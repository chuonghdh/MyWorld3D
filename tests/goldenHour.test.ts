import { beforeEach, describe, expect, it } from 'vitest';
import { useWorldStore } from '../src/store';
import { applyGoldenHour } from '../src/ui/goldenHour';
import { uiCamera } from '../src/config/tuning';

describe('Golden Hour button action', () => {
  beforeEach(() => {
    const st = useWorldStore.getState();
    st.setSetting('timeOfDay', 9);
    st.setToggle('autoTime', true);
    st.setToggle('paused', false);
  });

  it('sets the configured hour, stops auto time and keeps the simulation running', () => {
    applyGoldenHour(useWorldStore.getState());
    const st = useWorldStore.getState();
    expect(uiCamera.goldenHourTime).toBe(18);
    expect(st.settings.timeOfDay).toBe(uiCamera.goldenHourTime);
    expect(st.toggles.autoTime).toBe(false);
    expect(st.toggles.paused).toBe(false);
  });
});
