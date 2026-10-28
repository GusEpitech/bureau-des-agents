// Le monde du bureau : les robots, ce qu'ils font, où ils vont. Chaque événement venu de Claude Code
// devient une petite mise en scène : un membre de l'équipe arrive par la porte, va à son bureau, tape
// ou lit selon ce qu'il fait vraiment, se lève pour rendre son rapport au chef, puis repart.
import { weather } from './weather.ts';
import type { ActKind, OfficeEvent, PlanItem, Role, WeekDay } from '../../shared/protocol.ts';
import { Actor, smokePhase, smokeTip, type Pt, type Task } from './actor.ts';
import { animateActor } from './animate.ts';
import { Cat } from './cat.ts';
import { Fx } from './fx.ts';
import { iconFor } from './icons.ts';
import { CHEF_SEAT, GATE, SEATS, SPOTS, T, WINDOWS, tileFeet, walkGrid, type Seat } from './layout.ts';
import { clear, NONE, nearestReach, sidestep, smooth } from './nav.ts';
import { findPath, type Tile } from './path.ts';
import type { Dir } from './robots.ts';

const WALK_SPEED = 58; // pixels par seconde

/** Les commandes qui ressemblent à des tests ou à des vérifications : si elles échouent, quelqu'un s'énerve. */
const TEST_CMD = /\b(test|tests|jest|vitest|pytest|mocha|rspec|phpunit|playwright|cypress|lint|eslint|tsc|check|build)\b/i;
const MAX_RESIDENTS = 10;
/** Les deux places du canapé, aux deux bouts : le milieu est la place du chat. `tile` : d'où on l'enjambe (derrière le dossier). */
const SOFA_SLOTS: { x: number; y: number; tile: Tile }[] = [{ x: 38, y: 237, tile: [2, 13] }, { x: 74, y: 237, tile: [4, 13] }];

export class World {
  actors = new Map<string, Actor>();
  fx = new Fx();
  grid = walkGrid();
  private extraId = 0;
  private slotUsed = new Set<number>();
  private seatOf = new Map<string, string>();
  private deliverTaken = new Set<number>();
  time = 0;
  speed = 1;
  /** les rapports posés sur le bureau du chef */
  inbox = 0;
  printUntil = 0;
  boardUntil = 0;
  missionActive = false;
  plan: PlanItem[] = [];
  /** qui fait quoi : écrit au tableau, coché quand l'agent a rendu son travail */
  assignments: { id: string; role: Role; name: string; task: string; status: 'working' | 'done' | 'failed' }[] = [];
  private planSize = -1;
  /** les 7 derniers jours (missions, tokens), pour le tableau quand il n'y a pas de plan */
  week: WeekDay[] | null = null;
  /** les commandes qui ressemblent à des tests : appel d'outil → qui l'a lancée */
  private testRuns = new Map<string, string>();
  // ── la vie du bureau (et ses œufs de Pâques) ──
  cat = new Cat();
  /** la couleur du néon (clique dessus pour en changer) */
  neonIndex = 0;
  /** les meubles qui frémissent (plantes…) : identifiant → jusqu'à quand */
  wiggles = new Map<string, number>();
  /** les lampes éteintes */
  lampsOff = new Set<string>();
  /** le mode soirée (boule à facettes, tout le monde danse) */
  discoUntil = 0;
  /** la musique du jukebox : est-ce qu'elle joue, et l'énergie des basses (0 à 1) */
  musicOn = false;
  musicLevel = 0;
  bobUntil = 0;
  private noteAt = 0;
  private steamAt = 0;
  private waveAt = 6;
  /** l'équipe résidente (elle se balade quand elle n'a pas de mission) */
  private residents = new Set<Actor>();
  private demoOn = false;
  /** vrai quand il ne se passe rien d'important : seuls l'équipe qui se balade et le chat bougent (15 images par seconde suffisent) */
  calm = true;
  rosterVersion = 0;
  private rosterListeners = new Set<() => void>();

  constructor() {
    this.resetAll();
  }

  get chef() { return this.actors.get('chef')!; }

  onRoster(fn: () => void) { this.rosterListeners.add(fn); return () => this.rosterListeners.delete(fn); }
  private rosterChanged() {
    this.rosterVersion++;
    for (const fn of this.rosterListeners) fn();
  }

  /** Le bureau vide, Max à l'accueil (début, nouvelle mission, rediffusion). */
  resetAll() {
    this.actors.clear();
    this.seatOf.clear();
    this.deliverTaken.clear();
    this.fx = new Fx();
    this.inbox = 0;
    this.printUntil = 0;
    this.boardUntil = 0;
    this.missionActive = false;
    this.plan = [];
    this.assignments = [];
    this.planSize = -1;
    this.testRuns.clear();
    const p = SPOTS.receptionPx;
    this.actors.set('chef', new Actor('chef', 'chef', 'Max', p.x, p.y));
    this.residents.clear();
    this.spawnResidents();
    this.rosterChanged();
  }

  // ── L'équipe qui vit au bureau ──
  /** Les cases libres où l'on peut se poser (pas les chaises). */
  private freeTiles(): Tile[] {
    const seats = new Set(SEATS.map((s) => s.tile.join(',')));
    const out: Tile[] = [];
    for (let y = 3; y <= 14; y++) for (let x = 1; x <= 20; x++) if (this.grid[y]?.[x] && !seats.has(`${x},${y}`)) out.push([x, y]);
    return out;
  }

