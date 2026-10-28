// Une liste déroulante à nous, en pixel : le menu d'un <select> natif est dessiné par le système et ne se stylise pas.
// Même écriture qu'un <select> (des <option> et des <optgroup> en enfants), mais `onChange` reçoit directement la valeur.
import { Children, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Opt = { value: string; label: ReactNode; group?: string };

/** Les <option> (et le titre de leur <optgroup>) trouvés dans les enfants, à plat. */
function collect(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const el = c as ReactElement<{ value?: string; label?: string; children?: ReactNode }>;
    if (el.type === 'option') out.push({ value: String(el.props.value ?? ''), label: el.props.children, group });
    else if (el.type === 'optgroup') collect(el.props.children, el.props.label, out);
    else if (el.props.children) collect(el.props.children, group, out);
  });
  return out;
}

export function Select({ value, onChange, children, className = '', title, 'aria-label': aria, disabled }: {
  value: string; onChange: (v: string) => void; children: ReactNode; className?: string; title?: string; 'aria-label'?: string; disabled?: boolean;
}) {
  const opts = useMemo(() => collect(children), [children]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; max: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = opts.findIndex((o) => o.value === value);

  const show = () => {
    if (disabled) return;
    setActive(Math.max(0, current));
    setOpen(true);
  };
  const pick = (i: number) => {
    const o = opts[i];
    setOpen(false);
    btn.current?.focus();
    if (o && o.value !== value) onChange(o.value);
  };

  // la place du menu : sous le bouton, ou au-dessus s'il n'y a pas la place (la saisie est en bas de l'écran)
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 180 && above > below;
    setPos({ left: r.left, width: Math.max(r.width, 200), ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }), max: Math.min(320, up ? above : below) });
  }, [open]);

  // on ferme en cliquant ailleurs, en défilant ou en redimensionnant
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const t = e.target as Node;
      if (list.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    const close = (e: Event) => { if (!list.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('[data-active="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active, pos]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    // Échap ferme seulement la liste (pas la fenêtre derrière)
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(opts.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(opts.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1) {
      // la première lettre saute à l'entrée qui commence par elle
      const k = e.key.toLowerCase();
      const from = opts.findIndex((o, i) => i > active && String(typeof o.label === 'string' ? o.label : '').toLowerCase().startsWith(k));
      const any = from >= 0 ? from : opts.findIndex((o) => String(typeof o.label === 'string' ? o.label : '').toLowerCase().startsWith(k));
      if (any >= 0) setActive(any);
    }
  };

  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`px-select ${open ? 'open' : ''} ${className}`}
        title={title}
        aria-label={aria}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
      >
        <span className="px-select-label">{current >= 0 ? opts[current].label : ''}</span>
        <span className="px-select-arrow" aria-hidden="true" />
      </button>
      {open && pos && createPortal(
        <ul
          ref={list}
          className="px-select-list"
          role="listbox"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width, maxHeight: pos.max }}
        >
          {opts.map((o, i) => {
            const head = o.group !== lastGroup && o.group ? <li key={`g${i}`} className="px-select-group" role="presentation">{o.group}</li> : null;
            lastGroup = o.group;
            return (
              <li key={o.value + i} style={{ display: 'contents' }}>
                {head}
                <div
                  role="option"
                  aria-selected={i === current}
                  data-active={i === active ? '1' : '0'}
                  className={`px-select-opt ${i === current ? 'on' : ''} ${i === active ? 'active' : ''}`}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => pick(i)}
                >{o.label}</div>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </>
  );
}
