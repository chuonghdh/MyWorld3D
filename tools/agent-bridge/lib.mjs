// Agent bridge helpers (ADR 0013), shared by server.mjs and hook.mjs and unit-tested. Node 22, no dependencies.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Words that may survive from an Agent description: specialist names only (used to pick the desk). */
const NAME_WORDS = new Set(['buildings', 'building', 'city', 'streets', 'street', 'traffic', 'life', 'sky', 'environment', 'audio', 'ui', 'camera', 'scene', 'qa', 'technical', 'architect', '&', 'and']);
const PATH_KEYS = ['file_path', 'notebook_path', 'path'];
const ID_KEYS = ['subagent_type', 'name', 'to'];

/** Repo-relative path when inside `cwd`, else the base name only (no home directories leave the machine). */
// Platform-independent: Windows drive paths count as absolute even on Linux (node:path does not), and both sides are
// compared with forward slashes, so the result is the same on every OS.
const WIN_DRIVE = /^[A-Za-z]:\//;
const fwd = (s) => s.split('\\').join('/');
export function safePath(p, cwd) {
  if (typeof p !== 'string' || !p) return undefined;
  const norm = fwd(p);
  if (!(WIN_DRIVE.test(norm) || norm.startsWith('/'))) return norm;
  const root = fwd(String(cwd ?? '')).replace(/\/+$/, '');
  // Inside the repo: the path relative to it. Outside: only the base name.
  if (root && norm.toLowerCase().startsWith(root.toLowerCase() + '/')) return norm.slice(root.length + 1);
  return norm.split('/').pop();
}

/**
 * Redact a Claude Code hook payload (human decision 3): keep event name, session / agent ids, tool name, file paths,
 * agent identifiers and specialist names; drop prompt text, tool input contents, responses (except is_error), cwd.
 */
export function redact(payload, cwd = process.cwd()) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const out = {};
  for (const k of ['hook_event_name', 'session_id', 'agent_id', 'agent_type', 'tool_name']) if (typeof p[k] === 'string') out[k] = p[k].slice(0, 120);
  const input = p.tool_input && typeof p.tool_input === 'object' ? p.tool_input : null;
  if (input) {
    const ti = {};
    for (const k of PATH_KEYS) {
      const v = safePath(input[k], cwd);
      if (v) ti[k] = v;
    }
    for (const k of ID_KEYS) if (typeof input[k] === 'string') ti[k] = input[k].slice(0, 60);
    if (typeof input.description === 'string') {
      const words = input.description.toLowerCase().split(/[^a-z&]+/).filter((w) => NAME_WORDS.has(w));
      if (words.length) ti.description = words.join(' ');
    }
    out.tool_input = ti;
  }
  if (p.tool_response && typeof p.tool_response === 'object' && p.tool_response.is_error === true) out.tool_response = { is_error: true };
  return out;
}

/** Bounded event ring with increasing ids, for SSE resume (Last-Event-ID). */
export class Ring {
  constructor(size) {
    this.size = Math.max(1, size | 0);
    this.items = [];
    this.seq = 0;
  }
  push(data) {
    const entry = { id: ++this.seq, ...data };
    this.items.push(entry);
    if (this.items.length > this.size) this.items.shift();
    return entry;
  }
  /** Entries with id > lastId (all kept entries when lastId is missing or invalid). */
  since(lastId) {
    const n = Number(lastId);
    return Number.isFinite(n) && n > 0 ? this.items.filter((e) => e.id > n) : this.items.slice();
  }
}

/** One SSE message. */
export function sseFrame(entry) {
  return `id: ${entry.id}\ndata: ${JSON.stringify(entry)}\n\n`;
}

/** Bridge settings read from the tuning file (single source of truth; no duplicated values). */
export function readTuning(root) {
  const text = readFileSync(join(root, 'src', 'config', 'tuning', 'agentRoom.ts'), 'utf8');
  const num = (name, def) => Number(new RegExp(`^\\s*${name}:\\s*([0-9.]+)`, 'm').exec(text)?.[1] ?? def);
  return { port: num('bridgePort', 0), ring: num('bridgeRingSize', 1) };
}

/** POST a redacted payload to the bridge; resolves true/false, never rejects, gives up after timeoutMs. */
export async function sendHook(body, { port, timeoutMs = 300, fetchImpl = fetch } = {}) {
  try {
    const timer = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
    const call = fetchImpl(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    }).then(
      (r) => r.ok,
      () => false,
    );
    return await Promise.race([call, timer]);
  } catch {
    return false;
  }
}
