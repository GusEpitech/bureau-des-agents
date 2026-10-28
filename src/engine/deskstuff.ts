// Les petits objets personnels sur le bureau de chacun : un canard en plastique, une mini-plante, des post-it, une photo,
// une figurine, un mug. Toujours le même pour le même prénom : Loula retrouve son bureau reconnaissable.
import type { G } from './pixels.ts';
import { P } from './pixels.ts';

const hashName = (s: string) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

/** Dessine l'objet de `name` sur le bureau dont le coin haut gauche est (x, y). `color` : la couleur du métier. */
export function deskStuff(g: G, x: number, y: number, name: string, color: string) {
  const h = hashName(name);
  const kind = h % 6;
  // deux places libres sur le devant du plateau : à gauche ou à droite
  const ox = x + ((h >> 3) % 2 ? 26 : 3);
  const oy = y + 14;
  switch (kind) {
    case 0: // un canard en plastique
      g.fillStyle = '#ffd23a'; g.fillRect(ox, oy, 3, 2); g.fillRect(ox + 2, oy - 1, 2, 2);
      g.fillStyle = '#ff8a3d'; g.fillRect(ox + 4, oy, 1, 1);
      g.fillStyle = '#15121d'; g.fillRect(ox + 3, oy - 1, 1, 1);
      break;
    case 1: // une mini-plante dans un pot
      g.fillStyle = '#b9633f'; g.fillRect(ox, oy, 3, 2);
      g.fillStyle = P.leaf; g.fillRect(ox, oy - 2, 1, 2); g.fillRect(ox + 2, oy - 3, 1, 3); g.fillRect(ox + 1, oy - 2, 1, 1);
      g.fillStyle = P.leafHi; g.fillRect(ox + 2, oy - 3, 1, 1);
      break;
    case 2: // des post-it
      g.fillStyle = '#ffe36b'; g.fillRect(ox, oy - 1, 3, 3);
      g.fillStyle = '#ff9fb3'; g.fillRect(ox + 2, oy - 2, 3, 3);
      g.fillStyle = '#8a6a3a'; g.fillRect(ox, oy, 2, 1);
      break;
    case 3: // une photo encadrée
      g.fillStyle = '#4a2e1a'; g.fillRect(ox, oy - 3, 4, 4);
      g.fillStyle = '#7fc6ff'; g.fillRect(ox + 1, oy - 2, 2, 1);
      g.fillStyle = '#6aa06a'; g.fillRect(ox + 1, oy - 1, 2, 1);
      break;
    case 4: // une figurine de robot, aux couleurs du métier
      g.fillStyle = color; g.fillRect(ox + 1, oy - 3, 3, 2); g.fillRect(ox, oy - 1, 5, 2);
      g.fillStyle = '#15121d'; g.fillRect(ox + 1, oy - 2, 1, 1); g.fillRect(ox + 3, oy - 2, 1, 1);
      break;
    default: // un mug
      g.fillStyle = color; g.fillRect(ox, oy - 2, 3, 3);
      g.fillStyle = '#15121d'; g.fillRect(ox + 3, oy - 1, 1, 1);
      g.fillStyle = '#6b3b22'; g.fillRect(ox, oy - 2, 3, 1);
  }
}
