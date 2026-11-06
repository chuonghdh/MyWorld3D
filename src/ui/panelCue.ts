// Sound cue for a user-initiated panel or section open/close. Only header clicks call this, never mount,
// restore from localStorage or programmatic focus changes. uiCue never throws and respects sound settings.
import { uiCue } from '../audio';

export function panelCue(opening: boolean): void {
  uiCue(opening ? 'open' : 'close');
}

/** Soft tick when the open left panel switches to another selection. */
export function selectionTickCue(): void {
  uiCue('tick');
}
