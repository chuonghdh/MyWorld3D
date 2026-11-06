import { describe, expect, it } from 'vitest';
import { formatHeight } from '../src/ui/heightText';

describe('formatHeight', () => {
  it('shows one decimal below 100 m', () => {
    expect(formatHeight(25)).toBe('Height 25.0 m');
    expect(formatHeight(3.25)).toBe('Height 3.3 m');
  });
  it('shows whole metres from 100 m up', () => {
    expect(formatHeight(100)).toBe('Height 100 m');
    expect(formatHeight(412.6)).toBe('Height 413 m');
  });
  it('clamps negative and invalid heights to 0', () => {
    expect(formatHeight(-4)).toBe('Height 0.0 m');
    expect(formatHeight(Number.NaN)).toBe('Height 0.0 m');
  });
});
