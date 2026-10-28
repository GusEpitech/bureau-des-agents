// L'ambiance lumineuse : ce qui donne du volume à la lumière de base (la carte de lumière de render.ts).
// Des rayons qui traversent les fenêtres (avec l'ombre des montants), des flaques de lumière sur le parquet là où
// il y a une lampe ou un écran, de la poussière qui flotte dans les rayons, la traînée du néon, et un vignettage
// qui assombrit les coins. Les formes sont dessinées une fois ; à chaque image on ne fait que les coller.
import type { ActKind } from '../../shared/protocol.ts';
import { H, NEON, OFFICE_H, T, W, WINDOWS } from './layout.ts';
import { g2d, makeCanvas, rgba, rng, type G } from './pixels.ts';
import type { TimeOfDay } from './room.ts';
import type { Actor } from './actor.ts';
import type { World } from './world.ts';
import { weather } from './weather.ts';

const SCREEN: Record<ActKind, string> = {
  search: '#7fd6ff', web: '#7fffc4', read: '#cfe3ff', write: '#fff0d4', edit: '#fff0d4', bash: '#8affb0',
  plan: '#ffd27a', skill: '#ffe08a', mcp: '#c9b4ff', other: '#dfe6ff',
};

/** Le réglage de chaque moment de la journée : la couleur et la force des rayons, de la poussière, du vignettage. */
const LOOK: Record<TimeOfDay, { beam: string; beamA: number; reach: number; lean: number; dust: string; dustN: number; vignette: number; vignetteColor: string }> = {
  day: { beam: '#fff0c0', beamA: 0.085, reach: 130, lean: 34, dust: '#fff3d0', dustN: 26, vignette: 0.1, vignetteColor: '8,6,16' },
  evening: { beam: '#ff9a5c', beamA: 0.13, reach: 118, lean: 46, dust: '#ffd9a8', dustN: 34, vignette: 0.3, vignetteColor: '14,6,22' },
  night: { beam: '#7f95ff', beamA: 0.12, reach: 112, lean: 34, dust: '#bcd0ff', dustN: 40, vignette: 0.46, vignetteColor: '4,3,16' },
};

const FLOOR_LAMPS: { id: string; x: number; y: number }[] = [
  { id: 'lamp', x: 1 * T + 8, y: 14 * T + 2 },
  { id: 'lamp-r', x: 20 * T + 8, y: 14 * T + 2 },
  { id: 'lamp-yard-l', x: 8 * T + 8, y: 19 * T + 2 },
  { id: 'lamp-yard-r', x: 13 * T + 8, y: 19 * T + 2 },
];

const pools = new Map<string, HTMLCanvasElement>();
/** Une tache de lumière toute faite (dégradé radial), à étirer en ellipse au collage. */
function pool(color: string): HTMLCanvasElement {
  let c = pools.get(color);
  if (!c) {
    c = makeCanvas(64, 64);
    const g = g2d(c);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, rgba(color, 1));
    grd.addColorStop(0.5, rgba(color, 0.4));
    grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    pools.set(color, c);
  }
  return c;
}

function stamp(g: G, x: number, y: number, rx: number, ry: number, color: string, a: number) {
  g.globalAlpha = a;
  g.drawImage(pool(color), Math.round(x - rx), Math.round(y - ry), Math.round(rx * 2), Math.round(ry * 2));
  g.globalAlpha = 1;
}

