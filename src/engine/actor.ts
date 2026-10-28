// Un robot du bureau : sa position, ce qu'il fait, ses humeurs. Les gestes de la cigarette sont ici aussi,
// parce que le dessin (render.ts) et le monde (world.ts) en ont besoin tous les deux.
import type { ActKind, Role } from '../../shared/protocol.ts';
import { ROWS, T, type Seat } from './layout.ts';
import type { Tile } from './path.ts';
import type { Dir, Eyes, Pose } from './robots.ts';

export type Pt = { x: number; y: number };

export type Task =
  | { t: 'walk'; tile: Tile; face?: Dir; then?: Pt }
  | { t: 'slide'; to: Pt; face?: Dir; speed?: number }
  | { t: 'sit'; seat: Seat }
  | { t: 'stand' }
  | { t: 'wait'; ms: number; pose?: Pose; dir?: Dir; eyes?: Eyes }
  | { t: 'call'; fn: () => void }
  | { t: 'fade'; to: number; ms: number };

export class Actor {
  id: string;
  role: Role;
  name: string;
  x: number;
  y: number;
  dir: Dir = 'down';
  pose: Pose = 'stand';
  frame = 0;
  eyes: Eyes = 'open';
  seat: Seat | null = null;
  seated = false;
  /** le petit rebond à l'assise (-1) et au lever (+1) : quand ça a commencé, et ce que c'était */
  wasSeated = false;
  squashAt = -9;
  squashKind: 'sit' | 'stand' = 'sit';
  /** avant de partir en mission, il tourne la tête vers où il va : jusqu'à quand, et quand sa dernière marche s'est finie */
  lookAheadUntil = 0;
  walkEndAt = -9;
  standSpot: Tile | null = null;
  tasks: Task[] = [];
  cur: Task | null = null;
  curT = 0;
  path: Pt[] = [];
  moving = false;
  alpha = 1;
  act: ActKind | null = null;
  actAt = -99;
  thinkAt = -99;
  carrying = false;
  asks = 0;
  cheerUntil = 0;
  happyUntil = 0;
  /** la cigarette : jusqu'à quand il fume (pause clope) */
  smokeUntil = 0;
  nextPuff = 0;
  /** ce qu'il fait de son temps libre : prendre des notes, regarder son téléphone, être assis ou dormir sur le canapé */
  doing: '' | 'notes' | 'phone' | 'sofa' | 'sleep' | 'play' = '';
  /** sa place sur le canapé (0 gauche, 1 droite), -1 s'il n'y est pas */
  slot = -1;
  // ── l'équipe qui vit au bureau : elle se balade en attendant, et prend un bureau quand Max l'appelle ──
  /** vrai pour un membre de l'équipe résidente */
  res = false;
  /** vrai quand Max l'a appelé (il a pris l'identité de l'agent de la mission) */
  onMission = false;
  homeId = '';
  resName = '';
  /** la case qu'il occupe ou vers laquelle il va (pour que deux robots ne se superposent pas) */
  at: string | null = null;
  nextWander = 0;
  /** sa vitesse de marche (chacun son rythme) */
  pace = 1;
  /** jusqu'à quand il ne s'écarte plus de personne (couloir trop étroit : on se croise, on ne reste pas coincé) */
  ghostUntil = 0;
  sadUntil = 0;
  /** jusqu'à quand il est furieux (un test a échoué) */
  angryUntil = 0;
  nextAnger = 0;
  reported = false;
  delivered = false;
  left = false;
  gone = false;
  animT = 0;
  nextBlink = 1 + Math.random() * 3;
  blinkUntil = 0;
  nextLook = 2 + Math.random() * 3;
  look: Eyes = 'open';
  lookUntil = 0;
  deliverSpot = -1;

  constructor(id: string, role: Role, name: string, x: number, y: number) {
    this.id = id;
    this.role = role;
    this.name = name;
    this.x = x;
    this.y = y;
  }

  get tile(): Tile {
    if (this.seated && this.seat) return this.seat.tile;
    return [Math.max(0, Math.floor(this.x / T)), Math.max(0, Math.min(ROWS - 1, Math.floor((this.y - 2) / T)))];
  }

  /** Le haut de la tête (pour accrocher les bulles). */
  get head(): Pt { return { x: this.x, y: this.y - 22 }; }

  get busy() { return !!this.cur || this.tasks.length > 0; }
}

/** Où en est la bouffée : 0 à 1 sur 4 s. Au-delà de 0,62 la main monte à la bouche, la fumée sort à 0,8. */
export function smokePhase(a: Actor, time: number): number {
  return ((time + a.smokeUntil) % 4) / 4;
}

/** La main monte vers la bouche pendant la bouffée (0 = au repos, 1 = à la bouche). */
export function smokeDrag(a: Actor, time: number): number {
  const p = smokePhase(a, time);
  return p < 0.62 ? 0 : p < 0.72 ? (p - 0.62) / 0.1 : p < 0.82 ? 1 : p < 0.9 ? 1 - (p - 0.82) / 0.08 : 0;
}

/** Le bout de la cigarette d'un robot : dans sa main, du côté où il regarde (plus haut, près de la bouche, pendant la bouffée). */
export function smokeTip(a: Actor, time = 0): Pt {
  const k = smokeDrag(a, time);
  const dx = a.dir === 'left' ? -8 : a.dir === 'right' ? 8 : 5;
  return { x: Math.round(a.x) + Math.round(dx * (1 - 0.3 * k)), y: Math.round(a.y) - 11 - Math.round(3 * k) };
}
