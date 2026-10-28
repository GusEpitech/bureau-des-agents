// Le bureau, côté serveur. Il vit dans un vrai dossier, ~/Documents/Bureau des agents/ :
//   - « Règlement du bureau.md » : ce que l'équipe doit savoir sur toi (Max le lit avant chaque mission) ;
//   - « Missions/ » : un dossier par mission, où l'équipe range tout ce qu'elle produit ;
//   - « .bureau/ » (caché) : l'état du bureau et l'enregistrement de chaque mission (pour la rejouer).
// Une mission = une séance Claude Code lancée dans le dossier de la mission. On peut lui reparler
// une fois finie (retouches) : la même séance reprend.
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, renameSync, statSync, watch, writeFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { countStats, emptyStats, mcpPrefix } from '../shared/activity.ts';
import { branchFromPlan, branchName, tidyBranch } from '../shared/branch.ts';
import type { ClaudeInfo, FileInfo, GitAction, Logged, MissionInfo, OfficeEvent, Quota, SearchHit, ServerMsg, Stats, WeekDay, Settings, TeamEntry, VersionInfo } from '../shared/protocol.ts';
import { createBranch, currentBranch, followedBranch, renamedBranch } from './branches.ts';
import { Library } from './library.ts';
import { mcpList } from './mcp.ts';
import { readLog, teamHistory } from './records.ts';
import { README, readRules, RULES_FILE, RULES_TEMPLATE } from './rules.ts';
import { DEFAULT_SETTINGS, MAX_RECENT, mergeSettings } from './settings.ts';
import type { Current, Live, State } from './types.ts';
import { addUsage, cleanName, pad, titleOf } from './util.ts';
import { keepVersion, listVersions, MAX_VERSION_SIZE, versionDirName } from './versions.ts';
import { ClaudeProcess, freshQuota, measureQuota, Normalizer, type ClaudeBinary, type TurnResult } from './claude.ts';
import * as gitOps from './git.ts';
import { agentsJson, ALWAYS_ALLOWED, chefPrompt, SESSION_TOOLS } from './team.ts';

const IDLE_STOP_MS = 15 * 60 * 1000;
const MAX_LOG = 8000;
const MAX_MISSIONS = 300;
/** dans un dossier de travail (un projet), ces dossiers bougent tout seuls : on ne les suit pas */
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', 'target', '__pycache__', 'venv', 'vendor']);

export class Bureau {
  readonly dir: string;
  readonly missionsDir: string;
  private stateFile: string;
  private recDir: string;
  private verDir: string;
  private library: Library | null = null;
  private state: State = { missions: [], settings: { ...DEFAULT_SETTINGS } };
  private saveTimer: NodeJS.Timeout | null = null;
  current: Current | null = null;
  quota: Quota | null = null;

  private claude: ClaudeBinary | null;
  private broadcast: (m: ServerMsg) => void;

  constructor(claude: ClaudeBinary | null, broadcast: (m: ServerMsg) => void, dir?: string) {
    this.claude = claude;
    this.broadcast = broadcast;
    this.dir = dir ?? path.join(os.homedir(), 'Documents', 'Bureau des agents');
    this.missionsDir = path.join(this.dir, 'Missions');
    this.stateFile = path.join(this.dir, '.bureau', 'state.json');
    this.recDir = path.join(this.dir, '.bureau', 'missions');
    this.verDir = path.join(this.dir, '.bureau', 'versions');
  }

  async init() {
    const fresh = !existsSync(this.dir);
    await mkdir(this.recDir, { recursive: true });
    await mkdir(this.missionsDir, { recursive: true });
    this.library = await Library.open(path.join(this.dir, '.bureau', 'bureau.db'), this.recDir);
    if (fresh) await writeFile(path.join(this.dir, 'LISEZ-MOI.md'), README);
    if (!existsSync(path.join(this.dir, RULES_FILE))) await writeFile(path.join(this.dir, RULES_FILE), RULES_TEMPLATE);
    if (existsSync(this.stateFile)) {
      try {
        const s = JSON.parse(await readFile(this.stateFile, 'utf8')) as Partial<State>;
        this.state = { missions: Array.isArray(s.missions) ? s.missions : [], settings: { ...DEFAULT_SETTINGS, ...(s.settings ?? {}) }, currentId: s.currentId, quota: s.quota ?? null };
        if (this.state.quota) this.quota = freshQuota(this.state.quota);
      } catch { /* état illisible : on repart proprement */ }
    }
    // une mission restée « au travail » (le bureau a été coupé pendant qu'elle tournait) est arrêtée
    for (const m of this.state.missions) if (m.status === 'working') m.status = 'stopped';
    // les dossiers récents qui ont disparu sortent de la liste
    const s = this.state.settings;
    s.recent = (Array.isArray(s.recent) ? s.recent : []).filter((d) => typeof d === 'string' && existsSync(d)).slice(0, MAX_RECENT);
    // la conversation ouverte avant l'arrêt du bureau est toujours là : on peut la continuer
    const open = this.state.currentId ? this.mission(this.state.currentId) : null;
    if (open) await this.load(open).catch(() => { this.state.currentId = undefined; });
  }

