// DOM helpers for the camera rig: settings-panel inset and keyboard-focus checks.
import { leftPanelInset, panelInset } from './cameraMath';

/**
 * Final open state of a panel. The Panel component sets data-open at once, while the collapsed card class
 * waits for the slide to finish; reading data-open keeps the camera glide target steady during the slide.
 */
function panelClosed(panel: Element): boolean {
  const open = panel.getAttribute('data-open');
  if (open !== null) return open === 'false';
  return panel.classList.contains('is-collapsed');
}

/** Attribute the app puts on the container of the right-hand settings panel (see App.tsx). */
export const RIGHT_PANEL_ATTR = 'data-mw-right-panel';

/** Pixels hidden under the settings panel, read from the DOM; 0 when it is collapsed or missing. */
export function measureRightInset(): number {
  if (typeof document === 'undefined') return 0;
  const host = document.querySelector(`[${RIGHT_PANEL_ATTR}]`);
  const panel = host?.querySelector('.mw-panel') ?? null;
  if (!panel) return 0;
  const collapsed = panelClosed(panel);
  return panelInset(panel.getBoundingClientRect().left, window.innerWidth, collapsed);
}

/** Attribute the app puts on the container of the left-hand house / block / monument panel (see App.tsx). */
export const LEFT_PANEL_ATTR = 'data-mw-left-panel';

/** Pixels hidden under the left panel, read from the DOM; 0 when it is collapsed or missing. */
export function measureLeftInset(): number {
  if (typeof document === 'undefined') return 0;
  const host = document.querySelector(`[${LEFT_PANEL_ATTR}]`);
  const panel = host?.querySelector('.mw-panel') ?? null;
  if (!panel) return 0;
  const collapsed = panelClosed(panel);
  return leftPanelInset(panel.getBoundingClientRect().right, window.innerWidth, collapsed);
}

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}