/** Les rayons des fenêtres : deux vitres par fenêtre, séparées par le montant du milieu, et la traverse qui coupe le rayon. */
function beamSprite(tod: TimeOfDay): HTMLCanvasElement {
  const look = LOOK[tod];
  const c = makeCanvas(W, OFFICE_H);
  const g = g2d(c);
  const top = 46;
  g.fillStyle = look.beam;
  for (const w of WINDOWS) {
    const half = w.w / 2;
    for (const [x0, x1] of [[w.x + 3, w.x + half - 1], [w.x + half + 2, w.x + w.w - 3]]) {
      g.beginPath();
      g.moveTo(x0, top);
      g.lineTo(x1, top);
      g.lineTo(x1 + look.lean, top + look.reach);
      g.lineTo(x0 + look.lean, top + look.reach);
      g.closePath();
      g.fill();
    }
  }
  g.globalCompositeOperation = 'destination-out';
  for (const w of WINDOWS) g.fillRect(w.x, top + look.reach * 0.2, w.w + look.lean + 8, 3);
  // le rayon s'éteint en s'éloignant de la fenêtre
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, top, 0, top + look.reach);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, W, OFFICE_H);
  return c;
}

/** Les coins plus sombres (comme un objectif), à multiplier avec la carte de lumière : du blanc au centre, la teinte du moment sur les bords. */
function vignetteSprite(tod: TimeOfDay): HTMLCanvasElement {
  const look = LOOK[tod];
  const c = makeCanvas(W, H);
  const g = g2d(c);
  const [r, gr, b] = look.vignetteColor.split(',').map(Number);
  const at = (k: number) => {
    const v = look.vignette * k;
    return `rgb(${Math.round(255 * (1 - v) + r * v)},${Math.round(255 * (1 - v) + gr * v)},${Math.round(255 * (1 - v) + b * v)})`;
  };
  const grd = g.createRadialGradient(W / 2, OFFICE_H / 2, 70, W / 2, OFFICE_H / 2, Math.hypot(W / 2, H / 2) * 0.95);
  grd.addColorStop(0, at(0));
  grd.addColorStop(0.55, at(0.35));
  grd.addColorStop(1, at(1));
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  return c;
}

/** La traînée de lumière que le néon jette vers le sol, un peu plus large en bas. */
const washes = new Map<string, HTMLCanvasElement>();
function neonWash(color: string): HTMLCanvasElement {
  let c = washes.get(color);
  if (!c) {
    c = makeCanvas(90, 100);
    const g = g2d(c);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(34, 0);
    g.lineTo(56, 0);
    g.lineTo(88, 100);
    g.lineTo(2, 100);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, 0, 100);
    fade.addColorStop(0, 'rgba(0,0,0,0.9)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, 90, 100);
    washes.set(color, c);
  }
  return c;
}

interface Mote { u: number; k: number; ph: number; sp: number; big: boolean }

export class Ambience {
  /** Le vignettage du moment, pour la carte de lumière (qui le multiplie une fois, pas à chaque image). */
  vignette(tod: TimeOfDay): HTMLCanvasElement {
    let v = this.vignettes.get(tod);
    if (!v) { v = vignetteSprite(tod); this.vignettes.set(tod, v); }
    return v;
  }

  private beams = new Map<TimeOfDay, HTMLCanvasElement>();
  private vignettes = new Map<TimeOfDay, HTMLCanvasElement>();
  private motes: Mote[];

  constructor() {
    const r = rng(2024);
    this.motes = Array.from({ length: 40 }, () => ({ u: r(), k: r(), ph: r() * 6.28, sp: 0.006 + r() * 0.01, big: r() < 0.2 }));
  }

