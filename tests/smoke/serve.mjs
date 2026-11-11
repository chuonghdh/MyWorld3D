/* global process, fetch, setTimeout, document, Event, HTMLInputElement */
// Shared helpers for the headless scripts (smoke.mjs, closeup.mjs): vite preview of dist, browser launch, time of day.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { waitFrames } from './counters.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PORT = 4173;
export const URL = `http://localhost:${PORT}/`;

export function startPreview() {
  if (!existsSync(resolve(ROOT, 'dist', 'index.html'))) throw new Error('dist/index.html missing: run `npx vite build` first');
  const vite = resolve(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  return { child, log: () => log };
}

export async function waitForServer(preview) {
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

/** Software GL (swiftshader); SMOKE_BROWSER overrides the Chromium executable. */
export function launchBrowser() {
  return chromium.launch({ executablePath: process.env.SMOKE_BROWSER || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
}

export async function setLight(page, hour) {
  await page.evaluate((h) => {
    const el = document.getElementById('light');
    if (!el) throw new Error('Light slider (#light) not found');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(h));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, hour);
  await waitFrames(page, 2); // the change reaches the store, then the next frame draws it
}
