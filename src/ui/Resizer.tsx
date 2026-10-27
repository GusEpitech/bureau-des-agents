// La poignée entre le bureau et le panneau de droite : on la saisit et on la tire (vers la gauche, le panneau s'élargit).
// Double-clic : retour à la largeur d'origine. Au clavier : flèches gauche et droite.
import { useRef } from 'react';
import { savePref, useOffice } from '../state/store.ts';

const MIN_PANEL = 320;
const MIN_STAGE = 280;

export function Resizer() {
  const handle = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const set = (w: number | null) => {
    useOffice.setState({ panelW: w });
    savePref('panelW', w);
  };
  const clamp = (w: number, total: number) => Math.round(Math.max(MIN_PANEL, Math.min(w, total - MIN_STAGE)));
  /** la zone qui contient le bureau, la poignée et le panneau */
  const area = () => handle.current?.parentElement?.getBoundingClientRect() ?? null;

  const move = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const r = area();
    if (r) useOffice.setState({ panelW: clamp(r.right - e.clientX - 3, r.width) });
  };
  const stop = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    handle.current?.releasePointerCapture(e.pointerId);
    document.body.classList.remove('resizing');
    savePref('panelW', useOffice.getState().panelW);
  };

  return (
    <div
      ref={handle}
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Largeur du panneau : tire vers la gauche pour l’élargir, double-clic pour revenir à la normale"
      title="Tire pour changer la taille (double-clic : taille d’origine)"
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.classList.add('resizing');
        e.preventDefault();
      }}
      onPointerMove={move}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={() => set(null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const r = area();
        const panel = handle.current?.nextElementSibling as HTMLElement | null;
        if (!r || !panel) return;
        e.preventDefault();
        set(clamp(panel.offsetWidth + (e.key === 'ArrowLeft' ? 24 : -24), r.width));
      }}
    />
  );
}
