// Ce qu'on voit dehors : par les fenêtres du bureau (fenêtres de la ville qui s'allument et s'éteignent, un avion, des
// oiseaux, une étoile filante, les phases de la lune) et par le portail de la cour (une voiture passe dans la rue).
// Tout se calcule à partir de l'heure du monde : rien à garder en mémoire.
import { T, WINDOWS, W } from './layout.ts';
import type { G } from './pixels.ts';
import { CITY_LIGHTS, SKY, type TimeOfDay } from './room.ts';

const hash = (i: number) => { const s = Math.sin(i * 78.233 + 12.9) * 43758.5453; return s - Math.floor(s); };

/** Les deux vitres de chaque fenêtre (le montant du milieu les sépare). */
const PANES = WINDOWS.flatMap((w) => [
  { x: w.x, y: w.y, w: Math.floor(w.w / 2), h: w.h },
  { x: w.x + Math.floor(w.w / 2) + 2, y: w.y, w: w.w - Math.floor(w.w / 2) - 2, h: w.h },
]);

/** L'âge de la lune, de 0 (nouvelle) à 29,5 jours (la même référence que les almanachs : nouvelle lune du 6 janvier 2000). */
function moonAge(now: number) { return (((now / 86400000 - 10957.76) % 29.53) + 29.53) % 29.53; }

export class Outside {
  /** Les vitres : à appeler juste après le décor (avant les robots). */
  windows(g: G, t: number, tod: TimeOfDay) {
    g.save();
    g.beginPath();
    for (const p of PANES) g.rect(p.x, p.y, p.w, p.h);
    g.clip();
    if (tod !== 'day') this.cityLights(g, t, tod);
    if (tod === 'night') { this.moon(g); this.shootingStar(g, t); }
    this.plane(g, t, tod);
    if (tod !== 'night') this.birds(g, t);
    g.restore();
  }

  /** Quelques fenêtres de la ville s'éteignent, d'autres s'allument, doucement. */
  private cityLights(g: G, t: number, tod: TimeOfDay) {
    const lights = CITY_LIGHTS[tod];
    const sky = SKY[tod];
    for (let i = 0; i < lights.length; i++) {
      if (hash(i) > 0.3) continue; // seules 3 sur 10 changent d'état
      const p = lights[i];
      const period = 14 + hash(i + 1) * 30;
      const on = ((t / period + hash(i + 2)) % 1) < 0.6;
      if (!on) { g.fillStyle = p.dark; g.fillRect(p.x, p.y, 1, 1); }
    }
    // et quelques-unes, éteintes au départ, qui s'allument
    g.fillStyle = sky.lit;
    for (let k = 0; k < 6; k++) {
      const w = PANES[k % PANES.length];
      const phase = (t / (22 + hash(k + 40) * 20) + hash(k + 50)) % 1;
      if (phase > 0.5) continue;
      g.fillRect(w.x + 3 + Math.floor(hash(k + 60) * (w.w - 6)), w.y + w.h - 3 - Math.floor(hash(k + 70) * 5) * 2, 1, 1);
    }
  }

  /** La lune du coin de la première fenêtre, avec sa vraie phase : un côté dans l'ombre. */
  private moon(g: G) {
    const w = WINDOWS[0];
    const age = moonAge(Date.now());
    const illum = (1 - Math.cos((age / 29.53) * Math.PI * 2)) / 2; // 0 = nouvelle, 1 = pleine
    if (illum > 0.93) return;
    const shade = Math.round(8 * (1 - illum)); // la largeur dans l'ombre, sur 8 pixels
    const waxing = age < 14.77;
    g.fillStyle = SKY.night.bands[0];
    const x0 = w.x + 9;
    for (let dy = 0; dy < 6; dy++) {
      const left = waxing ? 0 : 8 - shade;
      g.fillRect(x0 + left, w.y + 5 + dy, shade, 1);
    }
  }

  private shootingStar(g: G, t: number) {
    const slot = Math.floor(t / 31);
    if (hash(slot + 9) > 0.55) return; // pas à chaque fois
    const u = (t % 31) / 0.9;
    if (u > 1) return;
    const pane = PANES[Math.floor(hash(slot + 3) * PANES.length)];
    const x = pane.x + 4 + hash(slot) * (pane.w - 18) + u * 14;
    const y = pane.y + 1 + hash(slot + 1) * 5 + u * 8;
    for (let k = 0; k < 6; k++) {
      g.fillStyle = `rgba(255,255,240,${(0.9 - k * 0.14) * (1 - u * 0.5)})`;
      g.fillRect(Math.round(x - k * 1.6), Math.round(y - k * 0.9), 1, 1);
    }
  }

