// Le nom de la branche git d'une mission (mode projet), d'après le modèle choisi dans les réglages.
// Partagé : le serveur crée la branche, le navigateur montre un aperçu du nom.

export const DEFAULT_BRANCH_PATTERN = 'bureau/{date}-{titre}';

/** Les morceaux qu'on peut mettre dans le modèle. */
export const BRANCH_TOKENS: [string, string][] = [
  ['{titre}', 'le titre de la mission'],
  ['{ticket}', 'le ticket cité dans ta demande (SCRUM-17)'],
  ['{date}', 'la date (2026-10-27)'],
  ['{heure}', 'l’heure (11h20)'],
  ['{projet}', 'le nom du projet'],
];

/** Un morceau de nom sûr : minuscules sans accents, mots séparés par des tirets. */
export const slugify = (s: string, max = 50) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');

/** Le premier ticket cité dans la demande, au format Jira (SCRUM-17, PROJ-123), ou ''. */
export const ticketOf = (prompt: string) => /\b[A-Z][A-Z0-9]{1,9}-\d+\b/.exec(prompt)?.[0] ?? '';

const pad = (n: number) => String(n).padStart(2, '0');

/** Le nom de la branche, propre pour git : morceaux remplis, séparateurs en double retirés, caractères interdits enlevés. */
export function branchName(pattern: string, v: { title: string; prompt: string; project: string; now: Date }): string {
  const d = v.now;
  const values: Record<string, string> = {
    '{titre}': slugify(v.title.replace(/…$/, '')),
    '{ticket}': ticketOf(v.prompt),
    '{date}': `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    '{heure}': `${pad(d.getHours())}h${pad(d.getMinutes())}`,
    '{projet}': slugify(v.project, 30),
  };
  let name = (pattern.trim() || DEFAULT_BRANCH_PATTERN).replace(/\{[a-z]+\}/g, (t) => values[t] ?? '');
  name = name
    .replace(/\s+/g, '-')
    .replace(/[~^:?*[\]\\@{}"'<>|]+/g, '') // interdits par git (ou pénibles dans un terminal)
    .replace(/\.{2,}/g, '.')
    .replace(/\/{2,}/g, '/')
    .replace(/-{2,}/g, '-')
    .replace(/_{2,}/g, '_')
    .split('/').map((p) => p.replace(/^[-._]+|[-._]+$/g, '').replace(/\.lock$/, '')).filter(Boolean).join('/');
  return name.slice(0, 120).replace(/[-/._]+$/, '') || 'bureau/mission';
}
