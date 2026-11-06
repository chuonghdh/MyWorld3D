import { useEffect } from 'react';
import { HOUSE_SHUTTER_OPTIONS, HOUSE_WALL_OPTIONS } from '../buildings';
import { useWorldStore } from '../store';
import { HOUSE_PRESETS, HOUSE_STYLES, ROOF_TYPES, type HouseOverride, type RoofType } from '../store/model';
import type { HousePreset, HouseStyle } from '../core/types';
import { ActionButton, HouseGlyph, Panel, Segmented, Slider, SwatchGroup, Swatches } from './controls';
import { PresetCarousel } from './PresetCarousel';
import { RoofIcon } from './roofIcons';
import { useHouseThumbs } from '../scene/houseThumbs';
import { shownHouseRoof, shownShutter, typePickPatch } from './houseRoof';

/** Presets a house can be set to. 'as-block' is not offered: "Original" already restores the block's own look. */
const PRESET_CHOICES: readonly HousePreset[] = HOUSE_PRESETS.filter((v) => v !== 'as-block');

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

/** What the house shows when it has no override: the block's own values (see houseBaseFor in scene/townBlocks). */
export interface HouseBase {
  preset: HousePreset;
  floors: number;
  roof: RoofType;
  style: HouseStyle;
  wallColor: string;
  /** Null when the block's style has no shutters (modern, brick, stone). */
  shutterColor: string | null;
}

export const DEFAULT_HOUSE_BASE: HouseBase = {
  preset: 'canal-amsterdam',
  floors: 4,
  roof: 'mansard',
  style: 'classic',
  wallColor: HOUSE_WALL_OPTIONS[0],
  shutterColor: HOUSE_SHUTTER_OPTIONS[0],
};

export interface HousePanelProps {
  houseId: string;
  /** Values the house has before any override. Supplied by the scene side. */
  base?: Partial<HouseBase>;
  onAction?: (action: 'newLook' | 'original', houseId: string) => void;
}

export function HousePanel({ houseId, base, onAction }: HousePanelProps) {
  const override: HouseOverride | undefined = useWorldStore((st) => st.houseOverrides[houseId]);
  const setOverride = useWorldStore((st) => st.setOverride);
  const clearOverride = useWorldStore((st) => st.clearOverride);
  const thumbs = useHouseThumbs((st) => st.thumbs);
  const requestThumbs = useHouseThumbs((st) => st.request);
  // Thumbnails are rendered once on demand (scene/houseThumbs.ts); placeholders show until each arrives.
  useEffect(() => {
    requestThumbs();
  }, [requestThumbs]);

  const merged: HouseBase = { ...DEFAULT_HOUSE_BASE, ...base, ...override };
  // Roof as the scene renders it (a type pick without a roof override shows that type's default roof).
  const eff: HouseBase = { ...merged, roof: shownHouseRoof(override, merged) };
  // 'as-block' is not a choice: show the block's own preset so the select always has a valid option.
  const shownPreset: HousePreset = eff.preset === 'as-block' ? (base?.preset ?? DEFAULT_HOUSE_BASE.preset) : eff.preset;
  // Shutters follow the shown type (presetHasShutters), not the block's original style.
  const shutter = shownShutter(override, base?.shutterColor !== undefined ? base.shutterColor : DEFAULT_HOUSE_BASE.shutterColor, shownPreset);
  const target = { type: 'house' as const, id: houseId };
  const patch = (p: HouseOverride) => setOverride(target, p);

  const newLook = () => {
    const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
    const look: HouseOverride = { wallColor: pick(HOUSE_WALL_OPTIONS), roof: pick(ROOF_TYPES) };
    // A shutter colour only when the type can carry shutters.
    if (shutter.show) look.shutterColor = pick(HOUSE_SHUTTER_OPTIONS);
    patch(look);
    onAction?.('newLook', houseId);
  };

  const original = () => {
    clearOverride(target);
    onAction?.('original', houseId);
  };

  return (
    <Panel id="selection" title="House" icon={<HouseGlyph />}>
      <PresetCarousel<HousePreset>
        label="Type"
        value={shownPreset}
        items={PRESET_CHOICES.map((v) => ({ value: v, label: PRESET_LABEL[v] }))}
        thumbs={thumbs}
        onChange={(v) => {
          if (v !== shownPreset) patch(typePickPatch(v, override));
        }}
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
              <RoofIcon roof={r} />
              <span>{ROOF_LABEL[r]}</span>
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

      <SwatchGroup>
        <div className="mw-colorfields">
          <Swatches label="Wall" colors={HOUSE_WALL_OPTIONS} value={eff.wallColor} onChange={(c) => patch({ wallColor: c })} />
          {shutter.show && (
            <Swatches
              label="Shutter"
              colors={HOUSE_SHUTTER_OPTIONS}
              value={shutter.value}
              onChange={(c) => patch({ shutterColor: c })}
            />
          )}
        </div>
      </SwatchGroup>

      <div className="mw-button-grid mw-button-grid-2">
        <ActionButton icon="✦" onClick={newLook}>New look</ActionButton>
        <ActionButton icon="↺" onClick={original}>Original</ActionButton>
      </div>
    </Panel>
  );
}
