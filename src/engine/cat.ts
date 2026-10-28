// Pixel, le chat du bureau : un chat noir aux yeux orange (les couleurs de la maison). Il se promène,
// s'assoit, et fait de longues siestes sur le canapé. Clique dessus : il miaule.
import { findPath, type Tile } from './path.ts';
import { g2d, makeCanvas, outline, rect, px } from './pixels.ts';
import { T, tileFeet } from './layout.ts';

type CatPose = 'walk' | 'sit' | 'sleep';

const BODY = '#26222f';
const RIM = '#4a4458';
const EYE = '#ff8a3d';

function build(pose: CatPose, frame: number, right: boolean): HTMLCanvasElement {
  const c = makeCanvas(16, 12);
  const g = g2d(c);
  if (pose === 'sleep') {
    // roulé en boule, la queue autour
    rect(g, 3, 6, 10, 4, BODY);
    rect(g, 4, 5, 8, 1, BODY);
    rect(g, 4, 5, 6, 1, RIM);
    rect(g, 10, 4, 3, 3, BODY);
    px(g, 10, 3, BODY);
    px(g, 12, 3, BODY);
    rect(g, 11, 5, 1, 1, '#120f17');
    rect(g, 2, 8, 2, 2, BODY);
  } else if (pose === 'sit') {
    rect(g, 6, 4, 5, 6, BODY);
    rect(g, 5, 8, 7, 2, BODY);
    rect(g, 6, 1, 5, 4, BODY);
    px(g, 6, 0, BODY);
    px(g, 10, 0, BODY);
    hlineRim(g, 6, 1, 5);
    px(g, 7, 2, EYE);
    px(g, 9, 2, EYE);
    px(g, 8, 3, '#ff9fb3');
    rect(g, 11, 8, 3, 1, BODY);
    px(g, 13, 7, BODY);
  } else {
    // de profil, vers la droite
    const f = frame % 2;
    rect(g, 3, 4, 8, 4, BODY);
    hlineRim(g, 3, 4, 8);
    rect(g, 10, 2, 4, 4, BODY);
    px(g, 10, 1, BODY);
    px(g, 13, 1, BODY);
    px(g, 12, 3, EYE);
    px(g, 13, 4, '#ff9fb3');
    // la queue, dressée
    px(g, 2, 3, BODY);
    px(g, 1, 2, BODY);
    px(g, 1, 1, BODY);
    // les pattes
    for (const [x, up] of [[4, f], [6, 1 - f], [9, f], [11, 1 - f]] as [number, number][]) rect(g, x, 8, 1, up ? 1 : 2, BODY);
  }
  outline(c, '#0b0910');
  if (!right && pose === 'walk') {
    const m = makeCanvas(16, 12);
    const mg = g2d(m);
    mg.translate(16, 0);
    mg.scale(-1, 1);
    mg.drawImage(c, 0, 0);
    return m;
  }
  return c;
}

function hlineRim(g: CanvasRenderingContext2D, x: number, y: number, w: number) { rect(g, x, y, w, 1, RIM); }

const cache = new Map<string, HTMLCanvasElement>();
function sprite(pose: CatPose, frame: number, right: boolean) {
  const k = `${pose}|${frame}|${right}`;
  let c = cache.get(k);
  if (!c) { c = build(pose, frame, right); cache.set(k, c); }
  return c;
}

/** Le canapé (là où il dort) et les endroits où il aime traîner. */
const SOFA = { x: 3 * T + 4, y: 14 * T + 4, from: [3, 13] as Tile };
/** Le clavier de Max : le chat s'y roule en boule quand le chef n'est pas à son bureau. `front` : la case devant le bureau. */
const KEYS = { x: 11 * T, y: 7 * T + 4, front: [11, 8] as Tile, frontPx: { x: 11 * T + 8, y: 8 * T + 13 } };
const HAUNTS: Tile[] = [[9, 10], [12, 10], [7, 13], [14, 13], [17, 13], [10, 9], [3, 9], [18, 9], [8, 6]];

export class Cat {
  x = SOFA.x;
  y = SOFA.y;
  right = true;
  pose: CatPose = 'sleep';
  private path: { x: number; y: number }[] = [];
  private until = 8;
  private t = 0;
  private toSofa = false;
  /** où il va : le canapé, le clavier de Max, ou ailleurs */
  private goal: 'wander' | 'sofa' | 'keys' = 'wander';
  /** il est venu voir quelqu'un dormir (il s'assoit d'abord, puis s'installe) */
  private watching = false;
  private curious = false;
  private sawSleeper = false;
  heartUntil = 0;
  /** combien de robots dorment en ce moment (renseigné par le monde) */
  sleepers = 0;
  /** le bureau de Max est occupé (renseigné par le monde) */
  deskTaken = false;
  /** vrai un instant quand on le chasse du clavier ; `arrived` : il vient d'arriver quelque part (lu et remis à zéro par le monde) */
  startled = false;
  arrived: '' | 'sleeper' | 'keys' = '';

  get tile(): Tile { return [Math.floor(this.x / T), Math.floor((this.y - 2) / T)]; }

