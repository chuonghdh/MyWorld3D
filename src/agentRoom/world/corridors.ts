// Walking network from the human's floor plan (orange lines): axis-aligned corridors, plus the seat ring round the
// discuss table (a closed cycle through the stool seats). Desk stubs join the row corridors, the central aisle runs
// from the front to the ring's front seat, a top corridor leads to the pantry and a far-right corridor joins the right
// block's rows. Routes are Dijkstra on this graph (fixed tie-break); only the last step into the pantry uses the
// furniture grid (nav.ts).
import { AISLE_X, DESK_COLS, DESK_ROWS, DESK_SLOTS, STAND, SX, SEAT_COUNT, leadHome, seatPos, type Vec2 } from './layout';

export const ROW_Z = [DESK_ROWS[0] + 2.0, DESK_ROWS[1] + 2.2] as const; // 2.6 and 6.6
export const TOP_Z = -1.2;
export const RIGHT_X = 9.0 * SX; // right of the ninth desk column (7.1 * SX) so the far-right corridor clears its desk
export const PANTRY_ENTRY: Vec2 = { x: 5.0 * SX, z: TOP_Z };
/** Lead spot beside the board's right end (stands there while not working). */
export const LEAD_NODE: Vec2 = { x: 1.2, z: -6.0 };
/** Lead working spot in front of the lead desk. */
export const LEAD_HOME: Vec2 = leadHome();
/** Ring seat in front of the table (seat 0), and the seat the lead's walkway joins (seat 2, right side). */
const FRONT_SEAT = seatPos(0);
const LEAD_JOIN = seatPos(2);
/** Huddle seats (seat k), in index order. */
export const SEATS: readonly Vec2[] = Array.from({ length: SEAT_COUNT }, (_, k) => seatPos(k));

/** Polylines of the network; consecutive points are edges, equal points are the same node. */
export function corridorLines(): Vec2[][] {
  const [L0, L1, R0, R1, R2] = DESK_COLS;
  const P = (x: number, z: number): Vec2 => ({ x, z });
  const lines: Vec2[][] = [
    [P(L0, ROW_Z[0]), P(L1, ROW_Z[0]), P(AISLE_X, ROW_Z[0])],
    [P(L0, ROW_Z[1]), P(L1, ROW_Z[1]), P(AISLE_X, ROW_Z[1])],
    [P(AISLE_X, ROW_Z[0]), P(R0, ROW_Z[0]), P(R1, ROW_Z[0]), P(R2, ROW_Z[0]), P(RIGHT_X, ROW_Z[0])],
    [P(AISLE_X, ROW_Z[1]), P(R0, ROW_Z[1]), P(R1, ROW_Z[1]), P(R2, ROW_Z[1]), P(RIGHT_X, ROW_Z[1])],
    // Central aisle up to the ring's front seat.
    [P(AISLE_X, ROW_Z[1]), P(AISLE_X, ROW_Z[0]), P(AISLE_X, TOP_Z), P(AISLE_X, FRONT_SEAT.z), FRONT_SEAT],
    [P(AISLE_X, TOP_Z), P(LEAD_NODE.x, TOP_Z), P(PANTRY_ENTRY.x, TOP_Z), P(RIGHT_X, TOP_Z)],
    [P(RIGHT_X, TOP_Z), P(RIGHT_X, ROW_Z[0]), P(RIGHT_X, ROW_Z[1])],
    // Seat ring: a closed cycle through every stool seat.
    [...SEATS, SEATS[0]!],
    // Lead: from the ring's right side down the desk's west end to the lead's spot, then round to its chair (north side).
    [LEAD_JOIN, P(LEAD_NODE.x, LEAD_JOIN.z)],
    // Lead spine: straight down from the top corridor, past the ring's right seat, to the lead's spot and round to its chair.
    [P(LEAD_NODE.x, TOP_Z), P(LEAD_NODE.x, LEAD_JOIN.z), LEAD_NODE, P(LEAD_NODE.x, LEAD_HOME.z), LEAD_HOME],
  ];
  // Desk stubs: from where the agent stands down to its row corridor.
  for (const [c, r] of DESK_SLOTS) lines.push([P(DESK_COLS[c]!, DESK_ROWS[r]! + STAND), P(DESK_COLS[c]!, ROW_Z[r]!)]);
  return lines;
}

export interface Graph {
  nodes: Vec2[];
  adj: number[][];
}

const key = (p: Vec2) => `${Math.round(p.x * 1000)},${Math.round(p.z * 1000)}`;

export function buildCorridors(): Graph {
  const nodes: Vec2[] = [];
  const index = new Map<string, number>();
  const id = (p: Vec2) => {
    const k = key(p);
    let i = index.get(k);
    if (i === undefined) {
      i = nodes.length;
      nodes.push({ x: p.x, z: p.z });
      index.set(k, i);
    }
    return i;
  };
  const adj: number[][] = [];
  const link = (a: number, b: number) => {
    if (a === b) return;
    (adj[a] ??= []).includes(b) || adj[a]!.push(b);
    (adj[b] ??= []).includes(a) || adj[b]!.push(a);
  };
  for (const line of corridorLines()) for (let i = 1; i < line.length; i++) link(id(line[i - 1]!), id(line[i]!));
  for (let i = 0; i < nodes.length; i++) (adj[i] ??= []).sort((a, b) => a - b);
  return { nodes, adj };
}

export function nodeAt(g: Graph, p: Vec2): number {
  return g.nodes.findIndex((n) => Math.abs(n.x - p.x) < 1e-6 && Math.abs(n.z - p.z) < 1e-6);
}

/** Nearest node by distance, lowest index on ties. */
export function nearestNode(g: Graph, p: Vec2): number {
  let best = 0;
  let bd = Infinity;
  g.nodes.forEach((n, i) => {
    const d = Math.hypot(n.x - p.x, n.z - p.z);
    if (d < bd - 1e-9) [best, bd] = [i, d];
  });
  return best;
}

/** Shortest node path a -> b (Dijkstra, deterministic). */
export function graphPath(g: Graph, a: number, b: number): Vec2[] {
  const dist = new Array<number>(g.nodes.length).fill(Infinity);
  const prev = new Array<number>(g.nodes.length).fill(-1);
  const done = new Array<boolean>(g.nodes.length).fill(false);
  dist[a] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]! - 1e-9)) u = i;
    if (u < 0 || u === b) break;
    done[u] = true;
    for (const v of g.adj[u] ?? []) {
      const d = dist[u]! + Math.hypot(g.nodes[u]!.x - g.nodes[v]!.x, g.nodes[u]!.z - g.nodes[v]!.z);
      if (d < dist[v]! - 1e-9) [dist[v], prev[v]] = [d, u];
    }
  }
  const out: Vec2[] = [];
  for (let c = b; c >= 0; c = prev[c]!) {
    out.push(g.nodes[c]!);
    if (c === a) break;
  }
  return out.reverse();
}
