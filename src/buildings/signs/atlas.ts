// Draws the sign atlas on a canvas (browser only). Layout comes from layout.ts.
import * as THREE from 'three';
import { ATLAS_COLUMNS, ATLAS_ROWS, CELL_H, CELL_W, SIGNS, type SignDef } from './layout';

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '"Arial Black", Impact, "Helvetica Neue", Arial, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCell(ctx: CanvasRenderingContext2D, def: SignDef, x0: number, y0: number): void {
  const classic = def.shop === 'cafe' || def.shop === 'restaurant';
  // Fill the whole cell so mip-map bleeding between cells stays close to the panel colour.
  ctx.fillStyle = def.bg;
  ctx.fillRect(x0, y0, CELL_W, CELL_H);
  ctx.strokeStyle = def.fg;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 3;
  if (classic) roundRect(ctx, x0 + 10, y0 + 10, CELL_W - 20, CELL_H - 20, 16);
  else roundRect(ctx, x0 + 8, y0 + 8, CELL_W - 16, CELL_H - 16, 4);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const margin = classic ? 64 : 40;
  const maxW = CELL_W - margin * 2;
  const family = classic ? SERIF : SANS;
  const weight = 'bold';
  let size = 78;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${size}px ${family}`;
  const w = ctx.measureText(def.text).width;
  if (w > maxW) size = Math.max(20, Math.floor((size * maxW) / w));
  ctx.font = `${weight} ${size}px ${family}`;
  const tw = ctx.measureText(def.text).width;
  ctx.fillStyle = def.fg;
  ctx.fillText(def.text, x0 + CELL_W / 2, y0 + CELL_H / 2 + 3);

  if (classic && tw < CELL_W - 190) {
    // Small ornament either side of the lettering: a diamond on a short rule.
    const cy = y0 + CELL_H / 2;
    for (const dir of [-1, 1]) {
      const edge = x0 + CELL_W / 2 + dir * (tw / 2 + 18);
      const end = edge + dir * 34;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(Math.min(edge, end), cy - 1.5, 34, 3);
      ctx.beginPath();
      ctx.moveTo(end + dir * 3, cy);
      ctx.lineTo(end + dir * 11, cy - 7);
      ctx.lineTo(end + dir * 19, cy);
      ctx.lineTo(end + dir * 11, cy + 7);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

/** Renders the whole atlas, or returns null where there is no DOM (node, tests). */
export function drawSignAtlas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLUMNS * CELL_W;
  canvas.height = ATLAS_ROWS * CELL_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  SIGNS.forEach((def, i) => {
    drawCell(ctx, def, (i % ATLAS_COLUMNS) * CELL_W, Math.floor(i / ATLAS_COLUMNS) * CELL_H);
  });
  return canvas;
}

let texture: THREE.CanvasTexture | null | undefined;

/** The shared atlas texture, or null without a canvas. */
export function getSignAtlasTexture(): THREE.CanvasTexture | null {
  if (texture !== undefined) return texture;
  const canvas = drawSignAtlas();
  if (!canvas) {
    texture = null;
    return null;
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  texture = t;
  return t;
}
