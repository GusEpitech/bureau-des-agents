// La base SQLite du bureau (.bureau/bureau.db) : un seul fichier, ouvert une fois, partagé par l'état (store.ts)
// et l'index de l'historique (library.ts). Node 22 l'intègre (node:sqlite) ; sans lui, le bureau garde l'ancien fichier d'état.
export type Db = import('node:sqlite').DatabaseSync;

/** Ouvre (ou crée) la base ; renvoie null si SQLite n'est pas disponible. */
export async function openDb(file: string): Promise<Db | null> {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL');
    return db;
  } catch {
    return null;
  }
}
