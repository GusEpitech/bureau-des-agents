// L'index de l'historique : une base SQLite (node:sqlite) qui range le texte des missions pour le retrouver vite.
// Les fichiers .jsonl restent la source de vérité : la base se reconstruit toute seule, on peut la supprimer sans rien perdre.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Logged, MissionInfo, SearchHit } from '../shared/protocol.ts';

// l'import est dynamique : si cette version de Node n'a pas SQLite, le bureau marche, sans la recherche
type Db = import('node:sqlite').DatabaseSync;

/** Les marques autour des mots trouvés dans un extrait (le navigateur les met en valeur). */
export const MARK_OPEN = '\u0001';
export const MARK_CLOSE = '\u0002';

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
      db.exec(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY, size INTEGER NOT NULL, meta TEXT NOT NULL);
        CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(mission_id UNINDEXED, kind UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2');
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
    this.db.prepare('DELETE FROM docs WHERE mission_id = ?').run(id);
    this.db.prepare('DELETE FROM seen WHERE id = ?').run(id);
  }

  private reindex(m: MissionInfo, file: string, size: number, meta: string) {
    const rows: [string, string][] = [['title', [m.title, m.project, m.branch].filter(Boolean).join(' · ')]];
    let raw = '';
    try { raw = size ? readFileSync(file, 'utf8') : ''; } catch { /* illisible */ }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let l: Logged;
      try { l = JSON.parse(line) as Logged; } catch { continue; }
      const ev = l.ev;
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
      db.prepare('DELETE FROM docs WHERE mission_id = ?').run(m.id);
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
}
