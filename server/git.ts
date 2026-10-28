// Mode projet : le diff de la mission et les actions git de la fin (commiter, pousser, ouvrir une PR,
// revenir sur la branche de départ, supprimer la branche). Toujours git lancé directement (jamais un shell),
// dans le dossier de la mission.
import { execFile } from 'node:child_process';
import type { DiffFile, GitStatus, MissionInfo } from '../shared/protocol.ts';

interface Run { code: number; out: string; err: string }

/** Lance un programme et rend sa sortie, sans jamais lever d'erreur (le code de sortie dit si ça a marché). */
function run(bin: string, args: string[], cwd: string, timeout = 30_000): Promise<Run> {
  return new Promise((resolve) => {
    execFile(bin, args, {
      cwd, timeout, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
      // jamais de question dans le terminal (mot de passe…) : le bureau attendrait pour rien
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', GIT_PAGER: 'cat', PAGER: 'cat' },
    }, (err, stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null;
      const code = !e ? 0 : typeof e.code === 'number' ? e.code : e.code === 'ENOENT' ? 127 : 1;
      resolve({ code, out: String(stdout ?? ''), err: String(stderr ?? '') || (e && !stdout ? e.message : '') });
    });
  });
}

const git = (cwd: string, args: string[], timeout?: number) => run('git', ['-c', 'core.quotePath=false', '-c', 'color.ui=false', ...args], cwd, timeout);

/** La dernière ligne utile d'une erreur git (« fatal: … »). */
const why = (r: Run) => (r.err || r.out).trim().split('\n').filter(Boolean).slice(-2).join(' ') || `code ${r.code}`;

let ghFound: boolean | null = null;
async function hasGh(cwd: string) {
  if (ghFound === null) ghFound = (await run('gh', ['--version'], cwd, 5000)).code === 0;
  return ghFound;
}

const MAX_FILE_PATCH = 200_000;
const MAX_TOTAL_PATCH = 2_000_000;
const MAX_UNTRACKED = 300;

/** Découpe la sortie de « git diff » en fichiers. */
export function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  const chunks = raw.split(/^diff --git /m).slice(1);
  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    const head: string[] = [];
    let i = 1;
    for (; i < lines.length && !lines[i].startsWith('@@'); i++) head.push(lines[i]);
    const patchLines = lines.slice(i);
    while (patchLines.length && patchLines[patchLines.length - 1] === '') patchLines.pop();
    const strip = (s: string) => s.replace(/\t$/, '');
    let path = '', oldPath = '';
    let status: DiffFile['status'] = 'modified';
    let binary = false;
    for (const h of head) {
      if (h.startsWith('new file mode')) status = 'added';
      else if (h.startsWith('deleted file mode')) status = 'deleted';
      else if (h.startsWith('rename from ')) { status = 'renamed'; oldPath = h.slice(12); }
      else if (h.startsWith('rename to ')) path = h.slice(10);
      else if (h.startsWith('+++ ') && h !== '+++ /dev/null') path = path || strip(h.slice(4)).replace(/^b\//, '');
      else if (h.startsWith('--- ') && h !== '--- /dev/null') oldPath = oldPath || strip(h.slice(4)).replace(/^a\//, '');
      else if (h.startsWith('Binary files ')) binary = true;
    }
    if (!path) path = oldPath;
    if (!path) {
      // fichier binaire ou changement de droits : le nom vient de la première ligne « a/x b/x »
      const m = lines[0].match(/^a\/(.+) b\/(.+)$/);
      path = m ? m[2] : lines[0];
    }
    let additions = 0, deletions = 0;
    for (const l of patchLines) {
      if (l.startsWith('+')) additions++;
      else if (l.startsWith('-')) deletions++;
    }
    let patch = patchLines.join('\n');
    let truncated = false;
    if (patch.length > MAX_FILE_PATCH) { patch = patch.slice(0, MAX_FILE_PATCH).replace(/\n[^\n]*$/, ''); truncated = true; }
    files.push({ path, oldPath: status === 'renamed' ? oldPath : undefined, status, additions, deletions, patch, binary, truncated });
  }
  return files;
}

/** Le dossier est-il un dépôt git ? */
async function isRepo(folder: string) {
  const r = await git(folder, ['rev-parse', '--is-inside-work-tree']);
  return r.code === 0 && r.out.trim() === 'true';
}

async function currentBranch(folder: string): Promise<string | null> {
  const r = await git(folder, ['symbolic-ref', '--short', 'HEAD']);
  return r.code === 0 ? r.out.trim() : null;
}

async function branchExists(folder: string, branch: string) {
  return (await git(folder, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])).code === 0;
}

/** Les fichiers modifiés ou nouveaux du dépôt (chemins relatifs), pour la liste des rendus : bien plus léger que surveiller tout le dossier. */
export async function changedFiles(folder: string, max = 200): Promise<string[]> {
  const r = await git(folder, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], 10_000);
  if (r.code !== 0) return [];
  const out: string[] = [];
  const parts = r.out.split('\0');
  for (let i = 0; i < parts.length && out.length < max; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    const st = e.slice(0, 2);
    if (st.includes('D')) continue; // supprimé : plus rien à montrer
    if (st.includes('R') || st.includes('C')) i++; // un renommage a un second chemin
    out.push(e.slice(3));
  }
  return out;
}

