// Drift guard: src/agentRoom/mapping/owners.ts must match the ownership table in docs/agents/README.md.
import { describe, expect, it } from 'vitest';
import { OWNERSHIP, ownerOf } from '../src/agentRoom/mapping/owners';

const README = Object.values(import.meta.glob('/docs/agents/README.md', { query: '?raw', import: 'default', eager: true }))[0] as string;

/** Table rows: [handbook slug, Owns cell]. The slug is the agent id. */
const ROWS = README.split('\n')
  .filter((l) => /^\| \d+ \|/.test(l))
  .map((l) => {
    const cells = l.split('|').map((c) => c.trim());
    const slug = /\(([\w-]+)\.md\)/.exec(cells[4] ?? '')?.[1] ?? '';
    return [slug, cells[3] ?? ''] as const;
  });

/** Shared or reviewed only, no single owner (README: "Shared, no single owner"). */
const SHARED = ['src/shaders/'];

function samplePath(p: string): string {
  const path = p.includes('/') ? p : `src/scene/${p}`; // bare names in the UI & Camera row live in src/scene
  return path.replace(/\*\*$/, 'x.ts').replace(/\*/g, 'x');
}

describe('owners.ts matches the ownership table', () => {
  it('table parses into 9 specialists', () => {
    expect(ROWS.map(([s]) => s)).toEqual(['buildings', 'city-streets', 'traffic-life', 'sky-environment', 'audio', 'ui-camera', 'scene-qa', 'architect', 'graphics-character']);
  });
  it('people rendering is Graphics & Character; walkers and the rest of traffic stay Traffic & Life', () => {
    expect(ownerOf('src/traffic/people/x.ts')).toBe('graphics-character');
    expect(ownerOf('src/traffic/people/rigShaderGlsl.ts')).toBe('graphics-character');
    expect(ownerOf('src/traffic/walkers/x.ts')).toBe('traffic-life');
    expect(ownerOf('src/traffic/pedestrians.ts')).toBe('traffic-life');
    expect(ownerOf('src/traffic/vehicles/x.ts')).toBe('traffic-life');
    expect(ownerOf('src/life/birds.ts')).toBe('traffic-life');
  });
  it('every path in the table maps to its row owner', () => {
    const drift: string[] = [];
    for (const [slug, owns] of ROWS) {
      for (const m of owns.matchAll(/`([^`]+)`/g)) {
        const p = m[1]!;
        if (SHARED.some((s) => p.startsWith(s))) continue;
        const got = ownerOf(samplePath(p));
        if (got !== slug) drift.push(`${p}: table ${slug}, owners.ts ${got}`);
      }
    }
    expect(drift).toEqual([]);
  });
  it('every src entry in owners.ts is named in its owner row', () => {
    const rowOf = new Map(ROWS.map(([s, o]) => [s, o] as const));
    const drift = OWNERSHIP.filter(([p]) => p.startsWith('src/'))
      .filter(([p, id]) => !(rowOf.get(id) ?? '').includes(p.replace(/\/$/, '').split('/').pop()!))
      .map(([p, id]) => `${p} -> ${id}`);
    expect(drift).toEqual([]);
  });
});
