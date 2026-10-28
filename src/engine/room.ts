// La pièce elle-même : le parquet, les tapis de chaque coin, les murs, les grandes fenêtres sur la
// ville (le ciel suit l'heure), le néon VibesMoney, le tableau du plan, l'horloge et la porte.
// Tout ça ne bouge pas : c'est dessiné une fois, puis recopié à chaque image.
import { ROLES, roleSign } from '../../shared/activity.ts';
import { pixelText, textWidth } from './font.ts';
import { BOARD, CLOCK, H, NEON, OFFICE_H, T, W, WINDOWS, ZONES } from './layout.ts';
import { g2d, hline, lighten, makeCanvas, mix, P, px, rect, rng, vline, type G } from './pixels.ts';

export type TimeOfDay = 'day' | 'evening' | 'night';

const SKY: Record<TimeOfDay, { bands: string[]; city: string; city2: string; lit: string; litRate: number }> = {
  day: { bands: ['#4f9fe8', '#68b1ef', '#83c2f3', '#a3d3f6', '#c3e3f8'], city: '#6f80a8', city2: '#8494b9', lit: '#d4e2f5', litRate: 0.08 },
  evening: { bands: ['#2a2453', '#43306a', '#6c3a72', '#a64a6c', '#dc6a5c', '#ff9d5c'], city: '#1d1631', city2: '#2a2040', lit: '#ffcf6b', litRate: 0.22 },
  night: { bands: ['#0a0a20', '#0f0f2c', '#151538', '#1c1a45', '#231e50'], city: '#0a0816', city2: '#120f22', lit: '#ffcf6b', litRate: 0.32 },
};

