/* global process, console, window, document, Buffer */
// Pedestrian close-up capture and people cost baseline (T-0020). Run: npm run smoke:closeup (needs dist: npx vite build).
// Camera: see closeupHook.mjs (no src/ hook). For each subject (adult, child, elder, teen, dog) and distance (3, 8, 25 m) it
// saves a PNG by day (12:00) and night (00:00), and 3 m and 8 m in rain. PNGs go to the OS temp dir, never the repo
// (override with CLOSEUP_DIR). Then it prints the baseline: triangles per person, instances, frame cost with the people
// group hidden or without shadow casting (the difference is what people cost, all passes included).
// Software GL draws a frame in 5 to 10 s, so a full run takes many minutes; CLOSEUP_SUBJECTS=adult,dog and
// CLOSEUP_DISTANCES=3,8 narrow it. SMOKE_BROWSER overrides the Chromium executable (see the scene-qa handbook).
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INIT_SCRIPT, frameStats, waitFrames } from './counters.mjs';
import { CLOSEUP_HOOK } from './closeupHook.mjs';
import { analyseCanvas } from './pixels.mjs';
import { URL, launchBrowser, setLight, startPreview, waitForServer } from './serve.mjs';

const OUT = process.env.CLOSEUP_DIR || join(tmpdir(), 'myworld3d-closeup');
// [name, mesh name, aim height above the feet in metres at scale 1]
const ALL_SUBJECTS = [
  ['adult', 'pedestrians-adult', 0.95],
  ['child', 'pedestrians-child', 0.95],
  ['elder', 'pedestrians-elder', 0.95],
  ['teen', 'pedestrians-teen', 0.95],
  ['dog', 'dogs', 0.35],
];
const list = (name, def) => (process.env[name] ? process.env[name].split(',') : def);
const SUBJECTS = ALL_SUBJECTS.filter(([n]) => list('CLOSEUP_SUBJECTS', ALL_SUBJECTS.map((s) => s[0])).includes(n));
const DISTANCES = list('CLOSEUP_DISTANCES', ['3', '8', '25']).map(Number);
const RAIN_MAX_DISTANCE = 8;
const SAMPLE_FRAMES = 5;
const failures = [];

async function savePng(page, file) {
  const url = await page.evaluate(() => {
    const src = document.querySelector('canvas');
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c.toDataURL('image/png');
  });
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}

/** Place the camera on instance 0 of a mesh and save a PNG. Returns a result line. */
async function shoot(page, tag, [name, farMesh, chest], distance) {
  // A person near the camera draws from the near mesh (T-0022); follow that one once the camera sits next to it.
  const nearName = farMesh.replace('pedestrians-', 'pedestrians-near-');
  const nearCount = farMesh === nearName ? 0 : await page.evaluate((m) => window.__closeup.scene.getObjectByName(m)?.count ?? 0, nearName);
  const mesh = nearCount > 0 ? nearName : farMesh;
  const count = await page.evaluate((m) => window.__closeup.scene.getObjectByName(m)?.count ?? 0, mesh);
  if (count < 1) return `${tag}: no ${name} instance`;
  await page.evaluate(([m, c, d]) => {
    window.__closeup.placed = false;
    window.__closeup.shot = { mesh: m, index: 0, distance: d, yaw: 0.6, lift: 0.15, chest: c };
  }, [mesh, chest, distance]);
  await waitFrames(page, 2); // the first frame may predate the shot
  const placed = await page.evaluate(() => window.__closeup.placed);
  if (!placed) return `${tag}: camera not placed`;
  const look = await analyseCanvas(page);
  await savePng(page, join(OUT, `${tag}.png`));
  return `${tag}: ok (luma ${look.mean.toFixed(0)}, buckets ${look.buckets})`;
}

function inspect() {
  const s = window.__closeup.scene;
  const rows = {};
  for (const n of ['pedestrians-adult', 'pedestrians-child', 'pedestrians-elder', 'pedestrians-teen', 'pedestrians-near-adult', 'pedestrians-near-child', 'pedestrians-near-elder', 'pedestrians-near-teen', 'dogs', 'leashes', 'umbrellas']) {
    const m = s.getObjectByName(n);
    const g = m.geometry;
    const verts = g.getAttribute('position').count;
    const tris = (g.index ? g.index.count : verts) / 3;
    rows[n] = { tris, verts, instances: m.count, capacity: m.instanceMatrix.count };
  }
  return rows;
}

