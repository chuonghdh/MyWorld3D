// Types for lib.mjs (used by tests; the bridge itself is plain Node ESM).
export interface RedactedHook {
  hook_event_name?: string;
  session_id?: string;
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  tool_input?: Record<string, string>;
  tool_response?: { is_error: true };
}
export interface RingEntry {
  id: number;
  [k: string]: unknown;
}
export declare function safePath(p: unknown, cwd: string): string | undefined;
export declare function redact(payload: unknown, cwd?: string): RedactedHook;
export declare class Ring {
  constructor(size: number);
  size: number;
  seq: number;
  items: RingEntry[];
  push(data: Record<string, unknown>): RingEntry;
  since(lastId: unknown): RingEntry[];
}
export declare function sseFrame(entry: RingEntry): string;
export declare function readTuning(root: string): { port: number; ring: number };
export declare function sendHook(
  body: unknown,
  opts?: { port?: number; timeoutMs?: number; fetchImpl?: (url: string, init?: unknown) => Promise<{ ok: boolean }> },
): Promise<boolean>;
