// L'état du bureau (les missions, les réglages, le quota, la mission ouverte), gardé dans la base SQLite.
// Les missions ont leurs colonnes (titre, projet, branche, statut…) : on les retrouve avec n'importe quel outil SQL.
// Sans SQLite, on retombe sur l'ancien fichier state.json. Un state.json existant est migré une seule fois, puis
// mis de côté (state.json.migrated) : on ne le supprime jamais.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { MissionInfo } from '../shared/protocol.ts';
import type { Db } from './db.ts';
import type { State } from './types.ts';

export class StateStore {
  private db: Db | null;
  private jsonFile: string;
  /** ce qui est déjà écrit pour chaque mission : on n'écrit que ce qui a changé */
  private written = new Map<string, string>();

  constructor(db: Db | null, jsonFile: string) {
    this.db = db;
    this.jsonFile = jsonFile;
    db?.exec(`
      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, title TEXT NOT NULL, project TEXT, branch TEXT,
        status TEXT NOT NULL, work_ms INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS missions_created ON missions (created_at);
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }

  /** L'état gardé (null s'il n'y en a pas encore, ou s'il est illisible). */
  load(): Partial<State> | null {
    if (this.db) {
      const fromDb = this.fromDb();
      if (fromDb) return fromDb;
    }
    if (!existsSync(this.jsonFile)) return null;
    let old: Partial<State>;
    try { old = JSON.parse(readFileSync(this.jsonFile, 'utf8')) as Partial<State>; } catch { return null; }
    // première fois avec SQLite : on range l'ancien état dans la base, puis on met le fichier de côté
    if (this.db && Array.isArray(old.missions) && old.settings) {
      try {
        this.save({ missions: old.missions, settings: old.settings, quota: old.quota ?? null, currentId: old.currentId });
        renameSync(this.jsonFile, this.jsonFile + '.migrated');
      } catch { /* la migration recommencera au prochain lancement : le fichier est toujours là */ }
    }
    return old;
  }

  private fromDb(): Partial<State> | null {
    const db = this.db!;
    const kv = new Map(db.prepare('SELECT key, value FROM kv').all().map((r) => [String(r.key), String(r.value)]));
    if (!kv.has('settings')) return null;
    const missions: MissionInfo[] = [];
    for (const r of db.prepare('SELECT id, data FROM missions ORDER BY created_at').all()) {
      const data = String(r.data);
      try { missions.push(JSON.parse(data) as MissionInfo); this.written.set(String(r.id), data); } catch { /* ligne abîmée : ignorée */ }
    }
    const parse = <T>(k: string): T | undefined => { try { return kv.has(k) ? (JSON.parse(kv.get(k)!) as T) : undefined; } catch { return undefined; } };
    return { missions, settings: parse('settings'), quota: parse('quota') ?? null, currentId: parse<string>('currentId') };
  }

  /** Écrit l'état d'un coup (en transaction : jamais à moitié). */
  save(state: State) {
    if (!this.db) { this.saveJson(state); return; }
    const db = this.db;
    db.exec('BEGIN');
    try {
      const upsert = db.prepare(`
        INSERT INTO missions (id, created_at, title, project, branch, status, work_ms, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET created_at = excluded.created_at, title = excluded.title, project = excluded.project,
          branch = excluded.branch, status = excluded.status, work_ms = excluded.work_ms, data = excluded.data`);
      const ids = new Set<string>();
      for (const m of state.missions) {
        ids.add(m.id);
        const data = JSON.stringify(m);
        if (this.written.get(m.id) === data) continue;
        upsert.run(m.id, m.createdAt, m.title, m.project ?? null, m.branch ?? null, m.status, m.workMs, data);
        this.written.set(m.id, data);
      }
      const drop = db.prepare('DELETE FROM missions WHERE id = ?');
      for (const id of [...this.written.keys()]) if (!ids.has(id)) { drop.run(id); this.written.delete(id); }
      const put = db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      const del = db.prepare('DELETE FROM kv WHERE key = ?');
      put.run('settings', JSON.stringify(state.settings));
      if (state.quota) put.run('quota', JSON.stringify(state.quota)); else del.run('quota');
      if (state.currentId) put.run('currentId', JSON.stringify(state.currentId)); else del.run('currentId');
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* rien à défaire */ }
      throw e;
    }
  }

  /** L'ancienne façon, sans SQLite : un fichier écrit d'un coup. */
  private saveJson(state: State) {
    const tmp = this.jsonFile + '.tmp';
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, this.jsonFile);
  }
}
