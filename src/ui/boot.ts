// Boot screen helpers. The spinner markup and its error fallback live inline in index.html so they show before any
// script runs; the scene calls bootDone() after its first rendered frame.

const BOOT_ID = 'mw-boot';
/** Matches the CSS fade in index.html. */
const FADE_MS = 450;

/** Fades the boot spinner out and removes it. Safe to call more than once, and without a DOM (tests). */
export function bootDone(): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(BOOT_ID);
  if (!el || el.classList.contains('is-done') || el.getAttribute('role') === 'alert') return;
  el.classList.add('is-done');
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => el.remove(), reduce ? 0 : FADE_MS);
}

/** Removes the boot screen at once (the React error panel takes over). */
export function bootRemove(): void {
  if (typeof document === 'undefined') return;
  document.getElementById(BOOT_ID)?.remove();
}
