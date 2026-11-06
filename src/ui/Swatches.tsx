// Compact colour field: a bar (label, current colour pill, hex, chevron) that slides open a swatch grid.
// Only one field of a SwatchGroup is open at a time. A pick applies at once, ticks, and folds after a short beat
// so the ring is seen moving. Keyboard: Enter/Space on the bar toggles, Esc closes, arrows move in the grid.
import { createContext, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { slideVars, useSlide } from './slide';
import { panelCue, selectionTickCue } from './panelCue';

/** Delay before the grid folds after a pick, so the selection ring is visible (ms). Interaction constant. */
const FOLD_AFTER_PICK_MS = 150;
/** Grid columns (matches .mw-swatches). */
const COLUMNS = 7;

interface Group {
  open: string | null;
  setOpen: (id: string | null) => void;
}

const SwatchGroupContext = createContext<Group | null>(null);

/** Wraps colour fields that share one open grid (opening one closes the other). */
export function SwatchGroup({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  return <SwatchGroupContext.Provider value={{ open, setOpen }}>{children}</SwatchGroupContext.Provider>;
}

export function Swatches({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: readonly string[];
  /** Null: nothing selected (shows None). */
  value: string | null;
  onChange: (c: string) => void;
}) {
  const id = useId();
  const group = useContext(SwatchGroupContext);
  const [localOpen, setLocalOpen] = useState(false);
  const open = group ? group.open === id : localOpen;
  const setOpen = (next: boolean) => {
    if (group) group.setOpen(next ? id : group.open === id ? null : group.open);
    else setLocalOpen(next);
  };
  const slide = useSlide(open, false);
  const gridId = useId();
  const bar = useRef<HTMLButtonElement>(null);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const foldTimer = useRef<number | null>(null);
  const activeIndex = Math.max(0, value === null ? 0 : colors.indexOf(value));

  useEffect(
    () => () => {
      if (foldTimer.current !== null) window.clearTimeout(foldTimer.current);
    },
    [],
  );

  const toggle = () => {
    setOpen(!open);
    panelCue(!open);
  };

  const close = (focusBar: boolean) => {
    if (!open) return;
    setOpen(false);
    panelCue(false);
    if (focusBar) bar.current?.focus();
  };

  const pick = (c: string) => {
    if (c !== value) {
      onChange(c);
      selectionTickCue();
    }
    if (foldTimer.current !== null) window.clearTimeout(foldTimer.current);
    foldTimer.current = window.setTimeout(() => {
      foldTimer.current = null;
      close(true);
    }, FOLD_AFTER_PICK_MS);
  };

  const onGridKey = (e: KeyboardEvent, i: number) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS };
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    let next = i;
    if (e.key in moves) next = i + moves[e.key];
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = colors.length - 1;
    else return;
    e.preventDefault();
    cells.current[Math.max(0, Math.min(colors.length - 1, next))]?.focus();
  };

  return (
    <div className={open ? 'mw-field mw-colorfield is-open' : 'mw-field mw-colorfield'} style={slideVars()}>
      <button
        ref={bar}
        type="button"
        className="mw-colorfield-bar"
        aria-expanded={open}
        aria-controls={gridId}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close(false);
        }}
      >
        <span className="mw-colorfield-label">{label}</span>
        <span
          className={value === null ? 'mw-colorfield-pill is-none' : 'mw-colorfield-pill'}
          style={value === null ? undefined : { background: value }}
          aria-hidden="true"
        />
        <span className="mw-value">{value ?? 'None'}</span>
        <span className="mw-section-chevron" aria-hidden="true" />
      </button>
      <div className={slide.expanded ? 'mw-slide is-open' : 'mw-slide'} id={gridId} aria-hidden={!open}>
        <div className="mw-slide-inner">
          {!slide.folded && (
            <div className="mw-swatches" role="radiogroup" aria-label={label}>
              {colors.map((c, i) => (
                <button
                  key={c}
                  ref={(el) => {
                    cells.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={c === value}
                  tabIndex={i === activeIndex ? 0 : -1}
                  className={c === value ? 'mw-swatch is-active' : 'mw-swatch'}
                  style={{ background: c }}
                  aria-label={`${label} ${c}`}
                  onClick={() => pick(c)}
                  onKeyDown={(e) => onGridKey(e, i)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
