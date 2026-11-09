// Route = corridor graph (orange lines) + short grid legs only where the floor plan has no corridor: inside the
// pantry (from its entry to a seat). Pure and deterministic.
import type { Vec2 } from './layout';
import { PANTRY_ENTRY, TOP_Z, buildCorridors, graphPath, nearestNode, nodeAt, type Graph } from './corridors';
import { buildGrid, findPath, type NavGrid } from './nav';
import { PANTRY } from './office';

let graph: Graph | null = null;
let grid: NavGrid | null = null;
export function corridorGraph(): Graph {
  graph ??= buildCorridors();
  return graph;
}
function navGrid(): NavGrid {
  grid ??= buildGrid();
  return grid;
}

export function inPantry(p: Vec2): boolean {
  return p.x >= PANTRY.x0 && p.x <= PANTRY.x1 + 0.3 && p.z >= PANTRY.z0 - 0.3 && p.z <= TOP_Z + 0.25; // down to its entry corridor
}

/** Graph node to enter from `p`, plus the off-graph leg (p -> node) if p is not a node. */
function attach(g: Graph, p: Vec2): { node: number; leg: Vec2[] } {
  const exact = nodeAt(g, p);
  if (exact >= 0) return { node: exact, leg: [] };
  if (inPantry(p)) {
    const node = nodeAt(g, PANTRY_ENTRY);
    return { node, leg: findPath(navGrid(), p, PANTRY_ENTRY).slice(0, -1) };
  }
  const node = nearestNode(g, p);
  return { node, leg: [p] };
}

/** Edge (i, j) that contains p (an agent re-planned mid-corridor), or null. */
function edgeOf(g: Graph, p: Vec2): [number, number] | null {
  for (let i = 0; i < g.nodes.length; i++)
    for (const j of g.adj[i] ?? []) {
      if (j < i) continue;
      const a = g.nodes[i]!;
      const b = g.nodes[j]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const da = Math.hypot(p.x - a.x, p.z - a.z);
      const db = Math.hypot(p.x - b.x, p.z - b.z);
      if (Math.abs(da + db - len) < 1e-4) return [i, j];
    }
  return null;
}

const length = (pts: Vec2[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1]!.x, p.z - pts[i - 1]!.z) : 0), 0);

/** Waypoints from `from` to `to` (both included). */
export function route(from: Vec2, to: Vec2): Vec2[] {
  const g = corridorGraph();
  const e = nodeAt(g, from) < 0 ? edgeOf(g, from) : null;
  if (e) {
    // Mid-corridor: continue along the edge to whichever end gives the shorter route.
    const [r0, r1] = e.map((n) => route(g.nodes[n]!, to));
    const pick = length([from, ...r0!]) <= length([from, ...r1!]) ? r0! : r1!;
    return [from, ...pick];
  }
  const a = attach(g, from);
  const b = attach(g, to);
  const mid = graphPath(g, a.node, b.node);
  const tail = [...b.leg].reverse();
  const pts = [from, ...a.leg, ...mid, ...tail, to];
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1]!.x, p.z - pts[i - 1]!.z) > 1e-6);
}
