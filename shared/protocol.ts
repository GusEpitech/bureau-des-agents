// Le contrat entre le bureau (navigateur) et le pont (serveur Node qui pilote Claude Code).
// Tout passe par une seule connexion WebSocket, en JSON. Syntaxe « effaçable » uniquement :
// ce fichier est lu tel quel par Node (sans compilation) et par Vite.

/** Les métiers du bureau. « chef » = l'agent principal, celui à qui tu parles. */
export type Role = 'chef' | 'recherche' | 'code' | 'design' | 'redaction' | 'analyse' | 'renfort';

/** Ce que fait un agent à un instant : sert à l'animation, à l'icône et à la bulle. */
export type ActKind = 'search' | 'web' | 'read' | 'write' | 'edit' | 'bash' | 'plan' | 'skill' | 'mcp' | 'other';

export interface PlanItem { text: string; status: 'pending' | 'in_progress' | 'completed' }

/** Un fichier produit par l'équipe, dans le dossier de la mission. */
export interface FileInfo { path: string; name: string; ext: string; size: number; at: number; by: string }

export interface MissionStats { agents: number; searches: number; pages: number; reads: number; writes: number; commands: number }

export type MissionStatus = 'working' | 'done' | 'stopped' | 'error';

export interface MissionInfo {
  id: string;
  title: string;
  prompt: string;
  /** le dossier de la mission, sur ton ordinateur */
  folder: string;
  /** mode projet : le nom du dossier de travail choisi (absent = un dossier neuf dans « Missions ») */
  project?: string;
  /** mode projet : la branche git créée pour la mission, et celle d'où elle part */
  branch?: string;
  baseBranch?: string;
  createdAt: number;
  endedAt?: number;
  /** temps de travail cumulé (toutes les reprises comprises) */
  workMs: number;
  status: MissionStatus;
  sessionId?: string;
  model?: string;
  stats: MissionStats;
  files: FileInfo[];
  /** le dernier message du chef, une fois la mission rendue */
  final?: string;
}

/**
 * Ce qui se passe dans le bureau. `who` vaut « chef » ou l'identifiant d'un agent de l'équipe
 * (l'identifiant de l'appel Agent qui l'a fait venir).
 */
export type OfficeEvent =
  | { k: 'start'; text: string }
  | { k: 'init'; model: string; auth: string }
  | { k: 'think'; who: string }
  | { k: 'typing'; who: string; text: string }
  | { k: 'say'; who: string; text: string }
  | { k: 'plan'; items: PlanItem[] }
  | { k: 'hire'; id: string; role: Role; type: string; name: string; task: string; prompt: string }
  /** raw : l'entrée brute de l'outil (JSON compact, tronqué), pour le mode technique */
  | { k: 'act'; who: string; id: string; kind: ActKind; tool: string; label: string; detail: string; raw?: string }
  /** out : la sortie de l'outil (tronquée), pour le mode technique */
  | { k: 'act_done'; who: string; id: string; ok: boolean; out?: string }
  /** le rapport qu'un agent rend au chef */
  | { k: 'report'; who: string; text: string }
  /** un agent a fini son travail et quitte son poste */
  | { k: 'leave'; who: string; ok: boolean; tokens: number; tools: number; ms: number }
  | { k: 'file'; file: FileInfo; isNew: boolean }
  /** full = la bulle montre l'action en entier (sinon, on répond dans le panneau, où tout est affiché) */
  | { k: 'ask'; who: string; requestId: string; tool: string; label: string; detail: string; full: boolean }
  | { k: 'ask_done'; requestId: string; allow: boolean; cancelled?: boolean }
  | { k: 'end'; ok: boolean; text: string; ms: number; stopped?: boolean; usage?: TurnUsage }
  | { k: 'error'; message: string };

/** Un événement daté, tel qu'il est enregistré. */
/** Ce qu'a consommé un tour de conversation (le message « result » de Claude Code). */
export interface TurnUsage { input: number; output: number; cacheRead?: number; cacheWrite?: number; costUsd?: number; turns?: number }

export interface Logged { at: number; ev: OfficeEvent }

export interface ClaudeInfo { found: boolean; version?: string; path?: string }

/** Une version enregistrée d'un fichier rendu (à chaque modification par l'équipe). */
export interface VersionInfo { id: string; at: number; size: number; by: string }

/** Un passage d'un agent au bureau (pour l'historique de l'équipe). */
export interface TeamEntry {
  missionId: string;
  missionTitle: string;
  at: number;
  id: string;
  name: string;
  role: Role;
  task: string;
  status: 'working' | 'done' | 'failed';
  tools: number;
  tokens: number;
  ms: number;
  report: string;
}

