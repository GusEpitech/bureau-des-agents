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

/** Le premier ticket cité dans la demande : SCRUM-17, PROJ-123, US21, « ticket #45 »… ou ''. */
export const ticketOf = (prompt: string) => {
  const m = /\b[A-Za-z][A-Za-z0-9]{1,9}-\d+\b/.exec(prompt) ?? /\b(?:US|TK|TICKET)[-\s#]?\d+\b/i.exec(prompt) ?? /\bticket\s*#?\s*(\d+)/i.exec(prompt);
  return (m?.[1] ?? m?.[0] ?? '').replace(/\s+/g, '');
};

/** Le titre pour la branche : sans le ticket ni les « je souhaite faire le… », six mots au plus. */
export const branchTitle = (title: string, ticket: string) => {
  let t = title.replace(/…$/, '');
  if (ticket) t = t.replace(new RegExp(`\\b${ticket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
  t = t.replace(/^\s*(?:(?:je|j['’])\s*(?:souhaite|souhaiterais|veux|voudrais|aimerais)\s+(?:que\s+tu\s+)?|peux-tu\s+|pourrais-tu\s+|fais(?:-moi)?\s+|s'il te plaît\s+)*(?:faire\s+|traiter\s+|prendre\s+)?(?:le\s+|la\s+|l['’]|les\s+)?(?:ticket|tâche|tache|us|story|user story)?\s*[:\-–]?\s*/i, '');
  return slugify(t.split(/\s+/).filter(Boolean).slice(0, 6).join(' '));
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Le nom de la branche, propre pour git : morceaux remplis, séparateurs en double retirés, caractères interdits enlevés. */
export function branchName(pattern: string, v: { title: string; prompt: string; project: string; now: Date; ticket?: string }): string {
  const d = v.now;
  const ticket = v.ticket ?? ticketOf(v.prompt);
  const values: Record<string, string> = {
    '{titre}': branchTitle(v.title, ticket) || slugify(v.title.replace(/…$/, '')),
    '{ticket}': ticket,
    '{date}': `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    '{heure}': `${pad(d.getHours())}h${pad(d.getMinutes())}`,
    '{projet}': slugify(v.project, 30),
  };
  return tidyBranch((pattern.trim() || DEFAULT_BRANCH_PATTERN).replace(/\{[a-z]+\}/g, (t) => values[t] ?? ''));
}

/** Un nom de branche propre pour git : espaces en tirets, caractères interdits enlevés, séparateurs en double retirés. */
export function tidyBranch(raw: string): string {
  const name = raw
    .replace(/\s+/g, '-')
    .replace(/[~^:?*[\]\\@{}"'<>|]+/g, '') // interdits par git (ou pénibles dans un terminal)
    .replace(/\.{2,}/g, '.')
    .replace(/\/{2,}/g, '/')
    .replace(/-{2,}/g, '-')
    .replace(/_{2,}/g, '_')
    .split('/').map((p) => p.replace(/^[-._]+|[-._]+$/g, '').replace(/\.lock$/, '')).filter(Boolean).join('/');
  return name.slice(0, 120).replace(/[-/._]+$/, '') || 'bureau/mission';
}

/** Le nom proposé par Max dans son plan (ligne « Branche : ticket | titre »), passé par le modèle des réglages ; '' s'il n'y en a pas. */
export function branchFromPlan(plan: string, pattern: string, v: { prompt: string; project: string; createdAt: number }): string {
  const hit = /^\W*branche\s*:\s*(.*)$/im.exec(plan);
  if (!hit) return '';
  const [rawTicket = '', ...rest] = hit[1].includes('|') ? hit[1].split('|') : ['', hit[1]];
  const title = rest.join(' ').replace(/[*_`]/g, '').trim();
  if (!title) return '';
  const ticket = rawTicket.replace(/[*_`\s]/g, '').replace(/^<.*>$/, '');
  return branchName(pattern, { title, prompt: v.prompt, project: v.project, now: new Date(v.createdAt), ticket: ticket || undefined });
}
