// Agent registry loader (ADR 0013 network exception: only this folder may fetch). Reads agent id -> specialist records
// from the bridge (/registry) or the dev server file written by tools/agent-bridge/registry.mjs. Empty when neither exists.
import type { RegistryEntry } from '../mapping/hook';
import { BRIDGE_URL } from './live';

export const REGISTRY_URL = '/harness/runs/agent-registry.json';

export async function loadRegistry(): Promise<RegistryEntry[]> {
  return (await loadFrom(`${BRIDGE_URL}/registry`)) ?? (await loadFrom(REGISTRY_URL)) ?? [];
}

async function loadFrom(url: string): Promise<RegistryEntry[] | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const doc = (await res.json()) as { agents?: unknown };
    if (!doc || !Array.isArray(doc.agents)) return null;
    return doc.agents.filter((a): a is RegistryEntry => !!a && typeof (a as RegistryEntry).agentId === 'string');
  } catch {
    return null;
  }
}
