#!/usr/bin/env node
// Claude Code hook -> agent bridge (ADR 0013). Reads the hook JSON on stdin, redacts it (tool names and file paths
// only), POSTs it to the local bridge with a 300 ms limit, and ALWAYS exits 0 so a missing bridge never blocks a
// session. Usage (from .claude/settings.local.json): node tools/agent-bridge/hook.mjs
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTuning, redact, sendHook } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 1_000_000) break; // huge payloads: the fields we keep sit at the top level anyway
  }
  const payload = JSON.parse(raw);
  const { port } = readTuning(ROOT);
  await sendHook(redact(payload, process.cwd()), { port, timeoutMs: 300 });
}

const hardStop = setTimeout(() => process.exit(0), 900);
main()
  .catch(() => undefined)
  .finally(() => {
    clearTimeout(hardStop);
    process.exit(0);
  });
