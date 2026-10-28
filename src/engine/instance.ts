// Le monde et son dessinateur n'existent qu'une fois : ils survivent aux rafraîchissements de React.
import { bus } from '../state/bus.ts';
import type { Tod } from '../state/store.ts';
import { Camera, Director } from './camera.ts';
import { Renderer } from './render.ts';
import type { TimeOfDay } from './room.ts';
import { World } from './world.ts';

export const world = new World();
export const renderer = new Renderer();
export const camera = new Camera();
export const director = new Director(camera, world);

bus.on((ev, live) => { world.apply(ev, live); director.event(ev, live); });
bus.onWeek((days) => { world.week = days; });
bus.onReset(() => { world.resetAll(); camera.wide(); });

/** L'heure du bureau : celle de ton ordinateur (en « auto »), ou celle que tu as choisie. */
export function timeOfDay(pref: Tod): TimeOfDay {
  if (pref !== 'auto') return pref;
  const h = new Date().getHours();
  return h >= 8 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'evening' : 'night';
}
