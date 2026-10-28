// Pure helpers for the UI layer (no React, no DOM requirements, so they run under vitest in node).

/** True when the viewport matches the (narrow) query. Safe without a DOM (returns false). */
export function isNarrowViewport(
  query = '(max-width: 600px)',
  win: { matchMedia?: (q: string) => { matches: boolean } } | undefined = typeof window === 'undefined' ? undefined : window,
): boolean {
  try {
    return !!win?.matchMedia?.(query).matches;
  } catch {
    return false;
  }
}

/** Screenshot file name: myworld3d-<seed>-<YYYYMMDD-HHMMSS>.png, using the local time of `date`. */
export function screenshotFilename(seed: number, date: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const stamp =
    `${p(date.getFullYear(), 4)}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `myworld3d-${Math.trunc(seed)}-${stamp}.png`;
}

/** Keys that toggle the help overlay. */
export function isHelpKey(key: string): boolean {
  return key === 'h' || key === 'H' || key === '?';
}
