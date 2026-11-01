// Set-up of a vehicle system from the layout: lane paths, turn connectors and the arm count of every junction.

import type { CityLayout } from '../../city/layout';
import type { Vec2 } from '../../core/types';
import { createRng } from '../../core/rng';
import { TrafficLightController, axisForOrientation } from '../lights';
import { trafficDensityAt } from '../trafficDensity';
import type { VehicleSystemOptions, StopLine, Corner, PathModel } from './types';
import { EDGE_EXTENSION, DRAW_MARGIN, LEFT_TURN_SPEED, RIGHT_TURN_SPEED, STOP_BACK, STOP_MARGIN, CROSSWALK_REACH, CROSSWALK_LATERAL, SPAWN_MAX_S } from './constants';
import { filletPath, extendWaypoints, pathOpenness, armBit, projectArc, projectArcDist, poseAt, wrapAngle } from './geometry';
import { junctionAt } from './junctions';
import type { VehicleSystem } from '../vehicles';

export function setupSystem(sys: VehicleSystem, layout: CityLayout, options: VehicleSystemOptions) {
  sys.multiplier = Math.max(0, options.trafficMultiplier);
  sys.density = options.timeOfDay === undefined ? 1 : trafficDensityAt(options.timeOfDay);
  sys.rng = createRng(options.seed ?? 1);
  sys.hornRng = createRng(((options.seed ?? 1) ^ 0x68c0ffee) >>> 0);
  sys.lights = options.lights ?? new TrafficLightController(layout.trafficLights);

  for (const cw of layout.crosswalks) {
    // Pedestrians walk along the crosswalk length; the band is a little wider than painted.
    const alongX = cw.orientation === 'horizontal';
    sys.crosswalkRects.push({
      cx: cw.center.x,
      cz: cw.center.z,
      hx: alongX ? cw.length / 2 + 0.3 : cw.width / 2 + 0.6,
      hz: alongX ? cw.width / 2 + 0.6 : cw.length / 2 + 0.3,
    });
  }
  sys.crosswalkBusy = new Uint8Array(sys.crosswalkRects.length);
  if ((options.edgeExtension ?? EDGE_EXTENSION) > 0) {
    const b = layout.townBounds;
    sys.drawBounds = { minX: b.minX - DRAW_MARGIN, maxX: b.maxX + DRAW_MARGIN, minZ: b.minZ - DRAW_MARGIN, maxZ: b.maxZ + DRAW_MARGIN };
  }
  for (const it of layout.intersections) {
    sys.junctions.push({
      minX: it.center.x - it.sizeX / 2 - 1,
      maxX: it.center.x + it.sizeX / 2 + 1,
      minZ: it.center.z - it.sizeZ / 2 - 1,
      maxZ: it.center.z + it.sizeZ / 2 + 1,
    });
  }

  const orientation = new Map(layout.roads.map((r) => [r.id, r.orientation] as const));
  const lightPos = new Map(layout.trafficLights.map((l) => [l.id, l.position] as const));
  // A 2-arm junction (block merges) has no light; its id still marks the junction, so the stop line in front of the
  // crosswalk is kept (buildArms clears its signal and vehicles only yield to pedestrians there).
  for (const it of layout.intersections) {
    const id = it.id.replace(/^intersection-/, "light-");
    if (!lightPos.has(id)) lightPos.set(id, it.center);
  }
  const ext = options.edgeExtension ?? EDGE_EXTENSION;
  const openness = pathOpenness(layout, orientation);

  for (const path of layout.trafficPaths) {
    if (path.waypoints.length < 2) continue;
    const open = openness.get(path) ?? { start: true, end: true };
    const { points, cornerIdx } = filletPath(extendWaypoints(path.waypoints, open.start ? ext : 0, open.end ? ext : 0));
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
    }
    const length = cum[cum.length - 1];
    if (length <= 0) continue;

    const corners: Corner[] = cornerIdx.map((c) => ({ s: cum[c.index], angle: c.angle }));

    const orient = orientation.get(path.roadId) ?? 'vertical';
    const stops: StopLine[] = [];
    for (const lightId of path.trafficLightIds) {
      const pos = lightPos.get(lightId);
      if (!pos) continue;
      const sLight = projectArc(points, cum, pos);
      // The stop line is the near edge of the crosswalk in front of this light, minus a small margin.
      let sStop = sLight - STOP_BACK;
      let bestC = -Infinity;
      let bestIdx = -1;
      for (let ci = 0; ci < layout.crosswalks.length; ci++) {
        const cw = layout.crosswalks[ci];
        const hit = projectArcDist(points, cum, cw.center);
        if (hit.s >= sLight || sLight - hit.s > CROSSWALK_REACH || hit.d > CROSSWALK_LATERAL) continue;
        if (hit.s > bestC) {
          bestC = hit.s;
          bestIdx = ci;
          sStop = hit.s - cw.width / 2 - STOP_MARGIN;
        }
      }
      if (sStop > 0 && sStop < length) stops.push({ s: sStop, passS: sStop + STOP_MARGIN, lightId, cw: bestIdx, junction: junctionAt(sys, pos.x, pos.z), exitS: 2 * sLight - (sStop + STOP_MARGIN) });
    }
    stops.sort((a, b) => a.s - b.s);

    // Vehicles enter at the start of the (extended) path, i.e. at the edge of the map. A closed start (a junction
    // on a merged block's boundary) gets no spawn: vehicles only reach that lane by turning into it.
    const spawns = path.spawnPoints.length > 0 && open.start ? [{ s: 0, timer: sys.rng() * SPAWN_MAX_S }] : [];

    sys.models.push({
      path,
      conn: null,
      srcPath: -1,
      turn: null,
      junction: -1,
      opposite: -1,
      passes: [],
      turns: [],
      points,
      cum,
      length,
      axis: axisForOrientation(orient),
      stops,
      corners,
      spawns,
      list: [],
      startOpen: open.start,
      endOpen: open.end,
    });
  }
  sys.pathCount = sys.models.length;
  sys.junctionCount = layout.intersections.length;
  buildTurns(sys, layout);
  buildArms(sys);
  for (let j = 0; j < sys.junctionCount; j++) {
    sys.grantedAt.push([]);
    sys.askingAt.push([]);
  }
}