/** Où en est le dépôt de la mission. */
export async function status(m: MissionInfo): Promise<GitStatus> {
  const folder = m.folder;
  if (!(await isRepo(folder))) throw new Error('Ce projet n’est pas un dépôt git.');
  const branch = await currentBranch(folder);
  const exists = m.branch ? await branchExists(folder, m.branch) : false;
  const dirty = (await git(folder, ['status', '--porcelain'])).out.trim() !== '';
  let ahead = 0;
  if (m.branch && m.baseBranch && exists) {
    const r = await git(folder, ['rev-list', '--count', `${m.baseBranch}..${m.branch}`]);
    if (r.code === 0) ahead = Number(r.out.trim()) || 0;
  }
  const remote = (await git(folder, ['remote', 'get-url', 'origin'])).code === 0;
  return {
    branch, missionBranch: m.branch, base: m.baseBranch, onMission: !!m.branch && branch === m.branch,
    branchExists: exists, dirty, ahead, remote, gh: await hasGh(folder),
  };
}

/** Les fichiers pas encore suivis par git, montrés comme des fichiers nouveaux. */
async function untrackedDiff(folder: string): Promise<{ files: DiffFile[]; more: boolean }> {
  const list = (await git(folder, ['ls-files', '--others', '--exclude-standard', '-z'])).out.split('\0').filter(Boolean);
  const files: DiffFile[] = [];
  for (const f of list.slice(0, MAX_UNTRACKED)) {
    // « --no-index » sort en code 1 quand il y a une différence : c'est normal
    const r = await git(folder, ['diff', '--no-color', '--no-ext-diff', '--no-index', '--', '/dev/null', f]);
    const parsed = parseDiff(r.out);
    if (parsed.length) files.push({ ...parsed[0], path: f, status: 'added' });
    else files.push({ path: f, status: 'added', additions: 0, deletions: 0, patch: '', binary: false, truncated: false });
  }
  return { files, more: list.length > MAX_UNTRACKED };
}

export interface DiffResult { ok: boolean; text?: string; note?: string; files: DiffFile[]; truncated: boolean }

/**
 * Le diff de la mission. Sur sa branche : l'arbre de travail (commité ou pas) comparé à la branche de départ,
 * avec les fichiers nouveaux. Revenu ailleurs : les commits de la branche de la mission.
 */
