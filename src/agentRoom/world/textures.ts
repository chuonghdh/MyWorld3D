// Procedural CanvasTextures for the room, built once and seeded (roomSeed). No image assets.
import * as THREE from 'three';
import { mulberry32 } from '../engine/sim';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Dark floor tiles, 1 tile per texture repeat, value noise per tile, 1 px seams. */
export function floorTexture(seed: number, w: number, d: number): THREE.CanvasTexture {
  const px = 64;
  const [c, g] = canvas(px * 8, px * 8);
  const rnd = mulberry32(seed);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const v = 40 + Math.floor(rnd() * 8);
      g.fillStyle = `rgb(${v} ${v + 9} ${v + 24})`;
      g.fillRect(x * px, y * px, px, px);
    }
  g.fillStyle = '#0a0f18';
  for (let i = 0; i <= 8; i++) {
    g.fillRect(i * px, 0, 1, px * 8);
    g.fillRect(0, i * px, px * 8, 1);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / 8, d / 8); // 8 one-metre tiles per image
  return t;
}

/** Warm wood planks for the pantry floor (0.2 m boards, staggered joints), 2 m per image. */
export function plankTexture(seed: number, w: number, d: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const rnd = mulberry32(seed + 29);
  for (let row = 0; row < 10; row++) {
    const off = rnd() * 256;
    for (let k = -1; k < 2; k++) {
      const v = rnd() * 14;
      g.fillStyle = `rgb(${92 + v} ${70 + v * 0.8} ${52 + v * 0.5})`;
      g.fillRect(off + k * 256, row * 25.6, 256, 25.6);
      g.fillStyle = 'rgb(40 30 22)';
      g.fillRect(off + k * 256, row * 25.6, 2, 25.6);
    }
    g.fillRect(0, row * 25.6, 256, 1);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / 2, d / 2);
  return t;
}

/** Scrolling "code" lines in white (tinted per screen by instance colour). Scroll via offset.y. */
export function codeTexture(seed: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 512);
  const rnd = mulberry32(seed + 7);
  g.fillStyle = '#05070a';
  g.fillRect(0, 0, 256, 512);
  for (let y = 10; y < 512; y += 14) {
    let x = 12 + Math.floor(rnd() * 4) * 14;
    const n = 1 + Math.floor(rnd() * 4);
    for (let k = 0; k < n && x < 240; k++) {
      const w = 12 + Math.floor(rnd() * 60);
      const a = 0.35 + rnd() * 0.65;
      g.fillStyle = `rgb(255 255 255 / ${a})`;
      g.fillRect(x, y, Math.min(w, 244 - x), 6);
      x += w + 8;
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Lit office windows for the skyline (emissive map). */
export function windowsTexture(seed: number): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256);
  const rnd = mulberry32(seed + 13);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 256);
  for (let y = 4; y < 256; y += 10)
    for (let x = 4; x < 128; x += 9) {
      if (rnd() < 0.36) {
        const warm = rnd() < 0.7;
        g.fillStyle = warm ? `rgb(255 ${190 + Math.floor(rnd() * 40)} 130)` : 'rgb(170 210 255)';
        g.fillRect(x, y, 5, 6);
      }
    }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Blue-hour sky gradient for the far backdrop. */
export function skyTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(4, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#0a1530');
  grd.addColorStop(0.55, '#23365f');
  grd.addColorStop(0.8, '#5a5878');
  grd.addColorStop(1, '#b07a6a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  return tex(c);
}
