// Walking graph over the sidewalks and crosswalks, built once from the layout.

import type { CityLayout } from '../../city/layout';
import type { Graph, RoadRects } from './types';

export function buildRoadRects(layout: CityLayout): RoadRects {
  const n = layout.roads.length;
  const r: RoadRects = { minX: new Float32Array(n), maxX: new Float32Array(n), minZ: new Float32Array(n), maxZ: new Float32Array(n), count: n };
  layout.roads.forEach((road, i) => {
    const hw = road.width / 2;
    if (road.orientation === 'vertical') {
      r.minX[i] = road.start.x - hw;
      r.maxX[i] = road.start.x + hw;
      r.minZ[i] = Math.min(road.start.z, road.end.z);
      r.maxZ[i] = Math.max(road.start.z, road.end.z);
    } else {
      r.minX[i] = Math.min(road.start.x, road.end.x);
      r.maxX[i] = Math.max(road.start.x, road.end.x);
      r.minZ[i] = road.start.z - hw;
      r.maxZ[i] = road.start.z + hw;
    }
  });
  return r;
}

export function inRoad(r: RoadRects, x: number, z: number, tol: number): boolean {
  for (let i = 0; i < r.count; i++) {
    if (x > r.minX[i] + tol && x < r.maxX[i] - tol && z > r.minZ[i] + tol && z < r.maxZ[i] - tol) return true;
  }
  return false;
}

