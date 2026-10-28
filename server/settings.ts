// Les réglages du bureau : leurs valeurs par défaut, et le nettoyage de ce qu'envoie le navigateur
// (seulement des valeurs connues : le reste est écarté).
import { DEFAULT_BRANCH_PATTERN } from '../shared/branch.ts';
import type { Role, Settings } from '../shared/protocol.ts';

export const MAX_RECENT = 6;

export const DEFAULT_SETTINGS: Settings = { chefModel: 'sonnet', teamModel: 'sonnet', permission: 'auto', roleModels: {}, workdir: '', recent: [], branchPattern: DEFAULT_BRANCH_PATTERN, quick: false, skills: false, mcpOff: {}, chefEffort: '', roleEffort: {} };
export const CHEF_MODELS = ['', 'sonnet', 'opus', 'haiku', 'fable'];
export const TEAM_MODELS = ['sonnet', 'haiku', 'opus', 'fable', 'inherit'];
const MODEL_ROLES: Role[] = ['recherche', 'code', 'design', 'redaction', 'analyse'];

/** Les modèles par métier : seulement des métiers connus et des modèles connus (le reste est écarté). */
export function cleanRoleModels(v: Partial<Record<Role, unknown>>): Partial<Record<Role, string>> {
  const out: Partial<Record<Role, string>> = {};
  for (const r of MODEL_ROLES) {
    const m = v[r];
    if (typeof m === 'string' && TEAM_MODELS.includes(m)) out[r] = m;
  }
  return out;
}
export const EFFORT_LEVELS = ['', 'low', 'medium', 'high', 'xhigh', 'max'];
export function cleanRoleEffort(v: Partial<Record<Role, unknown>>): Partial<Record<Role, string>> {
  const out: Partial<Record<Role, string>> = {};
  for (const r of MODEL_ROLES) { const e = v[r]; if (typeof e === 'string' && e && EFFORT_LEVELS.includes(e)) out[r] = e; }
  return out;
}
/** Les connecteurs coupés par projet : des listes de clés « claude.ai:Canva », sans rien d'autre. */
export function cleanMcpOff(v: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [dir, list] of Object.entries(v).slice(0, 100)) {
    if (!Array.isArray(list)) continue;
    const keys = list.filter((k): k is string => typeof k === 'string' && /^(claude\.ai|local):.{1,80}$/.test(k)).slice(0, 60);
    if (keys.length) out[dir.slice(0, 500)] = [...new Set(keys)];
  }
  return out;
}

/** Les réglages après la demande du navigateur : ce qui est valable est pris, le reste reste comme avant. */
export function mergeSettings(cur: Settings, p: Partial<Settings>, workdir: string): Settings {
  return {
    chefModel: typeof p.chefModel === 'string' && CHEF_MODELS.includes(p.chefModel) ? p.chefModel : cur.chefModel,
    teamModel: typeof p.teamModel === 'string' && TEAM_MODELS.includes(p.teamModel) ? p.teamModel : cur.teamModel,
    permission: p.permission === 'ask' || p.permission === 'auto' ? p.permission : cur.permission,
    roleModels: p.roleModels && typeof p.roleModels === 'object' ? cleanRoleModels(p.roleModels) : cur.roleModels,
    workdir,
    // le dernier dossier choisi passe en tête de la liste (le navigateur ne peut pas la modifier)
    recent: workdir ? [workdir, ...cur.recent.filter((d) => d !== workdir)].slice(0, MAX_RECENT) : cur.recent,
    branchPattern: typeof p.branchPattern === 'string' ? p.branchPattern.trim().slice(0, 100) || DEFAULT_BRANCH_PATTERN : cur.branchPattern,
    quick: typeof p.quick === 'boolean' ? p.quick : cur.quick,
    skills: typeof p.skills === 'boolean' ? p.skills : cur.skills,
    mcpOff: p.mcpOff && typeof p.mcpOff === 'object' ? cleanMcpOff(p.mcpOff) : cur.mcpOff,
    chefEffort: typeof p.chefEffort === 'string' && EFFORT_LEVELS.includes(p.chefEffort) ? p.chefEffort : cur.chefEffort,
    roleEffort: p.roleEffort && typeof p.roleEffort === 'object' ? cleanRoleEffort(p.roleEffort) : cur.roleEffort,
  };
}
