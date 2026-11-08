// Kanban board drawing (pure apart from the canvas): column mapping, card slots, and the draw call.
import type { AgentId, AgentSnapshot, Source, TaskState } from '../model/types';
import type { TaskCard, Shipped } from '../engine/state';
import { AGENT_COLOR, AGENT_LABEL } from './palette';
import { agentRoom } from '../../config/tuning';

export const BOARD_PX = { w: 1400, h: 1008 } as const; // same aspect as the 7.5 x 5.4 m board; type sized for the overview
export const TICKER_H = 72; // status ticker band, just above the footer
export const COLUMNS = ['Backlog', 'Active', 'Review', 'Done'] as const;
export type Column = (typeof COLUMNS)[number];

export function columnOf(state: TaskState): Column {
  switch (state) {
    case 'assigned':
    case 'in_progress':
      return 'Active';
    case 'verifying':
      return 'Review';
    case 'done':
      return 'Done';
    default:
      return 'Backlog'; // proposed, blocked, cancelled
  }
}

const HEAD = 84;
const FOOT = 112;
const CARD_H = 124;
const GAP = 12;
const MAX_ROWS = Math.floor((BOARD_PX.h - HEAD - FOOT - TICKER_H) / (CARD_H + GAP));

export interface Slot {
  x: number;
  y: number;
  hidden: boolean;
}

/** Card slots: per column, newest first; cards beyond the column height are hidden (counted in the header). */
export function cardSlots(tasks: Readonly<Record<string, TaskCard>>): Map<string, Slot> {
  const colW = BOARD_PX.w / COLUMNS.length;
  const byCol = new Map<Column, [string, TaskCard][]>();
  for (const [id, c] of Object.entries(tasks)) {
    const col = columnOf(c.state);
    byCol.set(col, [...(byCol.get(col) ?? []), [id, c]]);
  }
  const out = new Map<string, Slot>();
  COLUMNS.forEach((col, ci) => {
    const list = (byCol.get(col) ?? []).sort((a, b) => b[1].t - a[1].t || a[0].localeCompare(b[0]));
    list.forEach(([id], r) => out.set(id, { x: ci * colW + 10, y: HEAD + r * (CARD_H + GAP), hidden: r >= MAX_ROWS }));
  });
  return out;
}

export function columnCounts(tasks: Readonly<Record<string, TaskCard>>): Record<Column, number> {
  const n = { Backlog: 0, Active: 0, Review: 0, Done: 0 } as Record<Column, number>;
  for (const c of Object.values(tasks)) n[columnOf(c.state)]++;
  return n;
}

const FONT = "'Segoe UI', system-ui, sans-serif";

/** Column label; with the picture behind the board it gets a thin dark outline for readability. */
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, outlined: boolean): void {
  if (outlined) {
    g.lineJoin = 'round';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(6, 10, 18, 0.9)';
    g.strokeText(text, x, y);
  }
  g.fillText(text, x, y);
}

