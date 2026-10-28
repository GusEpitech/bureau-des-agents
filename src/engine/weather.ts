// La météo : de la pluie derrière les fenêtres du bureau et dans la cour (gouttes, éclaboussures, flaques qui
// reflètent les lampadaires). Elle passe toute seule (deux minutes de pluie tous les quarts d'heure) ; dans la
// console, `__bureau.weather.force = 'rain' | 'clear' | 'auto'` la déclenche ou l'arrête.
import { T, W, WINDOWS, YARD_TOP } from './layout.ts';
import type { G } from './pixels.ts';

const YARD_Y = YARD_TOP * T;
const YARD_H = 6 * T;
const PUDDLES: { x: number; y: number; rx: number }[] = [
  { x: 6 * T + 4, y: 18 * T + 12, rx: 11 },
  { x: 16 * T, y: 20 * T + 4, rx: 13 },
  { x: 10 * T, y: 17 * T + 10, rx: 9 },
  { x: 12 * T + 8, y: 19 * T + 12, rx: 8 },
  { x: 3 * T, y: 19 * T + 6, rx: 7 },
];

/** Un nombre entre 0 et 1, toujours le même pour le même i (pour placer les gouttes sans rien garder en mémoire). */
const hash = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export class Weather {
  force: 'auto' | 'rain' | 'clear' = 'auto';
  /** 0 (sec) à 1 (grosse pluie) : monte et descend doucement */
  level = 0;
  /** la force maximale de la pluie (0 à 1) */
  intensity = 1;

  get raining() { return this.level > 0.02; }

  private target() {
    if (this.force !== 'auto') return this.force === 'rain' ? this.intensity : 0;
    const phase = (Date.now() / 1000) % 900;
    return phase > 560 && phase < 680 ? this.intensity : 0;
  }

  update(dt: number) {
    const to = this.target();
    this.level += Math.max(-dt * 0.2, Math.min(dt * 0.2, to - this.level));
  }

  /** Les vitres : de fines gouttes en biais dehors, et quelques gouttes lourdes qui coulent sur le verre. */
  windows(g: G, t: number) {
    if (!this.raining) return;
    const lv = this.level;
    for (const [wi, w] of WINDOWS.entries()) {
      g.save();
      g.beginPath();
      g.rect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
      g.clip();
      g.fillStyle = `rgba(70,82,110,${(0.34 * lv).toFixed(2)})`;
      g.fillRect(w.x, w.y, w.w, w.h);
      const n = Math.round(34 * lv);
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const k = wi * 40 + i;
        const p = (t * (1.7 + hash(k) * 0.8) + hash(k + 9)) % 1;
        g.rect(w.x + Math.round(hash(k + 3) * w.w - p * 4), w.y + Math.round(p * (w.h + 4)) - 2, 1, 2);
      }
      g.fillStyle = `rgba(200,220,255,${(0.8 * lv).toFixed(2)})`;
      g.fill();
      // les gouttes sur la vitre : elles glissent, s'arrêtent, repartent
      g.fillStyle = `rgba(235,244,255,${(0.7 * lv).toFixed(2)})`;
      for (let i = 0; i < 5; i++) {
        const k = wi * 20 + i + 300;
        const p = (t * (0.05 + hash(k) * 0.05) + hash(k + 1)) % 1;
        const y = w.y + 2 + Math.round(Math.pow(p, 1.6) * (w.h - 4));
        const x = w.x + 3 + Math.round(hash(k + 2) * (w.w - 6));
        g.fillRect(x, y, 1, 2);
        g.fillStyle = `rgba(235,244,255,${(0.2 * lv).toFixed(2)})`;
        g.fillRect(x, y - 3, 1, 3);
        g.fillStyle = `rgba(235,244,255,${(0.7 * lv).toFixed(2)})`;
      }
      g.restore();
    }
  }

  /** Les flaques de la cour, sous les meubles : un reflet pâle, et des ronds qui s'étendent là où les gouttes tombent. */
  ground(g: G, t: number) {
    if (!this.raining) return;
    const lv = this.level;
    for (const [i, p] of PUDDLES.entries()) {
      const ry = Math.max(3, Math.round(p.rx * 0.38));
      g.fillStyle = `rgba(110,140,205,${(0.3 * lv).toFixed(2)})`;
      for (let dy = -ry; dy <= ry; dy++) {
        const half = Math.round(p.rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
        g.fillRect(p.x - half, p.y + dy, half * 2, 1);
      }
      g.fillStyle = `rgba(230,240,255,${(0.2 * lv).toFixed(2)})`;
      g.fillRect(p.x - Math.round(p.rx * 0.5), p.y - 1, Math.round(p.rx * 0.6), 1);
      // un rond qui grandit puis s'efface
      const ph = (t * 0.9 + hash(i) * 3) % 1;
      const r = 1 + ph * (p.rx - 2);
      g.fillStyle = `rgba(235,244,255,${((1 - ph) * 0.45 * lv).toFixed(2)})`;
      for (let a = 0; a < 14; a++) {
        const ang = (a / 14) * Math.PI * 2;
        g.fillRect(Math.round(p.x + Math.cos(ang) * r), Math.round(p.y + Math.sin(ang) * r * 0.4), 1, 1);
      }
    }
  }

  /** La pluie qui tombe dans la cour, devant les robots et les arbres ; la cour s'assombrit un peu. */
  rain(g: G, t: number) {
    if (!this.raining) return;
    const lv = this.level;
    g.save();
    g.beginPath();
    g.rect(T, YARD_Y, W - 2 * T, YARD_H);
    g.clip();
    g.fillStyle = `rgba(28,38,70,${(0.26 * lv).toFixed(2)})`;
    g.fillRect(T, YARD_Y, W - 2 * T, YARD_H);
    const n = Math.round(120 * lv);
    // toutes les traînées dans un seul tracé, toutes les éclaboussures dans un autre : bien moins cher que goutte par goutte
    g.beginPath();
    const splash = new Path2D();
    for (let i = 0; i < n; i++) {
      const x = T + hash(i) * (W - 2 * T - 4);
      const ground = YARD_Y + 14 + hash(i + 50) * (YARD_H - 22);
      const period = 0.5 + hash(i + 7) * 0.35;
      const ph = (t / period + hash(i + 13)) % 1;
      if (ph < 0.9) {
        g.rect(Math.round(x - ph * 2), Math.round(YARD_Y + (ph / 0.9) * (ground - YARD_Y + 6)), 1, 4);
      } else {
        const s = (ph - 0.9) / 0.1;
        splash.rect(Math.round(x - 1 - s * 2), Math.round(ground - s * 2), 1, 1);
        splash.rect(Math.round(x + 2 + s * 2), Math.round(ground - s * 2), 1, 1);
      }
    }
    g.fillStyle = 'rgba(205,222,255,0.8)';
    g.fill();
    g.fillStyle = 'rgba(220,235,255,0.5)';
    g.fill(splash);
    g.restore();
  }
}

export const weather = new Weather();
