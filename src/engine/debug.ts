// Les mesures et les interrupteurs du menu de debug (F3). `perf` est rempli par la boucle de dessin (Office.tsx),
// `debug` est lu par le moteur : couper une couche de dessin pour voir ce qu'elle coûte.
export const RING = 180;

export const perf = {
  /** compteurs depuis le début (ou la dernière remise à zéro) */
  frames: 0,
  ms: 0,
  /** la durée de chaque partie, lissée */
  update: 0,
  draw: 0,
  present: 0,
  /** les derniers temps d'image (ms) et les dates où elles ont été dessinées */
  ring: new Float32Array(RING),
  at: new Float64Array(RING),
  n: 0,
  /** images qui ont dépassé 16,7 ms */
  long: 0,
  worst: 0,
  reset() { this.frames = 0; this.ms = 0; this.long = 0; this.worst = 0; this.ring.fill(0); this.at.fill(0); this.n = 0; },
  push(total: number, update: number, draw: number, present: number, now: number) {
    this.frames++;
    this.ms += total;
    const k = 0.1;
    this.update += (update - this.update) * k;
    this.draw += (draw - this.draw) * k;
    this.present += (present - this.present) * k;
    if (total > 16.7) this.long++;
    if (total > this.worst) this.worst = total;
    this.ring[this.n % RING] = total;
    this.at[this.n % RING] = now;
    this.n++;
  },
};

export const debug = {
  /** 0 = automatique (24 / 15 / 8 selon l'activité) ; sinon le nombre d'images par seconde voulu ; -1 = aussi vite que possible */
  fpsCap: 0,
  /** le monde ne bouge plus (mais le dessin continue) */
  pause: false,
  /** couper une couche pour mesurer ce qu'elle coûte */
  noLight: false,
  noAmbience: false,
  noYard: false,
  noWeather: false,
  /** dessiner la grille de marche (rouge = case bloquée) */
  grid: false,
};
