// Les versions d'un rendu : une copie à chaque changement, rangée dans .bureau/versions/<mission>/<fichier>/.
import { copyFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { VersionInfo } from '../shared/protocol.ts';

/** au-delà, un fichier n'est pas gardé en version (vidéos, gros exports) */
export const MAX_VERSION_SIZE = 5_000_000;
const MAX_VERSIONS = 30;

/** Un nom de dossier sûr pour ranger les versions d'un fichier. */
export const versionDirName = (rel: string) => rel.replace(/[\\/]+/g, '__').replace(/[^\w.\-À-ÿ ]+/g, '_').slice(0, 160);

/** Garde une copie de chaque version d'un rendu (l'historique des versions). */
export async function keepVersion(verDir: string, missionId: string, rel: string, abs: string, at: number, by: string) {
  try {
    const dir = path.join(verDir, missionId, versionDirName(rel));
    await mkdir(dir, { recursive: true });
    const safeBy = by.replace(/[^\w-]/g, '').slice(0, 64) || 'chef';
    await copyFile(abs, path.join(dir, `${Math.round(at)}__${safeBy}${path.extname(rel)}`));
    const all = (await readdir(dir)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - MAX_VERSIONS))) await unlink(path.join(dir, old)).catch(() => {});
  } catch { /* pas de version cette fois : le fichier reste là */ }
}

/** Les versions d'un rendu, de la plus récente à la plus ancienne. */
export async function listVersions(verDir: string, missionId: string, file: string): Promise<VersionInfo[]> {
  const dir = path.join(verDir, missionId, versionDirName(file));
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: VersionInfo[] = [];
  for (const n of names) {
    const m = n.match(/^(\d+)__([\w-]*)/);
    if (!m) continue;
    const st = await stat(path.join(dir, n)).catch(() => null);
    if (st) out.push({ id: n, at: Number(m[1]), size: st.size, by: m[2] || 'chef' });
  }
  return out.sort((a, b) => b.at - a.at);
}
