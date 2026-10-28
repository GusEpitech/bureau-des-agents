// Les effets : la lumière de téléportation à la porte, les étincelles, les confettis, les petites
// données qui arrivent d'internet par la fenêtre, la vapeur du café, les feuilles qui volent jusqu'au chef.
import { icon, type IconName } from './icons.ts';
import { P } from './pixels.ts';

interface Particle {
  kind: 'spark' | 'confetti' | 'data' | 'steam' | 'smoke' | 'icon' | 'paper' | 'beam';
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  color: string;
  size: number;
  gravity: number;
  icon?: IconName;
  /** pour les trajets courbes (données, feuilles) */
  from?: { x: number; y: number }; to?: { x: number; y: number }; arc?: number; delay?: number;
  onEnd?: () => void;
}

export class Fx {
  list: Particle[] = [];

  /** vrai s'il se passe quelque chose (la vapeur du café, discrète, ne compte pas) */
  get busy() { return this.list.some((p) => p.kind !== 'steam' && p.kind !== 'smoke'); }

  /** La colonne de lumière d'une arrivée ou d'un départ. */
  beam(x: number, y: number, color = P.orangeLight) {
    this.list.push({ kind: 'beam', x, y, vx: 0, vy: 0, life: 0, max: 0.9, color, size: 1, gravity: 0 });
    for (let i = 0; i < 14; i++) {
      this.list.push({
        kind: 'spark', x: x + (Math.random() - 0.5) * 12, y: y - Math.random() * 20, vx: (Math.random() - 0.5) * 6, vy: -12 - Math.random() * 22,
        life: 0, max: 0.6 + Math.random() * 0.5, color: Math.random() < 0.5 ? P.orange : '#ffffff', size: 1, gravity: 0, delay: Math.random() * 0.3,
      });
    }
  }

