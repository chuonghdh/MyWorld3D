export interface RegistryRecord {
  agentId: string;
  name?: string | null;
  subagent_type?: string | null;
  description?: string | null;
  session_id?: string | null;
  source?: string;
  t?: number | null;
}
export function registryFile(root?: string): string;
export function extractAgentId(toolResponse: unknown): string | null;
export function upsertEntry(agents: RegistryRecord[], entry: RegistryRecord): RegistryRecord[];
export function entryFromPayload(payload: unknown, now?: number): RegistryRecord | null;
export function entriesFromTranscript(jsonl: string): RegistryRecord[];
export function readRegistry(root?: string): { version: number; agents: RegistryRecord[] };
export function recordEntries(entries: RegistryRecord[], root?: string): number;
