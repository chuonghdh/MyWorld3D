/* global window */
// WebGL draw-call and triangle counter for the smoke. INIT_SCRIPT runs in the page before the app (Playwright
// addInitScript): it wraps the draw methods of WebGL1 and WebGL2 contexts and, once per requestAnimationFrame tick,
// pushes the tally of the frame just finished to window.__smokeFrames. Triangles: TRIANGLES count/3, STRIP and FAN
// count-2; instanced calls multiply by the instance count. Points and lines count as 0 triangles but as draw calls.

export const INIT_SCRIPT = `(() => {
  const frames = [];
  let calls = 0, tris = 0;
  // Keep the drawing buffer so the last frame can be read back after it was presented (pixels.mjs).
  const getCtx = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (typeof type === 'string' && type.indexOf('webgl') === 0) attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
    return getCtx.call(this, type, attrs);
  };
  window.__smokeFrames = frames;
  const perPrim = (mode, n) => (mode === 4 ? n / 3 : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0);
  const wrap = (proto) => {
    const w = (name, countIdx, instIdx) => {
      const orig = proto[name];
      if (!orig) return;
      proto[name] = function (...a) {
        calls += 1;
        tris += perPrim(a[0], a[countIdx]) * (instIdx === null ? 1 : a[instIdx]);
        return orig.apply(this, a);
      };
    };
    w('drawArrays', 2, null);
    w('drawElements', 1, null);
    w('drawArraysInstanced', 2, 3);
    w('drawElementsInstanced', 1, 4);
    w('drawRangeElements', 3, null);
  };
  if (window.WebGLRenderingContext) wrap(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) wrap(WebGL2RenderingContext.prototype);
  const tick = () => {
    if (calls > 0) { frames.push({ calls, tris }); if (frames.length > 400) frames.shift(); }
    calls = 0; tris = 0;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

/** Wait until the page has finished n more frames (software GL needs seconds per frame). Returns the new frames. */
export async function waitFrames(page, n) {
  const start = await page.evaluate(() => window.__smokeFrames.length);
  await page.waitForFunction(([s, k]) => window.__smokeFrames.length >= s + k, [start, n], { timeout: 180000, polling: 250 });
  return page.evaluate(([s, k]) => window.__smokeFrames.slice(s, s + k), [start, n]);
}

/** Median and max of draw calls and triangles over n new frames. */
export async function frameStats(page, n) {
  const frames = await waitFrames(page, n);
  const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const calls = frames.map((f) => f.calls);
  const tris = frames.map((f) => f.tris);
  return {
    frames: frames.length,
    drawCalls: Math.round(med(calls)),
    triangles: Math.round(med(tris)),
    maxCalls: Math.max(0, ...calls),
    maxTriangles: Math.round(Math.max(0, ...tris)),
  };
}
