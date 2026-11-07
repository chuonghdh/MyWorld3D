import { QUALITY_LABEL, QUALITY_TIERS, useWorldStore, type QualityTier } from '../store';
import { SEASONS } from '../store/model';
import { WEATHER_KINDS, WEATHER_LABEL, type WeatherKind } from '../weather/weatherState';
import type { Season } from '../core/types';
import { ActionButton, CheckToggle, Panel, Section, Segmented, SettingsGlyph, Slider } from './controls';
import { SoundMixer } from './SoundMixer';
import { WeatherGlyph } from './WeatherIcons';
import { applyGoldenHour } from './goldenHour';
import { uiCamera } from '../config/tuning';

/** Actions that the scene handles. Store-backed toggles are also written to the store. */
export type CityAction =
  | 'sound'
  | 'music'
  | 'tiltShift'
  | 'switchTrees'
  | 'moveBlocks'
  | 'resetBlocks'
  | 'resetHouses';

export interface SettingsCityProps {
  onAction?: (action: CityAction, value?: boolean) => void;
}

const COMPASS = [
  'North', 'North-North-East', 'North-East', 'East-North-East',
  'East', 'East-South-East', 'South-East', 'South-South-East',
  'South', 'South-South-West', 'South-West', 'West-South-West',
  'West', 'West-North-West', 'North-West', 'North-North-West',
];

/** Compass name for a bearing in degrees, 0 = north, clockwise. */
export function compassName(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  return COMPASS[Math.round(d / 22.5) % 16];
}

/** Human label for the time of day slider. */
export function lightLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 16) return 'day';
  if (h >= 16 && h < 18.5) return 'golden hour';
  if (h >= 18.5 && h < 20) return 'dusk';
  return 'night';
}

function formatHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}

const LIGHT_TRACK =
  'linear-gradient(to right, #f5b04a 0%, #e8833a 40%, #7a4bb0 75%, #2b2350 100%)';

const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

