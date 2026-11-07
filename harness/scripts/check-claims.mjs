// Checks that every changed file is covered by an active claim in harness/state/claims.json.
// Usage: node harness/scripts/check-claims.mjs [--staged]
//   --staged: files in the index (git diff --cached). Default: working tree vs HEAD plus untracked files.
// Git is read only. Prints only unclaimed files and a summary line. Exit 1 if any file is unclaimed.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXEMPT = ['harness/state/claims.json', 'harness/tasks/**'];

/** Runs a read-only git command. -z output: paths are NUL-separated and never quoted. */
function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`);
  return r.stdout.split('\0').map((s) => s.trim().replace(/\\/g, '/')).filter(Boolean);
}

/** Glob to RegExp: ** crosses directories, * and ? stay inside one segment. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

function main() {
  const staged = process.argv.includes('--staged');
  const files = new Set(
    staged
      ? git(['diff', '-z', '--cached', '--name-only'])
      : [...git(['diff', '-z', '--name-only', 'HEAD']), ...git(['ls-files', '-z', '--others', '--exclude-standard'])],
  );

  const claims = JSON.parse(readFileSync(join(root, 'harness/state/claims.json'), 'utf8')).claims ?? [];
  const claimRes = claims
    .filter((c) => c.status === 'active')
    .flatMap((c) => c.globs.map((g) => globToRegExp(g)));
  const exemptRes = EXEMPT.map((g) => globToRegExp(g));

  const unclaimed = [...files].filter(
    (f) => !exemptRes.some((re) => re.test(f)) && !claimRes.some((re) => re.test(f)),
  );

  for (const f of unclaimed.sort()) console.log(`UNCLAIMED ${f}`);
  const mode = staged ? 'staged' : 'working tree';
  console.log(`check-claims (${mode}): ${files.size} changed, ${unclaimed.length} unclaimed`);
  process.exitCode = unclaimed.length ? 1 : 0;
}

import { pathToFileURL } from 'node:url';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.log(err.message);
    process.exitCode = 2;
  }
}
