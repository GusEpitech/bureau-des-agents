// Petits outils des missions : leur titre, un nom de dossier sûr, l'addition de la consommation de deux tours.
import type { TurnUsage } from '../shared/protocol.ts';

/** Additionne l'usage de deux tours (un tour peut se faire en plusieurs résultats). */
export function addUsage(a: TurnUsage | undefined, b: TurnUsage): TurnUsage {
  if (!a) return b;
  const sum = (x?: number, y?: number) => (x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0));
  return {
    input: a.input + b.input, output: a.output + b.output, cacheRead: sum(a.cacheRead, b.cacheRead), cacheWrite: sum(a.cacheWrite, b.cacheWrite),
    costUsd: sum(a.costUsd, b.costUsd), turns: sum(a.turns, b.turns),
  };
}

export const pad = (n: number) => String(n).padStart(2, '0');

/** Un titre court, tiré de la demande : « Analyse mes 5 concurrents et fais-moi… » → « Analyse mes 5 concurrents et fais-moi » */
export function titleOf(prompt: string) {
  const first = prompt.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? '';
  let t = first.replace(/[.!?:;,]+$/, '');
  if (t.length > 46) t = t.slice(0, 46).replace(/\s+\S*$/, '') + '…';
  return t ? t[0].toUpperCase() + t.slice(1) : 'Mission';
}

export const cleanName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
