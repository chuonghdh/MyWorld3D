// Exit slide for the left panel: when the panel content goes away (selection cleared), the last panel stays
// mounted in "leaving" mode, slides closed (Panel reads PanelExitContext) and unmounts after the close time.
// A new panel arriving mid-exit replaces it at once (same panel type keeps its instance and slides open again).
// While filming the panel unmounts at once (a film must not hear a close cue). Always slides, also under reduced
// motion (user's choice, 2026-11-06).
import { useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';
import { useWorldStore } from '../store';
import { PanelExitContext, PanelFocusContext } from './controls';
import { panelCue, selectionTickCue } from './panelCue';
import { slideTimings } from './slide';

/** `selectionId` names what the panel shows (e.g. 'house:h12'); a change while the panel stays open ticks. */
export function PanelExit({ children, selectionId = null }: { children: ReactNode; selectionId?: string | null }) {
  const present = children !== null && children !== undefined && children !== false;
  const last = useRef<ReactNode>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const filming = useWorldStore((s) => s.toggles.filming);
  const closeMs = slideTimings().closeMs;

  if (present) last.current = children;
  else if (filming || closeMs <= 0) last.current = null;
  const leaving = !present && last.current !== null;

  // Open cue when a user selection brings the panel in (absent or leaving -> present). Not on first mount
  // (page load / restore), not while filming, not when one selection replaces another in an open panel,
  // and not when the panel arrives folded (phone block mode keeps the map visible).
  const focus = useContext(PanelFocusContext);
  const wasPresent = useRef(present);
  const lastId = useRef(selectionId);
  useEffect(() => {
    const appeared = present && !wasPresent.current;
    const switched = present && wasPresent.current && selectionId !== null && selectionId !== lastId.current;
    wasPresent.current = present;
    if (present) lastId.current = selectionId;
    if (filming || focus.active !== 'selection') return;
    if (appeared) panelCue(true);
    else if (switched) selectionTickCue();
  }, [present, selectionId, filming, focus.active]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => {
      last.current = null;
      rerender();
    }, closeMs);
    return () => window.clearTimeout(t);
  }, [leaving, closeMs]);

  // Same tree shape in every state, so the panel instance survives the switch between present and leaving.
  return <PanelExitContext.Provider value={leaving}>{present ? children : last.current}</PanelExitContext.Provider>;
}
