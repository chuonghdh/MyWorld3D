// Sign atlas layout: pure data, no DOM. Both the facade builder (UV lookup) and the atlas renderer
// (src/buildings/signs/atlas.ts) read this, so they always agree on where each sign lives.
//
// The atlas is a grid of equally sized cells. Every sign, fascia or blade, is a 4:1 panel that
// fills one cell, so one quad with UVs from signUv() shows the sign.

export const ATLAS_COLUMNS = 4;
export const ATLAS_ROWS = 8;
/** Pixels per cell; atlas size is (ATLAS_COLUMNS * CELL_W) x (ATLAS_ROWS * CELL_H). */
export const CELL_W = 512;
export const CELL_H = 128;

export type ShopType = 'cafe' | 'restaurant' | 'food' | 'shop' | 'service' | 'culture';

export interface SignDef {
  id: string;
  /** Text drawn on the sign, upper case. */
  text: string;
  /** Panel background colour. */
  bg: string;
  /** Lettering colour. */
  fg: string;
  /** Shop type the sign suits; the facade builder picks signs by shop type and seed. */
  shop: ShopType;
}

export const SIGNS: readonly SignDef[] = [
  { id: 'coffee', text: 'COFFEE', bg: '#2f3b2f', fg: '#f2e6c9', shop: 'cafe' },
  { id: 'cafe', text: 'CAFE', bg: '#7a2e2a', fg: '#f6efe0', shop: 'cafe' },
  { id: 'espresso', text: 'ESPRESSO', bg: '#1f2a44', fg: '#f3d9a4', shop: 'cafe' },
  { id: 'tea', text: 'TEA ROOM', bg: '#3f6e5a', fg: '#f6efe0', shop: 'cafe' },
  { id: 'restaurant', text: 'RESTAURANT', bg: '#24395c', fg: '#f6efe0', shop: 'restaurant' },
  { id: 'bistro', text: 'BISTRO', bg: '#7a2e2a', fg: '#efe1c2', shop: 'restaurant' },
  { id: 'pizza', text: 'PIZZERIA', bg: '#2f6b4f', fg: '#f6efe0', shop: 'restaurant' },
  { id: 'brasserie', text: 'BRASSERIE', bg: '#1d2a22', fg: '#e8c777', shop: 'restaurant' },
  { id: 'bar', text: 'BAR', bg: '#1c1c22', fg: '#f2c14e', shop: 'restaurant' },
  { id: 'wine', text: 'WINE BAR', bg: '#4a1f2b', fg: '#f1dcc0', shop: 'restaurant' },
  { id: 'bakery', text: 'BAKERY', bg: '#c9843f', fg: '#fff6e2', shop: 'food' },
  { id: 'deli', text: 'DELI', bg: '#6b2d2d', fg: '#f6efe0', shop: 'food' },
  { id: 'cheese', text: 'CHEESE', bg: '#e0b84a', fg: '#3a2c14', shop: 'food' },
  { id: 'fruit', text: 'FRUIT & VEG', bg: '#3f7d3a', fg: '#fdf6dd', shop: 'food' },
  { id: 'icecream', text: 'ICE CREAM', bg: '#e8a1b8', fg: '#4a2233', shop: 'food' },
  { id: 'flowers', text: 'FLOWERS', bg: '#f1e4e8', fg: '#8a2f55', shop: 'shop' },
  { id: 'books', text: 'BOOKS', bg: '#3a2f27', fg: '#f0dcb4', shop: 'shop' },
  { id: 'toys', text: 'TOYS', bg: '#2b5fa8', fg: '#ffe27a', shop: 'shop' },
  { id: 'boutique', text: 'BOUTIQUE', bg: '#1c1c22', fg: '#e9d9b0', shop: 'shop' },
  { id: 'antiques', text: 'ANTIQUES', bg: '#4b3a26', fg: '#e8d6a8', shop: 'shop' },
  { id: 'pharmacy', text: 'PHARMACY', bg: '#ffffff', fg: '#1f8f4a', shop: 'service' },
  { id: 'optician', text: 'OPTICIAN', bg: '#1f3a5a', fg: '#e9f1f7', shop: 'service' },
  { id: 'tailor', text: 'TAILOR', bg: '#3b3b44', fg: '#e8dcc0', shop: 'service' },
  { id: 'laundry', text: 'LAUNDRY', bg: '#2c6f9e', fg: '#ffffff', shop: 'service' },
  { id: 'hotel', text: 'HOTEL', bg: '#1c1c22', fg: '#e5c46b', shop: 'service' },
  { id: 'bank', text: 'BANK', bg: '#1f3a5a', fg: '#e6d089', shop: 'service' },
  { id: 'gallery', text: 'GALLERY', bg: '#f3efe7', fg: '#1c1c22', shop: 'culture' },
  { id: 'cinema', text: 'CINEMA', bg: '#7a1f2b', fg: '#f6e7b4', shop: 'culture' },
  { id: 'market', text: 'MARKET', bg: '#3f7d3a', fg: '#fdf6dd', shop: 'shop' },
  { id: 'bike', text: 'BIKE SHOP', bg: '#d9531e', fg: '#fff3e0', shop: 'shop' },
  { id: 'music', text: 'MUSIC', bg: '#2a1f44', fg: '#f0c8ff', shop: 'culture' },
  { id: 'museum', text: 'MUSEUM', bg: '#3a3f48', fg: '#efe7cf', shop: 'culture' },
];

export const SIGN_COUNT = SIGNS.length;

const indexById = new Map(SIGNS.map((s, i) => [s.id, i]));

export interface SignUv {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Index of a sign in SIGNS, or -1. */
export function signIndex(id: string): number {
  return indexById.get(id) ?? -1;
}

/**
 * Texture coordinates of a sign's cell. Cell 0 is the top-left of the atlas as seen on screen;
 * v runs upward (three.js convention with flipY), so row 0 has the highest v.
 */
export function signUv(index: number): SignUv {
  const i = ((index % SIGN_COUNT) + SIGN_COUNT) % SIGN_COUNT;
  const col = i % ATLAS_COLUMNS;
  const row = Math.floor(i / ATLAS_COLUMNS);
  return {
    u0: col / ATLAS_COLUMNS,
    u1: (col + 1) / ATLAS_COLUMNS,
    v1: 1 - row / ATLAS_ROWS,
    v0: 1 - (row + 1) / ATLAS_ROWS,
  };
}

/** Picks a sign of the given shop type(s) deterministically from r in 0..1. Returns an index into SIGNS. */
export function pickSign(shop: ShopType | readonly ShopType[], r: number): number {
  const kinds: readonly ShopType[] = typeof shop === 'string' ? [shop] : shop;
  const candidates: number[] = [];
  SIGNS.forEach((s, i) => {
    if (kinds.includes(s.shop)) candidates.push(i);
  });
  if (candidates.length === 0) return 0;
  return candidates[Math.floor(r * candidates.length) % candidates.length];
}