  private spawnResidents() {
    if (this.demoOn) return;
    const team: [string, Role, string][] = [['res-1', 'recherche', 'Iris'], ['res-2', 'recherche', 'Hugo'], ['res-3', 'code', 'Ada'], ['res-4', 'design', 'Frida'], ['res-5', 'redaction', 'Colette'], ['res-6', 'analyse', 'Marie']];
    const tiles = this.freeTiles();
    for (const [id, role, name] of team) {
      const t = tiles.splice(Math.floor(Math.random() * tiles.length), 1)[0];
      const f = tileFeet(t);
      const a = new Actor(id, role, name, f.x, f.y);
      a.res = true;
      a.homeId = id;
      a.resName = name;
      a.dir = (['down', 'left', 'right'] as Dir[])[Math.floor(Math.random() * 3)];
      a.nextWander = this.time + 1 + Math.random() * 8;
      a.pace = 0.88 + Math.random() * 0.24;
      this.actors.set(id, a);
      this.residents.add(a);
    }
  }

  /** Quelqu'un de l'équipe résidente, libre, pour ce métier (n'importe lequel pour un renfort). */
  private freeResident(role: Role): Actor | null {
    const free = [...this.residents].filter((a) => !a.onMission && !a.gone && a.alpha > 0.9 && !a.carrying);
    return free.find((a) => a.role === role) ?? (role === 'renfort' ? free[0] ?? null : null);
  }

  /** La mission est finie (ou son travail rendu) : il reprend sa vie de bureau. */
  private release(a: Actor, live: boolean) {
    const back = () => {
      if (a.seated) { a.seated = false; this.standUp(a); }
      if (a.seat && this.seatOf.get(a.seat.id) === a.id) this.seatOf.delete(a.seat.id);
      if (a.deliverSpot >= 0) { this.deliverTaken.delete(a.deliverSpot); a.deliverSpot = -1; }
      this.actors.delete(a.id);
      a.id = a.homeId;
      a.name = a.resName;
      a.left = false; a.reported = false; a.delivered = false; a.carrying = false; a.asks = 0;
      a.act = null; a.actAt = -99; a.onMission = false; a.at = null; a.standSpot = null; a.seat = null;
      a.nextWander = this.time + 3 + Math.random() * 5;
      this.actors.set(a.id, a);
      this.rosterChanged();
    };
    if (live) { this.queue(a, { t: 'call', fn: back }); return; }
    a.tasks = [];
    a.cur = null;
    back();
    const tiles = this.freeTiles();
    const f = tileFeet(tiles[Math.floor(Math.random() * tiles.length)]);
    a.x = f.x;
    a.y = f.y;
  }

  /**
   * Son travail est fini. Il ne quitte pas le bureau : il reprend sa vie de bureau (café, clope, discussion…).
   * Un renfort arrivé par la porte reste donc dans l'équipe résidente, jusqu'à MAX_RESIDENTS ; au-delà, il repart.
   */
  private retire(a: Actor, live: boolean) {
    if (!a.res) {
      if (this.demoOn || this.residents.size >= MAX_RESIDENTS) { if (live) this.exit(a); else this.remove(a); return; }
      a.res = true;
      a.onMission = true; // jusqu'à ce qu'il ait fini de rendre son travail
      a.homeId = `res-x${++this.extraId}`;
      a.resName = a.name;
      this.residents.add(a);
    }
    this.release(a, live);
  }

