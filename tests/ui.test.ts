import { describe, expect, it } from 'vitest';
import { isHelpKey, isNarrowViewport, screenshotFilename } from '../src/ui/uiUtils';

describe('ui helpers', () => {
  it('formats the screenshot file name from seed and local time', () => {
    expect(screenshotFilename(7, new Date(2026, 0, 5, 9, 3, 2))).toBe('myworld3d-7-20260105-090302.png');
  });

  it('matchMedia helper tolerates missing window and reads matches', () => {
    expect(isNarrowViewport()).toBe(false);
    expect(isNarrowViewport('(max-width: 600px)', { matchMedia: () => ({ matches: true }) })).toBe(true);
    expect(
      isNarrowViewport('x', {
        matchMedia: () => {
          throw new Error('x');
        },
      }),
    ).toBe(false);
  });

  it('recognises help keys', () => {
    expect(isHelpKey('?')).toBe(true);
    expect(isHelpKey('h')).toBe(true);
    expect(isHelpKey('a')).toBe(false);
  });
});
