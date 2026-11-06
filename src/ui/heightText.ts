// Camera height label text. Pure: no DOM, no React.

/** "Height 25.0 m" below 100 m (one decimal), "Height 412 m" from 100 m up. Negative heights show as 0. */
export function formatHeight(h: number): string {
  const v = Number.isFinite(h) ? Math.max(0, h) : 0;
  return Number(v.toFixed(1)) < 100 ? `Height ${v.toFixed(1)} m` : `Height ${Math.round(v)} m`;
}
