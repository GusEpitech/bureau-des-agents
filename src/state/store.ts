// La mémoire du bureau, côté navigateur : la mission en cours, l'équipe, le plan, les rendus, ce que
// dit Max. Chaque événement venu du pont est rangé ici, puis transmis au moteur du jeu (les robots).
import { create } from 'zustand';
import { countStats, emptyStats, setProjectMode } from '../../shared/activity.ts';
import type {
  ActKind, ClaudeInfo, ClientMsg, DiffFile, McpServer, FileInfo, GitAction, GitStatus, MissionInfo, MissionStats, OfficeEvent, PlanItem, Quota, Role, ServerMsg, Settings, TeamEntry, TurnUsage, VersionInfo,
} from '../../shared/protocol.ts';
import { sfx } from '../audio/sfx.ts';
import { say } from '../audio/voice.ts';
import { bus } from './bus.ts';
import { DEFAULT_BRANCH_PATTERN } from '../../shared/branch.ts';
import { techLabel } from '../ui/tech.ts';

export interface ActView { id: string; kind: ActKind; label: string; detail: string; at: number; ok?: boolean; tool?: string; raw?: string; out?: string }

export interface AgentView {
  id: string;
  role: Role;
  name: string;
  task: string;
  prompt: string;
  status: 'working' | 'reporting' | 'done' | 'failed';
  act: ActView | null;
  acts: ActView[];
  say: string;
  sayAt: number;
  report: string;
  hiredAt: number;
  leftAt?: number;
  tokens: number;
  tools: number;
}

export interface ChefView {
  say: string;
  sayAt: number;
  typing: string;
  thinkingAt: number;
  act: ActView | null;
  acts: ActView[];
}

export interface AskView { requestId: string; who: string; tool: string; label: string; detail: string; full: boolean; at: number }

export interface FeedLine { id: number; at: number; who: string; text: string; /** la vraie commande (mode technique) */ tech?: string; kind: 'user' | 'chef' | 'hire' | 'act' | 'report' | 'file' | 'ask' | 'end' | 'error' }

/** Un message de la conversation avec Max (ce que tu dis, ce qu'il répond, qui il appelle, ses récaps). */
export interface ChatMsg {
  id: number; at: number; kind: 'user' | 'chef' | 'final' | 'note' | 'error' | 'tool' | 'plan'; text: string; ok?: boolean;
  /** kind 'tool' (mode technique) : l'appel d'outil, complété par sa sortie quand il se termine */
  act?: { id: string; who: string; tool: string; raw: string; out?: string; ok?: boolean };
  /** le récap d'un tour : ce qu'il a consommé, et combien de temps l'équipe a travaillé */
  usage?: TurnUsage;
  ms?: number;
  /** le plan de Max (kind 'plan') : la demande de permission à laquelle répondre, et ce que tu en as fait */
  requestId?: string;
  plan?: 'pending' | 'approved' | 'changes' | 'cancelled';
}

export interface Toast { id: number; kind: 'info' | 'error'; text: string }

export type Tod = 'auto' | 'day' | 'evening' | 'night';

/** Les fenêtres qu'on ouvre en cliquant sur le bureau (un robot, le tableau, l'horloge…). */
export type Modal =
  | { kind: 'agent'; id: string }
  | { kind: 'board' }
  | { kind: 'clock' }
  | { kind: 'machine' }
  | { kind: 'jukebox' }
  | { kind: 'team'; role?: Role }
  | { kind: 'files' }
  | { kind: 'preview'; missionId: string; file: string };

