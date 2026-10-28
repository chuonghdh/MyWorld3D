// Small shared form controls for the panels. Plain DOM, no UI library.
import { useState, type ReactNode } from 'react';
import { isNarrowViewport } from './uiUtils';

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

/**
 * Floating card with a title bar. The triangle in the top-right corner folds the body away so the
 * scene behind stays visible; the title bar stays so the panel can be opened again.
 */
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  // Collapsed by default on phones so the first view is the scene, not a full-screen sheet.
  const [collapsed, setCollapsed] = useState(() => isNarrowViewport());
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
          onClick={() => setCollapsed((c) => !c)}
        >
          <span aria-hidden="true">{collapsed ? '▼' : '▲'}</span>
        </button>
      </header>
      {!collapsed && <div className="mw-panel-body">{children}</div>}
    </section>
  );
}
