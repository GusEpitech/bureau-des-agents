// Le fil des événements entre la mémoire du bureau (React) et le moteur du jeu (les robots).
import type { OfficeEvent, WeekDay } from '../../shared/protocol.ts';

type Fn = (ev: OfficeEvent, live: boolean) => void;

const listeners = new Set<Fn>();
const resetters = new Set<() => void>();
const weekers = new Set<(days: WeekDay[]) => void>();

export const bus = {
  on(fn: Fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  emit(ev: OfficeEvent, live: boolean) { for (const fn of listeners) fn(ev, live); },
  /** nouvelle mission, rediffusion : le bureau se vide, Max revient à l'accueil */
  onReset(fn: () => void) { resetters.add(fn); return () => { resetters.delete(fn); }; },
  /** les 7 derniers jours, pour le tableau du bureau */
  onWeek(fn: (days: WeekDay[]) => void) { weekers.add(fn); return () => { weekers.delete(fn); }; },
  week(days: WeekDay[]) { for (const fn of weekers) fn(days); },
  reset() { for (const fn of resetters) fn(); },
};
