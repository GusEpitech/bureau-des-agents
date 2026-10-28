// La vie de la cour : des feuilles qui tombent des arbres, et le soir des lucioles et des papillons de nuit
// autour des lampadaires allumés. Tout se calcule à partir de l'heure : rien à garder en mémoire.
import { T, W, YARD_TOP } from './layout.ts';
import type { G } from './pixels.ts';
import type { World } from './world.ts';
import { weather } from './weather.ts';

const hash = (i: number) => { const s = Math.sin(i * 91.3 + 17.9) * 43758.5453; return s - Math.floor(s); };

/** Le pied des arbres de la cour (case) : de là partent les feuilles. */
const TREES: [number, number][] = [[1, 17], [20, 17], [7, 21], [14, 21]];
const LEAF = ['#7fbf4a', '#a3c94a', '#d6a23a', '#c8573a'];
const LAMPS: { id: string; x: number; y: number }[] = [
  { id: 'lamp-yard-l', x: 8 * T + 8, y: 19 * T - 12 },
  { id: 'lamp-yard-r', x: 13 * T + 8, y: 19 * T - 12 },
];

export class YardLife {
  /** Des feuilles qui se détachent, tournoient et se posent au pied de l'arbre, puis s'effacent. */
  leaves(g: G, t: number) {
    for (let i = 0; i < 10; i++) {
      const [tx, ty] = TREES[i % TREES.length];
      const life = 11 + hash(i) * 6;
      const ph = ((t + hash(i + 4) * life) % life) / life;
      const fall = 0.72;
      const x0 = tx * T + 8 + (hash(i + 8) - 0.5) * 14;
      const top = ty * T - 24;
      const ground = ty * T + 6 + hash(i + 2) * 4;
      let x: number, y: number, a: number;
      if (ph < fall) {
        const u = ph / fall;
        x = x0 + Math.sin(u * 9 + i) * 5 + u * (hash(i + 6) - 0.4) * 14;
        y = top + u * (ground - top);
        a = 1;
      } else {
        const u = (ph - fall) / (1 - fall);
        x = x0 + (hash(i + 6) - 0.4) * 14 + Math.sin(fall * 9 + i) * 5;
        y = ground;
        a = 1 - u;
      }
      g.globalAlpha = a;
      g.fillStyle = LEAF[i % LEAF.length];
      const flip = Math.floor(t * 3 + i) % 2;
      g.fillRect(Math.round(x), Math.round(y), flip && ph < fall ? 1 : 2, flip && ph < fall ? 2 : 1);
    }
    g.globalAlpha = 1;
  }

  /** Le soir : des lucioles qui clignotent dans l'herbe, des papillons de nuit qui tournent autour des lampes. */
  glow(g: G, world: World, t: number) {
    const calm = 1 - Math.min(1, weather.level * 1.6);
    if (calm <= 0.02) return;
    for (let i = 0; i < 9; i++) {
      const bx = T * 2 + hash(i) * (W - T * 4);
      const by = YARD_TOP * T + 12 + hash(i + 20) * 5.2 * T;
      const x = bx + Math.sin(t * (0.25 + hash(i + 1) * 0.2) + i * 2) * 14;
      const y = by + Math.sin(t * (0.35 + hash(i + 2) * 0.2) + i * 3) * 7;
      const blink = Math.max(0, Math.sin(t * 1.1 + hash(i + 3) * 6.28));
      const a = blink * blink * calm;
      if (a < 0.05) continue;
      g.fillStyle = `rgba(210,255,110,${(a * 0.16).toFixed(2)})`;
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      g.fillStyle = `rgba(235,255,150,${a.toFixed(2)})`;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    for (const [li, lamp] of LAMPS.entries()) {
      if (world.lampsOff.has(lamp.id)) continue;
      for (let m = 0; m < 3; m++) {
        const ph = hash(li * 5 + m) * 6.28;
        const sp = 2 + hash(li * 5 + m + 9) * 1.6;
        const x = lamp.x + Math.cos(t * sp + ph) * (5 + m * 2);
        const y = lamp.y + Math.sin(t * sp * 1.3 + ph) * (3 + m);
        const wide = Math.floor(t * 12 + m) % 2;
        g.fillStyle = `rgba(240,236,255,${(0.85 * calm).toFixed(2)})`;
        g.fillRect(Math.round(x), Math.round(y), wide ? 3 : 2, 1);
        g.fillStyle = `rgba(200,195,230,${(0.6 * calm).toFixed(2)})`;
        g.fillRect(Math.round(x) + 1, Math.round(y) + 1, 1, 1);
      }
    }
  }
}

export const yardLife = new YardLife();