  claudeInfo(): ClaudeInfo {
    return this.claude ? { found: true, version: this.claude.version, path: this.claude.path } : { found: false };
  }

  get settings() { return this.state.settings; }

  setSettings(p: Partial<Settings>) {
    const cur = this.state.settings;
    const workdir = typeof p.workdir === 'string' ? this.checkWorkdir(p.workdir) : cur.workdir;
    this.state.settings = mergeSettings(cur, p, workdir);
    this.save();
    this.broadcast({ t: 'settings', settings: this.state.settings });
  }

  /** Un dossier de travail acceptable ('' = un nouveau dossier par mission), sinon une erreur claire. */
  private checkWorkdir(p: string): string {
    if (!p.trim()) return '';
    const dir = path.resolve(p.trim());
    if (!path.isAbsolute(p.trim())) throw new Error('Choisis un dossier avec son chemin complet.');
    let isDir = false;
    try { isDir = statSync(dir).isDirectory(); } catch { /* introuvable */ }
    if (!isDir) throw new Error('Ce dossier n’existe pas.');
    if (dir === path.parse(dir).root || dir === os.homedir()) throw new Error('Ce dossier est trop large : choisis un dossier précis, pas tout ton ordinateur.');
    const hidden = path.join(this.dir, '.bureau');
    if (dir === hidden || dir.startsWith(hidden + path.sep)) throw new Error('Ce dossier appartient au bureau.');
    return dir;
  }

  private picking = false;

  /** Ouvre la fenêtre de choix de dossier de l'ordinateur ; le dossier choisi devient le dossier de travail. */
  async pickFolder() {
    if (this.picking) return;
    this.picking = true;
    try {
      const start = this.settings.workdir || os.homedir();
      const title = 'Le dossier où l’équipe va travailler';
      const tries: [string, string[]][] = process.platform === 'darwin'
        ? [['osascript', ['-e', `POSIX path of (choose folder with prompt "${title}")`]]]
        : process.platform === 'win32'
          ? [['powershell', ['-NoProfile', '-STA', '-Command',
              `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = '${title.replace(/'/g, "''")}'; $d.SelectedPath = '${start.replace(/'/g, "''")}'; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }`]]]
          : [['zenity', ['--file-selection', '--directory', `--title=${title}`, `--filename=${start}/`]],
             ['kdialog', ['--getexistingdirectory', start, '--title', title]]];
      for (const [bin, args] of tries) {
        const r = await new Promise<{ missing: boolean; out: string }>((resolve) => {
          execFile(bin, args, { encoding: 'utf8' }, (err, stdout) => {
            const missing = (err as NodeJS.ErrnoException | null)?.code === 'ENOENT';
            resolve({ missing, out: err ? '' : stdout.trim() });
          });
        });
        if (r.missing) continue;
        if (r.out) this.setSettings({ workdir: r.out }); // rien de choisi (fenêtre fermée) : on ne change rien
        return;
      }
      throw new Error('Je ne trouve pas de fenêtre de choix de dossier sur cet ordinateur (installe zenity ou kdialog).');
    } finally {
      this.picking = false;
    }
  }

  private mcpChecking: Promise<ServerMsg> | null = null;

  /** Les connecteurs MCP, vérifiés là où l'équipe travaille (la mission ouverte, sinon le projet choisi, sinon le bureau). */
  mcpList(): Promise<ServerMsg> {
    if (this.mcpChecking) return this.mcpChecking; // une seule vérification à la fois (elle prend quelques secondes)
    const cwd = this.current?.mission.folder ?? (this.settings.workdir || this.dir);
    const place = this.current?.mission.project ?? (this.settings.workdir ? path.basename(this.settings.workdir) : 'le bureau');
    const at = Date.now();
    const run = async (): Promise<ServerMsg> => {
      if (!this.claude) return { t: 'mcp_list', servers: [], place, at, error: 'Claude Code n’est pas installé sur cet ordinateur.' };
      try { return { t: 'mcp_list', servers: await mcpList(this.claude.path, cwd), place, at }; } catch (e) {
        return { t: 'mcp_list', servers: [], place, at, error: e instanceof Error ? e.message : String(e) };
      }
    };
    this.mcpChecking = run().finally(() => { this.mcpChecking = null; });
    return this.mcpChecking;
  }

  /** Vrai si la mission travaille dans un dossier choisi par l'utilisateur (et pas dans « Missions »). */
  private ownFolder(m: MissionInfo) { return !m.folder.startsWith(this.missionsDir + path.sep); }

  missions(): MissionInfo[] {
    return [...this.state.missions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 60);
  }

  hello(): ServerMsg {
    const c = this.current;
    return {
      t: 'hello', claude: this.claudeInfo(), dir: this.dir, settings: this.settings, quota: this.quota,
      missions: this.missions(), current: c ? { mission: c.mission, log: c.log } : null,
    };
  }

  private mission(id: string) { return this.state.missions.find((m) => m.id === id) ?? null; }

