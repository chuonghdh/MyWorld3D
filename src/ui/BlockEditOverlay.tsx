// DOM buttons over the map for the block editor: + (grow) and - (split) on the selected block, and one chip per
// merge suggestion. Elements are placed by the scene (scene/BlockEditor.tsx) through the anchor slots, so this
// component only renders when the selection or the suggestions change. Touch targets are at least 44 px.
import { useLayoutEffect, useRef } from 'react';
import { setAnchor } from '../scene/blockEditAnchors';

export interface OverlaySuggestion {
  x: number;
  z: number;
  /** Size the merge would give, e.g. "2×2". */
  label: string;
}

export interface BlockEditOverlayProps {
  /** Ground point of the selected block centre, or null when no house block is selected. */
  at: { x: number; z: number } | null;
  canGrow: boolean;
  canSplit: boolean;
  growing: boolean;
  suggestions: readonly OverlaySuggestion[];
  onToggleGrow: () => void;
  onSplit: () => void;
  onApply: (index: number) => void;
}

function Anchored({ slot, x, z, className, children }: { slot: number; x: number; z: number; className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    setAnchor(slot, ref.current, x, z);
    return () => setAnchor(slot, null);
  }, [slot, x, z]);
  return (
    <div ref={ref} className={className} style={{ visibility: 'hidden' }}>
      {children}
    </div>
  );
}

export function BlockEditOverlay({ at, canGrow, canSplit, growing, suggestions, onToggleGrow, onSplit, onApply }: BlockEditOverlayProps) {
  return (
    <div className="mw-blockedit" aria-live="polite">
      {at && (canGrow || canSplit) && (
        <Anchored slot={0} x={at.x} z={at.z} className="mw-blockedit-actions">
          {canGrow && (
            <button
              type="button"
              className={growing ? 'mw-blockedit-btn is-active' : 'mw-blockedit-btn'}
              aria-pressed={growing}
              aria-label={growing ? 'Hide merge suggestions' : 'Show merge suggestions'}
              title={growing ? 'Hide merge suggestions' : 'Merge with neighbours'}
              onClick={onToggleGrow}
            >
              +
            </button>
          )}
          {canSplit && (
            <button type="button" className="mw-blockedit-btn" aria-label="Split merged block" title="Split into its blocks" onClick={onSplit}>
              −
            </button>
          )}
        </Anchored>
      )}
      {growing &&
        suggestions.map((s, i) => (
          <Anchored key={`${i}-${s.x}-${s.z}`} slot={1 + i} x={s.x} z={s.z} className="mw-blockedit-suggest">
            <button type="button" className="mw-blockedit-chip" aria-label={`Merge to ${s.label}`} title={`Merge to ${s.label}`} onClick={() => onApply(i)}>
              + {s.label}
            </button>
          </Anchored>
        ))}
    </div>
  );
}

export function EditModeChip({ mode, busy = false }: { mode: 'house' | 'block'; busy?: boolean }) {
  const block = mode === 'block';
  return (
    <div
      className={block ? 'mw-mode-chip is-block' : 'mw-mode-chip'}
      role="status"
      title={block ? 'Camera above 200 m: a tap selects a block. Zoom in to edit houses.' : 'A tap selects a house. Zoom out above 200 m to merge blocks.'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {block ? <path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z" /> : <path d="M3 11l9-7 9 7v9H3z" />}
      </svg>
      <span>{busy ? 'Updating blocks…' : block ? 'Block editing' : 'House editing'}</span>
    </div>
  );
}
