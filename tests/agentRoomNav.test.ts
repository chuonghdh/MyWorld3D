// Walking routes follow the floor plan's corridors (orange lines): every leg between graph nodes lies on a corridor
// edge (axis-aligned); only the last step into the pantry leaves the network. No route
// crosses furniture, and routes are deterministic.
import { describe, expect, it } from 'vitest';
import { buildCorridors, nodeAt, PANTRY_ENTRY, SEATS } from '../src/agentRoom/world/corridors';
import { footprints, hits, type Footprint } from '../src/agentRoom/world/nav';
import { inPantry, route } from '../src/agentRoom/world/route';
import { LEAD_SPOT, PANTRY_SEATS, huddleSlot, seatOf } from '../src/agentRoom/world/office';
import { SPECIALISTS, homeSpot, type Vec2 } from '../src/agentRoom/world/layout';

const g = buildCorridors();
const fps = footprints();
const PAD = 0.15;

function crosses(a: Vec2, b: Vec2, list: Footprint[]): boolean {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05);
  for (let k = 0; k <= n; k++) {
    const t = n ? k / n : 0;
    if (list.some((f) => hits(f, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, PAD))) return true;
  }
  return false;
}
const isEdge = (a: Vec2, b: Vec2) => {
  const i = nodeAt(g, a);
  const j = nodeAt(g, b);
  return i >= 0 && j >= 0 && (g.adj[i] ?? []).includes(j);
};
// The discuss table is round: edges between two ring seats are chords (the only non-axis corridor, by design).
const onRing = (p: Vec2) => SEATS.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 1e-6);
const axisOrRing = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.z - b.z) < 1e-9 || (onRing(a) && onRing(b));
const offNet = (p: Vec2) => inPantry(p);

/** Check a route: legs are corridor edges, except legs touching an off-network point (pantry). */
function check(path: Vec2[]): void {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (offNet(a) || offNet(b)) continue;
    expect(isEdge(a, b), `leg ${a.x},${a.z} -> ${b.x},${b.z}`).toBe(true);
    expect(axisOrRing(a, b)).toBe(true);
  }
  const inner = path.slice(1, -1);
  for (let i = 1; i < inner.length; i++) expect(crosses(inner[i - 1]!, inner[i]!, fps)).toBe(false);
}

describe('corridor network', () => {
  it('all working spots are graph nodes: desk stands, huddle slots, lead, pantry entry', () => {
    for (const p of [LEAD_SPOT, PANTRY_ENTRY, ...SPECIALISTS.map(homeSpot), ...SPECIALISTS.map((id) => huddleSlot(id))]) {
      expect(nodeAt(g, p), `${p.x},${p.z}`).toBeGreaterThanOrEqual(0);
    }
  });
  it('edges are axis-aligned and clear of furniture', () => {
    g.adj.forEach((ns, i) =>
      ns.forEach((j) => {
        const a = g.nodes[i]!;
        const b = g.nodes[j]!;
        expect(axisOrRing(a, b)).toBe(true);
        expect(crosses(a, b, fps), `${a.x},${a.z} -> ${b.x},${b.z}`).toBe(false);
      }),
    );
  });
  it('work loop (pantry -> board -> desk -> board -> pantry) stays on the network for every specialist', () => {
    for (const id of SPECIALISTS) {
      const seat = PANTRY_SEATS[seatOf(id)]!.pos;
      for (const [a, b] of [[seat, huddleSlot(id)], [huddleSlot(id), homeSpot(id)], [homeSpot(id), huddleSlot(id)], [huddleSlot(id), seat]] as const) {
        const p = route(a, b);
        expect(p[0]).toEqual(a);
        expect(p[p.length - 1]).toEqual(b);
        check(p);
      }
    }
  });
  it('lead reaches its spot', () => {
    check(route(huddleSlot('audio'), LEAD_SPOT));
  });
  it('re-planning mid-corridor continues along the corridor', () => {
    const a = homeSpot('audio');
    const mid = { x: a.x, z: (a.z + 2.6) / 2 }; // halfway down the audio desk stub
    const p = route(mid, LEAD_SPOT);
    expect(Math.abs(p[1]!.x - mid.x) < 1e-9 || Math.abs(p[1]!.z - mid.z) < 1e-9).toBe(true);
    check(p.slice(1));
  });
  it('routes are deterministic', () => {
    expect(route(PANTRY_SEATS[0]!.pos, homeSpot('architect'))).toEqual(route(PANTRY_SEATS[0]!.pos, homeSpot('architect')));
  });
});
