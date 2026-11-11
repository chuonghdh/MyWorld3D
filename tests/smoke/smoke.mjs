/* global process, fetch, setTimeout, document, Event, HTMLInputElement, console */
// Headless smoke (T-0010). Run: npm run smoke (needs dist: npx vite build first).
// Serves dist with vite preview, opens it in headless Chromium (software GL) and fails on:
//   - any console.error, pageerror, failed request or HTTP 4xx/5xx for an app file;
//   - a blank or flat canvas by night (00:00) or by day (12:00), or a day frame not brighter than the night frame;
//   - draw calls or triangles per frame above the caps below.
// Draw calls and triangles come from wrapping the WebGL draw methods in an init script (no src/ hook, see counters.mjs).
// One "frame" is everything issued between two requestAnimationFrame ticks (shadow pass + main pass + post passes).
//
// Caps. Static estimate in tests/budget.test.ts: main <= 1,900,000 tri, main + shadow <= 2,300,000 tri, draw calls <= 140
// (main + shadow meshes). The live frame also draws what that estimate leaves out (moving cars, walkers, aircraft,
// clouds, sky, weather, post-processing passes) and counts a mesh once per pass. So the caps here are the measured
// live median plus a margin (see CAPS), not the budget numbers. A bigger live number is a regression to explain.
// Console noise ignored (software renderer only): GPU stall and swiftshader performance warnings.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { INIT_SCRIPT, frameStats, waitFrames } from './counters.mjs';
import { analyseCanvas } from './pixels.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 4173;
const URL = `http://localhost:${PORT}/`;

// Measured median per frame, 2026-11-11, default settings, 1280x720, swiftshader: 156 to 182 draw calls, 1.87 M to 2.36 M triangles
// (varies with moving actors and time of day). CAPS sit about 40% above.
const CAPS = { drawCalls: 260, triangles: 3_200_000 };
const MIN_BUCKETS = 8; // distinct colour buckets in a frame; a flat canvas has 1 or 2
const MIN_STD = 4; // luminance standard deviation (0..255)
const MIN_DAY_OVER_NIGHT = 10; // mean luminance gap
const IGNORED_CONSOLE = [/GPU stall/i, /swiftshader/i, /ReadPixels/i];
const SAMPLE_FRAMES = 5; // software GL draws one frame in several seconds

const failures = [];
const fail = (msg) => failures.push(msg);

function startPreview() {
  const vite = resolve(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  return { child, log: () => log };
}

async function waitForServer(preview) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(URL);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    if (preview.child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite preview did not start:\n${preview.log()}`);
}

async function setLight(page, hour) {
  await page.evaluate((h) => {
    const el = document.getElementById('light');
    if (!el) throw new Error('Light slider (#light) not found');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(h));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, hour);
  await waitFrames(page, 2); // the change reaches the store, then the next frame draws it
}

async function frameLook(page, label) {
  const look = await analyseCanvas(page);
  if (look.buckets < MIN_BUCKETS || look.std < MIN_STD) fail(`${label}: canvas looks blank (buckets ${look.buckets}, std ${look.std.toFixed(1)})`);
  return look;
}

async function run() {
  if (!existsSync(resolve(ROOT, 'dist', 'index.html'))) throw new Error('dist/index.html missing: run `npx vite build` first');
  const preview = startPreview();
  let browser;
  try {
    await waitForServer(preview);
    browser = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(INIT_SCRIPT);
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (!IGNORED_CONSOLE.some((re) => re.test(t))) fail(`console.error: ${t}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => {
      if (r.url().startsWith(URL)) fail(`request failed: ${r.url()} (${r.failure()?.errorText})`);
    });
    page.on('response', (r) => {
      if (r.url().startsWith(URL) && r.status() >= 400) fail(`HTTP ${r.status()}: ${r.url()}`);
    });

    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas', { timeout: 30000 });
    await page.waitForSelector('#light', { timeout: 30000 });
    await waitFrames(page, 3);

    await setLight(page, 0);
    const night = await frameLook(page, 'night');
    await setLight(page, 12);
    const day = await frameLook(page, 'day');
    if (!(day.mean > night.mean + MIN_DAY_OVER_NIGHT)) fail(`day frame not brighter than night (day ${day.mean.toFixed(1)}, night ${night.mean.toFixed(1)})`);

    const stats = await frameStats(page, SAMPLE_FRAMES);
    if (stats.frames < SAMPLE_FRAMES) fail(`only ${stats.frames} frames sampled`);
    if (stats.drawCalls > CAPS.drawCalls) fail(`draw calls ${stats.drawCalls} > cap ${CAPS.drawCalls}`);
    if (stats.triangles > CAPS.triangles) fail(`triangles ${stats.triangles} > cap ${CAPS.triangles}`);

    console.log(
      `smoke: ${failures.length ? 'FAIL' : 'ok'} | draw calls ${stats.drawCalls} (cap ${CAPS.drawCalls}, max ${stats.maxCalls}) | triangles ${stats.triangles} (cap ${CAPS.triangles}, max ${stats.maxTriangles}) | frames ${stats.frames} | luma day ${day.mean.toFixed(1)} night ${night.mean.toFixed(1)}`,
    );
  } finally {
    if (browser) await browser.close();
    preview.child.kill();
  }
}

try {
  await run();
} catch (e) {
  fail(`smoke error: ${e instanceof Error ? e.message : e}`);
}
if (failures.length) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