  update(dt: number, time: number, grid: boolean[][], onZ: (x: number, y: number) => void) {
    this.t += dt;
    // Max revient à son bureau : le chat saute du clavier
    if (this.onKeys && this.deskTaken) {
      this.startled = true;
      this.goal = 'wander';
      const target = HAUNTS[Math.floor(Math.random() * HAUNTS.length)];
      const tiles = findPath(grid, KEYS.front, target);
      this.path = [KEYS.frontPx, ...(tiles ?? []).map(tileFeet)].map((p) => ({ x: p.x, y: p.y - 2 }));
      this.toSofa = false;
    }
    // quelqu'un s'endort : il a envie d'aller voir
    if (this.sleepers > 0 && !this.sawSleeper) {
      this.sawSleeper = true;
      if (!this.path.length && !this.atSofa && !this.onKeys) { this.curious = true; this.until = Math.min(this.until, time + 2 + Math.random() * 4); }
    } else if (this.sleepers === 0) this.sawSleeper = false;
    if (this.path.length) {
      const p = this.path[0];
      const dx = p.x - this.x, dy = p.y - this.y;
      const d = Math.hypot(dx, dy);
      const step = 22 * dt;
      if (Math.abs(dx) > 0.5) this.right = dx > 0;
      if (d <= step) { this.x = p.x; this.y = p.y; this.path.shift(); }
      else { this.x += (dx / d) * step; this.y += (dy / d) * step; }
      this.pose = 'walk';
      if (!this.path.length) {
        if (this.goal === 'keys') {
          this.pose = 'sleep';
          this.until = time + 30 + Math.random() * 30;
          this.arrived = 'keys';
        } else if (this.watching) {
          this.pose = 'sit';
          this.until = time + 4 + Math.random() * 2;
          this.arrived = 'sleeper';
        } else {
          this.pose = this.toSofa ? 'sleep' : 'sit';
          this.until = time + (this.toSofa ? 25 + Math.random() * 25 : 4 + Math.random() * 6);
        }
      }
      return true;
    }
    if (this.pose === 'sleep' && Math.floor(this.t * 0.8) !== Math.floor((this.t - dt) * 0.8)) onZ(this.x + 6, this.y - 10);
    if (time < this.until) return false;
    // il a regardé le dormeur assez longtemps : il s'installe à côté
    if (this.watching) {
      this.watching = false;
      this.pose = 'sleep';
      this.until = time + 25 + Math.random() * 25;
      return false;
    }
    // en route : vers un coin du bureau, le canapé pour une sieste, ou le clavier de Max
    this.watching = false;
    const r = Math.random();
    this.goal = this.curious || (this.sleepers > 0 && r < 0.45) ? 'sofa' : !this.deskTaken && r < 0.35 ? 'keys' : r < 0.6 ? 'sofa' : 'wander';
    this.toSofa = this.goal === 'sofa';
    this.watching = this.toSofa && (this.curious || this.sleepers > 0);
    this.curious = false;
    const target = this.goal === 'keys' ? KEYS.front : this.toSofa ? SOFA.from : HAUNTS[Math.floor(Math.random() * HAUNTS.length)];
    const tiles = findPath(grid, this.tile, target);
    if (!tiles) { this.until = time + 3; this.watching = false; this.goal = 'wander'; return false; }
    this.path = tiles.map(tileFeet).map((p) => ({ x: p.x, y: p.y - 2 }));
    if (this.toSofa) this.path.push({ x: SOFA.x, y: SOFA.y });
    if (this.goal === 'keys') this.path.push({ x: KEYS.x, y: KEYS.y });
    return true;
  }

  /** Clic : il s'arrête, regarde, et miaule. */
  pet(time: number) {
    this.path = [];
    this.pose = 'sit';
    this.until = time + 3;
    this.heartUntil = time + 1.2;
  }

  /** Il est sur le canapé (assis ou endormi) */
  private get atSofa() { return !this.path.length && Math.abs(this.x - SOFA.x) < 2 && Math.abs(this.y - SOFA.y) < 3; }

  /** Il dort sur le clavier de Max */
  get onKeys() { return !this.path.length && this.goal === 'keys' && Math.abs(this.x - KEYS.x) < 2 && Math.abs(this.y - KEYS.y) < 3; }

  /** Il dort sur le canapé (les robots s'assoient alors à côté, sans le déranger). */
  get onSofa() { return this.pose === 'sleep' && this.atSofa; }

  get frame() { return Math.floor(this.t * 6) % 2; }

  /** Sur le canapé, il passe devant (sinon le dossier le cacherait). */
  get sortY() { return this.atSofa ? 14 * T + 15 : this.onKeys ? 8 * T + 4 : this.y; }

  draw(g: CanvasRenderingContext2D) {
    const s = sprite(this.pose, this.frame, this.right);
    g.fillStyle = 'rgba(8,6,16,0.3)';
    g.fillRect(Math.round(this.x) - 5, Math.round(this.y) - 1, 10, 2);
    g.drawImage(s, Math.round(this.x) - 8, Math.round(this.y) - 11);
  }

  /** La zone où l'on peut cliquer (en pixels du bureau). */
  hit(x: number, y: number) { return Math.abs(x - this.x) < 8 && y > this.y - 12 && y < this.y + 2; }
}
