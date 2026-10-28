// L'index de l'historique : une base SQLite (node:sqlite) qui range le texte des missions pour le retrouver vite.
// Les fichiers .jsonl restent la source de vérité : la base se reconstruit toute seule, on peut la supprimer sans rien perdre.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { AgentUse, Logged, MissionInfo, Role, SearchHit, Stats, WeekDay } from '../shared/protocol.ts';

// l'import est dynamique : si cette version de Node n'a pas SQLite, le bureau marche, sans la recherche
type Db = import('node:sqlite').DatabaseSync;

/** Les marques autour des mots trouvés dans un extrait (le navigateur les met en valeur). */
export const MARK_OPEN = '\u0001';
export const MARK_CLOSE = '\u0002';

const SCHEMA = 3;
const SYNC_EVERY_MS = 2000;
const MAX_TEXT = 4000;

/** Les mots tapés, tels que FTS5 les comprend : chacun est un début de mot, et tous doivent être là. */
export function ftsQuery(q: string) {
  const words = q.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
  return words.slice(0, 8).map((w) => `"${w}"*`).join(' ');
}

export class Library {
  private db: Db;
  private recDir: string;
  private lastSync = 0;

  private constructor(db: Db, recDir: string) {
    this.db = db;
    this.recDir = recDir;
  }

