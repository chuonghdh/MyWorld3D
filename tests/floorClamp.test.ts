// Floor clamp per preset: glass towers go up to glassTowerMaxFloors, every other preset stays at maxFloors.
import { describe, expect, it } from 'vitest';
import { HOUSE_PRESETS, MAX_FLOORS, buildHouse, defaultHouseParams, houseHeight, maxFloorsFor } from '../src/buildings';
import { buildings } from '../src/config/tuning';

describe('maxFloorsFor', () => {
  it('glass tower uses glassTowerMaxFloors (12), others the house max (8)', () => {
    expect(buildings.glassTowerMaxFloors).toBe(12);
    expect(maxFloorsFor('glass-tower')).toBe(12);
    expect(maxFloorsFor('canal-amsterdam')).toBe(8);
    expect(maxFloorsFor('canal-amsterdam')).toBe(MAX_FLOORS);
    for (const p of HOUSE_PRESETS) {
      if (p !== 'glass-tower') expect(maxFloorsFor(p)).toBe(MAX_FLOORS);
    }
  });

  it('the as-block fallback is not a tower', () => {
    expect(maxFloorsFor('as-block')).toBe(MAX_FLOORS);
  });
});

describe('floor clamp in buildHouse', () => {
  it('glass tower keeps 12 floors and is taller than at 8', () => {
    const t12 = buildHouse({ ...defaultHouseParams('glass-tower'), floors: 12 });
    expect(t12.userData.floors).toBe(12);
    const t8 = buildHouse({ ...defaultHouseParams('glass-tower'), floors: 8 });
    expect(houseHeight({ ...defaultHouseParams('glass-tower'), floors: 12 })).toBeGreaterThan(
      houseHeight({ ...defaultHouseParams('glass-tower'), floors: 8 }),
    );
    expect(t12.userData.wallTop).toBeGreaterThan(t8.userData.wallTop);
  });

  it('glass tower clamps above 12 to 12', () => {
    expect(buildHouse({ ...defaultHouseParams('glass-tower'), floors: 20 }).userData.floors).toBe(12);
  });

  it('canal clamps above 8 to 8', () => {
    expect(buildHouse({ ...defaultHouseParams('canal-amsterdam'), floors: 12 }).userData.floors).toBe(8);
    expect(buildHouse({ ...defaultHouseParams('canal-amsterdam'), floors: 20 }).userData.floors).toBe(8);
  });
});