  /** Un avion traverse le ciel de temps en temps : un trait de fumée le jour, des feux clignotants le soir et la nuit. */
  private plane(g: G, t: number, tod: TimeOfDay) {
    const period = 95;
    const u = (t % period) / 34; // 34 s de vol, puis le ciel est vide
    if (u > 1) return;
    const x = -14 + u * (W + 28);
    const y = 12 + Math.floor(hash(Math.floor(t / period)) * 6);
    if (tod === 'day') {
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(Math.round(x) - 12, y, 12, 1);
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(x), y, 3, 1);
    } else {
      g.fillStyle = '#20203a';
      g.fillRect(Math.round(x), y, 4, 1);
      if (Math.floor(t * 2) % 2) { g.fillStyle = '#ff4a3a'; g.fillRect(Math.round(x) - 1, y, 1, 1); }
      g.fillStyle = Math.floor(t * 1.3) % 3 ? 'rgba(255,255,255,0)' : '#ffffff';
      g.fillRect(Math.round(x) + 4, y, 1, 1);
    }
  }

  /** Trois oiseaux en V, qui battent des ailes, traversent en groupe. */
  private birds(g: G, t: number) {
    const period = 58;
    const u = ((t + 20) % period) / 18;
    if (u > 1) return;
    g.fillStyle = '#2a2a44';
    for (let k = 0; k < 3; k++) {
      const x = Math.round(-10 + u * (W + 20) - k * 7);
      const y = 16 + k * 2 + Math.round(Math.sin(t * 1.5 + k) * 1);
      const up = Math.floor(t * 6 + k) % 2;
      g.fillRect(x, y + (up ? 0 : 1), 1, 1);
      g.fillRect(x + 1, y + 1, 1, 1);
      g.fillRect(x + 2, y + (up ? 0 : 1), 1, 1);
    }
  }

  /** La rue derrière le portail : de temps en temps une voiture passe (ses phares la nuit), de gauche à droite ou l'inverse. */
  street(g: G, t: number, tod: TimeOfDay) {
    const slot = Math.floor(t / 23);
    if (hash(slot + 77) > 0.6) return;
    const u = (t % 23) / 2.4;
    if (u > 1) return;
    const dir = hash(slot + 5) < 0.5 ? 1 : -1;
    const x0 = 10 * T, x1 = 12 * T;
    const bottom = 22 * T;
    const x = dir > 0 ? x0 - 14 + u * (x1 - x0 + 28) : x1 + 14 - u * (x1 - x0 + 28) - 12;
    const y = bottom + 11;
    const colors = ['#c0504d', '#4d7fc0', '#d9b44a', '#6aa06a', '#8a8aa0'];
    const body = colors[Math.floor(hash(slot + 11) * colors.length)];
    g.save();
    g.beginPath();
    g.rect(x0 + 6, bottom + 2, x1 - x0 - 12, T - 3); // seulement entre les battants
    g.clip();
    g.fillStyle = tod === 'day' ? body : '#1b1830';
    g.fillRect(Math.round(x), y, 12, 3);
    g.fillRect(Math.round(x) + 3, y - 2, 6, 2);
    g.fillStyle = tod === 'day' ? '#bfe0f5' : '#2c2a4a';
    g.fillRect(Math.round(x) + 4, y - 2, 4, 1);
    g.fillStyle = '#0a0a12';
    g.fillRect(Math.round(x) + 1, y + 3, 3, 1);
    g.fillRect(Math.round(x) + 8, y + 3, 3, 1);
    if (tod !== 'day') {
      // les phares : deux points vifs devant, et un halo pâle qui balaie le sol de la rue
      const fx = dir > 0 ? Math.round(x) + 12 : Math.round(x) - 1;
      g.fillStyle = '#fff3c4';
      g.fillRect(fx, y, 1, 1);
      g.fillRect(fx, y + 2, 1, 1);
      g.fillStyle = 'rgba(255,240,190,0.18)';
      g.fillRect(dir > 0 ? fx + 1 : fx - 8, y - 1, 8, 5);
      g.fillStyle = 'rgba(255,60,50,0.9)';
      g.fillRect(dir > 0 ? Math.round(x) : Math.round(x) + 11, y + 1, 1, 1);
    }
    g.restore();
  }
}

export const outside = new Outside();
