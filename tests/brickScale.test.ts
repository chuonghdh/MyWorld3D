// Brick size: 1.5x the old 0.215 x 0.065 m, used only by the brick pattern (not the cathedral or other surfaces).
import { describe, expect, it } from 'vitest';
import { SURFACE } from '../src/buildings/surface';
import { SURFACE_FRAGMENT_COLOR, SURFACE_FRAGMENT_COMMON } from '../src/buildings/shaders/surface';

describe('brick size', () => {
  it('brick pattern uses 0.48375 x 0.14625 m (1.5x the previous 0.3225 x 0.0975 m, 2.25x the original)', () => {
    expect(SURFACE_FRAGMENT_COMMON).toContain('vec2 sz = vec2(0.48375, 0.14625);');
    expect(SURFACE_FRAGMENT_COMMON).not.toContain('vec2 sz = vec2(0.3225, 0.0975);');
    expect(SURFACE_FRAGMENT_COMMON).not.toContain('vec2 sz = vec2(0.215, 0.065);');
    expect(0.3225 * 1.5).toBeCloseTo(0.48375, 6);
    expect(0.0975 * 1.5).toBeCloseTo(0.14625, 6);
  });

  it('only the brick id dispatches to patBrick', () => {
    expect(SURFACE.BRICK).toBe(1);
    expect(SURFACE_FRAGMENT_COLOR).toContain('patBrick(sc, sp, surfPx, sh)');
    expect(SURFACE_FRAGMENT_COLOR).not.toMatch(/patBrick\([^)]*\)[^;]*STONE/);
    expect(SURFACE_FRAGMENT_COLOR).toContain('if (vSurface < 1.5) sc = patBrick');
  });
});