function floor(g: G) {
  const r = rng(42);
  const top = 3 * T;
  const colors = [P.floor1, P.floor2, P.floor3, P.floor1];
  // des lames de parquet de 6 pixels, aux raccords décalés
  for (let y = top; y < OFFICE_H; y += 6) {
    let x = -Math.floor(r() * 20);
    while (x < W) {
      const len = 18 + Math.floor(r() * 22);
      // chaque lame a sa teinte : un peu plus claire ou plus foncée, comme du vrai bois
      const col = mix(colors[Math.floor(r() * colors.length)], r() < 0.5 ? '#ffffff' : '#000000', r() * 0.05);
      rect(g, x, y, len, 5, col);
      hline(g, x, y, len, mix(col, P.floorHi, 0.5));
      rect(g, x, y + 5, len, 1, P.floorSeam);
      vline(g, x + len - 1, y, 5, P.floorSeam);
      // les veines du bois : de longs traits fins, dans le sens de la lame
      const grain = mix(col, P.floorSeam, 0.3);
      const light = mix(col, P.floorHi, 0.28);
      for (let k = 0; k < 2; k++) {
        const gy = y + 1 + Math.floor(r() * 4), gx = x + 2 + Math.floor(r() * Math.max(1, len - 12)), gl = 4 + Math.floor(r() * 8);
        hline(g, gx, gy, Math.min(gl, x + len - 2 - gx), k ? light : grain);
      }
      // un nœud, de temps en temps
      if (r() < 0.07) {
        const kx = x + 5 + Math.floor(r() * Math.max(1, len - 10)), ky = y + 1 + Math.floor(r() * 2);
        rect(g, kx, ky, 2, 2, mix(col, '#1c1216', 0.45));
        px(g, kx - 1, ky, grain);
        px(g, kx + 2, ky + 1, grain);
        px(g, kx, ky, mix(col, '#1c1216', 0.7));
      }
      // les clous aux deux bouts de certaines lames
      if (r() < 0.45) { px(g, x + 2, y + 2, mix(col, '#1c1216', 0.5)); px(g, x + len - 4, y + 2, mix(col, '#1c1216', 0.5)); }
      x += len;
    }
  }
  // les passages usés : le bois est plus clair là où l'on marche (de la porte à l'accueil, autour du bureau de Max)
  const worn: [number, number, number, number][] = [[9, 12, 5, 4], [8, 8, 7, 4], [9, 4, 5, 3], [3, 8, 4, 2], [13, 8, 5, 2]];
  for (const [tx, ty, tw, th] of worn) {
    for (let yy = ty * T; yy < (ty + th) * T; yy += 2) {
      const inset = Math.floor(r() * 5);
      g.fillStyle = 'rgba(255,214,190,0.035)';
      g.fillRect(tx * T + inset, yy, tw * T - inset * 2, 2);
    }
  }
  // quelques éraflures et un petit tas de poussière contre le mur
  for (let i = 0; i < 26; i++) {
    const sx = T + 4 + Math.floor(r() * (W - 2 * T - 10)), sy = top + 4 + Math.floor(r() * (OFFICE_H - top - 12));
    const dir = r() < 0.5 ? 1 : -1;
    g.fillStyle = 'rgba(255,225,205,0.07)';
    for (let k = 0; k < 3 + Math.floor(r() * 3); k++) g.fillRect(sx + k * dir * 2, sy + (k % 2), 2, 1);
  }
  // l'ombre portée des murs de côté, et celle de l'entrée, sur le parquet
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(8,6,16,${0.16 - i * 0.026})`;
    g.fillRect(T + i * 2, top, 2, OFFICE_H - top - T);
    g.fillRect(W - T - 2 - i * 2, top, 2, OFFICE_H - top - T);
  }
}

function rug(g: G, x: number, y: number, w: number, h: number, color: string) {
  const base = mix(color, '#2b2232', 0.72);
  const edge = mix(color, '#2b2232', 0.5);
  const inner = mix(color, '#2b2232', 0.62);
  const weave = mix(color, '#2b2232', 0.69);
  const motif = mix(color, '#2b2232', 0.55);
  const px0 = x * T + 2, py0 = y * T + 2, pw = w * T - 4, ph = h * T - 4;
  // l'ombre du tapis sur le parquet
  g.fillStyle = 'rgba(8,6,16,0.22)';
  g.fillRect(px0 + 1, py0 + ph, pw - 2, 2);
  g.fillRect(px0 + pw, py0 + 2, 1, ph - 2);
  rect(g, px0 + 1, py0, pw - 2, ph, base);
  rect(g, px0, py0 + 1, pw, ph - 2, base);
  // le tissage : un fin quadrillage, une trame sur deux
  for (let yy = py0 + 2; yy < py0 + ph - 2; yy += 2) for (let xx = px0 + 2 + ((yy - py0) % 4); xx < px0 + pw - 2; xx += 4) px(g, xx, yy, weave);
  // bordure
  hline(g, px0 + 1, py0, pw - 2, edge);
  hline(g, px0 + 1, py0 + ph - 1, pw - 2, edge);
  vline(g, px0, py0 + 1, ph - 2, edge);
  vline(g, px0 + pw - 1, py0 + 1, ph - 2, edge);
  // un liseré intérieur, et un motif en losanges
  hline(g, px0 + 3, py0 + 3, pw - 6, inner);
  hline(g, px0 + 3, py0 + ph - 4, pw - 6, inner);
  vline(g, px0 + 3, py0 + 3, ph - 6, inner);
  vline(g, px0 + pw - 4, py0 + 3, ph - 6, inner);
  hline(g, px0 + 5, py0 + 5, pw - 10, weave);
  hline(g, px0 + 5, py0 + ph - 6, pw - 10, weave);
  for (let yy = py0 + 8; yy < py0 + ph - 8; yy += 6) {
    for (let xx = px0 + 8 + ((yy - py0) / 6 % 2) * 3; xx < px0 + pw - 8; xx += 6) {
      px(g, xx, yy, inner);
      px(g, xx - 1, yy + 1, motif);
      px(g, xx + 1, yy + 1, motif);
      px(g, xx, yy + 2, motif);
    }
  }
  // les franges, aux deux bouts du tapis
  const fringe = mix(color, '#d9cbb0', 0.28);
  for (let xx = px0 + 2; xx < px0 + pw - 2; xx += 2) {
    px(g, xx, py0 - 1, fringe);
    px(g, xx, py0 + ph, fringe);
    if (xx % 4 === 0) { px(g, xx, py0 - 2, mix(fringe, '#2b2232', 0.4)); px(g, xx, py0 + ph + 1, mix(fringe, '#2b2232', 0.4)); }
  }
}

function backWall(g: G) {
  const r = rng(11);
  rect(g, 0, 0, W, 5, P.wallTop);
  rect(g, 0, 5, W, 39, P.wallFace);
  // le papier peint : de fines rayures, et un petit motif en losange tous les 8 pixels
  const stripe = mix(P.wallFace, P.wallHi, 0.16);
  const damask = mix(P.wallFace, P.wallHi, 0.3);
  for (let x = 2; x < W; x += 4) vline(g, x, 6, 24, stripe);
  for (let y = 9; y < 28; y += 8) for (let x = 4 + ((y / 8) % 2) * 4; x < W; x += 8) { px(g, x, y, damask); px(g, x - 1, y + 1, damask); px(g, x + 1, y + 1, damask); px(g, x, y + 2, damask); }
  // la corniche, en haut du mur
  hline(g, 0, 5, W, P.wallHi);
  hline(g, 0, 6, W, mix(P.wallFace, P.wallHi, 0.4));
  hline(g, 0, 7, W, P.wallLine);
  // boiseries : un soubassement plus sombre, une cimaise, des panneaux en relief
  rect(g, 0, 31, W, 13, P.wallFace2);
  hline(g, 0, 29, W, P.wallLine);
  hline(g, 0, 30, W, P.wallHi);
  hline(g, 0, 31, W, mix(P.wallHi, P.wallFace2, 0.35));
  hline(g, 0, 32, W, P.wallLine);
  for (let x = 4; x + 18 <= W; x += 22) {
    rect(g, x, 34, 18, 8, mix(P.wallFace2, P.wallLine, 0.25));
    hline(g, x, 34, 18, P.wallLine);
    vline(g, x, 34, 8, P.wallLine);
    hline(g, x + 1, 35, 16, mix(P.wallFace2, P.wallHi, 0.3));
    vline(g, x + 1, 35, 6, mix(P.wallFace2, P.wallHi, 0.22));
    hline(g, x, 41, 18, mix(P.wallFace2, P.wallHi, 0.18));
    vline(g, x + 17, 35, 7, mix(P.wallFace2, P.wallHi, 0.18));
  }
  // la plinthe, avec son liseré clair et ses petites vis
  rect(g, 0, 44, W, 4, P.baseboard);
  hline(g, 0, 44, W, P.wallHi);
  hline(g, 0, 45, W, mix(P.baseboard, P.wallHi, 0.25));
  hline(g, 0, 47, W, '#0d0a14');
  for (let x = 10; x < W; x += 22) px(g, x, 46, mix(P.baseboard, P.wallHi, 0.5));
  // la saleté qui monte du sol, une fissure ou deux, quelques éclats de peinture
  for (let x = 0; x < W; x += 2) { g.fillStyle = `rgba(8,6,16,${0.05 + r() * 0.06})`; g.fillRect(x, 28 - Math.floor(r() * 3), 2, 3); }
  for (const cx of [38, 176, 301]) {
    let x = cx, y = 9;
    for (let k = 0; k < 9; k++) { px(g, x, y, P.wallLine); y += 1 + (k % 2); x += r() < 0.5 ? 0 : (r() < 0.5 ? -1 : 1); }
  }
  for (let i = 0; i < 14; i++) px(g, 8 + Math.floor(r() * (W - 16)), 8 + Math.floor(r() * 20), mix(P.wallFace, P.wallHi, 0.5));
  // l'ombre du mur sur le sol
  g.fillStyle = 'rgba(8,6,16,0.35)';
  g.fillRect(0, 48, W, 2);
  g.fillStyle = 'rgba(8,6,16,0.18)';
  g.fillRect(0, 50, W, 2);
}

function windowPane(g: G, wx: number, wy: number, ww: number, wh: number, tod: TimeOfDay, seed: number) {
  const sky = SKY[tod];
  const r = rng(seed);
  // cadre
  rect(g, wx - 3, wy - 3, ww + 6, wh + 6, '#1a1724');
  rect(g, wx - 2, wy - 2, ww + 4, wh + 4, '#3b3550');
  // le ciel, en bandes (comme dans les vieux jeux)
  const bh = Math.ceil(wh / sky.bands.length);
  sky.bands.forEach((c, i) => rect(g, wx, wy + i * bh, ww, bh, c));
  if (tod === 'evening') {
    for (let i = 0; i < 9; i++) rect(g, wx + 30 + i - 4, wy + wh - 10 - Math.round(Math.sqrt(16 - (i - 4) ** 2)), 1, 6, '#ffd27a');
  }
  if (tod === 'night' && seed === 1) {
    rect(g, wx + 10, wy + 5, 6, 6, '#f2efd8');
    rect(g, wx + 9, wy + 6, 8, 4, '#f2efd8');
    px(g, wx + 12, wy + 7, '#d6d2b8');
    px(g, wx + 14, wy + 9, '#d6d2b8');
  }
  if (tod === 'day') {
    for (const [cx, cy, cw] of [[wx + 8, wy + 6, 12], [wx + 36, wy + 10, 9]]) {
      rect(g, cx, cy, cw, 3, '#ffffff');
      rect(g, cx + 2, cy - 2, cw - 5, 2, '#ffffff');
      hline(g, cx, cy + 3, cw, '#dcecf8');
    }
  }
  // la ville au loin
  let x = wx;
  while (x < wx + ww) {
    const bw = 4 + Math.floor(r() * 8);
    const bhh = 7 + Math.floor(r() * 13);
    const far = r() < 0.4;
    const top = wy + wh - bhh + (far ? 3 : 0);
    rect(g, x, top, Math.min(bw, wx + ww - x), wy + wh - top, far ? sky.city2 : sky.city);
    for (let yy = top + 2; yy < wy + wh - 1; yy += 2) {
      for (let xx = x + 1; xx < Math.min(x + bw - 1, wx + ww - 1); xx += 2) if (r() < sky.litRate) px(g, xx, yy, sky.lit);
    }
    x += bw;
  }
  // montants et traverse
  vline(g, wx + Math.floor(ww / 2), wy, wh, '#3b3550');
  vline(g, wx + Math.floor(ww / 2) + 1, wy, wh, '#2a2538');
  hline(g, wx, wy + 11, ww, '#3b3550');
  // un reflet sur la vitre
  for (let i = 0; i < 6; i++) px(g, wx + 4 + i, wy + 14 - i, 'rgba(255,255,255,0.18)');
  // l'appui de fenêtre
  rect(g, wx - 4, wy + wh + 2, ww + 8, 3, '#4a4560');
  hline(g, wx - 4, wy + wh + 2, ww + 8, '#625c7c');
}

function whiteboard(g: G) {
  const { x, y, w, h } = BOARD;
  rect(g, x - 2, y - 2, w + 4, h + 4, '#7a7e93');
  rect(g, x - 1, y - 1, w + 2, h + 2, '#c2c5d4');
  hline(g, x - 1, y - 1, w + 2, '#e6e8f0');
  rect(g, x, y, w, h, '#f4f5f9');
  // un reflet en biais
  for (let i = 0; i < 18; i++) px(g, x + w - 30 + i, y + 2 + Math.floor(i / 2), '#ffffff');
  // le rebord et les feutres
  rect(g, x + 4, y + h + 2, w - 8, 2, '#8a8ea2');
  hline(g, x + 4, y + h + 2, w - 8, '#b3b6c6');
  rect(g, x + 12, y + h + 1, 5, 1, '#e5484d');
  rect(g, x + 19, y + h + 1, 5, 1, '#3d8ad1');
  rect(g, x + 26, y + h + 1, 5, 1, '#2b2836');
  rect(g, x + w - 18, y + h + 1, 6, 2, '#e9e5ef');
  // le titre, au feutre orange
  pixelText(g, 'LE PLAN', x + 4, y + 3, P.orangeDark);
  hline(g, x + 4, y + 9, textWidth('LE PLAN'), P.orange);
}

/** Les écriteaux posés au coin de chaque tapis, avec le nombre d'agents au travail dans le coin. */
export function signs(g: G, busy: (role: string) => number) {
  for (const z of ZONES) {
    const n = busy(z.role);
    const label = roleSign(z.role) + (n > 0 && z.role !== 'chef' ? ` ${n}` : '');
    const color = ROLES[z.role].color;
    const w = textWidth(label) + 6;
    const x = z.x * T + 4, y = z.role === 'chef' ? (z.y + z.h) * T - 12 : z.y * T + 3;
    rect(g, x + 1, y, w - 2, 9, '#120f19');
    rect(g, x, y + 1, w, 7, '#120f19');
    hline(g, x + 1, y, w - 2, mix(color, '#120f19', 0.45));
    pixelText(g, label, x + 3, y + 2, lighten(color, 0.15));
  }
}

/** Le néon : la tête du robot VibesMoney, en tubes de couleur (orange par défaut). */
export function neon(g: G, tube: string, core: string) {
  const { x, y } = NEON;
  // antenne
  vline(g, x + 12, y, 3, tube);
  rect(g, x + 11, y - 2, 3, 2, tube);
  // contour de la tête
  rect(g, x + 1, y + 3, 23, 1, tube);
  rect(g, x + 1, y + 20, 23, 1, tube);
  rect(g, x + 1, y + 3, 1, 18, tube);
  rect(g, x + 23, y + 3, 1, 18, tube);
  hline(g, x + 2, y + 4, 21, core);
  // la visière et les yeux
  rect(g, x + 5, y + 8, 15, 1, tube);
  rect(g, x + 5, y + 15, 15, 1, tube);
  rect(g, x + 5, y + 8, 1, 8, tube);
  rect(g, x + 19, y + 8, 1, 8, tube);
  rect(g, x + 8, y + 10, 3, 3, core);
  rect(g, x + 14, y + 10, 3, 3, core);
  // le petit support au mur
  px(g, x + 3, y + 22, '#3b3550');
  px(g, x + 21, y + 22, '#3b3550');
}

function clockFace(g: G) {
  const { x, y } = CLOCK;
  rect(g, x + 3, y, 8, 14, '#2b2836');
  rect(g, x, y + 3, 14, 8, '#2b2836');
  rect(g, x + 1, y + 1, 12, 12, '#2b2836');
  rect(g, x + 2, y + 2, 10, 10, '#f2f0f7');
  rect(g, x + 4, y + 1, 6, 12, '#f2f0f7');
  rect(g, x + 1, y + 4, 12, 6, '#f2f0f7');
  px(g, x + 7, y + 2, '#2b2836');
  px(g, x + 7, y + 11, '#2b2836');
  px(g, x + 2, y + 7, '#2b2836');
  px(g, x + 11, y + 7, '#2b2836');
}

function poster(g: G) {
  const x = 252, y = 12;
  rect(g, x, y, 10, 14, '#c08a57');
  rect(g, x + 1, y + 1, 8, 12, '#16121f');
  // une courbe qui monte, en orange
  const pts = [[2, 10], [3, 9], [4, 9], [5, 7], [6, 6], [7, 4], [8, 3]];
  for (const [px_, py_] of pts) px(g, x + px_, y + py_, P.orange);
  px(g, x + 8, y + 2, P.orangeLight);
}

/** Un mur de briques : des rangées de 4 pixels, aux joints décalés, avec des briques un peu plus claires ou plus sombres. */
function bricks(g: G, x0: number, y0: number, w: number, h: number, base: string, seed: number) {
  const r = rng(seed);
  const joint = mix(base, '#0d0a14', 0.55);
  rect(g, x0, y0, w, h, base);
  for (let row = 0, y = y0; y < y0 + h; row++, y += 4) {
    const rh = Math.min(4, y0 + h - y);
    let x = x0 - (row % 2) * 4;
    while (x < x0 + w) {
      const bw = 8;
      const cx = Math.max(x, x0), cw = Math.min(x + bw, x0 + w) - cx;
      if (cw > 0) {
        const tone = r();
        rect(g, cx, y, cw, rh, tone < 0.3 ? mix(base, '#ffffff', 0.04 + r() * 0.04) : tone < 0.55 ? mix(base, '#000000', 0.08) : base);
        hline(g, cx, y, cw, mix(base, '#ffffff', 0.1));
        if (rh > 3) hline(g, cx, y + 3, cw, joint);
        if (x >= x0) vline(g, x, y, rh, joint);
      }
      x += bw;
    }
  }
}

function sideWalls(g: G) {
  for (const x0 of [0, W - T]) {
    bricks(g, x0, 0, T, H, P.wallTop, 5 + x0);
    // la face intérieure du mur est un peu plus claire, avec une plinthe au pied
    const inner = x0 === 0 ? T - 2 : x0;
    vline(g, inner, 5, H - 5, '#2c2740');
    vline(g, x0 === 0 ? inner + 1 : inner + 1, 5, H - 5, '#1d1a28');
    const bx = x0 === 0 ? T - 5 : x0 + 2;
    vline(g, bx, 3 * T, OFFICE_H - 3 * T - T, P.baseboard);
    vline(g, x0 === 0 ? bx : bx + 2, 3 * T, OFFICE_H - 3 * T - T, mix(P.baseboard, P.wallHi, 0.25));
  }
  // l'ombre des murs de côté sur le sol
  g.fillStyle = 'rgba(8,6,16,0.25)';
  g.fillRect(T, 3 * T, 2, OFFICE_H - 4 * T);
  g.fillRect(W - T - 2, 3 * T, 2, OFFICE_H - 4 * T);
}

function frontWall(g: G) {
  const y = 15 * T;
  bricks(g, 0, y, 10 * T, T, P.wallTop, 21);
  bricks(g, 12 * T, y, W - 12 * T, T, P.wallTop, 22);
  hline(g, 0, y, 10 * T, '#2c2740');
  hline(g, 12 * T, y, W - 12 * T, '#2c2740');
  // l'encadrement de la porte
  for (const x of [10 * T - 2, 12 * T]) {
    rect(g, x, y - 2, 2, T + 2, '#3b3550');
    vline(g, x, y - 2, T + 2, '#4d4666');
  }
  // le paillasson orange
  const mx = 10 * T + 2, my = 14 * T + 3;
  rect(g, mx, my, 2 * T - 4, 10, P.orangeDeep);
  for (let i = 0; i < 4; i++) hline(g, mx + 2, my + 2 + i * 2, 2 * T - 8, i % 2 ? P.orangeDark : P.orange);
  for (let i = 0; i < 12; i++) { px(g, mx + 3 + i * 2, my + 2 + (i % 3) * 2, P.orangeLight); px(g, mx + 4 + i * 2, my + 3 + ((i + 1) % 3) * 2, P.orangeDeep); }
  hline(g, mx, my + 9, 2 * T - 4, '#0d0a14');
}

/** Le portail : la rue derrière, deux battants de fer ouverts, deux piliers avec leur lanterne, et l'enseigne en bois. */
function gate(g: G, bottom: number) {
  const x0 = 10 * T, x1 = 12 * T;
  // la rue, dehors : sombre en haut, un peu éclairée en bas
  rect(g, x0, bottom, x1 - x0, T, '#14111e');
  for (let y = 0; y < 7; y++) rect(g, x0, bottom + 9 + y, x1 - x0, 1, mix('#1a1626', '#3a3552', y / 6));
  for (let x = x0 + 2; x < x1 - 2; x += 6) rect(g, x, bottom + 12, 3, 1, '#4a4466');
  // les battants, ouverts contre les piliers : des barreaux entre deux traverses
  for (const left of [true, false]) {
    const bx = left ? x0 : x1 - 6;
    rect(g, bx, bottom + 1, 6, 1, '#4d4666');
    rect(g, bx, bottom + 13, 6, 1, '#4d4666');
    rect(g, bx, bottom + 7, 6, 1, '#3b3550');
    for (let k = 0; k < 6; k += 2) {
      rect(g, bx + k, bottom + 2, 1, 11, '#2c2740');
      px(g, bx + k, bottom + 1, '#8a84a3');
    }
    px(g, left ? bx + 5 : bx, bottom + 7, '#d9b36a');
  }
  // les piliers en pierre, avec un chapeau et une lanterne
  for (const x of [x0 - 3, x1]) {
    rect(g, x, bottom - 15, 3, T + 15, '#3b3550');
    vline(g, x, bottom - 15, T + 15, '#4d4666');
    vline(g, x + 2, bottom - 15, T + 15, '#2c2740');
    for (let y = bottom - 12; y < bottom + T; y += 5) hline(g, x, y, 3, '#2c2740');
    rect(g, x - 1, bottom - 17, 5, 3, '#4d4666');
    hline(g, x - 1, bottom - 17, 5, '#6a6388');
    // la lanterne
    rect(g, x, bottom - 23, 3, 6, '#2b2836');
    rect(g, x + 1, bottom - 22, 1, 4, '#ffd98a');
    px(g, x + 1, bottom - 24, '#2b2836');
  }
  // l'enseigne : une planche de bois entre les piliers, ses clous et son texte
  rect(g, x0, bottom - 14, x1 - x0, 9, '#2a1a10');
  rect(g, x0, bottom - 14, x1 - x0, 1, '#7a5030');
  rect(g, x0, bottom - 6, x1 - x0, 1, '#1c110a');
  rect(g, x0 + 1, bottom - 13, x1 - x0 - 2, 7, '#4a2e1a');
  for (let k = 0; k < 4; k++) hline(g, x0 + 1, bottom - 12 + k * 2, x1 - x0 - 2, k % 2 ? '#563520' : '#4a2e1a');
  for (const x of [x0 + 2, x1 - 3]) for (const y of [bottom - 12, bottom - 8]) px(g, x, y, '#c9a04a');
  pixelText(g, 'ENTRÉE', 11 * T - textWidth('ENTRÉE') / 2, bottom - 11, '#2a1a10');
  pixelText(g, 'ENTRÉE', 11 * T - textWidth('ENTRÉE') / 2, bottom - 12, '#f0dcb0');
}

/** La cour : un mur de bureau côté dehors, des dalles, de l'herbe sur les bords, le mur du fond et son portail. */
function yard(g: G) {
  const top = 16 * T, bottom = 22 * T;
  const r = rng(77);
  // la face extérieure du mur du bureau (avec le passage de la porte)
  for (const [x0, w] of [[0, 10 * T - 2], [12 * T, W - 12 * T]] as [number, number][]) {
    bricks(g, x0, top, w, 12, P.wallFace, 31 + x0);
    hline(g, x0, top, w, '#2c2740');
    rect(g, x0, top + 12, w, 3, P.baseboard);
    hline(g, x0, top + 12, w, mix(P.baseboard, P.wallHi, 0.3));
  }
  // le sol de la cour, d'un seul tenant (sous la porte aussi : rien ne doit rester transparent)
  rect(g, T, top, W - 2 * T, bottom - top, '#46425a');
  // les dalles
  const slabs = ['#4a4659', '#514c61', '#46425a', '#4d4960'];
  for (let y = top; y < bottom; y += 16) {
    for (let x = T; x < W - T; x += 16) {
      const col = slabs[Math.floor(r() * slabs.length)];
      rect(g, x, y, 15, 15, col);
      hline(g, x, y, 15, mix(col, '#7a7592', 0.35));
      rect(g, x + 15, y, 1, 16, '#35314a');
      rect(g, x, y + 15, 16, 1, '#35314a');
      if (r() < 0.2) px(g, x + 3 + Math.floor(r() * 9), y + 4 + Math.floor(r() * 8), '#38344c');
      // du grain sur la pierre
      for (let k = 0; k < 5; k++) px(g, x + 1 + Math.floor(r() * 13), y + 2 + Math.floor(r() * 12), r() < 0.5 ? mix(col, '#7a7592', 0.25) : mix(col, '#1c1a2a', 0.3));
      // une fissure sur certaines dalles
      if (r() < 0.14) {
        let cx = x + 3 + Math.floor(r() * 9), cy = y + 2;
        for (let k = 0; k < 8; k++) { px(g, cx, cy, '#2f2b42'); cy += 1; cx += r() < 0.4 ? 0 : (r() < 0.5 ? -1 : 1); }
      }
      // de la mousse dans les angles, surtout près des bords de la cour
      if ((x <= T + 16 || x >= W - T - 32 || y >= bottom - 32) && r() < 0.45) {
        const mx = x + (r() < 0.5 ? 0 : 11), my = y + (r() < 0.5 ? 0 : 11);
        for (let k = 0; k < 5; k++) px(g, mx + Math.floor(r() * 5), my + Math.floor(r() * 4), r() < 0.5 ? mix(P.leafDark, col, 0.45) : mix(P.leaf, col, 0.55));
      }
    }
  }
  // de petites touffes d'herbe dans les joints
  for (let i = 0; i < 22; i++) {
    const gx = T + 2 + Math.floor(r() * (W - 2 * T - 4)), gy = top + 16 * Math.floor(r() * 6) + 14;
    if (gx >= 10 * T - 2 && gx <= 12 * T + 2) continue;
    px(g, gx, gy, P.leafDark); px(g, gx + 1, gy - 1, P.leaf); px(g, gx + 2, gy, P.leafDark);
  }
  // quelques cailloux
  for (let i = 0; i < 18; i++) {
    const gx = T + 3 + Math.floor(r() * (W - 2 * T - 8)), gy = top + 3 + Math.floor(r() * (bottom - top - 8));
    px(g, gx, gy, '#6b6682'); px(g, gx + 1, gy + 1, '#35314a');
  }
  // un chemin plus clair, de la porte au portail
  for (let y = top; y < bottom; y += 16) {
    rect(g, 10 * T, y, 2 * T - 1, 15, '#5b566d');
    hline(g, 10 * T, y, 2 * T - 1, '#7d7893');
  }
  // l'herbe, sur les bords et au pied du mur du fond
  for (let x = T; x < W - T; x += 2) {
    const h = 3 + Math.floor(r() * 4);
    if (x >= 10 * T - 4 && x <= 12 * T + 4) continue;
    rect(g, x, bottom - h, 2, h, r() < 0.5 ? P.leaf : P.leafDark);
    if (r() < 0.4) px(g, x, bottom - h - 1, P.leafLight);
  }
  // des petites fleurs dans l'herbe du fond
  const flowers = ['#ffd166', '#ff9fb3', '#f2efd8', '#ff8a3d'];
  for (let i = 0; i < 16; i++) {
    const fx = T + 3 + Math.floor(r() * (W - 2 * T - 6));
    if (fx >= 10 * T - 4 && fx <= 12 * T + 4) continue;
    const fy = bottom - 5 - Math.floor(r() * 4);
    px(g, fx, fy, flowers[i % flowers.length]);
    if (i % 3 === 0) px(g, fx, fy + 1, P.leaf);
  }
  for (const x0 of [T, W - T - 6]) for (let y = top + 18; y < bottom - 4; y += 2) {
    const w2 = 2 + Math.floor(r() * 5);
    rect(g, x0 === T ? x0 : x0 + 6 - w2, y, w2, 2, r() < 0.5 ? P.leafDark : P.leaf);
  }
  // le mur du fond, et le portail
  bricks(g, 0, bottom, 10 * T, T, P.wallTop, 41);
  bricks(g, 12 * T, bottom, W - 12 * T, T, P.wallTop, 42);
  hline(g, 0, bottom, 10 * T, '#2c2740');
  hline(g, 12 * T, bottom, W - 12 * T, '#2c2740');
  gate(g, bottom);
}

/** Dessine toute la pièce (sans les meubles) dans une image de la taille du bureau. */
export function drawRoom(tod: TimeOfDay): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const g = g2d(c);
  // un fond opaque partout : un pixel transparent laisserait l'image précédente (ghosting)
  rect(g, 0, 0, W, H, P.wallTop);
  floor(g);
  for (const z of ZONES) rug(g, z.x, z.y, z.w, z.h, ROLES[z.role].color);
  backWall(g);
  WINDOWS.forEach((w, i) => windowPane(g, w.x, w.y, w.w, w.h, tod, i + 1));
  whiteboard(g);
  clockFace(g);
  poster(g);
  yard(g);
  sideWalls(g);
  frontWall(g);
  return c;
}