  /** Ce que fait quelqu'un de libre : un café, un coup d'œil dehors, une discussion, une clope, un tour… */
  private wander(a: Actor) {
    if (a.busy || a.seated || a.onMission || a.alpha < 0.9 || this.time < a.nextWander) return;
    a.nextWander = this.time + 5 + Math.random() * 9;
    const taken = new Set([...this.actors.values()].map((x) => x.at).filter(Boolean));
    const pick = (spots: Tile[]) => {
      const free = spots.filter((s) => !taken.has(s.join(',')));
      return free.length ? free[Math.floor(Math.random() * free.length)] : null;
    };
    const go = (spot: Tile, face: Dir, ms: number, doing: () => void) => {
      a.at = spot.join(',');
      this.queue(a,
        { t: 'walk', tile: spot, face },
        { t: 'call', fn: doing },
        { t: 'wait', ms, dir: face },
        { t: 'call', fn: () => { a.at = null; } },
      );
    };
    const x = Math.random();
    if (x < 0.4 && this.leisure(a, x, taken)) return;
    const r = Math.random();
    if (r < 0.22) { if (this.smokeBreak(a)) return; }
    if (r < 0.5) {
      const s = pick(SPOTS.coffee);
      if (s) { go(s, 'down', 4500, () => { this.coffeeAt(s); a.happyUntil = this.time + 1; }); return; }
    } else if (r < 0.6) {
      const s = pick(SPOTS.cooler);
      if (s) { go(s, 'up', 3500, () => { this.fx.floatIcon(a.x, a.y - 22, 'drop'); }); return; }
    } else if (r < 0.7) {
      const s = pick(SPOTS.windows);
      if (s) { go(s, 'up', 5000, () => { a.thinkAt = this.time; }); return; }
    } else if (r < 0.78) {
      const s = pick(SPOTS.jukebox);
      if (s) { go(s, 'down', 4000, () => { this.fx.floatIcon(a.x, a.y - 22, 'note'); a.cheerUntil = this.time + 1.5; }); return; }
    } else if (r < 0.9) {
      // une discussion à deux
      const mate = [...this.residents].find((b) => b !== a && !b.busy && !b.seated && !b.onMission && !b.at && b.alpha > 0.9);
      const spots = SPOTS.chat.filter(([p, q]) => this.grid[p[1]]?.[p[0]] && this.grid[q[1]]?.[q[0]] && !taken.has(p.join(',')) && !taken.has(q.join(',')));
      if (mate && spots.length) {
        const [p, q] = spots[Math.floor(Math.random() * spots.length)];
        const talk = (who: Actor, tile: Tile, face: Dir) => {
          who.at = tile.join(',');
          who.nextWander = this.time + 9;
          this.queue(who,
            { t: 'walk', tile, face },
            { t: 'wait', ms: 600, dir: face },
            { t: 'call', fn: () => { this.fx.floatIcon(who.x, who.y - 22, who === a ? 'idea' : 'heart'); who.happyUntil = this.time + 1.4; } },
            { t: 'wait', ms: 3800, dir: face },
            { t: 'call', fn: () => { who.at = null; } },
          );
        };
        talk(a, p, 'right');
        talk(mate, q, 'left');
        return;
      }
    }
    // sinon : un tour dans la cour, un petit tour, ou on s'étire
    if (Math.random() < 0.3) {
      const s = pick(SPOTS.yard);
      if (s) { go(s, 'down', 3500 + Math.random() * 3000, () => { a.thinkAt = this.time; }); return; }
    }
    if (Math.random() < 0.3) { this.queue(a, { t: 'wait', ms: 1300, pose: 'cheer', dir: 'down' }); return; }
    const tiles = this.freeTiles().filter((t) => !taken.has(t.join(',')));
    const t = tiles[Math.floor(Math.random() * tiles.length)];
    if (t) this.queue(a, { t: 'walk', tile: t }, { t: 'wait', ms: 1200 + Math.random() * 1500, dir: 'down' });
  }

  /** Il arrête ce qu'il faisait de son temps libre (et libère sa place sur le canapé). */
  private stopDoing(a: Actor) {
    if (a.slot >= 0) { this.slotUsed.delete(a.slot); a.slot = -1; }
    a.doing = '';
  }

  /** Un moment pour soi : des notes dans un carnet, le téléphone, le canapé, une sieste. Faux si rien n'est possible. */
  private leisure(a: Actor, x: number, taken: Set<string | null>): boolean {
    const free = this.freeTiles().filter((t) => !taken.has(t.join(',')));
    const spot = free[Math.floor(Math.random() * free.length)];
    if (x < 0.24) {
      const phone = x >= 0.12;
      // le téléphone se regarde volontiers dans la cour ; le carnet, n'importe où
      const yard = phone && Math.random() < 0.5 ? SPOTS.yard.filter((s) => !taken.has(s.join(',')))[0] : null;
      const at = yard ?? spot;
      if (!at) return false;
      const kind = phone ? 'phone' : 'notes';
      a.at = at.join(',');
      this.queue(a,
        { t: 'walk', tile: at, face: 'down' },
        { t: 'wait', ms: 400, dir: 'down' },
        { t: 'call', fn: () => { a.doing = kind; if (!phone) this.fx.floatIcon(a.x, a.y - 24, 'idea'); } },
        { t: 'wait', ms: 4500 + Math.random() * 4000, dir: 'down' },
        { t: 'call', fn: () => { if (phone && Math.random() < 0.6) { this.fx.floatIcon(a.x, a.y - 24, 'heart'); a.happyUntil = this.time + 1.2; } a.doing = ''; a.at = null; } },
      );
      return true;
    }
    // le canapé : une place libre, et jamais sur le chat
    const cat = this.cat;
    const slot = SOFA_SLOTS.findIndex((s, i) => !this.slotUsed.has(i) && Math.hypot(cat.x - s.x, (cat.y - s.y) * 1.5) > 16);
    if (slot < 0 || !this.grid[SOFA_SLOTS[slot].tile[1]]?.[SOFA_SLOTS[slot].tile[0]]) return false;
    const s = SOFA_SLOTS[slot];
    const sleep = x >= 0.34;
    this.slotUsed.add(slot);
    a.slot = slot;
    a.at = s.tile.join(',');
    this.queue(a,
      { t: 'walk', tile: s.tile, face: 'down' },
      // le chat dort : on s'installe à pas de loup
      { t: 'call', fn: () => { a.doing = 'sofa'; } },
      { t: 'slide', to: { x: s.x, y: s.y }, speed: cat.onSofa ? 14 : 32 },
      { t: 'call', fn: () => {
        a.doing = sleep ? 'sleep' : 'sofa';
        a.dir = 'down';
        if (cat.onSofa) { this.fx.floatIcon(a.x, a.y - 24, 'heart'); a.happyUntil = this.time + 1.2; }
      } },
      { t: 'wait', ms: sleep ? 14000 + Math.random() * 10000 : 7000 + Math.random() * 6000, dir: 'down' },
      { t: 'call', fn: () => { a.doing = 'sofa'; if (sleep) this.fx.floatIcon(a.x, a.y - 24, 'idea'); } },
      { t: 'slide', to: tileFeet(s.tile), speed: 32 },
      { t: 'call', fn: () => { this.stopDoing(a); a.at = null; } },
    );
    return true;
  }

