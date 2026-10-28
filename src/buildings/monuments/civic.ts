// Civic monuments: hospital, fire station, supermarket.

import {
  CAR_COLORS,
  ambulance,
  bays,
  bench,
  car,
  crowd,
  fireEngine,
  flagpole,
  lamp,
  lettering,
  onFace,
  person,
  planter,
  roofClutter,
  tree,
  wing,
  windowAt,
  type Kit,
  type Site,
} from './kit';

const PI = Math.PI;

// ---------------------------------------------------------------------------
// Hospital: Beaux-Arts white U-plan around a forecourt, portico, red cross, ambulance bay.
// ---------------------------------------------------------------------------
export function hospital(k: Kit, s: Site): void {
  const wall = k.jit('#f3efe7', 0.015);
  const trim = '#f7f3ea';
  const base = '#cbbfa8';
  const roof = k.pick(['#6f7a86', '#5d6773']);
  const mw = Math.min(26, s.W - 7);
  const md = 9;
  const mz = -s.hd + 3 + md / 2; // main block centre
  const front = mz + md / 2; // main block front face
  const wingW = 7;
  const wingX = mw / 2 - wingW / 2;
  const wingD = 10;
  const wingZ = front + wingD / 2;

  // Main block (4 floors) with entrance and doors behind the portico.
  const H = wing(k, {
    x: 0, z: mz, w: mw, d: md, floors: 4, groundH: 4.2, floorH: 3.4,
    wall, trim, base, faces: { front: true, back: true, left: true, right: true },
    skip: (f, u, fl) => f === 'front' && (Math.abs(u) > mw / 2 - wingW - 0.5 || (fl === 0 && Math.abs(u) < 3.2)),
  });
  // Rusticated base grooves on the front.
  for (let i = 1; i < 4; i++) k.box('#e4dccb', mw + 0.18, 0.06, md + 0.18, 0, i * 1.0, mz);
  // Mansard with dormers.
  k.frust(roof, mw + 0.3, md + 0.3, mw - 2.6, md - 2.8, 2.8, 0, H, mz);
  const nd = Math.floor((mw - 4) / 2.8);
  for (let i = 0; i < nd; i++) {
    const x = (i - (nd - 1) / 2) * 2.8;
    if (Math.abs(x) < 2) continue;
    for (const side of [1, -1]) {
      k.at(x, mz + side * (md / 2 - 0.2), side > 0 ? 0 : PI, () => {
        k.box(trim, 1.1, 1.4, 1.0, 0, H + 0.3, -0.3);
        k.gableRoof(roof, 1.3, 0.6, 1.2, 0, H + 1.7, -0.3);
        k.glass(k.chance(0.3), 0.7, 0.9, 0.06, 0, H + 0.45, 0.22);
      });
    }
  }
  // Roof lantern with a patina dome and chimneys.
  k.box(trim, 3, 2.2, 3, 0, H + 2.8, mz);
  k.blob('#7fa69a', 1.9, 0, H + 5.0, mz, 1, 0.8, 1, 1);
  k.cyl('#e2b66c', 0.05, 0.12, 1.4, 0, H + 6.4, mz, 5);
  for (const x of [-mw / 2 + 2, mw / 2 - 2]) k.box('#c9714f', 0.9, 1.6, 0.6, x, H + 1.5, mz);

  // Red cross sign on the roof edge (lit panel at night).
  k.at(0, front + 0.2, 0, () => {
    k.glass(true, 3.2, 3.2, 0.2, 0, H + 0.3, 0, '#f7f7f2');
    k.box('#d0282a', 2.5, 0.85, 0.12, 0, H + 1.47, 0.14);
    k.box('#d0282a', 0.85, 2.5, 0.12, 0, H + 0.65, 0.14);
    k.box('#22262a', 0.2, 0.6, 0.2, -1.2, H - 0.3, -0.1);
    k.box('#22262a', 0.2, 0.6, 0.2, 1.2, H - 0.3, -0.1);
  });

  // Wings: 3 floors, framing the forecourt.
  for (const sx of [-1, 1]) {
    const Hw = wing(k, {
      x: sx * wingX, z: wingZ, w: wingW, d: wingD, floors: 3, groundH: 4.2, floorH: 3.4,
      wall, trim, base, faces: { front: true, left: true, right: true },
    });
    k.frust(roof, wingW + 0.3, wingD + 0.3, wingW - 2.6, wingD - 2.6, 2.2, sx * wingX, Hw, wingZ);
    k.box('#c9714f', 0.8, 1.4, 0.6, sx * wingX, Hw + 1.2, wingZ - 2.5);
    // Pilasters on the wing fronts.
    for (const u of [-wingW / 2 + 0.3, wingW / 2 - 0.3]) k.box(trim, 0.5, Hw - 0.9, 0.2, sx * wingX + u, 0.9, wingZ + wingD / 2);
  }

  // Portico: steps, four columns, entablature with lettering, pediment.
  const pz = front + 1.7;
  const stepW = Math.min(11.4, 2 * (wingX - wingW / 2) - 0.4);
  for (let i = 0; i < 3; i++) k.box(base, stepW - i * 0.6, 0.2, 4.6 - i * 0.5, 0, i * 0.2, pz + 0.3 - i * 0.25);
  for (const x of [-3.6, -1.2, 1.2, 3.6]) {
    k.box(trim, 0.9, 0.3, 0.9, x, 0.6, pz + 1.0);
    k.cyl(trim, 0.33, 0.38, 6.4, x, 0.9, pz + 1.0, 10);
    k.box(trim, 0.9, 0.3, 0.9, x, 7.3, pz + 1.0);
  }
  k.box(trim, 9.6, 1.2, 3.6, 0, 7.6, pz - 0.2);
  lettering(k, 0, 7.85, pz + 1.6, 6, 0.55, '#3b4048', false);
  k.gableRoof(trim, 9.8, 1.8, 3.8, 0, 8.8, pz - 0.2);
  k.glass(true, 3.2, 3.0, 0.08, 0, 0.6, front + 0.02, '#4a5a68');
  k.box('#3b4048', 3.6, 0.2, 0.2, 0, 3.6, front + 0.1);

  // Ambulance bay: canopy against the right wing, with an "urgences" fascia.
  const bx0 = 1.6;
  const bx1 = wingX - wingW / 2;
  const bz0 = front + 3.2;
  const bz1 = front + wingD;
  const bcx = (bx0 + bx1) / 2;
  const bcz = (bz0 + bz1) / 2;
  k.box('#e9e6df', bx1 - bx0 + 0.4, 0.4, bz1 - bz0, bcx, 4.0, bcz);
  k.box('#d0282a', bx1 - bx0 + 0.45, 0.45, 0.1, bcx, 3.98, bz1);
  lettering(k, bcx, 4.06, bz1 + 0.05, (bx1 - bx0) * 0.75, 0.3, '#f7f7f2', true);
  for (const z of [bz0 + 0.3, bz1 - 0.3]) k.cyl('#d8d8d4', 0.12, 0.12, 4.0, bx0 + 0.3, 0, z, 6);
  ambulance(k, bcx, bcz - 0.3, 0);
  ambulance(k, -bcx - 0.5, bz1 + 3.0, 0.35);

  // Forecourt fountain / round planter.
  k.cyl(base, 1.8, 1.9, 0.5, -bcx, 0, front + 6.5, 14);
  k.cyl('#5d8fa8', 1.55, 1.55, 0.06, -bcx, 0.46, front + 6.5, 14, 'glass');
  k.cyl(trim, 0.25, 0.35, 1.3, -bcx, 0.5, front + 6.5, 8);

  // Plaza details.
  const fz = Math.min(s.hd - 2, bz1 + 6);
  for (const [i, x] of [-s.hw + 2.2, -s.hw + 3.6, -s.hw + 5.0].entries()) {
    flagpole(k, x, fz, 8, ['#24395c', '#efeee8', '#b03a2e'][i], i === 1 ? '#f2c14e' : undefined);
  }
  for (const sx of [-1, 1]) {
    planter(k, sx * 3.5, s.hd - 1.6, 2.4, 1.0, true);
    planter(k, sx * 8.5, s.hd - 1.6, 2.4, 1.0, true);
    lamp(k, sx * 6, bz1 + 1.2);
    tree(k, sx * (s.hw - 2.2), front + 1, 6);
    tree(k, sx * (s.hw - 2.2), front + 7.5, 6);
    tree(k, sx * (s.hw - 2.2), mz - 1, 6.5);
    bench(k, sx * (s.hw - 4.2), fz - 1.5, sx * -PI / 2);
  }
  for (const x of [-s.hw + 3, 0, s.hw - 3]) tree(k, x * 0.85, -s.hd + 2.2, 6);
  crowd(k, 8, -5, 5, front + 3, bz1 + 4);
  person(k, bcx + 1.6, bcz + 2, PI, '#3f8f8a');
  person(k, bcx - 1.6, bcz + 1.5, 0.4, '#3f8f8a');
}

