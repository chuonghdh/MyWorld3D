// Small shared form controls for the panels. Plain DOM, no UI library.
import { createContext, useContext, type ReactNode } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  id: string;
  background?: string;
}

export function Slider({ label, value, min, max, step, format, onChange, id, background }: SliderProps) {
  return (
    <div className="mw-field">
      <div className="mw-field-head">
        <label htmlFor={id}>{label}</label>
        <span className="mw-value">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        className="mw-range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={background ? { background } : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}

export function Segmented<T extends string>({ label, value, options, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className="mw-field">
      {label && (
        <div className="mw-field-head">
          <span>{label}</span>
          <span className="mw-value">{options.find((o) => o.value === value)?.label}</span>
        </div>
      )}
      <div className="mw-segmented" role="group" aria-label={ariaLabel}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={o.value === value ? 'mw-seg is-active' : 'mw-seg'}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ButtonProps {
  children: ReactNode;
  icon?: string;
  active?: boolean;
  onClick: () => void;
  ariaPressed?: boolean;
}

export function ActionButton({ children, icon, active, onClick, ariaPressed }: ButtonProps) {
  return (
    <button
      type="button"
      className={active ? 'mw-btn is-active' : 'mw-btn'}
      aria-pressed={ariaPressed}
      onClick={onClick}
    >
      {icon && <span className="mw-btn-icon" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  id,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  id: string;
}) {
  return (
    <div className="mw-field">
      <div className="mw-field-head">
        <label htmlFor={id}>{label}</label>
      </div>
      <select id={id} className="mw-select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Swatches({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="mw-field">
      <div className="mw-field-head">
        <span>{label}</span>
        <span className="mw-value">{value}</span>
      </div>
      <div className="mw-swatches" role="group" aria-label={label}>
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            className={c === value ? 'mw-swatch is-active' : 'mw-swatch'}
            style={{ background: c }}
            aria-label={`${label} ${c}`}
            aria-pressed={c === value}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  );
}

/** The two side panels: city settings, and the selected house or monument. Only one is open at a time. */
export type PanelId = 'settings' | 'selection';

export interface PanelFocus {
  /** The open panel, or null when every panel is folded. */
  active: PanelId | null;
  setActive: (id: PanelId | null) => void;
}

/** Provided once by the app shell; without it the settings panel stays open and toggles do nothing. */
export const PanelFocusContext = createContext<PanelFocus>({ active: 'settings', setActive: () => undefined });

/**
 * Floating card with a title bar. The triangle in the top-right corner folds the body away so the
 * scene behind stays visible; the title bar stays so the panel can be opened again. Opening one
 * panel folds the other.
 */
export function Panel({ id, title, icon, children }: { id: PanelId; title: string; icon?: ReactNode; children: ReactNode }) {
  const focus = useContext(PanelFocusContext);
  const collapsed = focus.active !== id;
  return (
    <section className={`mw-panel${collapsed ? ' is-collapsed' : ''}`} aria-label={title}>
      <header className="mw-panel-head">
        <span className="mw-dot" aria-hidden="true" />
        <h2>{title}</h2>
        <button
          type="button"
          className="mw-panel-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Show ${title}` : `Hide ${title}`}
          title={collapsed ? 'Show' : 'Hide'}
          onClick={() => focus.setActive(collapsed ? id : null)}
        >
          <span className="mw-panel-arrow" aria-hidden="true">{collapsed ? '▼' : '▲'}</span>
          {icon && <span className="mw-panel-glyph" aria-hidden="true">{icon}</span>}
        </button>
      </header>
      {!collapsed && <div className="mw-panel-body">{children}</div>}
    </section>
  );
}

/** Small line icons for the collapsed panel widget (shown only in the compact mid-width layout). */
export function SettingsGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" />
    </svg>
  );
}

export function HouseGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7v9H3z" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function LandmarkGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M3 21h18M5 21V10M10 21V10M14 21V10M19 21V10M2 10h20L12 3z" />
    </svg>
  );
}
