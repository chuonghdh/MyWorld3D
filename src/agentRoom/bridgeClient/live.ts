// Live feed (ADR 0013 network exception: only this folder may use fetch / EventSource). Connects to the local
// bridge on 127.0.0.1, receives redacted hook payloads over SSE (the browser resends Last-Event-ID on reconnect,
// so nothing is replayed twice) and reports the connection state for the Live pill.
import type { HookPayload } from '../mapping/hook';
import { agentRoom } from '../../config/tuning';

export type Connection = 'connected' | 'reconnecting' | 'down';

export const BRIDGE_URL = `http://127.0.0.1:${agentRoom.bridgePort}`;

/** True when the bridge answers /health within the time limit. */
export async function bridgeUp(timeoutMs = 600): Promise<boolean> {
  try {
    const r = await fetch(`${BRIDGE_URL}/health`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

export interface LiveMessage {
  id: number;
  t: number;
  payload: HookPayload;
}

/** Open the SSE stream. Returns a close function. */
export function connectLive(onMessage: (m: LiveMessage) => void, onState: (c: Connection) => void): () => void {
  const es = new EventSource(`${BRIDGE_URL}/events`);
  es.onopen = () => onState('connected');
  es.onerror = () => onState(es.readyState === EventSource.CLOSED ? 'down' : 'reconnecting');
  es.onmessage = (e: MessageEvent<string>) => {
    try {
      onMessage(JSON.parse(e.data) as LiveMessage);
    } catch {
      // malformed frame: ignore (the bridge only sends JSON)
    }
  };
  return () => es.close();
}