  /** La vapeur du café, à la machine, devant lui. */
  private coffeeAt(spot: Tile) {
    for (let i = 0; i < 8; i++) this.fx.steam(spot[0] * T + 8 + Math.random() * 3, 13 * T + 4 - Math.random() * 4);
    this.fx.floatIcon(spot[0] * T + 8, 13 * T - 4, 'coffee');
  }

  // ── Les tâches ──
  private queue(a: Actor, ...tasks: Task[]) { a.tasks.push(...tasks); }

  private startTask(a: Actor, task: Task) {
    a.curT = 0;
    switch (task.t) {
      case 'walk': {
        if (a.seated) { a.seated = false; this.standUp(a); }
        const tiles = findPath(this.grid, a.tile, task.tile) ?? nearestReach(this.grid, a.tile, task.tile);
        a.path = smooth(this.grid, a, (tiles ?? [task.tile]).map(tileFeet), task.tile);
        if (task.then) a.path.push(task.then);
        break;
      }
      case 'slide':
        a.path = [task.to];
        break;
      case 'sit':
        a.path = [{ x: task.seat.x, y: task.seat.y }];
        break;
      case 'stand':
        if (a.seated) { a.seated = false; this.standUp(a); }
        break;
    }
  }

  private standUp(a: Actor) {
    if (!a.seat) return;
    const f = tileFeet(a.seat.tile);
    a.x = f.x + (a.seat.x - f.x > 4 ? 6 : 0);
    a.y = f.y;
  }

