import { describe, expect, it } from 'vitest';
import { defaultHouseParams } from '../src/buildings';
import { shownHouseRoof, typePickPatch } from '../src/ui/houseRoof';

describe('house panel roof matches the render', () => {
  const base = { preset: 'canal-amsterdam' as const, roof: defaultHouseParams('canal-amsterdam').roof as never };

  it('shows the block roof with no override', () => {
    expect(shownHouseRoof(undefined, base)).toBe(base.roof);
    expect(shownHouseRoof({}, base)).toBe(base.roof);
  });

  it('shows the picked type default roof, and an explicit roof wins', () => {
    const glass = defaultHouseParams('glass-tower').roof;
    expect(shownHouseRoof({ preset: 'glass-tower' }, base)).toBe(glass);
    expect(shownHouseRoof({ preset: 'glass-tower', roof: 'gable' }, base)).toBe('gable');
    expect(shownHouseRoof({ style: 'modern' }, base)).toBe(defaultHouseParams('canal-amsterdam', 'modern').roof);
  });

  it('type pick replaces the roof with the type default for the current style, floors untouched', () => {
    const p = typePickPatch('mediterranean', { roof: 'gable', floors: 6, style: 'modern' });
    expect(p).toEqual({ preset: 'mediterranean', roof: defaultHouseParams('mediterranean', 'modern').roof });
    expect('floors' in p).toBe(false);
  });
});

describe('house panel shutters follow the type', () => {
  it('hides shutters for types without them and shows override, base, then type default', async () => {
    const { shownShutter } = await import('../src/ui/houseRoof');
    const { presetDefaultShutter, presetHasShutters } = await import('../src/buildings');
    expect(presetHasShutters('glass-tower')).toBe(false);
    expect(shownShutter({ shutterColor: '#123456' }, '#abcdef', 'glass-tower')).toEqual({ show: false, value: null });
    expect(shownShutter({ shutterColor: '#123456' }, '#abcdef', 'canal-amsterdam').value).toBe('#123456');
    expect(shownShutter({}, '#abcdef', 'canal-amsterdam').value).toBe('#abcdef');
    expect(shownShutter({ preset: 'canal-amsterdam' }, null, 'canal-amsterdam').value).toBe(presetDefaultShutter('canal-amsterdam'));
    // Untouched house on a block without shutters renders none: row shown, nothing selected.
    expect(shownShutter(undefined, null, 'canal-amsterdam')).toEqual({ show: true, value: null });
    expect(shownShutter({ floors: 5 }, null, 'canal-amsterdam')).toEqual({ show: true, value: null });
  });
});
