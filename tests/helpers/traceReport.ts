// Debug aid: attributes audit hits to the source lines that emitted the triangles (see `trace` in mesh.ts).
import { trace } from '../../src/buildings/facade/mesh';
import type { CoplanarPair } from './geometryAudit';

export function startTrace(): void {
  trace.on = true;
  trace.log.length = 0;
}

export function stopTrace(): typeof trace.log {
  trace.on = false;
  return [...trace.log];
}

export function sourceOf(log: typeof trace.log, mesh: string, local: number): string {
  for (const e of log) if (e.t === mesh && local >= e.start && local < e.start + e.count) return e.src;
  return '?';
}

/** Aggregates coplanar pairs by (source A, source B) and returns lines sorted by total area. */
export function summarize(log: typeof trace.log, pairs: readonly CoplanarPair[], top = 15): string[] {
  const agg = new Map<string, { n: number; area: number; gap: number; pos: string }>();
  for (const p of pairs) {
    const a = sourceOf(log, p.meshA, p.localA);
    const b = sourceOf(log, p.meshB, p.localB);
    const k = [a, b].sort().join('  <>  ');
    const e = agg.get(k) ?? { n: 0, area: 0, gap: 0, pos: p.position.map((v) => v.toFixed(1)).join(',') };
    e.n++;
    e.area += p.area;
    e.gap = Math.max(e.gap, p.gap);
    agg.set(k, e);
  }
  return [...agg.entries()]
    .sort((x, y) => y[1].area - x[1].area)
    .slice(0, top)
    .map(([k, e]) => `${e.n}x area=${e.area.toFixed(2)} gap<=${e.gap.toFixed(3)} @${e.pos}  ${k}`);
}