  /** Avance une tâche. Renvoie vrai quand elle est finie. */
  private runTask(a: Actor, task: Task, dt: number): boolean {
    switch (task.t) {
      case 'walk':
      case 'slide':
      case 'sit': {
        const speed = (task.t === 'slide' && task.speed) || (task.t === 'sit' ? 30 : WALK_SPEED * a.pace);
        let budget = speed * dt;
        const px = a.x, py = a.y;
        const wasClear = task.t === 'walk' && clear(this.grid, px, py, NONE, NONE);
        while (budget > 0 && a.path.length) {
          const p = a.path[0];
          const dx = p.x - a.x, dy = p.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d > 0.01 && task.t !== 'sit') a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
          if (d <= budget) { a.x = p.x; a.y = p.y; a.path.shift(); budget -= d; }
          else { a.x += (dx / d) * budget; a.y += (dy / d) * budget; budget = 0; }
        }
        a.moving = a.path.length > 0 && task.t !== 'sit';
        if (a.moving && task.t === 'walk' && this.time >= a.ghostUntil) {
          sidestep(this.grid, a, dt, this.actors.values(), this.cat);
          // un pas de côté a mis la route de travers : on revient d'où on venait et on recalcule le chemin depuis là
          if (wasClear && !clear(this.grid, a.x, a.y, NONE, NONE)) {
            a.x = px; a.y = py;
            a.ghostUntil = this.time + 1.2;
            const tiles = findPath(this.grid, a.tile, task.tile) ?? nearestReach(this.grid, a.tile, task.tile);
            if (tiles) {
              const keep = task.then ? a.path[a.path.length - 1] : null;
              a.path = smooth(this.grid, a, tiles.map(tileFeet), task.tile);
              if (keep) a.path.push(keep);
            }
          }
        }
        if (a.path.length) return false;
        a.moving = false;
        if (task.t === 'sit') { a.seated = true; a.seat = task.seat; a.dir = 'down'; }
        else if (task.face) a.dir = task.face;
        return true;
      }
      case 'stand':
        return true;
      case 'wait':
        if (task.dir) a.dir = task.dir;
        return a.curT * 1000 >= task.ms;
      case 'call':
        task.fn();
        return true;
      case 'fade': {
        const step = dt / Math.max(0.05, task.ms / 1000);
        a.alpha = task.to > a.alpha ? Math.min(task.to, a.alpha + step) : Math.max(task.to, a.alpha - step);
        return a.alpha === task.to;
      }
    }
  }

  // ── Les places ──
  private assignSeat(role: Role): Seat | null {
    const free = (r: Role | null) => SEATS.find((s) => (r === null || s.role === r) && !this.seatOf.has(s.id)) ?? null;
    return free(role) ?? (role === 'renfort' ? free(null) : null);
  }

  private overflowSpot(): Tile {
    const used = new Set([...this.actors.values()].map((a) => a.standSpot?.join(',')).filter(Boolean));
    return SPOTS.overflow.find((t) => !used.has(t.join(','))) ?? SPOTS.overflow[0];
  }

  private nearestWindow(a: Actor): Pt {
    const w = a.x < 176 ? WINDOWS[0] : WINDOWS[1];
    return { x: w.x + w.w / 2, y: w.y + w.h - 4 };
  }

  /** Les rapports se posent ici, dans la corbeille du bureau du chef. */
  get inboxPt(): Pt { return { x: 9 * T + 52, y: 7 * T - 2 }; }
  get printerPt(): Pt { return { x: 12 * T + 8, y: 4 * T - 4 }; }

  // ── Les événements ──
  apply(ev: OfficeEvent, live: boolean) {
    const chef = this.chef;
    switch (ev.k) {
      case 'start':
        this.missionActive = true;
        chef.thinkAt = this.time;
        if (live) {
          if (!chef.seated && !chef.busy) this.queue(chef, { t: 'wait', ms: 500, pose: 'wave', dir: 'down' }, { t: 'walk', tile: CHEF_SEAT.tile }, { t: 'sit', seat: CHEF_SEAT });
          else if (!chef.seated) this.queue(chef, { t: 'walk', tile: CHEF_SEAT.tile }, { t: 'sit', seat: CHEF_SEAT });
        } else this.snapSeat(chef, CHEF_SEAT);
        break;
      case 'think': {
        const a = this.actors.get(ev.who);
        if (a) a.thinkAt = this.time;
        break;
      }
      case 'plan': {
        this.plan = ev.items;
        const n = ev.items.length;
        const fresh = n !== this.planSize;
        this.planSize = n;
        if (live && fresh) {
          // Max va écrire le plan au tableau
          chef.tasks = chef.tasks.filter((t) => t.t !== 'sit');
          this.queue(chef,
            { t: 'walk', tile: SPOTS.board, face: 'up', then: SPOTS.boardPx },
            { t: 'call', fn: () => { this.boardUntil = this.time + 1.6; } },
            { t: 'wait', ms: 1600, pose: 'write', dir: 'up' },
            { t: 'call', fn: () => { this.fx.sparkle(SPOTS.boardPx.x, 24, 10, '#ffffff'); } },
            { t: 'walk', tile: CHEF_SEAT.tile },
            { t: 'sit', seat: CHEF_SEAT },
          );
        } else if (live) {
          this.fx.sparkle(SPOTS.boardPx.x + (Math.random() - 0.5) * 60, 22, 5, '#3ddc97');
        }
        break;
      }
      case 'hire': {
        if (this.actors.has(ev.id)) break;
        const seat = this.assignSeat(ev.role);
        // quelqu'un de l'équipe est libre pour ce métier : il prend le poste (sinon un nouveau arrive par la porte)
        const res = this.freeResident(ev.role);
        let a: Actor;
        if (res) {
          this.actors.delete(res.id);
          res.id = ev.id;
          res.name = ev.name;
          res.onMission = true;
          res.tasks = [];
          res.cur = null;
          res.smokeUntil = 0;
          this.stopDoing(res);
          res.at = null;
          res.act = null;
          res.actAt = -99;
          a = res;
        } else a = new Actor(ev.id, ev.role, ev.name, SPOTS.doorOut.x - 8 + Math.random() * 16, SPOTS.doorOut.y);
        if (!this.assignments.some((x) => x.id === ev.id)) this.assignments.push({ id: ev.id, role: ev.role, name: ev.name, task: ev.task, status: 'working' });
        if (seat) { this.seatOf.set(seat.id, a.id); a.seat = seat; }
        else a.standSpot = this.overflowSpot();
        this.actors.set(a.id, a);
        this.rosterChanged();
        if (live) {
          if (!res) {
            a.alpha = 0;
            a.dir = 'up';
            this.fx.beam(SPOTS.doorOut.x, GATE.y + 14);
            this.queue(a,
              { t: 'fade', to: 1, ms: 250 },
              { t: 'slide', to: tileFeet(SPOTS.door), speed: 40 },
            );
          } else this.fx.floatIcon(a.x, a.y - 22, 'alert');
          if (seat) this.queue(a, { t: 'walk', tile: seat.tile }, { t: 'sit', seat });
          else this.queue(a, { t: 'walk', tile: a.standSpot!, face: 'down' });
          // Max se tourne vers celui qu'il appelle
          chef.happyUntil = this.time + 0.8;
        } else if (seat) this.snapSeat(a, seat);
        else { const f = tileFeet(a.standSpot!); a.x = f.x; a.y = f.y; }
        break;
      }
      case 'act': {
        const a = this.actors.get(ev.who);
        if (!a) break;
        a.act = ev.kind;
        a.actAt = this.time;
        if (ev.kind === 'bash' && (a.role === 'analyse' || TEST_CMD.test(`${ev.detail} ${ev.raw ?? ''}`))) this.testRuns.set(ev.id, ev.who);
        if (!live) break;
        this.fx.floatIcon(a.x + (a.seated ? 0 : 1), a.y - 24, iconFor(ev.kind));
        if (ev.kind === 'search' || ev.kind === 'web') this.fx.data(this.nearestWindow(a), { x: a.x, y: a.y - 8 }, ev.kind === 'web' ? '#3ddc97' : '#7fd6ff');
        break;
      }
      case 'act_done': {
        const who = this.testRuns.get(ev.id);
        if (who === undefined) break;
        this.testRuns.delete(ev.id);
        const a = this.actors.get(who);
        if (live && !ev.ok && a && !a.left) this.rage(a);
        break;
      }
      case 'report': {
        const a = this.actors.get(ev.who);
        if (!a || a.reported) break;
        a.reported = true;
        if (live) this.deliver(a);
        else this.inbox++;
        break;
      }
      case 'leave': {
        const asg = this.assignments.find((x) => x.id === ev.who);
        if (asg) asg.status = ev.ok ? 'done' : 'failed';
        const a = this.actors.get(ev.who);
        if (!a || a.left) break;
        a.left = true;
        if (!live) { this.retire(a, false); break; }
        if (ev.ok && !a.reported) { a.reported = true; this.deliver(a); }
        if (!ev.ok) a.sadUntil = this.time + 2;
        this.retire(a, true);
        break;
      }
      case 'file':
        if (live) {
          this.printUntil = this.time + 1.8;
          this.fx.floatIcon(this.printerPt.x, this.printerPt.y - 6, 'paper');
        }
        break;
      case 'ask': {
        const a = this.actors.get(ev.who) ?? chef;
        a.asks++;
        if (live) this.fx.floatIcon(a.x, a.y - 26, 'alert');
        break;
      }
      case 'ask_done':
        for (const a of this.actors.values()) if (a.asks > 0) { a.asks = Math.max(0, a.asks - 1); break; }
        break;
      case 'end':
        this.missionActive = false;
        for (const a of [...this.actors.values()]) {
          if (a === chef || a.left) continue;
          if (a.res && !a.onMission) continue;
          a.left = true;
          this.retire(a, live);
        }
        if (live) {
          if (ev.ok) { this.fx.rain(22 * T); chef.happyUntil = this.time + 3; }
          chef.tasks = [];
          this.queue(chef,
            { t: 'walk', tile: SPOTS.reception, then: SPOTS.receptionPx },
            { t: 'wait', ms: 100, dir: 'down' },
            { t: 'call', fn: () => {
              if (ev.ok) {
                chef.cheerUntil = this.time + 2.6;
                this.fx.confetti(chef.x, chef.y - 20, 60);
              } else chef.sadUntil = this.time + 2.5;
            } },
          );
        } else {
          chef.tasks = [];
          chef.cur = null;
          chef.seated = false;
          chef.x = SPOTS.receptionPx.x;
          chef.y = SPOTS.receptionPx.y;
          chef.dir = 'down';
        }
        break;
      case 'error':
        chef.sadUntil = this.time + 2;
        break;
    }
  }

  private snapSeat(a: Actor, seat: Seat) {
    a.tasks = [];
    a.cur = null;
    a.seat = seat;
    a.seated = true;
    a.x = seat.x;
    a.y = seat.y;
    a.dir = 'down';
    a.alpha = 1;
  }

  /** Il se lève, prend son rapport et va le poser sur le bureau du chef. */
  private deliver(a: Actor) {
    let spot = SPOTS.deliver.findIndex((_, i) => !this.deliverTaken.has(i));
    if (spot < 0) spot = Math.floor(Math.random() * SPOTS.deliver.length);
    this.deliverTaken.add(spot);
    a.deliverSpot = spot;
    this.queue(a,
      { t: 'stand' },
      { t: 'call', fn: () => { a.carrying = true; } },
      { t: 'walk', tile: SPOTS.deliver[spot], face: 'up' },
      { t: 'call', fn: () => {
        a.carrying = false;
        this.fx.paper({ x: a.x, y: a.y - 12 }, this.inboxPt, () => { this.inbox++; this.fx.sparkle(this.inboxPt.x, this.inboxPt.y, 6, '#ffd2a8'); });
        a.happyUntil = this.time + 1.2;
        this.chef.happyUntil = this.time + 1.2;
      } },
      { t: 'wait', ms: 700, dir: 'up' },
      { t: 'call', fn: () => { this.deliverTaken.delete(spot); a.delivered = true; } },
    );
  }

  /** Il repart par la porte (et libère son bureau). */
  private exit(a: Actor) {
    this.queue(a,
      { t: 'call', fn: () => { if (a.seat) this.seatOf.delete(a.seat.id); } },
      { t: 'walk', tile: SPOTS.door },
      { t: 'call', fn: () => this.fx.beam(SPOTS.doorOut.x, GATE.y + 14) },
      { t: 'slide', to: { x: a.x, y: SPOTS.doorOut.y }, speed: 40 },
      { t: 'fade', to: 0, ms: 200 },
      { t: 'call', fn: () => this.remove(a) },
    );
  }

  private remove(a: Actor) {
    if (a.seat && this.seatOf.get(a.seat.id) === a.id) this.seatOf.delete(a.seat.id);
    if (a.deliverSpot >= 0) this.deliverTaken.delete(a.deliverSpot);
    a.gone = true;
    this.actors.delete(a.id);
    this.rosterChanged();
  }

  // ── Une image ──
  /** Fait avancer le monde. Renvoie vrai si quelque chose bouge (pour savoir à quel rythme redessiner). */
  update(dtReal: number): boolean {
    const dt = Math.min(0.1, dtReal) * this.speed;
    this.time += dt;
    this.fx.update(dt);
    weather.update(dt);
    let moving = this.fx.busy || weather.raining || this.time < this.printUntil || this.time < this.boardUntil;
    const chef = this.chef;
    // la vapeur du café
    if (this.time > this.steamAt) { this.steamAt = this.time + 0.35; this.fx.steam(16 * T + 11, 13 * T + 4); }
    // le chat : il sait qui dort, et si le bureau de Max est libre
    let sleepers = 0;
    for (const a of this.actors.values()) if (a.doing === 'sleep') sleepers++;
    this.cat.sleepers = sleepers;
    this.cat.deskTaken = this.missionActive || chef.seated || chef.busy;
    if (this.cat.update(dt, this.time, this.grid, (x, y) => this.fx.floatIcon(x, y, 'zzz'))) moving = true;
    const cat = this.cat;
    if (cat.startled) {
      // chassé du clavier : Max sourit, il ne va pas se fâcher contre un chat
      cat.startled = false;
      this.fx.floatIcon(cat.x, cat.y - 14, 'alert');
      chef.happyUntil = this.time + 1.3;
    }
    if (cat.arrived) {
      const kind = cat.arrived;
      cat.arrived = '';
      if (kind === 'sleeper') this.fx.floatIcon(cat.x, cat.y - 13, 'heart');
      else { this.fx.floatIcon(cat.x, cat.y - 14, 'heart'); if (chef.alpha > 0.9) chef.happyUntil = this.time + 1.2; }
    }
    // le jukebox : des notes qui s'envolent quand il joue
    if (this.musicOn && this.time > this.noteAt) {
      this.noteAt = this.time + 0.7 + Math.random() * 0.5;
      this.fx.floatIcon(14 * T + 10 + Math.random() * 12, 13 * T + 2, Math.random() < 0.5 ? 'note' : 'note2');
    }
    if (this.musicOn) moving = true;
    // le mode soirée : des étincelles, et tout le monde danse
    if (this.time < this.discoUntil) {
      moving = true;
      if (Math.random() < 0.25) this.fx.sparkle(32 + Math.random() * 288, 60 + Math.random() * 160, 2, ['#ff6fa8', '#4fb3ff', '#ffd166', '#3ddc97', '#ff8a3d'][Math.floor(Math.random() * 5)]);
    }
    for (const until of this.wiggles.values()) if (until > this.time) moving = true;
    for (const a of this.actors.values()) {
      if (a.id.startsWith('demo-') && this.time - a.actAt > 2 + Math.random() * 3) {
        const kinds: ActKind[] = a.role === 'recherche' ? ['search', 'web'] : a.role === 'code' ? ['write', 'bash'] : a.role === 'analyse' ? ['read', 'write'] : ['write', 'edit'];
        a.act = kinds[Math.floor(Math.random() * kinds.length)];
        a.actAt = this.time;
        this.fx.floatIcon(a.x, a.y - 24, iconFor(a.act));
      }
    }
    // Max salue de temps en temps quand il attend à l'accueil
    if (!this.missionActive && !chef.busy && !chef.seated && this.time > this.waveAt) {
      this.waveAt = this.time + 9 + Math.random() * 6;
      if (Math.random() < 0.18) this.smokeBreak(chef);
      else this.queue(chef, { t: 'wait', ms: 1200, pose: 'wave', dir: 'down' });
    }
    // la pause clope : une bouffée de fumée de temps en temps, depuis le bout de la cigarette
    for (const a of this.actors.values()) {
      if (a.smokeUntil <= this.time) continue;
      moving = true;
      if (a.moving) continue;
      const p = smokePhase(a, this.time);
      const was = smokePhase(a, this.time - dt);
      const e = smokeTip(a, this.time);
      if (was < 0.8 && p >= 0.8) for (let i = 0; i < 5; i++) this.fx.smoke(e.x + (a.dir === 'left' ? -1 : 1), e.y - 2 - i % 2);
      else if (this.time > a.nextPuff) {
        a.nextPuff = this.time + 0.5;
        this.fx.smoke(e.x, e.y - 1);
      }
    }
    for (const a of this.actors.values()) {
      if (a.angryUntil > this.time) {
        moving = true;
        // de la vapeur qui sort de la tête, et une marque de colère de temps en temps
        if (this.time > a.nextAnger) {
          a.nextAnger = this.time + 0.45;
          for (let i = 0; i < 3; i++) this.fx.steam(a.x - 4 + i * 4, a.y - 22);
          if (Math.random() < 0.4) this.fx.floatIcon(a.x + 5, a.y - 25, 'anger');
        }
      }
    }
    for (const a of this.actors.values()) {
      if (a.doing === 'sleep' && this.time > a.nextPuff) { a.nextPuff = this.time + 1.7; this.fx.floatIcon(a.x + 4, a.y - 24, 'zzz'); }
    }
    for (const a of [...this.actors.values()]) {
      if (a.res && !a.onMission) this.wander(a);
      if (!a.cur && a.tasks.length) { a.cur = a.tasks.shift()!; this.startTask(a, a.cur); }
      if (a.cur) {
        const task = a.cur;
        a.curT += dt;
        if (this.runTask(a, task, dt) && a.cur === task) a.cur = null;
      }
      animateActor(a, dt, this.time, this.cat);
      if (a.moving || (a.cur && !(a.res && !a.onMission && a.cur.t === 'wait')) || a.seated || a.cheerUntil > this.time || a.angryUntil > this.time || a.doing === 'notes' || a.doing === 'phone') moving = true;
    }
    this.calm = !this.missionActive && this.time >= this.discoUntil && !this.musicOn && this.time >= this.printUntil && this.time >= this.boardUntil;
    return moving;
  }

  // ── Les petits gestes du bureau (quand on clique sur les objets) ──
  neonNext() {
    this.neonIndex = (this.neonIndex + 1) % 5;
    this.fx.sparkle(97 + 12, 11 + 11, 10, '#ffffff');
  }

  wiggle(id: string, x: number, y: number) {
    this.wiggles.set(id, this.time + 1.1);
    this.fx.sparkle(x, y, 6, '#86cf7c');
  }

  coffee() {
    for (let i = 0; i < 12; i++) this.fx.steam(16 * T + 9 + Math.random() * 6, 13 * T + 4 - Math.random() * 4);
    this.fx.floatIcon(16 * T + 12, 13 * T - 2, 'coffee');
  }

  cooler() {
    for (let i = 0; i < 6; i++) this.fx.sparkle(9 * T + 8, 3 * T + 4 - i, 1, '#bfe3ff');
    this.fx.floatIcon(9 * T + 8, 3 * T - 4, 'drop');
  }

  toggleLamp(id: string) {
    if (this.lampsOff.has(id)) this.lampsOff.delete(id); else this.lampsOff.add(id);
  }

  /** Le mode soirée : la boule à facettes descend, et toute l'équipe danse. */
  disco(seconds = 16) {
    this.discoUntil = this.time + seconds;
    for (const a of this.actors.values()) a.cheerUntil = this.discoUntil;
    this.fx.rain(22 * T, 70);
  }

  /** Pour la visite guidée sans mission : un agent par coin, assis à son bureau, qui travaille. */
  demoTeam(on: boolean) {
    const demo: [string, Role, string][] = [['demo-1', 'recherche', 'Iris'], ['demo-2', 'recherche', 'Hugo'], ['demo-3', 'code', 'Ada'], ['demo-4', 'design', 'Frida'], ['demo-5', 'redaction', 'Colette'], ['demo-6', 'analyse', 'Marie']];
    this.demoOn = on;
    if (on) {
      // l'équipe de la visite remplace l'équipe qui se balade
      for (const a of this.residents) if (!a.onMission) this.actors.delete(a.id);
      this.residents = new Set([...this.residents].filter((a) => a.onMission));
      this.slotUsed.clear();
      for (const [id, role, name] of demo) {
        if (this.actors.has(id)) continue;
        const seat = this.assignSeat(role);
        if (!seat) continue;
        const a = new Actor(id, role, name, seat.x, seat.y);
        this.seatOf.set(seat.id, id);
        this.snapSeat(a, seat);
        a.act = Math.random() < 0.5 ? 'search' : 'write';
        a.actAt = this.time;
        this.actors.set(id, a);
      }
    } else {
      for (const [id] of demo) { const a = this.actors.get(id); if (a) this.remove(a); }
      if (!this.residents.size) this.spawnResidents();
    }
    this.rosterChanged();
  }

  /** La pause clope : quelqu'un de libre (Max en priorité) va fumer sur le pas de la porte, puis retourne à sa place. */
  smokeBreak(who?: Actor): boolean {
    const free = (a: Actor) => !a.gone && !a.left && !a.busy && !a.carrying && a.asks === 0 && a.alpha > 0.9 && a.smokeUntil <= this.time && this.time - a.actAt > 9;
    const a = who ?? [this.chef, ...[...this.actors.values()].filter((x) => x !== this.chef)].find(free);
    if (!a || !free(a)) return false;
    if (this.missionActive && (a === this.chef || a.onMission)) return false;
    const seat = a.seated ? a.seat : null;
    const back = a.tile;
    const taken = new Set([...this.actors.values()].map((x) => x.at).filter(Boolean));
    const spots = SPOTS.smoke.filter((s) => !taken.has(s.join(',')));
    if (!spots.length) return false;
    const spot = spots[Math.floor(Math.random() * spots.length)];
    a.at = spot.join(',');
    this.queue(a,
      { t: 'walk', tile: spot, face: 'down' },
      { t: 'call', fn: () => { a.smokeUntil = this.time + 9; } },
      { t: 'wait', ms: 9000, dir: 'down' },
      { t: 'call', fn: () => { a.smokeUntil = 0; a.at = null; a.happyUntil = this.time + 1; } },
      seat ? { t: 'walk', tile: seat.tile } : { t: 'walk', tile: a === this.chef ? SPOTS.reception : back, face: 'down' },
      ...(seat ? [{ t: 'sit', seat } as Task] : []),
    );
    return true;
  }

  /** Un test a échoué : le testeur lève le poing (les autres grincent des dents). */
  private rage(a: Actor) {
    a.angryUntil = this.time + 2.6;
    a.nextAnger = this.time;
    this.fx.floatIcon(a.x + 5, a.y - 24, 'anger');
  }

  petCat() {
    this.cat.pet(this.time);
    this.fx.floatIcon(this.cat.x, this.cat.y - 12, 'heart');
  }

  /** La musique : appelé à chaque image avec l'énergie des basses. */
  setMusic(on: boolean, level: number, beat: boolean) {
    this.musicOn = on;
    this.musicLevel = level;
    if (beat) this.bobUntil = this.time + 0.12;
  }
}