export function buildGraph(layout: CityLayout, rects: RoadRects): Graph {
  const nodeIndex = new Map<string, number>();
  const nodeX: number[] = [];
  const nodeZ: number[] = [];
  const nodeOf = (x: number, z: number): number => {
    const key = Math.round(x * 20) + ',' + Math.round(z * 20);
    let id = nodeIndex.get(key);
    if (id === undefined) {
      id = nodeX.length;
      nodeIndex.set(key, id);
      nodeX.push(x);
      nodeZ.push(z);
    }
    return id;
  };

  interface E {
    a: number;
    b: number;
    cross: boolean;
    weight: number;
    curb: number;
    inx: number;
    inz: number;
    light: number;
    axis: number;
  }
  const edges: E[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (e: E): void => {
    if (e.a === e.b) return;
    const key = Math.min(e.a, e.b) + '-' + Math.max(e.a, e.b);
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(e);
  };

  const lights = layout.trafficLights;
  const nearestLight = (x: number, z: number): number => {
    let best = -1;
    let bestD = 15;
    for (let i = 0; i < lights.length; i++) {
      const d = Math.hypot(lights[i].position.x - x, lights[i].position.z - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  // 1. Crossing edges from the crosswalks.
  const crossNodes = new Set<number>();
  for (const c of layout.crosswalks) {
    const alongX = c.orientation === 'horizontal'; // walkers walk along X, so they cross a vertical road
    let sw = 3;
    let streetClass = 'street';
    for (const road of layout.roads) {
      const matches =
        alongX
          ? road.orientation === 'vertical' &&
            Math.abs(road.start.x - c.center.x) < 0.5 &&
            c.center.z >= Math.min(road.start.z, road.end.z) - 0.5 &&
            c.center.z <= Math.max(road.start.z, road.end.z) + 0.5
          : road.orientation === 'horizontal' &&
            Math.abs(road.start.z - c.center.z) < 0.5 &&
            c.center.x >= Math.min(road.start.x, road.end.x) - 0.5 &&
            c.center.x <= Math.max(road.start.x, road.end.x) + 0.5;
      if (matches) {
        sw = road.sidewalkWidth || 3;
        streetClass = road.streetClass;
        break;
      }
    }
    const h = c.length / 2 + sw / 2;
    const ax = alongX ? c.center.x - h : c.center.x;
    const az = alongX ? c.center.z : c.center.z - h;
    const bx = alongX ? c.center.x + h : c.center.x;
    const bz = alongX ? c.center.z : c.center.z + h;
    const a = nodeOf(ax, az);
    const b = nodeOf(bx, bz);
    crossNodes.add(a);
    crossNodes.add(b);
    addEdge({
      a,
      b,
      cross: true,
      weight: streetClass === 'avenue' ? 1.3 : 1,
      curb: sw / 2,
      inx: 0,
      inz: 0,
      light: nearestLight(c.center.x, c.center.z),
      axis: alongX ? 0 : 1,
    });
  }

  // 2. Sidewalk edges along each road side, between the crossing end nodes lying on that line.
  const nodeList = [...crossNodes];
  for (const road of layout.roads) {
    const vertical = road.orientation === 'vertical';
    const sw = road.sidewalkWidth || 3;
    const off = road.width / 2 + sw / 2;
    const lo = vertical ? Math.min(road.start.z, road.end.z) : Math.min(road.start.x, road.end.x);
    const hi = vertical ? Math.max(road.start.z, road.end.z) : Math.max(road.start.x, road.end.x);
    for (const side of [1, -1]) {
      const line = (vertical ? road.start.x : road.start.z) + side * off;
      const on: number[] = [];
      for (const n of nodeList) {
        const perp = vertical ? nodeX[n] : nodeZ[n];
        const along = vertical ? nodeZ[n] : nodeX[n];
        if (Math.abs(perp - line) < 0.05 && along >= lo - 0.05 && along <= hi + 0.05) on.push(n);
      }
      on.sort((p, q) => (vertical ? nodeZ[p] - nodeZ[q] : nodeX[p] - nodeX[q]));
      // Extend to the road ends when they are well beyond the last crossing (short corner stubs are left out).
      const alongOf = (n: number): number => (vertical ? nodeZ[n] : nodeX[n]);
      if (on.length === 0 || alongOf(on[0]) - lo > 6) on.unshift(nodeOf(vertical ? line : lo, vertical ? lo : line));
      if (on.length === 1 || hi - alongOf(on[on.length - 1]) > 6) on.push(nodeOf(vertical ? line : hi, vertical ? hi : line));
      const inx = vertical ? side : 0;
      const inz = vertical ? 0 : side;
      for (let i = 0; i + 1 < on.length; i++) {
        const p = on[i];
        const q = on[i + 1];
        const mx = (nodeX[p] + nodeX[q]) / 2;
        const mz = (nodeZ[p] + nodeZ[q]) / 2;
        if (Math.hypot(nodeX[q] - nodeX[p], nodeZ[q] - nodeZ[p]) < 0.5) continue;
        if (inRoad(rects, mx, mz, 0.3)) continue; // this stretch is a crossing
        addEdge({
          a: p,
          b: q,
          cross: false,
          weight: road.streetClass === 'avenue' ? 2.2 : 1,
          curb: sw / 2,
          inx,
          inz,
          light: -1,
          axis: 0,
        });
      }
    }
  }

  // 3. Pack into typed arrays.
  const E = edges.length;
  const N = nodeX.length;
  const g: Graph = {
    nodeCount: N,
    nodeStart: new Int32Array(N + 1),
    nodeEdges: new Int32Array(E * 2),
    edgeCount: E,
    ax: new Float32Array(E),
    az: new Float32Array(E),
    bx: new Float32Array(E),
    bz: new Float32Array(E),
    len: new Float32Array(E),
    dx: new Float32Array(E),
    dz: new Float32Array(E),
    inx: new Float32Array(E),
    inz: new Float32Array(E),
    nodeA: new Int32Array(E),
    nodeB: new Int32Array(E),
    cross: new Uint8Array(E),
    build: new Uint8Array(E),
    weight: new Float32Array(E),
    curb: new Float32Array(E),
    ctl: new Uint8Array(E),
    axis: new Uint8Array(E),
    cycle: new Float32Array(E),
    nsG: new Float32Array(E),
    ewG: new Float32Array(E),
    allR: new Float32Array(E),
    yel: new Float32Array(E),
    spawnCum: new Float32Array(E),
    spawnTotal: 0,
  };
  const tb = layout.townBounds;
  const degree = new Int32Array(N);
  let cum = 0;
  for (let i = 0; i < E; i++) {
    const e = edges[i];
    g.nodeA[i] = e.a;
    g.nodeB[i] = e.b;
    g.ax[i] = nodeX[e.a];
    g.az[i] = nodeZ[e.a];
    g.bx[i] = nodeX[e.b];
    g.bz[i] = nodeZ[e.b];
    const ddx = g.bx[i] - g.ax[i];
    const ddz = g.bz[i] - g.az[i];
    const L = Math.hypot(ddx, ddz);
    g.len[i] = L;
    g.dx[i] = ddx / L;
    g.dz[i] = ddz / L;
    g.inx[i] = e.inx;
    g.inz[i] = e.inz;
    g.cross[i] = e.cross ? 1 : 0;
    g.weight[i] = e.weight;
    g.curb[i] = e.curb;
    if (!e.cross) {
      const mx = (g.ax[i] + g.bx[i]) / 2 + e.inx * 3.5;
      const mz = (g.az[i] + g.bz[i]) / 2 + e.inz * 3.5;
      g.build[i] = mx > tb.minX + 7 && mx < tb.maxX - 7 && mz > tb.minZ + 7 && mz < tb.maxZ - 7 ? 1 : 0;
      cum += L * e.weight;
    }
    g.spawnCum[i] = cum;
    if (e.cross && e.light >= 0) {
      const t = lights[e.light].timing;
      if (t.cycleSeconds > 0) {
        g.ctl[i] = 1;
        g.axis[i] = e.axis;
        g.cycle[i] = t.cycleSeconds;
        g.nsG[i] = t.nsGreenSeconds;
        g.ewG[i] = t.ewGreenSeconds;
        g.yel[i] = t.yellowSeconds;
        g.allR[i] = t.allRedSeconds ?? 0;
      }
    }
    degree[e.a]++;
    degree[e.b]++;
  }
  g.spawnTotal = cum;
  for (let n = 0; n < N; n++) g.nodeStart[n + 1] = g.nodeStart[n] + degree[n];
  const fill = new Int32Array(N);
  for (let i = 0; i < E; i++) {
    const a = g.nodeA[i];
    const b = g.nodeB[i];
    g.nodeEdges[g.nodeStart[a] + fill[a]++] = i;
    g.nodeEdges[g.nodeStart[b] + fill[b]++] = i;
  }
  return g;
}

// --- Simulation ----------------------------------------------------------------------------------------
