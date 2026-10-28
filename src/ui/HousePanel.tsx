import { useWorldStore } from '../store';
import { HOUSE_PRESETS, HOUSE_STYLES, ROOF_TYPES, type HouseOverride, type RoofType } from '../store/model';
import type { HousePreset, HouseStyle } from '../core/types';
import { ActionButton, Panel, Segmented, Select, Slider, Swatches } from './controls';

export const WALL_COLORS = ['#d8c3a5', '#c97b5a', '#e9e2d0', '#8a9a9b', '#b9a58b', '#f0e6d2', '#7d5a4f', '#a7b8c4'];
export const SHUTTER_COLORS = ['#4a5d4a', '#2f4a6d', '#7a2e2a', '#e0d8c4', '#3b3b3b', '#c9a227'];

const PRESET_LABEL: Record<HousePreset, string> = {
  'as-block': 'As the block has it',
  'original-feuilles': 'Original (Feuilles)',
  'canal-amsterdam': 'Canal house (Amsterdam)',
  'glass-tower': 'Glass tower',
  'brutalist-concrete': 'Brutalist concrete',
  bauhaus: 'Bauhaus',
  mediterranean: 'Mediterranean',
  'brownstone-ny': 'Brownstone (New York)',
  'nordic-timber': 'Nordic timber',
  'shophouse-asia': 'Shophouse (Asia)',
};

const ROOF_LABEL: Record<RoofType, string> = {
  mansard: 'Mansard',
  flat: 'Flat',
  gable: 'Gable',
  hip: 'Hip',
  cornice: 'Cornice',
  parapet: 'Parapet',
  terrace: 'Terrace',
  'low-tiled': 'Low tiled',
  'step-gable': 'Step gable',
};

/** What the house shows when it has no override: the block's own values. */
export interface HouseBase {
  preset: HousePreset;
  floors: number;
  roof: RoofType;
  style: HouseStyle;
  wallColor: string;
  shutterColor: string;
}

export const DEFAULT_HOUSE_BASE: HouseBase = {
  preset: 'as-block',
  floors: 4,
  roof: 'mansard',
  style: 'classic',
  wallColor: WALL_COLORS[0],
  shutterColor: SHUTTER_COLORS[0],
};

export interface HousePanelProps {
  houseId: string;
  /** Values the block has before any override. Supplied by the scene side. */
  base?: Partial<HouseBase>;
  onAction?: (action: 'newLook' | 'original', houseId: string) => void;
}

export function HousePanel({ houseId, base, onAction }: HousePanelProps) {
  const override: HouseOverride | undefined = useWorldStore((st) => st.houseOverrides[houseId]);
  const setOverride = useWorldStore((st) => st.setOverride);
  const clearOverride = useWorldStore((st) => st.clearOverride);

  const eff: HouseBase = { ...DEFAULT_HOUSE_BASE, ...base, ...override };
  const target = { type: 'house' as const, id: houseId };
  const patch = (p: HouseOverride) => setOverride(target, p);

  const newLook = () => {
    const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
    patch({
      wallColor: pick(WALL_COLORS),
      shutterColor: pick(SHUTTER_COLORS),
      roof: pick(ROOF_TYPES),
    });
    onAction?.('newLook', houseId);
  };

  const original = () => {
    clearOverride(target);
    onAction?.('original', houseId);
  };

  return (
    <Panel title="House">
      <Select<HousePreset>
        id="house-preset"
        label="Type"
        value={eff.preset}
        options={HOUSE_PRESETS.map((v) => ({ value: v, label: PRESET_LABEL[v] }))}
        onChange={(v) => patch({ preset: v })}
      />

      <Slider
        id="house-floors"
        label="Floors"
        value={eff.floors}
        min={2}
        max={8}
        step={1}
        format={(v) => String(v)}
        onChange={(v) => patch({ floors: v })}
      />

      <div className="mw-field">
        <div className="mw-field-head">
          <span>Roof</span>
        </div>
        <div className="mw-chip-grid" role="group" aria-label="Roof">
          {ROOF_TYPES.map((r) => (
            <button
              key={r}
              type="button"
              className={r === eff.roof ? 'mw-chip is-active' : 'mw-chip'}
              aria-pressed={r === eff.roof}
              onClick={() => patch({ roof: r })}
            >
              {ROOF_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      <Segmented<HouseStyle>
        label="Style"
        ariaLabel="Style"
        value={eff.style}
        options={HOUSE_STYLES.map((v) => ({ value: v, label: v === 'classic' ? 'Classic' : 'Modern' }))}
        onChange={(v) => patch({ style: v })}
      />

      <Swatches label="Wall" colors={WALL_COLORS} value={eff.wallColor} onChange={(c) => patch({ wallColor: c })} />
      <Swatches
        label="Shutter"
        colors={SHUTTER_COLORS}
        value={eff.shutterColor}
        onChange={(c) => patch({ shutterColor: c })}
      />

      <div className="mw-button-grid mw-button-grid-2">
        <ActionButton icon="✦" onClick={newLook}>New look</ActionButton>
        <ActionButton icon="↺" onClick={original}>Original</ActionButton>
      </div>
    </Panel>
  );
}