// ---------------------------------------------------------------------------
// Fire station: brick hall with three red bay doors, hose tower, two fire engines.
// ---------------------------------------------------------------------------
export function fireStation(k: Kit, s: Site): void {
  const brick = k.pick(['#9c4a36', '#8a4b33', '#a85a3e']);
  const trim = '#efe6d4';
  const base = '#8a8580';
  const roof = k.pick(['#9aa0a6', '#6f7a86']);
  const red = '#c8231e';

  const tw = 5;
  const towerX = -s.hw + 2.2 + tw / 2;
  const hx0 = towerX + tw / 2 + 0.6;
  const hx1 = s.hw - 2.5;
  const hw = hx1 - hx0;
  const hx = (hx0 + hx1) / 2;
  const hd = 13;
  const hFront = Math.min(1.5, s.hd - 15.5);
  const hz = hFront - hd / 2;
  const groundH = 5.6;

  const H = wing(k, {
    x: hx, z: hz, w: hw, d: hd, floors: 2, groundH, floorH: 3.4,
    wall: brick, trim, base, faces: { front: true, back: true, left: true, right: true },
    skip: (f, _u, fl) => f === 'front' && fl === 0,
  });
  // Hip roof with a little bell cupola.
  k.frust(roof, hw + 0.8, hd + 0.8, Math.max(2, hw - 7), 1.2, 3.0, hx, H, hz);
  k.box(trim, 1.6, 1.6, 1.6, hx + hw / 4, H + 2.4, hz);
  k.cone(roof, 1.3, 1.4, hx + hw / 4, H + 4.0, hz, 4, PI / 4);
  k.box(brick, 0.9, 2.2, 0.7, hx - hw / 3, H + 0.8, hz - 2);

  // Three bay doors with stone frames.
  const doorW = 4.6;
  const doorH = 4.4;
  const spacing = Math.min(6.2, (hw - 1.5) / 3);
  const doorXs = [-spacing, 0, spacing].map((u) => hx + u);
  k.at(hx, hFront, 0, () => {
    for (const u of [-spacing, 0, spacing]) {
      k.box(red, doorW, doorH, 0.12, u, 0, 0.02);
      for (let i = 1; i < 7; i++) k.box('#a81c18', doorW, 0.07, 0.08, u, i * 0.62, 0.1);
      for (let i = 0; i < 4; i++) k.glass(k.chance(0.6), 0.95, 0.5, 0.06, u - 1.65 + i * 1.1, 2.9, 0.1, '#3a4a58');
      k.box(trim, 0.4, doorH + 0.2, 0.32, u - doorW / 2 - 0.2, 0, 0.16);
      k.box(trim, 0.4, doorH + 0.2, 0.32, u + doorW / 2 + 0.2, 0, 0.16);
      k.box(trim, doorW + 1.0, 0.5, 0.4, u, doorH + 0.1, 0.2);
      k.box(trim, 0.6, 0.6, 0.45, u, doorH + 0.05, 0.25);
    }
    // Sign band with lit lettering.
    k.box(trim, hw - 1, 0.12, 0.25, 0, 4.95, 0.12);
    lettering(k, 0, 5.1, 0.05, Math.min(13, hw - 3), 0.7, '#f7f3ea', true);
    // Side entrance door.
    k.glass(true, 1.2, 2.5, 0.06, hw / 2 - 0.9, 0, 0.0, '#5a4a3a');
    k.box(trim, 1.6, 0.3, 0.3, hw / 2 - 0.9, 2.5, 0.15);
  });

  // Hose tower.
  const th = 21;
  const tz = hz - 1;
  k.box(brick, tw, th, tw, towerX, 0, tz);
  k.box(base, tw + 0.16, 0.9, tw + 0.16, towerX, 0, tz);
  for (let y = 4; y < th; y += 4) k.box(trim, tw + 0.14, 0.2, tw + 0.14, towerX, y, tz);
  for (const f of ['front', 'right', 'back', 'left'] as const) {
    onFace(k, f, towerX, tz, tw, tw, () => {
      for (let y = 5; y < th - 3; y += 4) windowAt(k, 0, y, 0.8, 1.6, k.chance(0.25), { frame: trim });
    });
  }
  // Belvedere top with corner piers, pyramid roof, flag.
  k.box(trim, tw + 0.5, 0.35, tw + 0.5, towerX, th, tz);
  k.glass(false, tw - 0.8, 2.4, tw - 0.8, towerX, th + 0.35, tz, '#1e2328');
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) k.box(brick, 0.8, 2.4, 0.8, towerX + dx * (tw / 2 - 0.4), th + 0.35, tz + dz * (tw / 2 - 0.4));
  k.box(trim, tw + 0.6, 0.35, tw + 0.6, towerX, th + 2.75, tz);
  k.frust(roof, tw + 0.6, tw + 0.6, 0.3, 0.3, 3.6, towerX, th + 3.1, tz);
  k.cyl('#d8d8d4', 0.04, 0.05, 2.6, towerX, th + 6.6, tz, 5);
  k.box('#b03a2e', 1.2, 0.8, 0.04, towerX + 0.62, th + 8.3, tz);
  k.glass(true, 0.3, 0.3, 0.3, towerX, th + 9.2, tz, '#ff6a4a');

  // Apron with lane markings.
  const az0 = hFront;
  const az1 = s.hd - 0.6;
  k.box('#c9c6bf', hw, 0.03, az1 - az0, hx, 0, (az0 + az1) / 2);
  for (const u of [-1.5, -0.5, 0.5, 1.5]) k.box('#f2c14e', 0.12, 0.02, az1 - az0 - 1, hx + u * spacing, 0.03, (az0 + az1) / 2);
  for (let i = 0; i < 8; i++) k.box('#f2c14e', 0.4, 0.02, 1.4, hx - hw / 2 + 1.5 + i * ((hw - 3) / 7), 0.03, az1 - 1, PI / 4);

  // Fire engines in front of doors 1 and 2, a command car at door 3.
  fireEngine(k, doorXs[0], az0 + 5.0, 0);
  fireEngine(k, doorXs[1], az0 + 5.6, 0);
  car(k, doorXs[2], az0 + 4.0, 0, '#c8231e');
  k.box('#f4f4f0', 1.84, 0.18, 4.42, doorXs[2], 0.62, az0 + 4.0);

  // Firefighters, hydrant, hose reel, plaza details.
  for (let i = 0; i < 4; i++) person(k, doorXs[0] + 2.4 + k.range(-0.5, 0.5), az0 + 3 + i * 1.6, k.range(0, 2 * PI), '#c9a640');
  k.cyl(red, 0.18, 0.2, 0.8, towerX - 0.5, 0, s.hd - 2.5, 8);
  k.cyl(red, 0.26, 0.26, 0.2, towerX - 0.5, 0.6, s.hd - 2.5, 8);
  k.cyl(red, 0.55, 0.55, 0.35, towerX + 1.2, 0, tz + tw / 2 + 1.0, 12);
  flagpole(k, towerX - 1.0, s.hd - 1.2, 7, '#24395c');
  planter(k, towerX + 1.0, s.hd - 1.3, 1.2, 1.2, true);
  lamp(k, towerX + 0.5, hFront + 2);
  bench(k, towerX - 1, hFront + 5, PI / 2);
  for (const z of [hz - hd / 2 - 1.2]) for (const x of [hx - hw / 3, hx, hx + hw / 3]) tree(k, x, z, 6);
  tree(k, s.hw - 2.3, hz - 3, 6.5);
}