  /** À appeler après la carte de lumière : ajoute les rayons, les flaques, la poussière et le vignettage. */
  draw(g: G, world: World, tod: TimeOfDay, atDesk: Map<string, Actor>, t: number, flick: number) {
    const look = LOOK[tod];
    const night = tod !== 'day';
    let beams = this.beams.get(tod);
    if (!beams) { beams = beamSprite(tod); this.beams.set(tod, beams); }

    g.save();
    // tout ce qui suit éclaire le sol du bureau seulement : pas les murs, pas la cour
    g.beginPath();
    g.rect(T, 3 * T, W - 2 * T, OFFICE_H - 4 * T);
    g.clip();
    g.globalCompositeOperation = 'lighter';
    // les rayons des fenêtres respirent doucement (les nuages, la lune qui bouge)
    g.globalAlpha = look.beamA * (0.86 + 0.14 * Math.sin(t * 0.45));
    g.drawImage(beams, 0, 0);
    g.globalAlpha = 1;

    if (night) {
      // les flaques de lumière : chaque lampe éclaire le parquet autour d'elle, et la lumière fait ressortir le bois
      for (const lamp of FLOOR_LAMPS) {
        if (world.lampsOff.has(lamp.id)) continue;
        const breathe = 0.94 + 0.06 * Math.sin(t * 1.3 + lamp.x);
        stamp(g, lamp.x, lamp.y, 40, 20, '#ffc979', 0.17 * breathe);
      }
      // le bureau de Max : sa lampe éclaire le plateau, plus fort quand l'équipe travaille
      const busy = world.missionActive ? 1.35 : 1;
      stamp(g, 9 * T + 14, 7 * T + 4, 30, 14, '#ffd9a0', 0.2 * busy);
      stamp(g, 11 * T, 8 * T + 10, 46, 16, '#ff8a3d', 0.07 * busy);
      // les écrans : une lueur colorée sur le bureau et le sol devant chaque poste occupé
      for (const a of atDesk.values()) {
        const on = t - a.actAt < 9;
        const col = on && a.act ? SCREEN[a.act] : '#8fa4d0';
        const wob = on ? 0.88 + 0.12 * Math.sin(t * 9 + a.seat!.x) : 1;
        stamp(g, a.seat!.x, a.seat!.y - 1, on ? 26 : 18, on ? 11 : 8, col, (on ? 0.16 : 0.07) * wob);
      }
      // la traînée du néon vers le sol (elle grésille avec lui)
      const neonColor = ['#ff8a3d', '#ff5fa2', '#3fd8ff', '#3ddc97', '#a98bff'][world.neonIndex] ?? '#ff8a3d';
      g.globalAlpha = (tod === 'night' ? 0.1 : 0.06) * flick;
      g.drawImage(neonWash(neonColor), NEON.x + 12 - 45, 46);
      g.globalAlpha = 1;
    }

    // la poussière qui flotte dans les rayons : des points qui scintillent et dérivent lentement
    g.fillStyle = look.dust;
    for (const m of this.motes) {
      const u = (m.u + t * m.sp) % 1;
      if (u > 0.92) continue;
      const w = WINDOWS[m.k < 0.5 ? 0 : 1];
      const x = w.x + 4 + ((m.k * 2) % 1) * (w.w - 8) + look.lean * u + Math.sin(t * 0.35 + m.ph) * 3;
      const y = 46 + u * look.reach * 0.95 + Math.sin(t * 0.5 + m.ph * 2) * 1.5;
      g.globalAlpha = Math.max(0, (0.5 + 0.5 * Math.sin(t * 1.6 + m.ph)) * 0.55 * (1 - u * 0.8));
      g.fillRect(Math.round(x), Math.round(y), m.big ? 2 : 1, m.big ? 2 : 1);
    }
    g.globalAlpha = 1;
    g.restore();

    // la pluie : les lampadaires de la cour se reflètent sur les dalles mouillées
    if (weather.raining && night) {
      g.globalCompositeOperation = 'lighter';
      for (const lamp of FLOOR_LAMPS.slice(2)) {
        if (world.lampsOff.has(lamp.id)) continue;
        stamp(g, lamp.x, lamp.y + 22, 26, 11, '#ffc979', 0.2 * weather.level);
      }
      g.globalCompositeOperation = 'source-over';
    }

    // le vignettage : la carte de lumière le porte déjà le soir et la nuit ; le jour (sans carte), on le colle ici
    if (tod === 'day') {
      g.globalCompositeOperation = 'multiply';
      g.drawImage(this.vignette(tod), 0, 0);
      g.globalCompositeOperation = 'source-over';
    }
  }
}