async function costs(page) {
  const measure = async () => {
    await waitFrames(page, 2);
    return frameStats(page, SAMPLE_FRAMES);
  };
  const base = await measure();
  await page.evaluate(() => {
    window.__closeup.scene.traverse((o) => {
      if (o.name.startsWith('pedestrians-') || o.name === 'dogs' || o.name === 'umbrellas') {
        o.userData.cast = o.castShadow;
        o.castShadow = false;
      }
    });
  });
  const noShadow = await measure();
  await page.evaluate(() => {
    window.__closeup.scene.getObjectByName('people').visible = false;
  });
  const hidden = await measure();
  await page.evaluate(() => {
    window.__closeup.scene.traverse((o) => {
      if (o.userData.cast !== undefined) o.castShadow = o.userData.cast;
    });
    window.__closeup.scene.getObjectByName('people').visible = true;
  });
  return { base, noShadow, hidden };
}

async function sweep(page, label, lines) {
  for (const subject of SUBJECTS) for (const d of DISTANCES) lines.push(await shoot(page, `${label}-${subject[0]}-${d}m`, subject, d));
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  const preview = startPreview();
  let browser;
  try {
    await waitForServer(preview);
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(INIT_SCRIPT);
    await page.addInitScript(CLOSEUP_HOOK);
    page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas', { timeout: 30000 });
    await page.waitForSelector('#light', { timeout: 30000 });
    await waitFrames(page, 3);
    const hooked = await page.evaluate(() => Boolean(window.__closeup.scene && window.__closeup.renderer));
    if (!hooked) throw new Error('scene or renderer not observed (__THREE_DEVTOOLS__ hook)');

    await setLight(page, 12);
    await waitFrames(page, 3);
    const rows = await page.evaluate(inspect);
    const cost = await costs(page);
    const lines = [];
    await sweep(page, 'day', lines);
    await setLight(page, 0);
    await sweep(page, 'night', lines);
    await setLight(page, 12);
    const rainClicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[role="group"][aria-label="Weather"] button')].find((x) => /rain/i.test(x.textContent || ''));
      if (b) b.click();
      return Boolean(b);
    });
    if (rainClicked) {
      await waitFrames(page, 3);
      for (const subject of SUBJECTS) for (const d of DISTANCES.filter((x) => x <= RAIN_MAX_DISTANCE)) lines.push(await shoot(page, `rain-${subject[0]}-${d}m`, subject, d));
    } else lines.push('rain: Weather control not found, skipped');

    console.log(`closeup PNGs: ${OUT}`);
    for (const l of lines) console.log(`  ${l}`);
    console.log('meshes (triangles per instance, vertices, instances/capacity):');
    for (const [n, r] of Object.entries(rows)) console.log(`  ${n}: ${r.tris} tris, ${r.verts} verts, ${r.instances}/${r.capacity}`);
    const row = (n, s) => `  ${n}: draw calls ${s.drawCalls}, triangles ${s.triangles} (max ${s.maxTriangles}), frames ${s.frames}`;
    console.log('frame cost at the default camera, day, 1280x720, all passes:');
    console.log(row('as is', cost.base));
    console.log(row('people shadow casting off', cost.noShadow));
    console.log(row('people hidden', cost.hidden));
    console.log(`  people total: ${cost.base.drawCalls - cost.hidden.drawCalls} draw calls, ${cost.base.triangles - cost.hidden.triangles} triangles; people shadow pass: ${cost.base.drawCalls - cost.noShadow.drawCalls} draw calls, ${cost.base.triangles - cost.noShadow.triangles} triangles`);
    for (const l of lines) if (/no .* instance|not placed/.test(l)) failures.push(l);
  } finally {
    if (browser) await browser.close();
    preview.child.kill();
  }
}

try {
  await run();
} catch (e) {
  failures.push(`closeup error: ${e instanceof Error ? e.message : e}`);
}
if (failures.length) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