export async function diff(m: MissionInfo): Promise<DiffResult> {
  const none = (text: string): DiffResult => ({ ok: false, text, files: [], truncated: false });
  if (!m.project) return none('Le diff n’existe qu’en mode projet.');
  if (!(await isRepo(m.folder))) return none('Ce projet n’est pas un dépôt git : pas de diff.');
  if (!m.branch || !m.baseBranch) return none('Cette mission n’a pas de branche git : pas de diff.');
  const branch = await currentBranch(m.folder);
  let files: DiffFile[];
  let note: string | undefined;
  let more = false;
  if (branch === m.branch) {
    const r = await git(m.folder, ['diff', '--no-color', '--no-ext-diff', '-M', m.baseBranch], 60_000);
    if (r.code !== 0) return none(`Je n’arrive pas à calculer le diff : ${why(r)}`);
    files = parseDiff(r.out);
    const u = await untrackedDiff(m.folder);
    files.push(...u.files);
    more = u.more;
  } else if (await branchExists(m.folder, m.branch)) {
    const r = await git(m.folder, ['diff', '--no-color', '--no-ext-diff', '-M', `${m.baseBranch}...${m.branch}`], 60_000);
    if (r.code !== 0) return none(`Je n’arrive pas à calculer le diff : ${why(r)}`);
    files = parseDiff(r.out);
    note = `Ton projet n’est plus sur la branche de la mission (${m.branch}) : voici seulement ce qui y est commité.`;
  } else {
    return none(`La branche de la mission (${m.branch}) n’existe plus.`);
  }
  // au-delà d'une taille totale, les patchs suivants ne sont plus envoyés (la liste des fichiers, si)
  let total = 0;
  let truncated = more;
  for (const f of files) {
    total += f.patch.length;
    if (total > MAX_TOTAL_PATCH) { f.patch = ''; f.truncated = true; truncated = true; }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { ok: true, note, files, truncated };
}

export interface ActionResult { ok: boolean; text: string; url?: string }

/** Le lien « comparer » de GitHub, si le remote origin est sur GitHub. */
async function compareUrl(folder: string, base: string, branch: string): Promise<string | undefined> {
  const r = await git(folder, ['remote', 'get-url', 'origin']);
  const m = r.out.trim().match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}?expand=1` : undefined;
}

/** Commite tout ce qui a changé, sur la branche de la mission. */
export async function commit(m: MissionInfo, message: string): Promise<ActionResult> {
  const msg = message.trim();
  if (!msg) return { ok: false, text: 'Écris un message de commit.' };
  if (!m.branch) return { ok: false, text: 'Cette mission n’a pas de branche git.' };
  if ((await currentBranch(m.folder)) !== m.branch) return { ok: false, text: `Ton projet n’est pas sur la branche de la mission (${m.branch}).` };
  const add = await git(m.folder, ['add', '-A']);
  if (add.code !== 0) return { ok: false, text: `git add a échoué : ${why(add)}` };
  if ((await git(m.folder, ['diff', '--cached', '--quiet'])).code === 0) return { ok: false, text: 'Rien à commiter : aucun changement.' };
  // les hooks du projet (pre-commit…) tournent normalement
  const r = await git(m.folder, ['commit', '-m', msg], 120_000);
  if (r.code !== 0) return { ok: false, text: `Le commit a échoué : ${why(r)}` };
  const hash = (await git(m.folder, ['rev-parse', '--short', 'HEAD'])).out.trim();
  return { ok: true, text: `Commité (${hash}) sur ${m.branch}.` };
}

/** Pousse la branche de la mission, puis ouvre une PR avec gh (ou donne le lien pour la créer). */
export async function push(m: MissionInfo): Promise<ActionResult> {
  if (!m.branch || !m.baseBranch) return { ok: false, text: 'Cette mission n’a pas de branche git.' };
  if (!(await branchExists(m.folder, m.branch))) return { ok: false, text: `La branche ${m.branch} n’existe plus.` };
  if ((await git(m.folder, ['remote', 'get-url', 'origin'])).code !== 0) return { ok: false, text: 'Ton dépôt n’a pas de remote « origin » : je ne sais pas où pousser.' };
  const ahead = await git(m.folder, ['rev-list', '--count', `${m.baseBranch}..${m.branch}`]);
  if (ahead.code === 0 && Number(ahead.out.trim()) === 0) return { ok: false, text: 'Rien à pousser : commite d’abord les changements.' };
  const p = await git(m.folder, ['push', '-u', 'origin', m.branch], 120_000);
  if (p.code !== 0) return { ok: false, text: `Le push a échoué : ${why(p)}` };
  if (await hasGh(m.folder)) {
    const pr = await run('gh', ['pr', 'create', '--base', m.baseBranch, '--head', m.branch, '--fill'], m.folder, 120_000);
    const url = (pr.out + '\n' + pr.err).match(/https:\/\/\S+\/pull\/\d+/)?.[0];
    if (pr.code === 0 && url) return { ok: true, text: 'Poussé, et la PR est ouverte.', url };
    // la PR existe déjà : gh donne son adresse dans l'erreur
    if (url) return { ok: true, text: 'Poussé. La PR existait déjà : elle est à jour.', url };
    const link = await compareUrl(m.folder, m.baseBranch, m.branch);
    return { ok: true, text: `Poussé, mais gh n’a pas pu ouvrir la PR : ${why(pr)}`, url: link };
  }
  const link = await compareUrl(m.folder, m.baseBranch, m.branch);
  return { ok: true, text: link ? 'Poussé. Ouvre le lien pour créer la PR.' : 'Poussé sur origin.', url: link };
}

/** Revient sur la branche de départ (refusé s'il reste des changements pas commités). */
export async function switchBase(m: MissionInfo): Promise<ActionResult> {
  if (!m.baseBranch) return { ok: false, text: 'Je ne connais pas la branche de départ de cette mission.' };
  if ((await currentBranch(m.folder)) === m.baseBranch) return { ok: false, text: `Ton projet est déjà sur ${m.baseBranch}.` };
  if ((await git(m.folder, ['status', '--porcelain'])).out.trim()) {
    return { ok: false, text: 'Il reste des changements pas commités : commite-les d’abord (ou range-les), puis reviens.' };
  }
  const r = await git(m.folder, ['switch', m.baseBranch]);
  if (r.code !== 0) {
    const c = await git(m.folder, ['checkout', m.baseBranch]);
    if (c.code !== 0) return { ok: false, text: `Je n’arrive pas à revenir sur ${m.baseBranch} : ${why(c)}` };
  }
  return { ok: true, text: `Tu es revenu sur ${m.baseBranch}.` };
}

/** Supprime la branche de la mission (refusé si le projet est encore dessus). */
export async function deleteBranch(m: MissionInfo): Promise<ActionResult> {
  if (!m.branch) return { ok: false, text: 'Cette mission n’a pas de branche git.' };
  if (!(await branchExists(m.folder, m.branch))) return { ok: false, text: `La branche ${m.branch} n’existe déjà plus.` };
  if ((await currentBranch(m.folder)) === m.branch) return { ok: false, text: 'Ton projet est encore sur cette branche : reviens d’abord sur la branche de départ.' };
  const r = await git(m.folder, ['branch', '-D', m.branch]);
  if (r.code !== 0) return { ok: false, text: `Je n’arrive pas à supprimer la branche : ${why(r)}` };
  return { ok: true, text: `La branche ${m.branch} est supprimée.` };
}