  sparkle(x: number, y: number, n = 8, color = '#ffffff') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 14 + Math.random() * 18;
      this.list.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, life: 0, max: 0.4 + Math.random() * 0.4, color, size: 1, gravity: 20 });
    }
  }

  confetti(x: number, y: number, n = 90) {
    const colors = [P.orange, P.orangeLight, '#ffffff', '#4fb3ff', '#3ddc97', '#ff6fa8', '#ffd166', '#a98bff'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const s = 50 + Math.random() * 80;
      this.list.push({
        kind: 'confetti', x: x + (Math.random() - 0.5) * 8, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 2 + Math.random() * 1.2,
        color: colors[i % colors.length], size: Math.random() < 0.3 ? 2 : 1, gravity: 90, delay: Math.random() * 0.15,
      });
    }
  }

  /** Une pluie de confettis qui tombe du plafond, sur tout le bureau. */
  rain(width: number, n = 140) {
    const colors = [P.orange, P.orangeLight, '#ffffff', '#4fb3ff', '#3ddc97', '#ff6fa8', '#ffd166', '#a98bff'];
    for (let i = 0; i < n; i++) {
      this.list.push({
        kind: 'confetti', x: 16 + Math.random() * (width - 32), y: 40 + Math.random() * 10, vx: (Math.random() - 0.5) * 30, vy: 10 + Math.random() * 30,
        life: 0, max: 2.6 + Math.random() * 1.6, color: colors[i % colors.length], size: Math.random() < 0.3 ? 2 : 1, gravity: 36, delay: Math.random() * 0.9,
      });
    }
  }

  floatIcon(x: number, y: number, name: IconName) {
    this.list.push({ kind: 'icon', x, y, vx: 0, vy: -12, life: 0, max: 1.3, color: '', size: 1, gravity: 0, icon: name });
  }

  /** Des petits paquets de données qui voyagent d'un point à un autre (internet → le bureau). */
  data(from: { x: number; y: number }, to: { x: number; y: number }, color = '#7fd6ff', n = 5) {
    for (let i = 0; i < n; i++) {
      this.list.push({
        kind: 'data', x: from.x, y: from.y, vx: 0, vy: 0, life: 0, max: 0.9, color: i % 2 ? '#ffffff' : color, size: 1, gravity: 0,
        from, to, arc: -14 - Math.random() * 10, delay: i * 0.12,
      });
    }
  }

  /** Une feuille qui vole en cloche, puis se pose (et prévient quand elle arrive). */
  paper(from: { x: number; y: number }, to: { x: number; y: number }, onEnd?: () => void) {
    this.list.push({ kind: 'paper', x: from.x, y: from.y, vx: 0, vy: 0, life: 0, max: 0.7, color: P.paper, size: 1, gravity: 0, from, to, arc: -18, onEnd });
  }

  /** La fumée d'une cigarette : monte lentement, grise, et s'efface. */
  smoke(x: number, y: number) {
    this.list.push({ kind: 'smoke', x, y, vx: 1.5 + Math.random() * 2, vy: -7 - Math.random() * 3, life: 0, max: 2.2, color: '#cfcad8', size: 1, gravity: 0 });
  }

  steam(x: number, y: number) {
    this.list.push({ kind: 'steam', x: x + (Math.random() - 0.5) * 2, y, vx: (Math.random() - 0.5) * 2, vy: -6 - Math.random() * 4, life: 0, max: 1.4, color: '#ffffff', size: 1, gravity: 0 });
  }

  update(dt: number) {
    const keep: Particle[] = [];
    for (const p of this.list) {
      if (p.delay && p.delay > 0) { p.delay -= dt; keep.push(p); continue; }
      p.life += dt;
      if (p.life >= p.max) { p.onEnd?.(); continue; }
      if (p.from && p.to) {
        const t = p.life / p.max;
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        p.x = p.from.x + (p.to.x - p.from.x) * e;
        p.y = p.from.y + (p.to.y - p.from.y) * e + (p.arc ?? 0) * Math.sin(Math.PI * t);
      } else {
        p.vy += p.gravity * dt;
        if (p.kind === 'confetti') p.vx *= 1 - 1.4 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      keep.push(p);
    }
    this.list = keep;
  }

  draw(g: CanvasRenderingContext2D) {
    for (const p of this.list) {
      if (p.delay && p.delay > 0) continue;
      const t = p.life / p.max;
      const x = Math.round(p.x), y = Math.round(p.y);
      switch (p.kind) {
        case 'beam': {
          const a = Math.sin(Math.PI * t);
          g.fillStyle = `rgba(255,214,170,${0.18 * a})`;
          g.fillRect(x - 7, y - 30, 14, 32);
          g.fillStyle = `rgba(255,236,214,${0.35 * a})`;
          g.fillRect(x - 3, y - 30, 6, 32);
          break;
        }
        case 'icon': {
          const c = icon(p.icon!);
          g.globalAlpha = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;
          g.drawImage(c, x - Math.floor(c.width / 2), y - c.height);
          g.globalAlpha = 1;
          break;
        }
        case 'paper':
          g.fillStyle = P.ink;
          g.fillRect(x - 3, y - 4, 7, 8);
          g.fillStyle = P.paper;
          g.fillRect(x - 2, y - 3, 5, 6);
          g.fillStyle = P.paperLine;
          g.fillRect(x - 1, y - 1, 3, 1);
          g.fillRect(x - 1, y + 1, 2, 1);
          break;
        case 'smoke':
          g.fillStyle = `rgba(207,202,216,${0.55 * (1 - t)})`;
          g.fillRect(x, y, t > 0.5 ? 2 : 1, t > 0.5 ? 2 : 1);
          break;
        case 'steam':
          g.fillStyle = `rgba(255,255,255,${0.35 * (1 - t)})`;
          g.fillRect(x, y, 1, 1);
          break;
        default:
          g.globalAlpha = p.kind === 'confetti' ? Math.min(1, (1 - t) * 3) : 1 - t;
          g.fillStyle = p.color;
          g.fillRect(x, y, p.size, p.size);
          g.globalAlpha = 1;
      }
    }
  }
}
