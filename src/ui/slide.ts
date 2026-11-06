// Slide open/close for panels and settings sections. CSS animates the height with the grid-rows trick
// (0fr <-> 1fr, see .mw-slide in panels.css); this hook only sequences the classes:
// open  -> layout switches to the open shape at once, the rows grow on the next frame (also on first mount);
// close -> the rows shrink first, the collapsed shape (narrow card or icon) applies after the close time,
//          so the content never reflows into the narrow width while it is still visible.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { uiCamera } from '../config/tuning';

const MS_PER_S = 1000;

// User's choice (2026-11-06): panels and sections always slide, even under prefers-reduced-motion.

/** Open and close durations in ms, from tuning. */
export function slideTimings(): { openMs: number; closeMs: number } {
  return { openMs: uiCamera.panelAnimSeconds * MS_PER_S, closeMs: uiCamera.panelCloseSeconds * MS_PER_S };
}

/** CSS custom properties that carry the tuning durations to panels.css. */
export function slideVars(): CSSProperties {
  return {
    '--mw-slide-open': `${uiCamera.panelAnimSeconds}s`,
    '--mw-slide-close': `${uiCamera.panelCloseSeconds}s`,
  } as CSSProperties;
}

export interface SlideState {
  /** Rows at full height (drives .is-open on the .mw-slide wrapper). */
  expanded: boolean;
  /** Collapsed shape applied (after the close animation ends). */
  folded: boolean;
}

/** Sequences one slide. `animateIn` makes a panel that mounts open grow in instead of popping up. */
export function useSlide(open: boolean, animateIn = true): SlideState {
  const [expanded, setExpanded] = useState(open && !animateIn);
  const [folded, setFolded] = useState(!open);
  const timer = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    timer.current = null;
    frame.current = null;
    const { closeMs } = slideTimings();
    if (open) {
      setFolded(false);
      // Grow on the next frame so the browser has the 0fr start to transition from.
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => setExpanded(true));
      });
    } else {
      setExpanded(false);
      if (closeMs <= 0) setFolded(true);
      else timer.current = window.setTimeout(() => setFolded(true), closeMs);
    }
  }, [open]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return { expanded, folded };
}
