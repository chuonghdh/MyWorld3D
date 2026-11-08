// Layering: core and store sit at the bottom. Their runtime imports stay inside core and store: store must not
// import city, weather, scene or ui. store may import the tuning config (src/config, a bottom module of plain values).
// Type-only imports are erased at build time and are not checked.
// Also checks that the block id scheme in core matches the city generator's (city/merge.ts).
import { describe, expect, it } from 'vitest';
import * as core from '../src/core/blockIds';
import * as city from '../src/city/merge';
import { WEATHER_KINDS as CORE_WEATHER } from '../src/core/weatherKinds';
import { WEATHER_KINDS as WEATHER_SYSTEM } from '../src/weather/weatherState';

// Raw sources through Vite, so the test needs no node typings.
const SOURCES = import.meta.glob('../src/{core,store}/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Runtime (value) imports of a source file: `import x from`, `import { x } from`, `export ... from`. */
function runtimeImports(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*(import|export)\s+(type\s+)?[^'";]*?from\s+['"]([^'"]+)['"]/gm)) {
    if (!m[2]) out.push(m[3]);
  }
  return out;
}

// Agent room (ADR 0013). Empty glob when src/agentRoom is absent: the block stays green.
const ROOM_SOURCES = import.meta.glob('../src/agentRoom/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** All import specifiers, type-only and side-effect imports included. */
function allImports(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*(?:import|export)\s+[^'";]*?from\s+['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

/** Resolve a relative specifier against the importing file; returns a path like 'src/agentRoom/engine/x'. */
function resolveSpec(file: string, spec: string): string {
  const parts = file.replace(/^\.\.\//, '').split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

describe('agentRoom layers', () => {
  it('agentRoom imports only src/agentRoom, src/config and packages', () => {
    const bad: string[] = [];
    for (const [path, text] of Object.entries(ROOM_SOURCES)) {
      for (const spec of allImports(text)) {
        if (!spec.startsWith('.')) continue;
        const target = resolveSpec(path, spec);
        if (!(target.startsWith('src/agentRoom/') || target.startsWith('src/config/') || target === 'src/config')) bad.push(`${path} -> ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('agentRoom model and engine import no react, three or @react-three (type imports included)', () => {
    const bad: string[] = [];
    for (const [path, text] of Object.entries(ROOM_SOURCES)) {
      if (!/\/agentRoom\/(model|engine)\//.test(path)) continue;
      for (const spec of allImports(text)) {
        if (/^(react|react-dom|three|@react-three)(\/|$)/.test(spec)) bad.push(`${path} -> ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('import resolver maps relative specifiers', () => {
    expect(resolveSpec('../src/agentRoom/engine/apply.ts', '../model/types')).toBe('src/agentRoom/model/types');
    expect(resolveSpec('../src/agentRoom/main.tsx', '../config/tuning')).toBe('src/config/tuning');
    expect(resolveSpec('../src/agentRoom/world/Desk.tsx', '../../scene/x')).toBe('src/scene/x');
  });
});

describe('layers', () => {
  it('core and store import only core, store and packages at runtime', () => {
    const bad: string[] = [];
    for (const [path, text] of Object.entries(SOURCES)) {
      const inCore = path.includes('/core/');
      for (const spec of runtimeImports(text)) {
        if (!spec.startsWith('.')) continue;
        const ok = inCore ? spec.startsWith('./') : spec.startsWith('./') || spec.startsWith('../core/') || spec.startsWith('../config/');
        if (!ok) bad.push(`${path} -> ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('core block ids match the city generator ids', () => {
    const m = { c0: 1, c1: 3, r0: 2, r1: 2 };
    expect(core.mergedBlockId(m)).toBe(city.mergedBlockId(m));
    expect(core.houseBlockId(4, 5)).toBe(city.houseBlockId(4, 5));
    expect(core.parseMergedBlockId('merged-1-2-3-2')).toEqual(city.parseMergedBlockId('merged-1-2-3-2'));
    expect(core.parseHouseBlockId('block-4-5')).toEqual(city.parseHouseBlockId('block-4-5'));
    expect(core.parseMergedBlockId('block-1-1')).toBeNull();
  });

  it('weather kinds have one source', () => {
    expect(WEATHER_SYSTEM).toBe(CORE_WEATHER);
  });
});
