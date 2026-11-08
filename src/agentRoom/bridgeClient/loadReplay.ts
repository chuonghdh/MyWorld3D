// Replay loader (ADR 0013 network exception: only this folder may fetch). Reads the file written by
// tools/agent-bridge/replay.mjs from the dev server; returns null when it is missing or not a replay document.
import { isReplayDoc, type ReplayDoc } from '../replay/build';
import { BRIDGE_URL } from './live';

export const REPLAY_URL = '/harness/runs/agent-room-replay.json';

/** Dev server file first, then the bridge's /replay (a built page has no dev server). */
export async function loadReplay(): Promise<ReplayDoc | null> {
  return (await loadFrom(REPLAY_URL)) ?? (await loadFrom(`${BRIDGE_URL}/replay`));
}

async function loadFrom(url: string): Promise<ReplayDoc | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const doc: unknown = await res.json();
    return isReplayDoc(doc) ? doc : null;
  } catch {
    return null;
  }
}