interface S {
  connection: 'connecting' | 'live' | 'offline' | 'demo';
  claude: ClaudeInfo | null;
  dir: string;
  settings: Settings;
  quota: Quota | null;
  missions: MissionInfo[];
  mission: MissionInfo | null;
  /** vrai pendant une rediffusion (ou la démo) */
  replaying: boolean;
  chef: ChefView;
  agents: Record<string, AgentView>;
  order: string[];
  plan: PlanItem[];
  files: FileInfo[];
  asks: Record<string, AskView>;
  stats: MissionStats;
  feed: FeedLine[];
  /** toute la conversation de la mission (pas tronquée, contrairement au fil « En direct ») */
  chat: ChatMsg[];
  /** les connecteurs MCP : ceux chargés dans la séance (au démarrage de Max), ou la dernière vérification */
  mcp: { servers: McpServer[]; from: 'session' | 'check'; place?: string; at: number; error?: string } | null;
  mcpLoading: boolean;
  final: { ok: boolean; text: string; ms: number; stopped?: boolean; at: number } | null;
  /** quand l'équipe s'est mise au travail (pour le chrono) ; null = au repos */
  busySince: number | null;
  workMs: number;
  // l'interface
  showFinal: boolean;
  viewer: { missionId: string; file: string; text?: string; truncated?: boolean; version?: string } | null;
  modal: Modal | null;
  /** les versions de chaque rendu (clé : mission|fichier) */
  versions: Record<string, VersionInfo[]>;
  teamHistory: TeamEntry[] | null;
  /** chaque version du plan, dans l'ordre (le tableau garde l'historique) */
  planHistory: { at: number; items: PlanItem[] }[];
  music: { playing: boolean; index: number; volume: number };
  /** la voix de Max (ElevenLabs) */
  voiceOn: boolean;
  /** en mode tournage, la caméra suit l'action toute seule */
  cameraAuto: boolean;
  /** le mode technique (vraies commandes, sorties, tokens) ; null = jamais réglé (suit le mode projet) */
  tech: boolean | null;
  /** vue développeur (dense) : null = jamais réglée (activée d'office en mode projet) */
  dense: boolean | null;
  /** en vue développeur, le bureau animé est replié (la conversation prend toute la largeur) */
  officeHidden: boolean;
  /** la largeur du panneau de droite, réglée en tirant la poignée (null = la largeur d'origine) */
  panelW: number | null;
  /** la visite guidée en cours (le texte que Max dit) */
  tour: { step: number; text: string } | null;
  historyOpen: boolean;
  settingsOpen: boolean;
  vertical: boolean;
  /** écran en hauteur (téléphone) : même mise en page que le cadre vertical */
  portrait: boolean;
  filming: boolean;
  sound: boolean;
  tod: Tod;
  draft: string;
  toasts: Toast[];
  /** mode projet : le diff de la mission (onglet « Diff ») */
  diff: { ok: boolean; text?: string; note?: string; files: DiffFile[]; truncated: boolean; at: number } | null;
  diffLoading: boolean;
  /** mode projet : où en est le dépôt (null : pas encore demandé) */
  git: { status: GitStatus | null; text?: string } | null;
  /** l'action git en cours (pour griser les boutons) */
  gitBusy: GitAction | null;
  /** le résultat de la dernière action git */
  gitResult: { action: GitAction; ok: boolean; text: string; url?: string } | null;
  send: (m: ClientMsg) => void;
  receive: (m: ServerMsg) => void;
  apply: (ev: OfficeEvent, at: number, live: boolean) => void;
  resetMission: (m: MissionInfo | null) => void;
  toast: (kind: Toast['kind'], text: string) => void;
}

const pref = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem('bureau:' + key); return v === null ? fallback : (JSON.parse(v) as T); } catch { return fallback; }
};
/** Vrai si l'utilisateur a déjà réglé cette préférence lui-même. */
export const hasPref = (key: string) => { try { return localStorage.getItem('bureau:' + key) !== null; } catch { return false; } };
export const savePref = (key: string, v: unknown) => { try { localStorage.setItem('bureau:' + key, JSON.stringify(v)); } catch { /* navigation privée */ } };

const emptyChef = (): ChefView => ({ say: '', sayAt: 0, typing: '', thinkingAt: 0, act: null, acts: [] });

let feedId = 0;
let toastId = 0;
let lastActSound = 0;
const MAX_ACTS = 80;
const MAX_FEED = 160;

