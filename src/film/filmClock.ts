// Auto film clock: film seconds from real time while an auto film runs. Module state (not React) so the camera
// rig and the film rig read it per frame. The auto film starter calls startAutoFilmClock() before it sets
// toggles.filming, and stopAutoFilmClock() when the film ends. Idle: time reads 0 and nothing runs.
let startedMs = 0;
let running = false;

export function startAutoFilmClock(nowMs: number = performance.now()): void {
  startedMs = nowMs;
  running = true;
}

export function stopAutoFilmClock(): void {
  running = false;
}

export function isAutoFilmClockRunning(): boolean {
  return running;
}

/** Film seconds since the auto film started; 0 when idle. Not clamped: the path clamps to its own length. */
export function autoFilmTime(nowMs: number = performance.now()): number {
  return running ? Math.max(0, (nowMs - startedMs) / 1000) : 0;
}