/** Finds the junctions each path runs through and builds a curved connector for every possible turn. */
export function buildTurns(sys: VehicleSystem, layout: CityLayout): void {
  const n = sys.pathCount;
  for (let a = 0; a < n; a++) {
    const A = sys.models[a];
    A.opposite = sys.models.findIndex(
      (m, i) => i < n && i !== a && m.path.roadId === A.path.roadId && m.path.direction === -A.path.direction,
    );
    for (let j = 0; j < layout.intersections.length; j++) {
      const hit = projectArcDist(A.points, A.cum, layout.intersections[j].center);
      if (hit.d <= 3.5) A.passes.push({ junction: j, sCentre: hit.s });
    }
    A.passes.sort((p, q) => p.sCentre - q.sCentre);
  }
  for (let a = 0; a < n; a++) {
    const A = sys.models[a];
    for (const pa of A.passes) {
      for (let b = 0; b < n; b++) {
        const B = sys.models[b];
        if (B.axis === A.axis) continue;
        const pb = B.passes.find((p) => p.junction === pa.junction);
        if (!pb) continue;
        const conn = makeConnector(sys, layout, a, pa.sCentre, b, pb.sCentre, pa.junction);
        if (!conn) continue;
        const index = sys.models.length;
        sys.models.push(conn.model);
        A.turns.push({ model: index, entryS: conn.entryS, turn: conn.turn, junction: pa.junction });
      }
    }
    A.turns.sort((p, q) => p.entryS - q.entryS);
  }
}

/**
 * Counts the real arms of every junction from the lane paths through it. A lane that goes on beyond the centre,
 * or ends there with an open end (the map edge), adds an arm ahead; one that comes from beyond, or starts there
 * with an open start, adds an arm behind. Then junctions left with 2 arms (straight or bend, after a block
 * merge removed a street) lose their signal: their stop lines only yield to pedestrians on the crosswalk.
 */