export function drawBoard(
  g: CanvasRenderingContext2D,
  tasks: Readonly<Record<string, TaskCard>>,
  pos: Map<string, { x: number; y: number }>,
  slots: Map<string, Slot>,
  shipped: Shipped,
  source: Source,
  agents: readonly AgentSnapshot[] = [],
  bg: HTMLImageElement | null = null,
): void {
  const { w, h } = BOARD_PX;
  const colW = w / COLUMNS.length;
  if (bg) {
    // City picture, cover-fitted, then a dark translucent panel so the text stays readable.
    const s = Math.max(w / bg.width, h / bg.height);
    const dw = bg.width * s;
    const dh = bg.height * s;
    g.drawImage(bg, (w - dw) / 2, (h - dh) / 2, dw, dh);
    g.fillStyle = `rgba(6, 10, 18, ${agentRoom.boardPanelOpacity})`;
    g.fillRect(0, 0, w, h);
  } else {
    g.fillStyle = '#16233a';
    g.fillRect(0, 0, w, h);
  }
  const counts = columnCounts(tasks);
  COLUMNS.forEach((col, i) => {
    g.fillStyle = i % 2 ? '#1a2a44' : '#172640';
    if (!bg) g.fillRect(i * colW, 0, colW, h - FOOT - TICKER_H); // with the picture, columns have no panel
    g.fillStyle = '#9ad7e6';
    g.font = `800 46px ${FONT}`;
    label(g, col.toUpperCase(), i * colW + 16, 56, !!bg);
    g.fillStyle = '#7c8797';
    g.font = `800 44px ${FONT}`;
    label(g, String(counts[col]), i * colW + colW - 64, 56, !!bg);
    g.fillStyle = '#263041';
    g.fillRect(i * colW + 10, 70, colW - 20, 5);
  });
  for (const [id, c] of Object.entries(tasks)) {
    const s = slots.get(id);
    const p = pos.get(id);
    if (!s || !p || s.hidden) continue;
    const owner = c.owner as AgentId;
    g.fillStyle = c.state === 'done' ? '#1f4a35' : '#26364f';
    g.fillRect(p.x, p.y, colW - 20, CARD_H);
    g.fillStyle = AGENT_COLOR[owner] ?? '#8a8f99';
    g.fillRect(p.x, p.y, 10, CARD_H);
    g.fillStyle = '#eef2f7';
    g.font = `800 46px ${FONT}`;
    g.fillText(id.length > 12 ? `${id.slice(0, 11)}…` : id, p.x + 24, p.y + 52);
    g.fillStyle = '#9aa3b2';
    g.font = `700 34px ${FONT}`;
    g.fillText(AGENT_LABEL[owner] ?? owner, p.x + 24, p.y + 102);
  }
  if (Object.keys(tasks).length === 0) {
    g.fillStyle = '#7c8797';
    g.font = `500 22px ${FONT}`;
    g.fillText('No task events from this source yet', 24, HEAD + 40);
  }
  g.fillStyle = '#06080c';
  g.fillRect(0, h - FOOT, w, FOOT);
  g.fillStyle = '#f2b46a';
  g.font = `800 34px ${FONT}`;
  g.fillText(`SHIPPED ${shipped.count}`, 18, h - 20);
  // Mission control strip: one chip per specialist with its live status.
  agents.filter((a) => a.id !== 'lead' && a.id !== 'guest').forEach((a, i) => {
    const x = 18 + i * ((w - 36) / 8);
    g.fillStyle = AGENT_COLOR[a.id];
    g.beginPath();
    g.arc(x + 10, h - FOOT + 30, 10, 0, Math.PI * 2);
    g.fill();
    // Name in the status colour: grey idle, white working, amber waiting, red error, green done.
    g.fillStyle = { idle: '#7c8797', waiting: '#f2b46a', error: '#ff8a7a', done: '#6fe3a4' }[a.status as string] ?? '#eef2f7';
    g.font = `700 28px ${FONT}`;
    g.fillText((AGENT_LABEL[a.id] ?? a.id).split(' ')[0]!, x + 26, h - FOOT + 40);
  });
  g.fillStyle = '#b7c1cf';
  g.font = `500 20px ${FONT}`;
  if (shipped.lastHash) g.fillText(`last ${shipped.lastHash}`, 190, h - 20);
  g.fillStyle = source === 'simulation' ? '#f2b46a' : '#7c8797';
  g.fillText(source === 'simulation' ? 'SIMULATION: demo tasks' : source === 'replay' ? 'REPLAY: harness tasks' : 'LIVE', w - 300, h - 20);
}

const SEP = '   \u25C6   ';

/** Scrolling status ticker in the band above the footer. Offset from sim time (ms), so it stops when the sim pauses. */
export function drawTicker(g: CanvasRenderingContext2D, messages: readonly string[], simMs: number, pxPerSec: number): void {
  const { w, h } = BOARD_PX;
  const y0 = h - FOOT - TICKER_H;
  g.fillStyle = '#0a1020';
  g.fillRect(0, y0, w, TICKER_H);
  g.font = `700 36px ${FONT}`;
  const line = messages.join(SEP) + SEP;
  const loop = g.measureText(line).width;
  if (loop <= 0) return;
  const off = ((simMs / 1000) * pxPerSec) % loop;
  g.save();
  g.beginPath();
  g.rect(0, y0, w, TICKER_H);
  g.clip();
  g.fillStyle = '#b7c1cf';
  g.textBaseline = 'middle';
  for (let x = -off; x < w; x += loop) g.fillText(line, x, y0 + TICKER_H / 2);
  g.restore();
}
