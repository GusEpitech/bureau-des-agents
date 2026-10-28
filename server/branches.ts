// Les branches git d'une mission : en créer une au départ, la renommer quand Max a lu le ticket,
// suivre un renommage fait à la main. Tout passe par la ligne de commande `git`.
import { execFileSync } from 'node:child_process';
import type { MissionInfo } from '../shared/protocol.ts';

/** Lance `git` dans ce dossier ; échoue (exception) si la commande échoue. */
export function gitIn(folder: string) {
  return (...args: string[]) => execFileSync('git', ['-C', folder, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function hasBranch(git: (...a: string[]) => string, branch: string) {
  try { git('rev-parse', '--verify', '--quiet', `refs/heads/${branch}`); return true; } catch { return false; }
}

/** La branche git actuelle du dossier (null si ce n'est pas un dépôt). */
export function currentBranch(folder: string): string | null {
  try { return execFileSync('git', ['-C', folder, 'symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

/** Crée la branche de la mission (renvoie null si ce n'est pas un dépôt) ; erreur claire si le dépôt a des changements pas commités. */
export function createBranch(folder: string, wanted: string): { branch: string; base: string } | null {
  const git = gitIn(folder);
  try {
    if (git('rev-parse', '--is-inside-work-tree') !== 'true') return null;
  } catch { return null; } // pas un dépôt git (ou git absent)
  if (git('status', '--porcelain')) {
    throw new Error('Ton projet a des changements pas encore commités. Commite-les (ou mets-les de côté avec « git stash »), puis relance : l’équipe travaillera sur sa propre branche.');
  }
  let base = '';
  try { base = git('symbolic-ref', '--short', 'HEAD'); } catch { base = git('rev-parse', '--short', 'HEAD'); }
  // le nom tiré du modèle des réglages ; git a le dernier mot sur ce qui est un nom valide
  try { git('check-ref-format', '--branch', wanted); } catch {
    throw new Error(`« ${wanted} » n’est pas un nom de branche valide pour git : change le modèle dans les réglages.`);
  }
  let branch = wanted;
  for (let n = 2; hasBranch(git, branch); n++) branch = `${wanted}-${n}`;
  try { git('switch', '-c', branch); } catch {
    try { git('checkout', '-b', branch); } catch (e) {
      throw new Error(`Je n’arrive pas à créer la branche ${branch} : ${e instanceof Error ? e.message.split('\n').pop() : e}`);
    }
  }
  return { branch, base };
}

/**
 * Renomme la branche `from` en `wanted` (un numéro est ajouté si le nom existe). Renvoie le nouveau nom, ou null si on garde l'ancien :
 * la branche a bougé entre-temps, ou git refuse. Le travail continue quoi qu'il arrive.
 */
export function renamedBranch(folder: string, from: string, wanted: string): string | null {
  const git = gitIn(folder);
  try {
    if (currentBranch(folder) !== from) return null;
    let branch = wanted;
    for (let n = 2; hasBranch(git, branch); n++) branch = `${wanted}-${n}`;
    git('check-ref-format', '--branch', branch);
    git('branch', '-m', from, branch);
    return branch;
  } catch { return null; }
}

/**
 * Tu as renommé la branche toi-même (dans un terminal, avant de pousser) : renvoie son nouveau nom, pour que la mission le suive
 * au lieu de se plaindre. Seulement si l'ancienne n'existe plus et que le dossier est sur une autre branche que celle de départ.
 */
export function followedBranch(m: MissionInfo): string | null {
  if (!m.project || !m.branch) return null;
  try {
    if (hasBranch(gitIn(m.folder), m.branch)) return null;
    const now = currentBranch(m.folder);
    return !now || now === m.baseBranch ? null : now;
  } catch { return null; }
}