export function buildArms(sys: VehicleSystem): void {
  const J = sys.junctionCount;
  sys.armMask = new Uint8Array(J);
  sys.armCount = new Uint8Array(J);
  const pose = sys.pose;
  for (let a = 0; a < sys.pathCount; a++) {
    const A = sys.models[a];
    for (const p of A.passes) {
      poseAt(A, p.sCentre, pose);
      const ahead = armBit(pose.heading);
      const behind = armBit(pose.heading + Math.PI);
      if (p.sCentre < A.length - 3 || A.endOpen) sys.armMask[p.junction] |= ahead;
      if (p.sCentre > 3 || A.startOpen) sys.armMask[p.junction] |= behind;
    }
  }
  for (let j = 0; j < J; j++) {
    const m = sys.armMask[j];
    sys.armCount[j] = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
  }
  for (let a = 0; a < sys.pathCount; a++) {
    for (const line of sys.models[a].stops) {
      if (line.junction >= 0 && sys.armCount[line.junction] <= 2) line.lightId = '';
    }
  }
}

export function makeConnector(sys: VehicleSystem,
  layout: CityLayout,
  a: number,
  sA: number,
  b: number,
  sB: number,
  junction: number,
): { model: PathModel; entryS: number; turn: 'left' | 'right' } | null {
  const A = sys.models[a];
  const B = sys.models[b];
  const it = layout.intersections[junction];
  const pose = sys.pose;
  poseAt(A, sA, pose);
  const posA = { x: pose.x, z: pose.z };
  const hA = pose.heading;
  poseAt(B, sB, pose);
  const posB = { x: pose.x, z: pose.z };
  const hB = pose.heading;
  const dA = { x: Math.sin(hA), z: Math.cos(hA) };
  const dB = { x: Math.sin(hB), z: Math.cos(hB) };
  const aAlongZ = Math.abs(dA.z) > 0.5;
  // Control point: where the two lane lines cross.
  const c = aAlongZ ? { x: posA.x, z: posB.z } : { x: posB.x, z: posA.z };
  // Start of the turn on the way in, and end of it on the way out: the edges of the junction box.
  const e0 = Math.max(1, aAlongZ ? it.sizeZ / 2 + dA.z * (c.z - it.center.z) : it.sizeX / 2 + dA.x * (c.x - it.center.x));
  const bAlongX = Math.abs(dB.x) > 0.5;
  const e1 = Math.max(1, bAlongX ? it.sizeX / 2 - dB.x * (c.x - it.center.x) : it.sizeZ / 2 - dB.z * (c.z - it.center.z));
  const p0 = { x: c.x - dA.x * e0, z: c.z - dA.z * e0 };
  const p1 = { x: c.x + dB.x * e1, z: c.z + dB.z * e1 };
  const entryS = projectArc(A.points, A.cum, p0);
  const exitS = projectArc(B.points, B.cum, p1);
  if (exitS > B.length - 2) return null;

  const points: Vec2[] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    points.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, z: u * u * p0.z + 2 * u * t * c.z + t * t * p1.z });
  }
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  const length = cum[cum.length - 1];
  const turn: 'left' | 'right' = wrapAngle(hB - hA) > 0 ? 'left' : 'right';

  // Pedestrians on the crosswalk the turn leads onto hold the vehicle back.
  const stops: StopLine[] = [];
  let cwIdx = -1;
  let cwNear = Infinity;
  for (let ci = 0; ci < layout.crosswalks.length; ci++) {
    const cw = layout.crosswalks[ci];
    const hit = projectArcDist(B.points, B.cum, cw.center);
    const near = hit.s - cw.width / 2 - exitS;
    if (hit.d > CROSSWALK_LATERAL || near < -1 || near > 6) continue;
    if (near < cwNear) {
      cwNear = near;
      cwIdx = ci;
    }
  }
  if (cwIdx >= 0) {
    const sStop = length + Math.min(Math.max(cwNear, 0), 1) - STOP_MARGIN;
    stops.push({ s: sStop, passS: sStop + STOP_MARGIN, lightId: '', cw: cwIdx, junction: -1, exitS: -1e9 });
  }

  const model: PathModel = {
    path: A.path,
    conn: { to: b, exitS, maxSpeed: turn === 'left' ? LEFT_TURN_SPEED : RIGHT_TURN_SPEED },
    srcPath: a,
    turn,
    junction,
    opposite: -1,
    passes: [],
    turns: [],
    points,
    cum,
    length,
    axis: A.axis,
    stops,
    corners: [],
    spawns: [],
    list: [],
    startOpen: true,
    endOpen: true,
  };
  return { model, entryS, turn };
}