// ---------------------------------------------------------------------------
// Supermarket: glass-front hall with a big sign band, car park and trolley shelter.
// ---------------------------------------------------------------------------
export function supermarket(k: Kit, s: Site): void {
  const brand = k.pick(['#d62828', '#2f6b4f', '#e07a1f', '#24395c']);
  const accent = k.pick(['#f2c14e', '#efeee8']);
  const clad = k.jit('#e6e1d6', 0.02);
  const dark = '#3b4048';
  const w = Math.min(28, s.W - 6);
  const d = 13;
  const z0 = -s.hd + 2;
  const zf = z0 + d;
  const cz = z0 + d / 2;
  const H = 7;

  // Hall body, cladding ribs on sides and back.
  k.box(clad, w, H, d, 0, 0, cz);
  k.box('#a9a49a', w + 0.1, 0.6, d + 0.1, 0, 0, cz);
  for (let x = -w / 2 + 1.5; x < w / 2 - 0.5; x += 1.5) k.box('#d5cfc2', 0.15, H - 0.6, 0.1, x, 0.6, z0 - 0.02);
  for (let z = z0 + 1.5; z < zf - 0.5; z += 1.5) {
    k.box('#d5cfc2', 0.1, H - 0.6, 0.15, -w / 2 - 0.02, 0.6, z);
    k.box('#d5cfc2', 0.1, H - 0.6, 0.15, w / 2 + 0.02, 0.6, z);
  }
  // Parapet.
  k.box(clad, w, 0.9, 0.3, 0, H, z0 + 0.15);
  k.box(clad, 0.3, 0.9, d, -w / 2 + 0.15, H, cz);
  k.box(clad, 0.3, 0.9, d, w / 2 - 0.15, H, cz);

  // Glass front: mullions, transom, sliding doors.
  k.at(0, zf, 0, () => {
    const n = Math.floor(w / 2);
    const pw = w / n;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + pw * (i + 0.5);
      k.glass(k.chance(0.85), pw - 0.12, 4.4, 0.08, x, 0.2, 0.02, '#6f8fa3');
    }
    for (let i = 0; i <= n; i++) k.box(dark, 0.14, 4.6, 0.2, -w / 2 + pw * i, 0.1, 0.1);
    k.box(dark, w, 0.2, 0.22, 0, 4.6, 0.1);
    k.box(dark, w, 0.15, 0.22, 0, 0.05, 0.1);
    k.box('#c9ccd0', 4.2, 3.0, 0.1, 0, 0.2, 0.18);
    k.glass(true, 3.8, 2.8, 0.06, 0, 0.2, 0.25, '#4a6a7a');
    // Sign band with logo and lit letters.
    k.box(brand, w + 0.2, 2.3, 0.4, 0, 4.8, 0.2);
    k.box(accent, w + 0.25, 0.12, 0.45, 0, 4.8, 0.2);
    k.box(accent, 1.8, 1.6, 0.12, -w * 0.22 - 1.6, 5.15, 0.42);
    lettering(k, w * 0.05, 5.25, 0.42, Math.min(14, w * 0.45), 1.3, '#ffffff', true);
    // Entrance canopy.
    k.box('#e9e6df', 11, 0.3, 3.0, 0, 3.6, 1.5);
    k.box(brand, 11.1, 0.4, 0.1, 0, 3.55, 3.0);
    for (const x of [-5.2, 5.2]) k.cyl('#c9ccd0', 0.1, 0.1, 3.6, x, 0, 2.8, 6);
  });

  // Roof: solar panels, skylights and plant.
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < Math.floor((w - 6) / 2.4); i++) {
      k.boxR('glass', '#1f2f4a', 2.2, 0.06, 1.6, [-w / 2 + 2.5 + i * 2.4, H + 0.55, z0 + 2.2 + r * 2.2], [-0.3, 0, 0]);
    }
  }
  for (let i = 0; i < 3; i++) k.glass(false, w * 0.18, 0.4, 1.0, -w / 4 + i * (w / 4), H, zf - 2.5, '#6a7a88');
  roofClutter(k, w / 2 - 4, z0 + 4, 6, 6, H, 4);

  // Car park.
  const pz0 = zf + 3.2;
  const pz1 = s.hd - 0.3;
  const bayW = 2.5;
  const bayL = 5;
  const n = Math.floor((w + 2) / bayW);
  const x0 = -(n * bayW) / 2;
  k.box('#4a4a50', n * bayW + 1, 0.03, pz1 - pz0, 0, 0, (pz0 + pz1) / 2);
  const rowA = pz0 + 0.3;
  const rowB = pz1 - bayL - 0.2;
  bays(k, x0, rowA, n, bayW, bayL);
  bays(k, x0, rowB, n, bayW, bayL);
  k.box('#efeee8', n * bayW, 0.02, 0.12, 0, 0.04, rowA + bayL);
  k.box('#efeee8', n * bayW, 0.02, 0.12, 0, 0.04, rowB);
  // Zebra path to the entrance.
  for (let i = 0; i < 6; i++) k.box('#efeee8', 2.6, 0.02, 0.45, 0, 0.04, zf + 3.5 + i * 0.85 - 0.0);
  const mid = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * bayW;
    // row A: disabled bays near the entrance, path kept free in the middle
    if (i === mid || i === mid - 1) continue;
    if (i === mid - 2 || i === mid + 1) {
      k.box('#3f6e8f', bayW - 0.3, 0.02, bayL - 0.4, cx, 0.04, rowA + bayL / 2);
    }
    if (i >= n - 2) continue; // trolley shelter
    if (k.chance(0.6)) car(k, cx, rowA + bayL / 2, PI, k.pick(CAR_COLORS));
  }
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * bayW;
    if (k.chance(0.55)) car(k, cx, rowB + bayL / 2, k.chance(0.7) ? 0 : PI, k.pick(CAR_COLORS));
  }
  // Trolley shelter.
  const tx = x0 + (n - 1) * bayW;
  const tzc = rowA + bayL / 2;
  k.box(brand, bayW * 2 - 0.2, 0.15, bayL - 0.6, tx, 2.3, tzc);
  for (const dx of [-bayW + 0.2, bayW - 0.2]) for (const dz of [-bayL / 2 + 0.5, bayL / 2 - 0.5]) k.cyl('#c9ccd0', 0.06, 0.06, 2.3, tx + dx, 0, tzc + dz, 5);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) k.box('#b8bcc2', 0.6, 0.95, 0.75, tx - 0.8 + r * 1.6, 0.05, tzc - 1.6 + i * 0.55);
  // Car park lamps.
  const aisle = (rowA + bayL + rowB) / 2;
  for (const x of [-w / 3, 0, w / 3]) {
    k.cyl('#5a5f66', 0.08, 0.12, 7, x, 0, aisle, 6);
    k.box('#5a5f66', 2.4, 0.15, 0.3, x, 7, aisle);
    for (const dx of [-1.1, 1.1]) k.glass(true, 0.6, 0.12, 0.35, x + dx, 6.9, aisle, '#f6f1e0');
  }
  // Totem sign.
  k.at(-s.hw + 1.3, pz0 - 1.2, 0, () => {
    k.box(brand, 1.4, 7, 0.5, 0, 0, 0);
    k.glass(true, 1.1, 1.1, 0.06, 0, 5.4, 0.26, '#ffffff');
    k.box(accent, 0.8, 0.8, 0.08, 0, 5.55, 0.3);
    lettering(k, 0, 3.4, 0.25, 1.1, 0.35, '#ffffff', true);
  });
  // Shoppers, planters, trees.
  for (let i = 0; i < 6; i++) person(k, k.range(-5, 5), zf + k.range(1, 3), k.range(0, 2 * PI));
  for (const sx of [-1, 1]) {
    planter(k, sx * 7.5, zf + 1.6, 2.6, 0.9, true);
    tree(k, sx * (s.hw - 1.6), z0 + 2.4, 5.5);
    tree(k, sx * (s.hw - 1.6), z0 + 8, 5.5);
  }
  for (const x of [-w / 4, w / 4]) bench(k, x, zf + 1.0, PI);
}