export interface Settings {
  /** le cerveau du chef : '' = le modèle par défaut de Claude Code */
  chefModel: string;
  /** le cerveau de l'équipe : sonnet, haiku, opus, fable ou inherit (le même que le chef) */
  teamModel: string;
  /** auto : l'équipe décide seule et ne demande que pour les gestes risqués ; ask : elle demande avant chaque commande */
  permission: 'auto' | 'ask';
  /** le dossier où l'équipe travaille : '' = un nouveau dossier pour chaque mission (dans « Missions ») */
  workdir: string;
  /** les derniers dossiers de travail choisis (tenu par le serveur) */
  recent: string[];
}

export interface Quota { fiveHour: number; resetsAt: number | null }

/** Mode projet : un fichier du diff de la mission (l'arbre de travail comparé à la branche de départ). */
export interface DiffFile {
  path: string;
  /** l'ancien nom, pour un fichier renommé */
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  /** les morceaux du diff (lignes « @@ », « + », « - », « espace ») */
  patch: string;
  binary: boolean;
  /** le patch a été coupé (trop gros) */
  truncated: boolean;
}

/** Mode projet : où en est le dépôt de la mission. */
export interface GitStatus {
  /** la branche actuelle du dossier (null : HEAD détachée) */
  branch: string | null;
  missionBranch?: string;
  base?: string;
  /** le dossier est sur la branche de la mission */
  onMission: boolean;
  /** la branche de la mission existe encore */
  branchExists: boolean;
  /** des changements pas encore commités */
  dirty: boolean;
  /** les commits de la branche de la mission qui ne sont pas sur la base */
  ahead: number;
  /** un remote « origin » existe */
  remote: boolean;
  /** la commande gh (GitHub) est installée */
  gh: boolean;
}

export type GitAction = 'status' | 'commit' | 'push' | 'switch_base' | 'delete_branch';

// ── Navigateur → serveur ──
export type ClientMsg =
  | { t: 'start'; prompt: string }
  | { t: 'say'; text: string }
  | { t: 'stop' }
  | { t: 'answer'; requestId: string; allow: boolean }
  | { t: 'new' }
  | { t: 'open'; missionId: string; file?: string }
  /** ouvre le dossier du bureau (ou son règlement) */
  | { t: 'open_root'; rules?: boolean }
  | { t: 'read'; missionId: string; file: string; version?: string }
  | { t: 'versions'; missionId: string; file: string }
  | { t: 'team_history' }
  | { t: 'replay'; missionId: string }
  | { t: 'settings'; settings: Partial<Settings> }
  /** ouvre la fenêtre de choix de dossier de l'ordinateur, pour choisir le dossier de travail */
  | { t: 'pick_folder' }
  /** rouvre une mission passée : sa conversation, son récap, ses fichiers ; on peut ensuite continuer à parler à Max */
  | { t: 'resume'; missionId: string }
  /** mode projet : le diff de la mission */
  | { t: 'diff'; missionId: string }
  /** mode projet : une action git sur la branche de la mission */
  | { t: 'git'; missionId: string; action: GitAction; message?: string };

// ── Serveur → navigateur ──
export type ServerMsg =
  | { t: 'hello'; claude: ClaudeInfo; dir: string; settings: Settings; quota: Quota | null; missions: MissionInfo[]; current: { mission: MissionInfo; log: Logged[] } | null; build?: string }
  | { t: 'mission'; mission: MissionInfo }
  | { t: 'ev'; missionId: string; at: number; ev: OfficeEvent }
  | { t: 'closed'; missionId: string }
  /** une mission passée rouverte devient la mission en cours (avec tout ce qui s'y est passé) */
  | { t: 'current'; mission: MissionInfo; log: Logged[] }
  | { t: 'replay'; mission: MissionInfo; log: Logged[] }
  | { t: 'file_text'; missionId: string; file: string; text: string; truncated: boolean; version?: string }
  | { t: 'versions'; missionId: string; file: string; list: VersionInfo[] }
  | { t: 'team_history'; entries: TeamEntry[] }
  | { t: 'quota'; quota: Quota }
  | { t: 'settings'; settings: Settings }
  | { t: 'toast'; kind: 'info' | 'error'; text: string }
  /** mode projet : le diff (ok faux : text explique pourquoi il n'y en a pas) */
  | { t: 'diff'; missionId: string; ok: boolean; text?: string; note?: string; files: DiffFile[]; truncated: boolean }
  | { t: 'git_status'; missionId: string; status: GitStatus | null; text?: string }
  | { t: 'git_done'; missionId: string; action: GitAction; ok: boolean; text: string; url?: string };
