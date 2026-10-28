// L'enregistrement d'une mission (.bureau/missions/<id>.jsonl) : sa lecture, et l'historique de l'équipe qui s'en déduit.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Logged, MissionInfo, Role, TeamEntry } from '../shared/protocol.ts';

/** Tout ce qui s'est passé dans une mission (les lignes coupées sont ignorées ; vide si rien n'a été enregistré). */
export async function readLog(recDir: string, missionId: string): Promise<Logged[]> {
  const raw = await readFile(path.join(recDir, `${missionId}.jsonl`), 'utf8').catch(() => '');
  const log: Logged[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { log.push(JSON.parse(line) as Logged); } catch { /* ligne coupée */ }
  }
  return log;
}

/** Tous les agents passés au bureau, mission par mission (les plus récentes d'abord). */
export async function teamHistory(recDir: string, missions: MissionInfo[]): Promise<TeamEntry[]> {
  const out: TeamEntry[] = [];
  for (const m of missions) {
    const byId = new Map<string, TeamEntry>();
    for (const l of await readLog(recDir, m.id)) {
      const ev = l.ev;
      if (ev.k === 'hire') {
        byId.set(ev.id, {
          missionId: m.id, missionTitle: m.title, at: l.at, id: ev.id, name: ev.name, role: ev.role as Role, task: ev.task,
          status: 'working', tools: 0, tokens: 0, ms: 0, report: '',
        });
      } else if (ev.k === 'report') {
        const e = byId.get(ev.who);
        if (e) e.report = ev.text.slice(0, 600);
      } else if (ev.k === 'leave') {
        const e = byId.get(ev.who);
        if (e) Object.assign(e, { status: ev.ok ? 'done' : 'failed', tools: ev.tools, tokens: ev.tokens, ms: ev.ms || l.at - e.at });
      }
    }
    out.push(...[...byId.values()].reverse());
  }
  return out;
}