export const useOffice = create<S>((set, get) => ({
  connection: 'connecting',
  claude: null,
  dir: '',
  settings: { chefModel: 'sonnet', teamModel: 'sonnet', permission: 'auto', roleModels: {}, workdir: '', recent: [], branchPattern: DEFAULT_BRANCH_PATTERN },
  quota: null,
  missions: [],
  mission: null,
  replaying: false,
  chef: emptyChef(),
  agents: {},
  order: [],
  plan: [],
  files: [],
  asks: {},
  stats: emptyStats(),
  feed: [],
  chat: [],
  mcp: null,
  mcpLoading: false,
  final: null,
  busySince: null,
  workMs: 0,
  showFinal: false,
  viewer: null,
  modal: null,
  versions: {},
  teamHistory: null,
  planHistory: [],
  music: { playing: false, index: 0, volume: 0.55 },
  voiceOn: pref('voice', true),
  cameraAuto: pref('cameraAuto', true),
  tech: pref<boolean | null>('tech', null),
  dense: pref<boolean | null>('dense', null),
  officeHidden: pref('officeHidden', false),
  panelW: (() => { const w = pref<number | null>('panelW', null); return typeof w === 'number' && w >= 240 && w <= 4000 ? w : null; })(),
  tour: null,
  historyOpen: false,
  settingsOpen: false,
  vertical: pref('vertical', false),
  portrait: typeof window !== 'undefined' && window.innerWidth / Math.max(1, window.innerHeight) < 0.8,
  filming: false,
  sound: pref('sound', true),
  tod: pref<Tod>('tod', 'auto'),
  draft: '',
  toasts: [],
  diff: null,
  diffLoading: false,
  git: null,
  gitBusy: null,
  gitResult: null,
  send: () => {},

  toast: (kind, text) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }].slice(-4) }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 4500);
  },

  resetMission: (m) => {
    set({
      mission: m, chef: emptyChef(), agents: {}, order: [], plan: [], files: [], asks: {}, stats: emptyStats(),
      feed: [], chat: [], final: null, busySince: null, workMs: 0, showFinal: false, planHistory: [],
      diff: null, diffLoading: false, git: null, gitBusy: null, gitResult: null,
    });
    bus.reset();
  },

  receive: (m) => {
    const s = get();
    switch (m.t) {
      case 'hello': {
        set({ claude: m.claude, dir: m.dir, settings: m.settings, quota: m.quota, missions: m.missions });
        if (s.replaying) break;
        if (m.current) {
          get().resetMission(m.current.mission);
          for (const l of m.current.log) get().apply(l.ev, l.at, false);
          set({ mission: m.current.mission });
        } else get().resetMission(null);
        break;
      }
      case 'mission': {
        const list = [m.mission, ...s.missions.filter((x) => x.id !== m.mission.id)].sort((a, b) => b.createdAt - a.createdAt);
        set({ missions: list });
        if (s.replaying) break;
        if (s.mission?.id === m.mission.id) set({ mission: m.mission });
        else if (m.mission.status === 'working' && (!s.mission || s.mission.id !== m.mission.id)) get().resetMission(m.mission);
        break;
      }
      case 'ev':
        if (s.replaying || s.mission?.id !== m.missionId) break;
        get().apply(m.ev, m.at, true);
        break;
      case 'mcp_list':
        set({ mcp: { servers: m.servers, from: 'check', place: m.place, at: m.at, error: m.error }, mcpLoading: false });
        break;
      case 'current':
        if (s.replaying) break;
        get().resetMission(m.mission);
        for (const l of m.log) get().apply(l.ev, l.at, false);
        set({ mission: m.mission, historyOpen: false });
        break;
      case 'closed':
        if (!s.replaying && s.mission?.id === m.missionId) get().resetMission(null);
        break;
      case 'file_text':
        if (s.viewer && s.viewer.file === m.file) set({ viewer: { ...s.viewer, text: m.text, truncated: m.truncated, version: m.version } });
        break;
      case 'versions':
        set({ versions: { ...s.versions, [`${m.missionId}|${m.file}`]: m.list } });
        break;
      case 'team_history':
        set({ teamHistory: m.entries });
        break;
      case 'quota':
        set({ quota: m.quota });
        break;
      case 'settings':
        set({ settings: m.settings });
        break;
      case 'toast':
        get().toast(m.kind, m.text);
        break;
      case 'replay':
        // géré par le lecteur (net/replay.ts)
        break;
      case 'diff':
        if (s.mission?.id !== m.missionId) break;
        set({ diff: { ok: m.ok, text: m.text, note: m.note, files: m.files, truncated: m.truncated, at: Date.now() }, diffLoading: false });
        break;
      case 'git_status':
        if (s.mission?.id !== m.missionId) break;
        set({ git: { status: m.status, text: m.text } });
        break;
      case 'git_done':
        if (s.mission?.id !== m.missionId) break;
        set({ gitBusy: null, gitResult: { action: m.action, ok: m.ok, text: m.text, url: m.url } });
        if (m.ok) sfx(m.action === 'delete_branch' ? 'paper' : 'check');
        break;
    }
  },

  apply: (ev, at, live) => {
    const s = get();
    const feed = (who: string, text: string, kind: FeedLine['kind']) => {
      const line: FeedLine = { id: ++feedId, at, who, text, kind };
      return [...get().feed, line].slice(-MAX_FEED);
    };
    const chat = (kind: ChatMsg['kind'], text: string, ok?: boolean, extra?: Partial<ChatMsg>) => [...get().chat, { id: ++feedId, at, kind, text, ok, ...extra }];
    const agentName = (who: string) => (who === 'chef' ? 'Max' : s.agents[who]?.name ?? 'Un agent');
    switch (ev.k) {
      case 'start': {
        const first = s.feed.length === 0;
        set({
          chef: { ...s.chef, say: '', typing: '', thinkingAt: at }, final: null, showFinal: false,
          busySince: at, feed: feed('toi', ev.text, 'user'), chat: chat('user', ev.text),
        });
        if (live && !first) sfx('send');
        if (live) void say('parti');
        break;
      }
      case 'init':
        // les connecteurs MCP de la séance (plus frais qu'une vérification faite avant)
        if (ev.mcp && (!s.mcp || s.mcp.from === 'session' || s.mcp.at < at)) set({ mcp: { servers: ev.mcp, from: 'session', at } });
        break;
      case 'think':
        if (ev.who === 'chef') set({ chef: { ...s.chef, thinkingAt: at } });
        break;
      case 'typing':
        if (ev.who === 'chef') set({ chef: { ...s.chef, typing: ev.text } });
        else if (s.agents[ev.who]) set({ agents: { ...s.agents, [ev.who]: { ...s.agents[ev.who], say: ev.text, sayAt: at } } });
        break;
      case 'say':
        if (ev.who === 'chef') set({ chef: { ...s.chef, say: ev.text, sayAt: at, typing: '' }, feed: feed('Max', ev.text, 'chef'), chat: chat('chef', ev.text) });
        else if (s.agents[ev.who]) set({ agents: { ...s.agents, [ev.who]: { ...s.agents[ev.who], say: ev.text, sayAt: at } } });
        break;
      case 'plan':
        set({ plan: ev.items, planHistory: [...s.planHistory, { at, items: ev.items }].slice(-60) });
        if (live && s.plan.length !== ev.items.length) sfx('plan');
        else if (live && ev.items.filter((i) => i.status === 'completed').length > s.plan.filter((i) => i.status === 'completed').length) sfx('check');
        break;
      case 'hire': {
        const a: AgentView = {
          id: ev.id, role: ev.role, name: ev.name, task: ev.task, prompt: ev.prompt, status: 'working', act: null, acts: [],
          say: '', sayAt: 0, report: '', hiredAt: at, tokens: 0, tools: 0,
        };
        const stats = { ...s.stats };
        countStats(stats, ev);
        const firstOfRound = !s.order.some((id) => s.agents[id]?.status === 'working' || s.agents[id]?.status === 'reporting');
        set({
          agents: { ...s.agents, [ev.id]: a }, order: [...s.order, ev.id], stats, feed: feed('Max', `appelle ${ev.name} : ${ev.task}`, 'hire'),
          chat: chat('note', `${ev.name} rejoint l’équipe : ${ev.task}`),
        });
        if (live) sfx('spawn');
        if (live && firstOfRound) void say('equipe');
        break;
      }
      case 'act': {
        const act: ActView = { id: ev.id, kind: ev.kind, label: ev.label, detail: ev.detail, at, tool: ev.tool, raw: ev.raw };
        const stats = { ...s.stats };
        countStats(stats, ev);
        if (ev.who === 'chef') set({ chef: { ...s.chef, act, acts: [...s.chef.acts, act].slice(-MAX_ACTS) }, stats });
        else if (s.agents[ev.who]) {
          const a = s.agents[ev.who];
          set({ agents: { ...s.agents, [ev.who]: { ...a, act, acts: [...a.acts, act].slice(-MAX_ACTS) } }, stats });
        } else set({ stats });
        if (ev.kind !== 'plan') {
          const lines = feed(agentName(ev.who), ev.label, 'act');
          lines[lines.length - 1].tech = techLabel(ev.tool, ev.raw, ev.detail);
          set({ feed: lines, chat: chat('tool', ev.label, undefined, { act: { id: ev.id, who: ev.who, tool: ev.tool, raw: ev.raw ?? '' } }) });
        }
        if (live && Date.now() - lastActSound > 220) { lastActSound = Date.now(); sfx(ev.kind === 'search' || ev.kind === 'web' ? 'search' : 'tick'); }
        break;
      }
      case 'act_done': {
        const mark = (acts: ActView[]) => acts.map((x) => (x.id === ev.id ? { ...x, ok: ev.ok, out: ev.out } : x));
        // la ligne de l'outil dans la conversation (on la cherche depuis la fin : c'est presque toujours une des dernières)
        const c = get().chat;
        for (let i = c.length - 1; i >= 0 && i >= c.length - 400; i--) {
          const x = c[i];
          if (x.kind === 'tool' && x.act?.id === ev.id) {
            const next = c.slice();
            next[i] = { ...x, ok: ev.ok, act: { ...x.act, ok: ev.ok, out: ev.out } };
            set({ chat: next });
            break;
          }
        }
        if (ev.who === 'chef') set({ chef: { ...s.chef, acts: mark(s.chef.acts) } });
        else if (s.agents[ev.who]) set({ agents: { ...s.agents, [ev.who]: { ...s.agents[ev.who], acts: mark(s.agents[ev.who].acts) } } });
        break;
      }
      case 'report': {
        const a = s.agents[ev.who];
        if (!a) break;
        set({ agents: { ...s.agents, [ev.who]: { ...a, report: ev.text, status: 'reporting' } }, feed: feed(a.name, 'rend son rapport à Max', 'report') });
        if (live) sfx('paper');
        break;
      }
      case 'leave': {
        const a = s.agents[ev.who];
        if (!a) break;
        set({ agents: { ...s.agents, [ev.who]: { ...a, status: ev.ok ? 'done' : 'failed', leftAt: at, tokens: ev.tokens, tools: ev.tools } } });
        break;
      }
      case 'file': {
        const files = [...s.files.filter((f) => f.path !== ev.file.path), ev.file].sort((a, b) => a.at - b.at);
        set({ files, feed: ev.isNew ? feed(agentName(ev.file.by), `a rangé ${ev.file.name}`, 'file') : get().feed });
        if (live && ev.isNew) sfx('print');
        break;
      }
      case 'ask': {
        const ask: AskView = { requestId: ev.requestId, who: ev.who, tool: ev.tool, label: ev.label, detail: ev.detail, full: ev.full, at };
        set({ asks: { ...s.asks, [ev.requestId]: ask }, feed: feed(agentName(ev.who), ev.label, 'ask') });
        // le plan de Max : il s'affiche dans la conversation, avec « Valider » et « Demander des changements »
        if (ev.tool === 'ExitPlanMode') set({ chat: [...get().chat, { id: ++feedId, at, kind: 'plan', text: ev.detail, requestId: ev.requestId, plan: 'pending' }] });
        if (live) { sfx('ask'); void say('feu-vert', true); }
        break;
      }
      case 'ask_done': {
        const asks = { ...s.asks };
        delete asks[ev.requestId];
        set({ asks });
        if (s.chat.some((c) => c.requestId === ev.requestId)) {
          const state: ChatMsg['plan'] = ev.cancelled ? 'cancelled' : ev.allow ? 'approved' : 'changes';
          const chat = get().chat.map((c) => (c.requestId === ev.requestId ? { ...c, plan: state } : c));
          // tes remarques sur le plan restent dans la conversation
          if (ev.message) chat.push({ id: ++feedId, at, kind: 'user', text: ev.message });
          set({ chat });
        }
        break;
      }
      case 'end': {
        const workMs = s.workMs + (s.busySince ? Math.max(0, at - s.busySince) : 0);
        // le récap de Max : souvent son dernier message, qui devient alors le récap (pas de doublon)
        const msgs = get().chat;
        // (les lignes d'outils du mode technique ne comptent pas : le récap est le dernier message de Max)
        let li = msgs.length - 1;
        while (li >= 0 && msgs[li].kind === 'tool') li--;
        const last = msgs[li];
        const text = ev.text.trim();
        const turnMs = s.busySince ? Math.max(0, at - s.busySince) : 0;
        const meta = { usage: ev.usage, ms: turnMs };
        const recap = last?.kind === 'chef' && (!text || last.text.trim() === text)
          ? [...msgs.slice(0, li), { ...last, kind: 'final' as const, ok: ev.ok, ...meta }, ...msgs.slice(li + 1)]
          : text ? chat('final', text, ev.ok, meta) : chat('note', ev.ok ? 'Mission accomplie.' : ev.stopped ? 'Mission arrêtée.' : 'La mission s’est mal terminée.', ev.ok, meta);
        set({
          final: { ok: ev.ok, text: ev.text, ms: ev.ms, stopped: ev.stopped, at }, busySince: null, workMs, asks: {},
          showFinal: false, chat: recap, feed: feed('Max', ev.ok ? 'Mission accomplie !' : ev.stopped ? 'Mission arrêtée.' : 'La mission s’est mal terminée.', 'end'),
        });
        if (live) sfx(ev.ok ? 'done' : 'error');
        if (live && ev.ok) setTimeout(() => { void say('accomplie', true); }, 900);
        // d'abord Max fait la fête (confettis), puis la carte du rendu s'ouvre
        // (en mode projet, le récap est dans la conversation : pas de carte qui s'ouvre)
        if (live && ev.ok && !projectModeOf(get())) setTimeout(() => { if (get().final?.at === at) set({ showFinal: true }); }, 3200);
        break;
      }
      case 'error':
        set({ feed: feed('Max', ev.message, 'error'), chat: chat('error', ev.message) });
        if (live) get().toast('error', ev.message);
        break;
    }
    bus.emit(ev, live);
  },
}));

/** Les membres de l'équipe, dans l'ordre où ils sont arrivés. */
export const teamList = (s: S) => s.order.map((id) => s.agents[id]).filter(Boolean);

/** Mode projet : la mission en cours travaille dans un de tes projets (ou, sans mission, un projet est choisi). */
export const projectModeOf = (s: S) => (s.mission ? !!s.mission.project : s.connection === 'live' && !!s.settings.workdir);

/** Vue développeur : réglée par l'utilisateur, sinon activée d'office en mode projet (jamais en cadre vertical ni en tournage). */
export const denseOf = (s: S) => !s.vertical && !s.portrait && !s.filming && (s.dense ?? projectModeOf(s));

// le dessin du bureau et les noms des métiers suivent le mode
setProjectMode(projectModeOf(useOffice.getState()));
useOffice.subscribe((s) => setProjectMode(projectModeOf(s)));

/** Le mode technique : réglé à la main, sinon activé en mode projet. */
export const techOf = (s: S) => s.tech ?? projectModeOf(s);

/** Le plan de Max qui attend ta validation (mode projet), s'il y en a un. */
export const pendingPlanOf = (s: S) => Object.values(s.asks).find((a) => a.tool === 'ExitPlanMode') ?? null;
