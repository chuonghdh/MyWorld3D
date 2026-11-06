// Golden Hour button: sets the clock to the configured hour and stops auto time there.
// Same store actions as the TimeBar (setSetting timeOfDay, setToggle autoTime), so the bar shows the new state.
// Does not touch toggles.paused: traffic and people keep moving.
import { uiCamera } from '../config/tuning';
import type { UiToggles, WorldSettings } from '../store/model';

export interface GoldenHourStore {
  setSetting: <K extends keyof WorldSettings>(key: K, value: WorldSettings[K]) => void;
  setToggle: (key: keyof UiToggles, value: boolean) => void;
}

export function applyGoldenHour(store: GoldenHourStore): void {
  store.setToggle('autoTime', false);
  store.setSetting('timeOfDay', uiCamera.goldenHourTime);
}
