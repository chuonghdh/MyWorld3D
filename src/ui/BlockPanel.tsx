// Panel for a selected house block or merged block (block editing, camera above 200 m): its size and the same
// grow (+) and split (-) actions as the icons on the map.
import { ActionButton, Panel } from './controls';

export interface BlockPanelProps {
  merged: boolean;
  cols: number;
  rows: number;
  /** Size in metres (east-west, north-south). */
  widthM: number;
  depthM: number;
  canGrow: boolean;
  growing: boolean;
  onToggleGrow: () => void;
  onSplit: () => void;
}

export function BlockGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z" />
    </svg>
  );
}

export function BlockPanel({ merged, cols, rows, widthM, depthM, canGrow, growing, onToggleGrow, onSplit }: BlockPanelProps) {
  const count = cols * rows;
  return (
    <Panel id="selection" title={merged ? 'Merged block' : 'House block'} icon={<BlockGlyph />}>
      <div className="mw-field">
        <div className="mw-field-head">
          <span>Size</span>
          <span className="mw-value">
            {cols} × {rows} {count === 1 ? 'block' : 'blocks'}
          </span>
        </div>
        <div className="mw-muted">
          {Math.round(widthM)} × {Math.round(depthM)} m
        </div>
      </div>
      <div className="mw-button-grid mw-button-grid-2">
        {canGrow && (
          <ActionButton icon="+" active={growing} ariaPressed={growing} onClick={onToggleGrow}>
            {growing ? 'Hide merges' : 'Merge'}
          </ActionButton>
        )}
        {merged && (
          <ActionButton icon="−" onClick={onSplit}>
            Split
          </ActionButton>
        )}
      </div>
      <p className="mw-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
        {canGrow
          ? growing
            ? 'Tap a green box on the map to merge it with this block.'
            : 'Merge joins neighbouring blocks into one (up to 4 blocks, always a rectangle).'
          : count >= 4 || (cols > 1 && rows > 1)
            ? 'This block has its largest size.'
            : 'No free neighbouring house block to merge with.'}
      </p>
    </Panel>
  );
}
