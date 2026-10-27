// Le mode technique : ce que fait vraiment un agent (la commande, l'outil et son argument), au lieu
// du libellé en français. Les chemins passent par tidy() à l'affichage, comme partout.
import type { TurnUsage } from '../../shared/protocol.ts';

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** L'entrée brute d'un outil (JSON tronqué : on la lit comme on peut). */
export function parseRaw(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v as Record<string, unknown> : null; } catch { return null; }
}

/** « $ npm test », « Edit src/app.ts », « Grep "useOffice" src »… */
export function techLabel(tool: string | undefined, raw: string | undefined, fallback = ''): string {
  const name = tool || 'Outil';
  const i = parseRaw(raw);
  if (!i) return raw ? `${name} ${cut(raw.replace(/\s+/g, ' '), 90)}` : `${name} ${fallback}`.trim();
  const str = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '');
  switch (name) {
    case 'Bash': return `$ ${cut(str('command').replace(/\s+/g, ' ').trim(), 120)}`;
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit': return `${name} ${str('file_path') || str('notebook_path')}`;
    case 'Grep': return `Grep "${cut(str('pattern'), 60)}"${str('path') ? ` ${str('path')}` : ''}${str('glob') ? ` --glob ${str('glob')}` : ''}`;
    case 'Glob': return `Glob ${str('pattern')}${str('path') ? ` ${str('path')}` : ''}`;
    case 'WebFetch': return `WebFetch ${str('url')}`;
    case 'WebSearch': return `WebSearch "${cut(str('query'), 80)}"`;
    case 'Skill': return `Skill ${str('skill') || str('command')}`;
  }
  const first = Object.values(i).find((v) => typeof v === 'string') as string | undefined;
  return first ? `${name} ${cut(first.replace(/\s+/g, ' '), 90)}` : name;
}

/** Une entrée brute lisible (JSON indenté ; la commande telle quelle pour Bash). */
export function prettyRaw(tool: string | undefined, raw: string | undefined): string {
  const i = parseRaw(raw);
  if (!i) return raw ?? '';
  if (tool === 'Bash' && typeof i.command === 'string') return `$ ${i.command}${typeof i.description === 'string' ? `\n# ${i.description}` : ''}`;
  return JSON.stringify(i, null, 2);
}

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k` : String(n));

/** « 12,4 k tokens en entrée · 1,2 k en sortie · 0,08 $ · 3 tours · 1 min 12 s » */
export function usageLine(u: TurnUsage | undefined, ms: number | undefined): string {
  const parts: string[] = [];
  if (u) {
    const input = u.input + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0);
    parts.push(`${k(input)} tokens en entrée${u.cacheRead ? ` (dont ${k(u.cacheRead)} en cache)` : ''}`, `${k(u.output)} en sortie`);
    if (u.costUsd !== undefined) parts.push(`${u.costUsd.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: u.costUsd < 0.1 ? 3 : 2 })} $`);
    if (u.turns) parts.push(`${u.turns} tour${u.turns > 1 ? 's' : ''}`);
  }
  if (ms) {
    const s = Math.round(ms / 1000);
    parts.push(s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`);
  }
  return parts.join(' · ');
}
