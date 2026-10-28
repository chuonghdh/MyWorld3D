// DOM helpers for the camera rig: settings-panel inset and keyboard-focus checks.
import { panelInset } from './cameraMath';

/** Attribute the app puts on the container of the right-hand settings panel (see App.tsx). */
export const RIGHT_PANEL_ATTR = 'data-mw-right-panel';

/** Pixels hidden under the settings panel, read from the DOM; 0 when it is collapsed or missing. */
export function measureRightInset(): number {
  if (typeof document === 'undefined') return 0;
  const host = document.querySelector(`[${RIGHT_PANEL_ATTR}]`);
  const panel = host?.querySelector('.mw-panel') ?? null;
  if (!panel) return 0;
  const collapsed = panel.classList.contains('is-collapsed');
  return panelInset(panel.getBoundingClientRect().left, window.innerWidth, collapsed);
}

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}
