// Writes harness/state/board-export.json: one {id, data} row per agent for the artifact agents collection.
// data = name, role, seat, status, progress, activity, updated. Reads board.json only.
// Prints nothing on success.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'state');
const board = JSON.parse(readFileSync(join(dir, 'board.json'), 'utf8'));

const rows = board.agents.map((a) => ({
  id: a.id,
  data: {
    name: a.name,
    role: a.role ?? '',
    seat: a.seat,
    status: a.status,
    progress: a.progress,
    activity: a.activity,
    updated: a.updated ?? board.updated,
  },
}));

writeFileSync(join(dir, 'board-export.json'), JSON.stringify(rows, null, 2) + '\n');