export function SettingsCity({ onAction }: SettingsCityProps) {
  const s = useWorldStore((st) => st.settings);
  const toggles = useWorldStore((st) => st.toggles);
  const setSetting = useWorldStore((st) => st.setSetting);
  const setToggle = useWorldStore((st) => st.setToggle);
  const resetBlocks = useWorldStore((st) => st.resetBlocks);
  const resetHouses = useWorldStore((st) => st.resetHouses);
  const setQuality = useWorldStore((st) => st.setQuality);
  const suggested = useWorldStore((st) => st.suggestedQuality);

  const toggle = (key: 'tiltShift' | 'music' | 'moveBlocks', action: CityAction) => {
    const next = !toggles[key];
    setToggle(key, next);
    onAction?.(action, next);
  };

  return (
    <Panel id="settings" title="Settings" icon={<SettingsGlyph />}>
      <div className="mw-button-grid">
        <ActionButton
          icon="◎"
          active={toggles.tiltShift}
          ariaPressed={toggles.tiltShift}
          onClick={() => toggle('tiltShift', 'tiltShift')}
        >
          Tilt-shift
        </ActionButton>
        <ActionButton icon="☀" onClick={() => applyGoldenHour({ setSetting, setToggle })}>
          Golden Hour
        </ActionButton>
        <ActionButton icon="⚲" onClick={() => onAction?.('switchTrees')}>Switch trees</ActionButton>
        <ActionButton
          icon="✥"
          active={toggles.moveBlocks}
          ariaPressed={toggles.moveBlocks}
          onClick={() => toggle('moveBlocks', 'moveBlocks')}
        >
          Move blocks
        </ActionButton>
        <ActionButton
          icon="↺"
          onClick={() => {
            resetBlocks();
            onAction?.('resetBlocks');
          }}
        >
          Reset blocks
        </ActionButton>
        <ActionButton
          icon="↺"
          onClick={() => {
            resetHouses();
            onAction?.('resetHouses');
          }}
        >
          Reset houses
        </ActionButton>
      </div>

      <Section id="atmosphere" title="Atmosphere">
        <Slider
          id="light"
          label="Light"
          value={s.timeOfDay}
          min={0}
          max={uiCamera.timeMax}
          step={uiCamera.timeStep}
          format={(v) => `${lightLabel(v)}  ${formatHour(v)}`}
          onChange={(v) => setSetting('timeOfDay', v)}
          background={LIGHT_TRACK}
        />

        <Segmented<Season>
          label="Season"
          ariaLabel="Season"
          value={s.season}
          options={SEASONS.map((v) => ({ value: v, label: SEASON_LABEL[v] }))}
          onChange={(v) => setSetting('season', v)}
        />

        <Segmented<WeatherKind>
          label="Weather"
          ariaLabel="Weather"
          grid
          value={s.weather}
          options={WEATHER_KINDS.map((v) => ({ value: v, label: WEATHER_LABEL[v], icon: <WeatherGlyph kind={v} /> }))}
          onChange={(v) => {
            setSetting('weather', v);
            // Picking a weather with the slider at the bottom would show nothing: lift it to a visible level.
            if (v !== 'clear' && s.weatherIntensity < uiCamera.weatherLiftBelow) setSetting('weatherIntensity', uiCamera.weatherLiftTo);
          }}
        />
        <Slider
          id="weather-intensity"
          label="Intensity"
          value={s.weatherIntensity}
          min={0}
          max={1}
          step={uiCamera.intensityStep}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setSetting('weatherIntensity', v)}
        />

        <Slider
          id="wind"
          label="Wind"
          value={s.windSpeed}
          min={0}
          max={uiCamera.windSpeedMax}
          step={uiCamera.windSpeedStep}
          format={(v) => `${v.toFixed(1)} m/s`}
          onChange={(v) => setSetting('windSpeed', v)}
        />

        <div className="mw-compass-row">
          <svg className="mw-compass" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="28" />
            <g className="mw-compass-tick">
              <line x1="32" y1="6" x2="32" y2="11" />
              <line x1="58" y1="32" x2="53" y2="32" />
              <line x1="32" y1="58" x2="32" y2="53" />
              <line x1="6" y1="32" x2="11" y2="32" />
            </g>
            {/* Arrow points where the wind blows to, i.e. opposite of windDirection. */}
            <g transform={`rotate(${(s.windDirection + 180) % 360} 32 32)`}>
              <polygon points="32,10 38,36 32,31 26,36" />
            </g>
          </svg>
          <div>
            <div className="mw-muted">Wind from</div>
            <div className="mw-strong">{compassName(s.windDirection)}</div>
          </div>
        </div>
        <Slider
          id="wind-dir"
          label="Wind direction"
          value={s.windDirection}
          min={0}
          max={uiCamera.windDirectionMax}
          step={uiCamera.windDirectionStep}
          format={(v) => `${Math.round(v)}°`}
          onChange={(v) => setSetting('windDirection', v)}
        />
      </Section>

      <Section id="town" title="Town">
        <div className="mw-grid-2">
          <Slider
            id="town-width"
            label="Width"
            value={s.townWidth}
            min={uiCamera.townMin}
            max={uiCamera.townMax}
            step={uiCamera.townStep}
            format={(v) => `${Math.round(v)} m`}
            onChange={(v) => setSetting('townWidth', v)}
          />
          <Slider
            id="town-depth"
            label="Depth"
            value={s.townDepth}
            min={uiCamera.townMin}
            max={uiCamera.townMax}
            step={uiCamera.townStep}
            format={(v) => `${Math.round(v)} m`}
            onChange={(v) => setSetting('townDepth', v)}
          />
        </div>

        <Slider
          id="traffic"
          label="Traffic & people"
          value={s.trafficMultiplier}
          min={0}
          max={uiCamera.multiplierMax}
          step={uiCamera.multiplierStep}
          format={(v) => `×${v.toFixed(2)}`}
          onChange={(v) => setSetting('trafficMultiplier', v)}
        />

        <Slider
          id="street-trees"
          label="Street trees"
          value={s.streetTreeMultiplier}
          min={0}
          max={uiCamera.multiplierMax}
          step={uiCamera.multiplierStep}
          format={(v) => `×${v.toFixed(2)}`}
          onChange={(v) => setSetting('streetTreeMultiplier', v)}
        />

        <div className="mw-grid-2">
          <Slider
            id="leaves"
            label="Leaves"
            value={s.leafAmount}
            min={0}
            max={1}
            step={uiCamera.leafAmountStep}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setSetting('leafAmount', v)}
          />
          <Slider
            id="leaf-size"
            label="Leaf size"
            value={s.leafSize}
            min={uiCamera.leafSizeMin}
            max={uiCamera.leafSizeMax}
            step={uiCamera.leafSizeStep}
            format={(v) => `×${v.toFixed(1)}`}
            onChange={(v) => setSetting('leafSize', v)}
          />
        </div>
      </Section>

      <Section id="quality" title="Quality">
        <Segmented<QualityTier>
          label="Graphics"
          ariaLabel="Graphics quality"
          value={s.quality}
          options={QUALITY_TIERS.slice().reverse().map((v) => ({ value: v, label: QUALITY_LABEL[v] }))}
          onChange={setQuality}
        />
        {suggested && suggested.tier !== s.quality && (
          <div className="mw-field">
            <div className="mw-muted">
              Suggested for this device: {QUALITY_LABEL[suggested.tier]} ({suggested.reason})
            </div>
            <ActionButton onClick={() => setQuality(suggested.tier)}>Use {QUALITY_LABEL[suggested.tier]}</ActionButton>
          </div>
        )}
      </Section>

      <Section id="sound" title="Sound">
        <div className="mw-check-row">
          <CheckToggle
            label="Sound"
            checked={s.soundEnabled}
            onChange={(next) => {
              setSetting('soundEnabled', next);
              onAction?.('sound', next);
            }}
          />
          <CheckToggle label="Music" checked={toggles.music} onChange={() => toggle('music', 'music')} />
        </div>
        <SoundMixer />
      </Section>
    </Panel>
  );
}
