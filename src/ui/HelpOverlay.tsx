// Keyboard and mouse help dialog. Opened by the H or ? keys, Escape closes it.
import { useEffect, useState } from 'react';
import { isHelpKey } from './uiUtils';

const CONTROLS: [string, string][] = [
  ['Left drag', 'Orbit the camera'],
  ['Right drag / two fingers', 'Pan (touch: two-finger orbit and pinch zoom)'],
  ['Wheel / pinch', 'Zoom'],
  ['Click / tap', 'Select a house or tree (camera at or below 200 m) or a whole block (above 200 m)'],
  ['Move blocks, then click twice', 'Swap two blocks'],
  ['Space', 'Pause or resume'],
  ['1 / 2', 'Map view / street view'],
  ['W A S D', 'Walk in street mode (Shift runs)'],
  ['H or ?', 'Show or hide this help'],
  ['Esc', 'Close help, clear selection'],
];

const BLOCKS: [string, string][] = [
  ['Mode', 'Camera above 200 m: a tap selects a block. At or below 200 m: a tap selects a house. The chip at the bottom shows the mode.'],
  ['+ on a block', 'Shows green suggestion boxes. Tap one to merge (rectangles only, up to 4 blocks).'],
  ['− on a merged block', 'Splits it back into its blocks.'],
  ['Save and undo', 'Merges are saved with the layout and can be undone.'],
];

const PANELS: [string, string][] = [
  ['Settings', 'Light, season, weather, wind, town size, traffic, trees, quality and effects.'],
  ['House / Monument', 'Appears when you select a building: colours, shutters, details.'],
  ['Time bar', 'Pause, auto day cycle, clock, the map / street view switch and Photo. The arrow folds it to the analog clock.'],
  ['Street view', 'Click the walker to walk from the centre, or drag it onto the map to start there.'],
  ['Photo', 'Saves the 3D view as a PNG without the panels.'],
];

/** Mount once, anywhere inside the page root (it positions itself with fixed CSS). */
export function HelpOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isHelpKey(e.key)) {
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {open && (
        <div className="mw-help-backdrop" onClick={() => setOpen(false)}>
          <div
            className="mw-help"
            role="dialog"
            aria-modal="true"
            aria-label="Help"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mw-panel-head">
              <span className="mw-dot" aria-hidden="true" />
              <h2>Controls</h2>
              <button type="button" className="mw-panel-toggle" aria-label="Close help" onClick={() => setOpen(false)}>
                <span aria-hidden="true">✕</span>
              </button>
            </header>
            <div className="mw-help-body">
              <dl className="mw-help-list">
                {CONTROLS.map(([k, v]) => (
                  <div key={k} className="mw-help-row">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mw-group-title">Block editing</div>
              <dl className="mw-help-list">
                {BLOCKS.map(([k, v]) => (
                  <div key={k} className="mw-help-row">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mw-group-title">Panels</div>
              <dl className="mw-help-list">
                {PANELS.map(([k, v]) => (
                  <div key={k} className="mw-help-row">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
