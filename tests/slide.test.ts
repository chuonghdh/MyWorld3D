import { describe, expect, it } from 'vitest';
import { slideTimings, slideVars } from '../src/ui/slide';
import { uiCamera } from '../src/config/tuning';

describe('panel slide timings', () => {
  it('uses the tuning durations, closing a little faster than opening', () => {
    const t = slideTimings();
    expect(t.openMs).toBeCloseTo(uiCamera.panelAnimSeconds * 1000, 9);
    expect(t.closeMs).toBeCloseTo(uiCamera.panelCloseSeconds * 1000, 9);
    expect(t.closeMs).toBeLessThan(t.openMs);
  });

  it('always slides (user choice: no reduced-motion instant path)', () => {
    expect(slideTimings().openMs).toBeGreaterThan(0);
    expect(slideTimings().closeMs).toBeGreaterThan(0);
  });

  it('passes the durations to CSS as custom properties', () => {
    expect(slideVars()).toEqual({
      '--mw-slide-open': `${uiCamera.panelAnimSeconds}s`,
      '--mw-slide-close': `${uiCamera.panelCloseSeconds}s`,
    });
  });
});