  // ── Une nouvelle mission ──
  async start(prompt: string) {
    const text = prompt.trim();
    if (!text) throw new Error('Dis à Max ce que tu veux.');
    if (!this.claude) throw new Error('Claude Code n’est pas installé sur cet ordinateur.');
    if (this.current?.mission.status === 'working') throw new Error('L’équipe est déjà sur une mission. Attends qu’elle la rende, ou arrête-la.');
    if (this.current) this.close();

    const now = new Date();
    const title = titleOf(text);
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}h${pad(now.getMinutes())}`;
    // le dossier de travail choisi, s'il existe encore ; sinon un nouveau dossier dans « Missions »
    let folder = '';
    if (this.settings.workdir) {
      try { folder = this.checkWorkdir(this.settings.workdir); } catch { throw new Error('Le dossier de travail choisi n’existe plus : choisis-en un autre.'); }
    } else {
      folder = path.join(this.missionsDir, cleanName(`${stamp} · ${title.replace(/…$/, '')}`).slice(0, 90));
      for (let n = 2; existsSync(folder); n++) folder = path.join(this.missionsDir, cleanName(`${stamp} · ${title.replace(/…$/, '')} ${n}`).slice(0, 90));
      await mkdir(folder, { recursive: true });
    }
    const project = this.settings.workdir ? path.basename(folder) : undefined;
    const git = project ? createBranch(folder, branchName(this.settings.branchPattern, { title, prompt: text, project, now })) : null;

    const mission: MissionInfo = {
      id: 'm' + Date.now().toString(36), title, prompt: text, folder, createdAt: Date.now(), workMs: 0,
      status: 'working', stats: emptyStats(), files: [], project, branch: git?.branch, baseBranch: git?.base, quick: project && this.settings.quick ? true : undefined,
    };
    this.state.missions.push(mission);
    this.state.currentId = mission.id;
    if (this.state.missions.length > MAX_MISSIONS) this.state.missions.splice(0, this.state.missions.length - MAX_MISSIONS);
    this.save();
    const cur: Current = {
      mission, log: [], live: null, names: new Set(), watcher: null, fileTimers: new Map(), idleTimer: null,
      busySince: Date.now(), stopAsked: false, lastChefText: '',
    };
    this.current = cur;
    this.watch(cur);
    this.broadcast({ t: 'mission', mission });
    this.say(text);
  }

  /**
   * Mode projet : une branche git pour la mission, pour que le travail de l'équipe reste à part.
   * Refuse si le dépôt a des changements pas commités (ils se mélangeraient à ceux de l'équipe).
   * Un dossier qui n'est pas un dépôt git : pas de branche.
   */
  /**
   * Le plan validé commence par « Branche : ticket | titre » : Max a lu le ticket, le bureau renomme alors la branche
   * (créée au départ d'après la seule demande) avec le modèle des réglages. Seulement si elle n'a pas bougé.
   */
  private renameBranch(cur: Current, input: unknown, chosen?: string) {
    const m = cur.mission;
    if (!m.project || !m.branch) return;
    let wanted = chosen ? tidyBranch(chosen) : '';
    if (!wanted) {
      const plan = typeof (input as { plan?: unknown } | null)?.plan === 'string' ? (input as { plan: string }).plan : '';
      wanted = branchFromPlan(plan, this.settings.branchPattern, { prompt: m.prompt, project: m.project, createdAt: m.createdAt });
    }
    if (!wanted || wanted === m.branch) return;
    const branch = renamedBranch(m.folder, m.branch, wanted);
    if (!branch) return;
    m.branch = branch;
    this.save();
    this.broadcast({ t: 'mission', mission: m });
  }

  /**
   * Tu as renommé la branche toi-même (dans un terminal, avant de pousser) : la mission suit le nouveau nom
   * au lieu de se plaindre. Seulement si l'ancienne n'existe plus et que le dossier est sur une autre branche.
   */
  private followBranch(m: MissionInfo) {
    if (!m.project || !m.branch) return;
    const now = followedBranch(m);
    if (!now) return;
    m.branch = now;
    this.save();
    this.broadcast({ t: 'mission', mission: m });
  }

  /** Parler à Max : la mission, puis les retouches. S'il s'était endormi, il reprend sa séance. */
  say(text: string) {
    const cur = this.current;
    if (!cur) throw new Error('Lance d’abord une mission.');
    const clean = text.trim();
    if (!clean) return;
    if (!this.claude) throw new Error('Claude Code n’est pas installé sur cet ordinateur.');
    // une retouche sur une autre branche que celle de la mission mélangerait les travaux
    if (cur.mission.status !== 'working') this.followBranch(cur.mission);
    const branch = cur.mission.branch;
    if (branch && cur.mission.status !== 'working') {
      const now = currentBranch(cur.mission.folder);
      if (now !== branch) throw new Error(`Ton projet n’est plus sur la branche de la mission (${branch}). Reviens dessus pour une retouche, ou lance une nouvelle mission.`);
    }
    let l = cur.live;
    if (!l || !l.proc.alive) l = this.spawn(cur);
    // mode projet : chaque nouvelle demande repasse par un plan à valider (une précision en plein travail, non)
    else if (this.ownFolder(cur.mission) && !cur.mission.quick && cur.mission.status !== 'working') l.proc.setPermissionMode('plan');
    if (cur.idleTimer) { clearTimeout(cur.idleTimer); cur.idleTimer = null; }
    l.lastText = clean;
    cur.stopAsked = false;
    if (cur.mission.status !== 'working') {
      cur.mission.status = 'working';
      cur.mission.endedAt = undefined;
      cur.busySince = Date.now();
      this.broadcast({ t: 'mission', mission: cur.mission });
    }
    this.record(cur, { k: 'start', text: clean });
    l.proc.send(clean);
  }

  /** Le mode de permission pour travailler (une fois le plan validé, en mode projet). */
  private workMode() { return this.settings.permission === 'ask' ? 'acceptEdits' : 'auto'; }

  private spawn(cur: Current, opts: { fresh?: boolean } = {}): Live {
    if (!this.claude) throw new Error('Claude Code n’est pas installé sur cet ordinateur.');
    const s = this.settings;
    const resume = opts.fresh ? undefined : cur.mission.sessionId;
    // le Normalizer renvoie vers la mission courante ; « proc » est connu dès que la ligne suivante a tourné
    const norm: Normalizer = new Normalizer({
      emit: (ev) => { if (cur.live?.proc === proc) this.onEvent(cur, ev); },
      onQuota: (q) => this.setQuota(q),
      onResult: (r) => { if (cur.live?.proc === proc) this.onResult(cur, r); },
      folder: cur.mission.folder,
      names: cur.names,
    });
    const proc: ClaudeProcess = new ClaudeProcess(
      {
        // mode projet : Max commence en mode plan (il explore, puis te soumet son plan avant de coder)
        bin: this.claude.path, cwd: cur.mission.folder, permissionMode: this.ownFolder(cur.mission) && !cur.mission.quick ? 'plan' : this.workMode(),
        model: s.chefModel || undefined, resume, tools: SESSION_TOOLS, allowedTools: ALWAYS_ALLOWED,
        agents: agentsJson(s, this.ownFolder(cur.mission)),
        appendSystemPrompt: chefPrompt(readRules(this.dir), this.ownFolder(cur.mission), cur.mission.branch, !!cur.mission.quick), useApiKey: process.env.BUREAU_USE_API_KEY === '1',
        restricted: !this.ownFolder(cur.mission),
        solo: !!cur.mission.quick,
        noSkills: !s.skills,
        disallowed: this.ownFolder(cur.mission) ? (s.mcpOff[cur.mission.folder] ?? s.mcpOff[s.workdir] ?? []).map(mcpPrefix) : [],
        effort: s.chefEffort || undefined,
      },
      (m) => {
        if (cur.live?.proc !== proc) return; // un ancien processus qui parle encore
        const refuse = norm.handle(m);
        if (refuse) proc.refuseControl(refuse);
      },
      (code, signal, stderr) => this.onExit(cur, proc, code, signal, stderr),
    );
    const l: Live = { proc, norm, stopping: false, lastText: '', resumed: !!resume };
    cur.live = l;
    proc.start();
    return l;
  }

  private onEvent(cur: Current, ev: OfficeEvent) {
    const m = cur.mission;
    if (ev.k === 'init') {
      const sid = cur.live?.norm.sessionId;
      if (sid) m.sessionId = sid;
      m.model = ev.model;
    }
    if (ev.k === 'say' && ev.who === 'chef') cur.lastChefText = ev.text;
    countStats(m.stats, ev);
    this.record(cur, ev);
    if (ev.k === 'hire' || ev.k === 'init') this.save();
  }

  private onResult(cur: Current, r: TurnResult) {
    const l = cur.live;
    if (r.usage) cur.usage = addUsage(cur.usage, r.usage);
    // des membres de l'équipe travaillent encore : Max reprendra la main quand ils auront rendu leur travail
    if (l && l.norm.present.size > 0 && r.ok && !cur.stopAsked) return;
    this.finish(cur, r.ok, r.text.trim() || cur.lastChefText, r.ms, cur.stopAsked);
  }

  private setQuota(q: Quota) {
    this.quota = q;
    this.state.quota = q;
    this.broadcast({ t: 'quota', quota: q });
    this.save();
  }

  private measuring = false;
  private lastMeasure = 0;

  /** Mesure le quota (un tout petit appel à Haiku) ; `auto` : en fin de mission, pas plus d'une fois par minute. */
  async refreshQuota(auto = false) {
    if (!this.claude || this.measuring) return;
    if (auto && Date.now() - this.lastMeasure < 60_000) return;
    this.measuring = true;
    this.lastMeasure = Date.now();
    try {
      const q = await measureQuota(this.claude.path, this.dir);
      if (q) this.setQuota(q);
      else if (!auto) this.broadcast({ t: 'toast', kind: 'error', text: 'Je n’ai pas pu mesurer ton énergie. Réessaie dans un instant.' });
    } finally {
      this.measuring = false;
    }
  }

  private finish(cur: Current, ok: boolean, text: string, ms: number, stopped: boolean) {
    const m = cur.mission;
    if (m.status !== 'working') return;
    // ceux qui travaillaient encore (mission arrêtée, erreur) quittent leur poste
    const present = cur.live?.norm.present;
    if (present?.size) {
      for (const id of present) this.record(cur, { k: 'leave', who: id, ok: false, tokens: 0, tools: 0, ms: 0 });
      present.clear();
    }
    const now = Date.now();
    m.status = ok ? 'done' : stopped ? 'stopped' : 'error';
    m.endedAt = now;
    if (cur.busySince) m.workMs += now - cur.busySince;
    cur.busySince = null;
    if (text) m.final = text.slice(0, 20000);
    // les demandes encore ouvertes n'ont plus d'objet
    const l = cur.live;
    if (l) for (const id of l.norm.pendingRequests()) { l.norm.forgetRequest(id); this.record(cur, { k: 'ask_done', requestId: id, allow: false, cancelled: true }); }
    const usage = cur.usage;
    cur.usage = undefined;
    this.record(cur, { k: 'end', ok, text: m.final ?? '', ms, stopped, ...(usage ? { usage } : {}) });
    this.broadcast({ t: 'mission', mission: m });
    this.save();
    void this.refreshQuota(true); // la jauge d'énergie se met à jour à chaque fin de mission
    if (this.ownFolder(m)) void this.syncProjectFiles(cur);
    // Max reste disponible un moment pour les retouches, puis s'endort (il reprendra sa séance si on lui reparle)
    if (cur.idleTimer) clearTimeout(cur.idleTimer);
    cur.idleTimer = setTimeout(() => {
      if (this.current === cur && cur.mission.status !== 'working' && cur.live) { cur.live.stopping = true; cur.live.proc.stop(); }
    }, IDLE_STOP_MS);
  }

  private onExit(cur: Current, proc: ClaudeProcess, code: number | null, signal: string | null, stderr: string) {
    const l = cur.live;
    if (!l || l.proc !== proc) return;
    cur.live = null;
    const failed = !l.stopping && (code !== 0 || signal !== null);
    // La séance à reprendre n'existe plus (Claude Code efface les vieilles séances) : on repart de zéro.
    if (failed && l.resumed && !l.norm.started && l.lastText && this.current === cur) {
      this.record(cur, { k: 'error', message: 'Je ne retrouve plus notre ancienne conversation : je reprends de zéro, avec ton dernier message.' });
      cur.mission.sessionId = undefined;
      const fresh = this.spawn(cur, { fresh: true });
      fresh.lastText = l.lastText;
      fresh.proc.send(l.lastText);
      return;
    }
    if (cur.mission.status === 'working') {
      const message = failed
        ? (stderr.split('\n').filter(Boolean).slice(-3).join(' ') || (signal ? `Claude Code s’est arrêté (${signal}).` : `Claude Code s’est arrêté (code ${code}).`))
        : 'Claude Code s’est arrêté.';
      if (!cur.stopAsked) this.record(cur, { k: 'error', message });
      // les membres de l'équipe encore présents s'en vont
      for (const id of l.norm.present) this.record(cur, { k: 'leave', who: id, ok: false, tokens: 0, tools: 0, ms: 0 });
      l.norm.present.clear();
      cur.live = l; // le temps de ranger les demandes ouvertes
      this.finish(cur, false, cur.lastChefText, 0, cur.stopAsked);
      cur.live = null;
    }
  }

  private record(cur: Current, ev: OfficeEvent) {
    const at = Date.now();
    this.broadcast({ t: 'ev', missionId: cur.mission.id, at, ev });
    if (ev.k === 'typing') return; // trop bavard pour l'enregistrement
    cur.log.push({ at, ev });
    if (cur.log.length > MAX_LOG) cur.log.splice(0, cur.log.length - MAX_LOG);
    void appendFile(path.join(this.recDir, `${cur.mission.id}.jsonl`), JSON.stringify({ at, ev }) + '\n').catch(() => {});
  }

  // ── Les fichiers produits par l'équipe ──
  private watch(cur: Current) {
    // en mode projet, on ne surveille pas tout le dépôt (node_modules, .git… : des milliers de dossiers) : git dit ce qui a changé, en fin de tour
    if (this.ownFolder(cur.mission)) return;
    const folder = cur.mission.folder;
    try {
      cur.watcher = watch(folder, { recursive: true }, (_type, name) => {
        if (!name) return;
        const rel = String(name);
        if (rel.split(path.sep).some((p) => p.startsWith('.') || IGNORED_DIRS.has(p))) return;
        const prev = cur.fileTimers.get(rel);
        if (prev) clearTimeout(prev);
        cur.fileTimers.set(rel, setTimeout(() => { cur.fileTimers.delete(rel); void this.fileChanged(cur, rel); }, 350));
      });
      cur.watcher.on('error', () => {});
    } catch { cur.watcher = null; }
  }

  /** Mode projet : les fichiers que git voit changés deviennent les rendus de la mission. */
  private async syncProjectFiles(cur: Current) {
    for (const rel of await gitOps.changedFiles(cur.mission.folder)) {
      if (this.current !== cur) return;
      if (rel.split('/').some((p) => IGNORED_DIRS.has(p))) continue;
      await this.fileChanged(cur, rel);
    }
  }

  private async fileChanged(cur: Current, rel: string) {
    if (this.current !== cur) return;
    const abs = path.join(cur.mission.folder, rel);
    const st = await stat(abs).catch(() => null);
    if (!st || !st.isFile()) return;
    const files = cur.mission.files;
    const i = files.findIndex((f) => f.path === rel);
    if (i >= 0 && files[i].size === st.size && files[i].at === st.mtimeMs) return;
    const file: FileInfo = {
      path: rel, name: path.basename(rel), ext: path.extname(rel).slice(1).toLowerCase(), size: st.size, at: st.mtimeMs,
      by: cur.live?.norm.writers.get(abs) ?? (i >= 0 ? files[i].by : 'chef'),
    };
    if (i >= 0) files[i] = file; else files.push(file);
    this.record(cur, { k: 'file', file, isNew: i < 0 });
    this.save();
    // en mode projet, git garde déjà l'historique : pas de copies en double
    if (st.size <= MAX_VERSION_SIZE && !this.ownFolder(cur.mission)) void keepVersion(this.verDir, cur.mission.id, rel, abs, st.mtimeMs, file.by);
  }

  /** Les versions d'un rendu, de la plus récente à la plus ancienne. */
  async versions(missionId: string, file: string): Promise<VersionInfo[]> {
    this.inside(missionId, file);
    return listVersions(this.verDir, missionId, file);
  }

  /** Le chemin d'un fichier de la mission pour l'aperçu des sites (null s'il sort du dossier). */
  previewPath(missionId: string, rel: string): string | null {
    const m = this.mission(missionId);
    if (!m) return null;
    const target = path.resolve(m.folder, rel);
    if (!target.startsWith(m.folder + path.sep) || !existsSync(target)) return null;
    return target;
  }

  /** Cherche dans l'historique (la base SQLite) ; rien si elle n'est pas disponible. */
  search(q: string): SearchHit[] {
    return this.library ? this.library.search(q.slice(0, 200), this.state.missions) : [];
  }

  /** Le bilan de consommation (la base SQLite) ; null si elle n'est pas disponible. */
  stats(days: number): Stats | null {
    return this.library ? this.library.stats(this.state.missions, days) : null;
  }

  /** Les 7 derniers jours, pour le tableau du bureau. */
  week(): WeekDay[] | null {
    return this.library ? this.library.week(this.state.missions) : null;
  }

  /** Tous les agents passés au bureau, mission par mission (les plus récentes d'abord). */
  teamHistory(): Promise<TeamEntry[]> {
    return teamHistory(this.recDir, this.missions().slice(0, 40));
  }

  // ── Les commandes du bureau ──
  /** Arrêter l'équipe. Sans `force`, Claude Code s'interrompt proprement ; avec, on coupe tout, même s'il ne répond plus. */
  stop(force = false) {
    const cur = this.current;
    if (!cur) return;
    // déjà arrêtée ici, mais le navigateur la croit au travail (fin jamais enregistrée) : on remet les choses d'aplomb
    if (cur.mission.status !== 'working') { this.ensureEnded(cur); return; }
    cur.stopAsked = true;
    const l = cur.live;
    if (force && l) {
      l.stopping = true;
      this.record(cur, { k: 'error', message: 'Arrêt forcé : j’ai coupé Claude Code et tout ce qu’il avait lancé.' });
      this.finish(cur, false, cur.lastChefText, 0, true);
      cur.live = null; // le processus qui meurt ne parle plus à la mission
      l.proc.forceKill();
      return;
    }
    if (l?.proc.alive) l.proc.interrupt();
    else this.finish(cur, false, cur.lastChefText, 0, true);
  }

  answer(requestId: string, allow: boolean, message?: string, branch?: string) {
    const cur = this.current;
    const l = cur?.live;
    if (!cur || !l || !l.norm.hasRequest(requestId)) return;
    const plan = l.norm.toolOf(requestId) === 'ExitPlanMode';
    const note = message?.trim();
    // le plan de Max : refusé avec tes remarques, il le corrige et le repropose
    const deny = plan
      ? note
        ? `Gus veut des changements au plan : ${note}\nCorrige le plan en tenant compte de ses remarques, puis repropose-le avec ExitPlanMode. N'écris pas encore de code.`
        : 'Gus n’a pas validé le plan. Demande-lui ce qu’il veut changer, sans écrire de code.'
      : note;
    l.proc.answerPermission(requestId, allow, l.norm.inputOf(requestId), allow ? undefined : deny);
    // plan validé : Max quitte le mode plan et travaille avec le mode de permission réglé
    if (plan && allow) {
      l.proc.setPermissionMode(this.workMode());
      this.renameBranch(cur, l.norm.inputOf(requestId), branch);
    }
    l.norm.forgetRequest(requestId);
    this.record(cur, { k: 'ask_done', requestId, allow, ...(!allow && note ? { message: note.slice(0, 4000) } : {}) });
  }

  /** On range la mission (fin de journée) : le bureau est prêt pour la suivante. */
  close() {
    const cur = this.current;
    if (!cur) return;
    if (cur.mission.status === 'working') { cur.stopAsked = true; this.finish(cur, false, cur.lastChefText, 0, true); }
    if (cur.idleTimer) clearTimeout(cur.idleTimer);
    for (const t of cur.fileTimers.values()) clearTimeout(t);
    cur.watcher?.close();
    if (cur.live) { cur.live.stopping = true; cur.live.proc.stop(); }
    this.current = null;
    this.state.currentId = undefined;
    this.broadcast({ t: 'closed', missionId: cur.mission.id });
    this.save();
  }

  // ── Mode projet : le diff et les actions git (voir git.ts) ──
  private gitBusy = false;

  /** Une mission en mode projet, sinon une erreur claire. */
  private projectMission(missionId: string) {
    const m = this.mission(missionId);
    if (!m) throw new Error('Cette mission n’existe plus.');
    if (!m.project) throw new Error('Les actions git n’existent qu’en mode projet.');
    if (!existsSync(m.folder)) throw new Error('Le dossier de cette mission n’existe plus.');
    if (m.status !== 'working') this.followBranch(m);
    return m;
  }

  async diff(missionId: string) {
    return gitOps.diff(this.projectMission(missionId));
  }

  async gitStatus(missionId: string) {
    return gitOps.status(this.projectMission(missionId));
  }

  /** Une action git sur la branche de la mission (jamais pendant que l'équipe y travaille). */
  async gitAction(missionId: string, action: Exclude<GitAction, 'status'>, message: string): Promise<gitOps.ActionResult> {
    const m = this.projectMission(missionId);
    const working = this.current?.mission.status === 'working' && this.current.mission.folder === m.folder;
    if (working) return { ok: false, text: 'L’équipe travaille encore dans ce projet : attends qu’elle ait fini (ou arrête-la).' };
    if (this.gitBusy) return { ok: false, text: 'Une action git est déjà en cours.' };
    this.gitBusy = true;
    try {
      switch (action) {
        case 'commit': return await gitOps.commit(m, message);
        case 'push': return await gitOps.push(m);
        case 'switch_base': return await gitOps.switchBase(m);
        case 'delete_branch': return await gitOps.deleteBranch(m);
      }
    } finally {
      this.gitBusy = false;
    }
  }

  /**
   * Rouvre une mission passée : elle redevient la mission en cours, avec sa conversation et ses fichiers.
   * Rien n'est lancé : Max reprend sa séance (et tout son historique) au prochain message.
   */
  async resume(missionId: string) {
    const m = this.mission(missionId);
    if (!m) throw new Error('Cette mission n’existe plus.');
    if (this.current?.mission.id === m.id) {
      this.broadcast({ t: 'current', mission: m, log: this.current.log });
      return;
    }
    if (this.current?.mission.status === 'working') throw new Error('L’équipe est déjà sur une mission. Attends qu’elle la rende, ou arrête-la.');
    if (!existsSync(m.folder)) throw new Error('Le dossier de cette mission n’existe plus.');
    if (this.current) this.close();
    const cur = await this.load(m);
    this.state.currentId = m.id;
    this.save();
    this.broadcast({ t: 'current', mission: m, log: cur.log });
  }

  /** Remet une mission en place comme mission en cours, d'après son enregistrement. */
  private async load(m: MissionInfo): Promise<Current> {
    const log = await readLog(this.recDir, m.id);
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    const names = new Set<string>();
    let lastChefText = '';
    for (const { ev } of log) {
      if (ev.k === 'hire') names.add(ev.name);
      if (ev.k === 'say' && ev.who === 'chef') lastChefText = ev.text;
    }
    const cur: Current = {
      mission: m, log, live: null, names, watcher: null, fileTimers: new Map(), idleTimer: null,
      busySince: null, stopAsked: false, lastChefText,
    };
    this.current = cur;
    this.watch(cur);
    if (m.status !== 'working') this.ensureEnded(cur);
    return cur;
  }

  /**
   * Un tour commencé sans fin enregistrée (le bureau a été coupé pendant que l'équipe travaillait) : on enregistre
   * sa fin, sinon le navigateur croirait l'équipe toujours au travail, sans moyen de l'arrêter.
   */
  private ensureEnded(cur: Current) {
    let open = false;
    for (const { ev } of cur.log) {
      if (ev.k === 'start') open = true;
      else if (ev.k === 'end') open = false;
    }
    if (!open) return;
    const present = new Set<string>();
    for (const { ev } of cur.log) {
      if (ev.k === 'hire') present.add(ev.id);
      else if (ev.k === 'leave') present.delete(ev.who);
    }
    for (const id of present) this.record(cur, { k: 'leave', who: id, ok: false, tokens: 0, tools: 0, ms: 0 });
    this.record(cur, { k: 'error', message: 'Le bureau a été coupé pendant que l’équipe travaillait : la mission s’est arrêtée là. Tu peux reprendre la conversation.' });
    this.record(cur, { k: 'end', ok: false, text: cur.lastChefText, ms: 0, stopped: true });
  }

  /** Le chemin d'un fichier de la mission (refusé s'il sort du dossier). */
  private inside(missionId: string, file?: string) {
    const m = this.mission(missionId);
    if (!m) throw new Error('Cette mission n’existe plus.');
    if (!file) return { m, target: m.folder };
    const target = path.resolve(m.folder, file);
    if (!target.startsWith(m.folder + path.sep) || !existsSync(target)) throw new Error('Ce fichier n’est pas dans le dossier de la mission.');
    return { m, target };
  }

  /**
   * Ouvre le dossier de la mission (ou un de ses fichiers) avec l'appli par défaut.
   * En mode projet, c'est l'éditeur de code qui l'ouvre (VS Code, ou celui de BUREAU_EDITOR : cursor, codium…),
   * avec le fichier dans la fenêtre du projet ; sans éditeur trouvé, on revient à l'appli par défaut.
   */
  open(missionId: string, file?: string) {
    const { m, target } = this.inside(missionId, file);
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    const fallback = () => execFile(opener, [target], () => {});
    if (!this.ownFolder(m)) { fallback(); return; }
    const editor = process.env.BUREAU_EDITOR || 'code';
    const win = process.platform === 'win32';
    // sous Windows, « code » est un script .cmd : il faut passer par le shell, avec les chemins entre guillemets
    const args = (file ? [m.folder, '--goto', target] : [m.folder]).map((a) => (win ? `"${a}"` : a));
    execFile(editor, args, { shell: win }, (err) => {
      if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') fallback();
    });
  }

  /** Ouvre le dossier du bureau, ou son règlement (dans l'éditeur de texte par défaut). */
  openRoot(rules: boolean) {
    const target = rules ? path.join(this.dir, RULES_FILE) : this.dir;
    if (rules && !existsSync(target)) writeFileSync(target, RULES_TEMPLATE);
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    execFile(opener, rules && process.platform === 'darwin' ? ['-t', target] : [target], () => {});
  }

  /** Le texte d'un rendu (rapport, CSV…), pour le lire dans le bureau. */
  async readText(missionId: string, file: string, version?: string) {
    let { target } = this.inside(missionId, file);
    if (version) {
      if (!/^\d+__[\w-]*(\.[\w-]+)?$/.test(version)) throw new Error('Version inconnue.');
      target = path.join(this.verDir, missionId, versionDirName(file), version);
      if (!existsSync(target)) throw new Error('Cette version n’existe plus.');
    }
    const st = await stat(target);
    const max = 400_000;
    const buf = await readFile(target);
    return { text: buf.subarray(0, max).toString('utf8'), truncated: st.size > max };
  }

  /** L'enregistrement d'une mission, pour la rejouer (pratique pour filmer sans relancer l'équipe). */
  async replay(missionId: string): Promise<{ mission: MissionInfo; log: Logged[] }> {
    const m = this.mission(missionId);
    if (!m) throw new Error('Cette mission n’existe plus.');
    const log = await readLog(this.recDir, m.id);
    if (!log.length) throw new Error('Cette mission n’a pas été enregistrée.');
    return { mission: m, log };
  }

  /** Sauvegarde groupée (au plus une fois par seconde), écrite d'un coup pour ne jamais laisser un fichier à moitié écrit. */
  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        const tmp = this.stateFile + '.tmp';
        await writeFile(tmp, JSON.stringify(this.state));
        await rename(tmp, this.stateFile);
      } catch (e) {
        console.error('  ⚠  Sauvegarde du bureau impossible :', e instanceof Error ? e.message : e);
      }
    }, 1000);
  }

  /** Le pont s'arrête : tout le monde s'arrête tout de suite, et on sauvegarde. */
  shutdown() {
    const cur = this.current;
    if (cur) {
      if (cur.mission.status === 'working') {
        cur.mission.status = 'stopped'; cur.mission.endedAt = Date.now(); if (cur.busySince) cur.mission.workMs += Date.now() - cur.busySince;
        // la fin du tour s'écrit tout de suite (le bureau s'arrête) : rouverte, la mission ne paraîtra pas encore au travail
        const at = Date.now();
        const end: OfficeEvent = { k: 'end', ok: false, text: cur.lastChefText, ms: 0, stopped: true };
        try { appendFileSync(path.join(this.recDir, `${cur.mission.id}.jsonl`), JSON.stringify({ at, ev: end }) + '\n'); } catch { /* tant pis */ }
      }
      cur.watcher?.close();
      if (cur.live) { cur.live.stopping = true; cur.live.proc.kill(); }
    }
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    try {
      const tmp = this.stateFile + '.tmp';
      writeFileSync(tmp, JSON.stringify(this.state));
      renameSync(tmp, this.stateFile);
    } catch { /* tant pis : l'état de la dernière sauvegarde reste */ }
  }
}