  /** Ouvre (ou crée) la base ; renvoie null si SQLite n'est pas disponible. */
  static async open(file: string, recDir: string): Promise<Library | null> {
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(file);
      db.exec('PRAGMA journal_mode = WAL');
      // une base plus ancienne n'a pas les mêmes colonnes : on la vide, tout se relit des enregistrements
      const version = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
      if (version < SCHEMA) db.exec(`DROP TABLE IF EXISTS seen; DROP TABLE IF EXISTS agents; DROP TABLE IF EXISTS turns; DROP TABLE IF EXISTS docs; PRAGMA user_version = ${SCHEMA}`);
      db.exec(`
        CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY, size INTEGER NOT NULL, meta TEXT NOT NULL);
        CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(mission_id UNINDEXED, kind UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2');
        CREATE TABLE IF NOT EXISTS agents (
          mission_id TEXT NOT NULL, agent_id TEXT NOT NULL, role TEXT NOT NULL, name TEXT NOT NULL,
          tokens INTEGER NOT NULL DEFAULT 0, tools INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0,
          input INTEGER NOT NULL DEFAULT 0, output INTEGER NOT NULL DEFAULT 0, cache_read INTEGER NOT NULL DEFAULT 0, cache_write INTEGER NOT NULL DEFAULT 0,
          thinking INTEGER NOT NULL DEFAULT 0, model TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS turns (mission_id TEXT NOT NULL, at INTEGER NOT NULL, input INTEGER NOT NULL, output INTEGER NOT NULL, cache_read INTEGER NOT NULL, cache_write INTEGER NOT NULL, cost REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS agents_mission ON agents (mission_id);
        CREATE INDEX IF NOT EXISTS turns_mission ON turns (mission_id);
      `);
      return new Library(db, recDir);
    } catch {
      return null;
    }
  }

  close() { try { this.db.close(); } catch { /* déjà fermée */ } }

  /** Met à jour l'index pour les missions dont l'enregistrement a changé. */
  sync(missions: MissionInfo[], force = false) {
    const now = Date.now();
    if (!force && now - this.lastSync < SYNC_EVERY_MS) return;
    this.lastSync = now;
    const known = new Map(this.db.prepare('SELECT id, size, meta FROM seen').all().map((r) => [String(r.id), r]));
    const ids = new Set(missions.map((m) => m.id));
    for (const m of missions) {
      const file = path.join(this.recDir, `${m.id}.jsonl`);
      const size = existsSync(file) ? statSync(file).size : 0;
      const meta = `${m.title}|${m.project ?? ''}|${m.branch ?? ''}`;
      const was = known.get(m.id);
      if (was && Number(was.size) === size && was.meta === meta) continue;
      this.reindex(m, file, size, meta);
    }
    // une mission qui a quitté la liste sort de l'index
    for (const id of known.keys()) if (!ids.has(id)) this.forget(id);
  }

  private forget(id: string) {
    for (const t of ['docs', 'agents', 'turns']) this.db.prepare(`DELETE FROM ${t} WHERE mission_id = ?`).run(id);
    this.db.prepare('DELETE FROM seen WHERE id = ?').run(id);
  }

  private reindex(m: MissionInfo, file: string, size: number, meta: string) {
    const rows: [string, string][] = [['title', [m.title, m.project, m.branch].filter(Boolean).join(' · ')]];
    let raw = '';
    try { raw = size ? readFileSync(file, 'utf8') : ''; } catch { /* illisible */ }
    const agents = new Map<string, { role: string; name: string; tokens: number; tools: number; ms: number; ok: number; use?: AgentUse }>();
    const turns: [number, number, number, number, number, number][] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let l: Logged;
      try { l = JSON.parse(line) as Logged; } catch { continue; }
      const ev = l.ev;
      if (ev.k === 'hire') agents.set(ev.id, { role: ev.role, name: ev.name, tokens: 0, tools: 0, ms: 0, ok: 0 });
      else if (ev.k === 'leave') {
        const a = agents.get(ev.who);
        if (a) Object.assign(a, { tokens: ev.tokens, tools: ev.tools, ms: ev.ms, ok: ev.ok ? 1 : 0, use: ev.use });
      } else if (ev.k === 'end' && ev.usage) {
        const u = ev.usage;
        turns.push([l.at, u.input, u.output, u.cacheRead ?? 0, u.cacheWrite ?? 0, u.costUsd ?? 0]);
      }
      if (ev.k === 'start') rows.push(['demande', ev.text]);
      else if (ev.k === 'say' && ev.who === 'chef') rows.push(['max', ev.text]);
      else if (ev.k === 'report') rows.push(['rapport', ev.text]);
      else if (ev.k === 'hire') rows.push(['tâche', ev.task]);
      else if (ev.k === 'plan') rows.push(['plan', ev.items.map((i) => i.text).join(' ; ')]);
      else if (ev.k === 'file') { if (ev.isNew) rows.push(['fichier', ev.file.name]); }
      else if (ev.k === 'end') rows.push(['récap', ev.text]);
      else if (ev.k === 'ask_done' && ev.message) rows.push(['remarque', ev.message]);
    }
    const db = this.db;
    db.exec('BEGIN');
    try {
      for (const t of ['docs', 'agents', 'turns']) db.prepare(`DELETE FROM ${t} WHERE mission_id = ?`).run(m.id);
      const addAgent = db.prepare('INSERT INTO agents (mission_id, agent_id, role, name, tokens, tools, ms, ok, input, output, cache_read, cache_write, thinking, model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const [id, a] of agents) addAgent.run(m.id, id, a.role, a.name, a.tokens, a.tools, a.ms, a.ok, a.use?.input ?? 0, a.use?.output ?? 0, a.use?.cacheRead ?? 0, a.use?.cacheWrite ?? 0, a.use?.thinking ?? 0, a.use?.model ?? '');
      const addTurn = db.prepare('INSERT INTO turns (mission_id, at, input, output, cache_read, cache_write, cost) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const t of turns) addTurn.run(m.id, ...t);
      const add = db.prepare('INSERT INTO docs (mission_id, kind, text) VALUES (?, ?, ?)');
      for (const [kind, text] of rows) if (text?.trim()) add.run(m.id, kind, text.slice(0, MAX_TEXT));
      db.prepare('INSERT OR REPLACE INTO seen (id, size, meta) VALUES (?, ?, ?)').run(m.id, size, meta);
      db.exec('COMMIT');
    } catch {
      try { db.exec('ROLLBACK'); } catch { /* rien à défaire */ }
    }
  }

  /** Les missions qui parlent de ce que tu cherches, les plus pertinentes d'abord, avec un extrait. */
  search(q: string, missions: MissionInfo[], limit = 40): SearchHit[] {
    const match = ftsQuery(q);
    if (!match) return [];
    this.sync(missions);
    const known = new Set(missions.map((m) => m.id));
    let rows: Record<string, unknown>[] = [];
    try {
      rows = this.db
        .prepare(`SELECT mission_id, kind, snippet(docs, 2, '${MARK_OPEN}', '${MARK_CLOSE}', '…', 14) AS snip FROM docs WHERE docs MATCH ? ORDER BY rank LIMIT 300`)
        .all(match);
    } catch { return []; }
    const hits: SearchHit[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const id = String(r.mission_id);
      if (seen.has(id) || !known.has(id)) continue;
      seen.add(id);
      hits.push({ missionId: id, kind: String(r.kind), snippet: String(r.snip) });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  /** Les 7 derniers jours (le plus ancien d'abord, aujourd'hui en dernier) : missions lancées et tokens consommés. */
  week(missions: MissionInfo[]): WeekDay[] {
    this.sync(missions);
    const days: WeekDay[] = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const x = new Date(d);
      x.setDate(d.getDate() - i);
      days.push({ day: x.getTime(), missions: 0, tokens: 0 });
    }
    const first = days[0].day;
    const tokens = new Map<string, number>();
    for (const r of this.db.prepare('SELECT mission_id, sum(tokens) AS t FROM agents GROUP BY mission_id').all()) tokens.set(String(r.mission_id), Number(r.t));
    for (const r of this.db.prepare('SELECT mission_id, sum(input + output + cache_read + cache_write) AS t FROM turns GROUP BY mission_id').all()) tokens.set(String(r.mission_id), (tokens.get(String(r.mission_id)) ?? 0) + Number(r.t));
    for (const m of missions) {
      if (m.createdAt < first) continue;
      const slot = days.findLast((x) => x.day <= m.createdAt);
      if (!slot) continue;
      slot.missions++;
      slot.tokens += tokens.get(m.id) ?? 0;
    }
    return days;
  }

  /** Le bilan de la consommation sur les `days` derniers jours (0 : depuis toujours). */
  stats(missions: MissionInfo[], days: number): Stats {
    this.sync(missions);
    const since = days > 0 ? Date.now() - days * 86_400_000 : 0;
    const inRange = new Map(missions.filter((m) => m.createdAt >= since).map((m) => [m.id, m]));
    const team = new Map<string, number>();
    const chef = new Map<string, number>();
    const cost = new Map<string, number>();
    const roles = new Map<string, { tokens: number; agents: number; output: number; thinking: number }>();
    for (const r of this.db.prepare('SELECT mission_id, role, count(*) AS n, sum(tokens) AS t, sum(output) AS o, sum(thinking) AS k FROM agents GROUP BY mission_id, role').all()) {
      const id = String(r.mission_id);
      if (!inRange.has(id)) continue;
      team.set(id, (team.get(id) ?? 0) + Number(r.t));
      const x = roles.get(String(r.role)) ?? { tokens: 0, agents: 0, output: 0, thinking: 0 };
      x.tokens += Number(r.t); x.agents += Number(r.n); x.output += Number(r.o); x.thinking += Number(r.k);
      roles.set(String(r.role), x);
    }
    for (const r of this.db.prepare('SELECT mission_id, sum(input + output + cache_read + cache_write) AS t, sum(cost) AS c FROM turns GROUP BY mission_id').all()) {
      const id = String(r.mission_id);
      if (!inRange.has(id)) continue;
      chef.set(id, Number(r.t));
      cost.set(id, Number(r.c));
    }
    const out: Stats = { days, missions: inRange.size, team: 0, chef: 0, costUsd: 0, byRole: [], byProject: [], byWeek: [], top: [] };
    const projects = new Map<string, { missions: number; tokens: number }>();
    const weeks = new Map<number, { missions: number; tokens: number }>();
    for (const [id, m] of inRange) {
      const t = team.get(id) ?? 0, c = chef.get(id) ?? 0;
      out.team += t; out.chef += c; out.costUsd += cost.get(id) ?? 0;
      const p = projects.get(m.project ?? '') ?? { missions: 0, tokens: 0 };
      p.missions++; p.tokens += t + c;
      projects.set(m.project ?? '', p);
      const w = weekStart(m.createdAt);
      const x = weeks.get(w) ?? { missions: 0, tokens: 0 };
      x.missions++; x.tokens += t + c;
      weeks.set(w, x);
      out.top.push({ missionId: id, title: m.title, tokens: t + c, team: t });
    }
    out.byRole = [...roles.entries()].map(([role, v]) => ({ role: role as Role, ...v })).sort((a, b) => b.tokens - a.tokens);
    out.byProject = [...projects.entries()].map(([project, v]) => ({ project, ...v })).sort((a, b) => b.tokens - a.tokens).slice(0, 12);
    out.byWeek = [...weeks.entries()].map(([week, v]) => ({ week, ...v })).sort((a, b) => a.week - b.week).slice(-12);
    out.top = out.top.sort((a, b) => b.tokens - a.tokens).slice(0, 5);
    return out;
  }
}

/** Le lundi (à minuit, heure locale) de la semaine de cette date. */
function weekStart(at: number) {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
