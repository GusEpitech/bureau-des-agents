// Se déplacer sans se coincer : trouver la case libre la plus proche, tendre le chemin en ligne droite,
// s'écarter de ceux qu'on croise. Rien ici ne dépend du monde : seulement la grille et les robots.
import { T } from './layout.ts';
import { findPath, type Tile } from './path.ts';
import type { Actor, Pt } from './actor.ts';

/** « aucune case n'est tolérée » pour clear() */
export const NONE: Tile = [-9, -9];

/** Le but est muré (un meuble posé dessus) : la case libre la plus proche qu'on peut atteindre. */
export function nearestReach(grid: boolean[][], from: Tile, to: Tile): Tile[] | null {
  for (let r = 1; r <= 3; r++) {
    const ring: Tile[] = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !grid[to[1] + dy]?.[to[0] + dx]) continue;
      ring.push([to[0] + dx, to[1] + dy]);
    }
    ring.sort((p, q) => Math.hypot(p[0] - to[0], p[1] - to[1]) - Math.hypot(q[0] - to[0], q[1] - to[1]));
    for (const t of ring) { const path = findPath(grid, from, t); if (path) return path; }
  }
  return null;
}

/** Le robot tient dans cette case ? (ses pieds et un peu de large de chaque côté) */
export function clear(grid: boolean[][], x: number, y: number, a: Tile, b: Tile, m = 5) {
  for (const ox of [-m, 0, m]) {
    const tx = Math.floor((x + ox) / T), ty = Math.floor((y - 2) / T);
    if (grid[ty]?.[tx]) continue;
    if ((tx === a[0] && ty === a[1]) || (tx === b[0] && ty === b[1])) continue;
    return false;
  }
  return true;
}

/**
 * Le chemin en cases fait des escaliers : on tend la corde. De chaque point on va au plus loin qu'on voit
 * en ligne droite sans toucher un meuble, ce qui donne des diagonales et des trajets plus naturels.
 */
export function smooth(grid: boolean[][], a: Actor, pts: Pt[], goal: Tile): Pt[] {
  if (pts.length < 2) return pts;
  const start = a.tile;
  const all: Pt[] = [{ x: a.x, y: a.y }, ...pts];
  const sees = (p: Pt, q: Pt) => {
    const n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 2);
    for (let i = 1; i < n; i++) if (!clear(grid, p.x + ((q.x - p.x) * i) / n, p.y + ((q.y - p.y) * i) / n, start, goal, 7)) return false;
    return true;
  };
  const out: Pt[] = [];
  let i = 0;
  while (i < all.length - 1) {
    let j = all.length - 1;
    while (j > i + 1 && !sees(all[i], all[j])) j--;
    out.push(all[j]);
    i = j;
  }
  return out;
}

/** On s'écarte de ceux qu'on croise au lieu de passer à travers : un pas de côté, sans quitter les cases libres. */
export function sidestep(grid: boolean[][], a: Actor, dt: number, actors: Iterable<Actor>, cat: Pt) {
  const to = a.path[0];
  if (!to) return;
  const mx = to.x - a.x, my = to.y - a.y;
  const m = Math.hypot(mx, my);
  if (m < 0.5) return;
  // les autres robots, et le chat qu'on ne veut surtout pas piétiner
  const others: { x: number; y: number; id: string }[] = [];
  for (const b of actors) if (b !== a && !b.gone && !b.seated && b.alpha >= 0.5 && b.doing !== 'sofa' && b.doing !== 'sleep') others.push(b);
  others.push({ x: cat.x, y: cat.y, id: '~cat' });
  for (const b of others) {
    const dx = a.x - b.x, dy = a.y - b.y;
    const d = Math.hypot(dx, dy * 1.5);
    if (d >= 10 || d < 0.01) continue;
    // à droite ou à gauche de sa route, du côté où l'autre n'est pas ; au pile face à face, chacun sa droite
    const px = -my / m, py = mx / m;
    const side = Math.sign(dx * px + dy * py) || (a.id < b.id ? 1 : -1);
    const push = ((10 - d) / 10) * 42 * dt;
    const nx = a.x + px * side * push + (dx / d) * push * 0.3, ny = a.y + py * side * push + (dy / d) * push * 0.3;
    if (clear(grid, nx, ny, NONE, NONE)) { a.x = nx; a.y = ny; }
  }
}
