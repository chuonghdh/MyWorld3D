import { describe, expect, it } from 'vitest';
import { isSectionOpen, readClosedSections, saveSectionOpen, SECTION_STORAGE_KEY, type SectionStorage } from '../src/ui/sectionState';

function memory(initial: Record<string, string> = {}): SectionStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe('settings section open state', () => {
  it('defaults to open with no storage or empty storage', () => {
    expect(isSectionOpen('town', null)).toBe(true);
    expect(isSectionOpen('town', memory())).toBe(true);
  });

  it('remembers a closed section per id and reopens it', () => {
    const st = memory();
    saveSectionOpen('town', false, st);
    expect(isSectionOpen('town', st)).toBe(false);
    expect(isSectionOpen('sound', st)).toBe(true);
    saveSectionOpen('town', true, st);
    expect(isSectionOpen('town', st)).toBe(true);
  });

  it('reads broken data as all open', () => {
    expect(readClosedSections(memory({ [SECTION_STORAGE_KEY]: '{not json' }))).toEqual({});
    expect(readClosedSections(memory({ [SECTION_STORAGE_KEY]: '[1]' }))).toEqual({});
  });

  it('survives storage that throws', () => {
    const bad: SectionStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(isSectionOpen('town', bad)).toBe(true);
    expect(() => saveSectionOpen('town', false, bad)).not.toThrow();
  });
});
