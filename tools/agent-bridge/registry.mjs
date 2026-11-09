#!/usr/bin/env node
// Agent registry (ADR 0013, 2026-11-09): one record per subagent, written when it is created, so the room can bind
// agent_id -> specialist before any other rule. File: harness/runs/agent-registry.json (gitignored).
//   Hook:      PostToolUse, matcher Agent (.claude/settings.json) runs `node tools/agent-bridge/registry.mjs`.
//   Backfill:  node tools/agent-bridge/registry.mjs --backfill <session.jsonl>   (reads Agent calls + tool results).
// The agent id is taken from the spawn result text (`agentId: <hex>`), so it works whatever the payload shape.
// Stores only ids, names, subagent types and a short description (the description is the specialist's own label).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ID_RE = /agentId\W{0,4}([a-f0-9]{15,})/i;

export function registryFile(root = ROOT) {
  return join(root, 'harness', 'runs', 'agent-registry.json');
}

/** The agent id named in a spawn result (string or any object: the id text is searched in the JSON form). */
export function extractAgentId(toolResponse) {
  if (toolResponse == null) return null;
  const text = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);
  const m = ID_RE.exec(text);
  return m ? m[1] : null;
}

/** Upsert by agentId; the first record wins for name fields, later sightings only fill gaps. */
export function upsertEntry(agents, entry) {
  const i = agents.findIndex((a) => a.agentId === entry.agentId);
  if (i < 0) return [...agents, entry];
  const merged = { ...agents[i] };
  for (const [k, v] of Object.entries(entry)) if (merged[k] == null && v != null) merged[k] = v;
  return agents.map((a, j) => (j === i ? merged : a));
}

/** Build the registry record for one hook payload, or null when it is not an Agent spawn with an id. */
export function entryFromPayload(payload, now = Date.now()) {
  if (!payload || payload.tool_name !== 'Agent' || payload.hook_event_name !== 'PostToolUse') return null;
  const agentId = extractAgentId(payload.tool_response);
  if (!agentId) return null;
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  return {
    agentId,
    name: strOrNull(input.name, 60),
    subagent_type: strOrNull(input.subagent_type, 60),
    description: strOrNull(input.description, 80),
    session_id: strOrNull(payload.session_id, 60),
    source: 'hook',
    t: now,
  };
}

/** Parse a Claude Code session transcript (JSONL): one entry per Agent call that got an id back. */
export function entriesFromTranscript(jsonl) {
  const calls = new Map();
  const out = [];
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const content = o.message && o.message.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b.type === 'tool_use' && b.name === 'Agent') calls.set(b.id, { input: b.input || {}, ts: o.timestamp });
      if (b.type === 'tool_result' && calls.has(b.tool_use_id)) {
        const agentId = extractAgentId(b.content);
        const c = calls.get(b.tool_use_id);
        if (!agentId) continue;
        out.push({
          agentId,
          name: strOrNull(c.input.name, 60),
          subagent_type: strOrNull(c.input.subagent_type, 60),
          description: strOrNull(c.input.description, 80),
          session_id: null,
          source: 'transcript',
          t: c.ts ? Date.parse(c.ts) : null,
        });
      }
    }
  }
  return out;
}

export function readRegistry(root = ROOT) {
  const f = registryFile(root);
  if (!existsSync(f)) return { version: 1, agents: [] };
  try {
    const doc = JSON.parse(readFileSync(f, 'utf8'));
    return { version: 1, agents: Array.isArray(doc.agents) ? doc.agents : [] };
  } catch {
    return { version: 1, agents: [] };
  }
}

function writeRegistry(agents, root) {
  const f = registryFile(root);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ version: 1, agents }, null, 2) + '\n');
}

export function recordEntries(entries, root = ROOT) {
  let agents = readRegistry(root).agents;
  for (const e of entries) agents = upsertEntry(agents, e);
  writeRegistry(agents, root);
  return agents.length;
}

function strOrNull(v, max) {
  return typeof v === 'string' && v ? v.slice(0, max) : null;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--backfill') {
    const file = argv[1];
    const n = recordEntries(entriesFromTranscript(readFileSync(file, 'utf8')));
    process.stdout.write(`agent registry: ${n} agents\n`);
    return;
  }
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const entry = entryFromPayload(JSON.parse(raw));
  if (entry) recordEntries([entry]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .catch(() => undefined)
    .finally(() => process.exit(0));
}
