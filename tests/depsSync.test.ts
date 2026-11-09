import { describe, expect, it } from 'vitest';
import pkgRaw from '../package.json?raw';
import lockRaw from '../package-lock.json?raw';

// No @types/node in this project: reach fs through Node's builtin loader with a minimal local type.
type Fs = { existsSync(p: string): boolean; readFileSync(p: string, enc: 'utf8'): string };
const proc = (globalThis as { process?: { getBuiltinModule?(id: string): unknown; cwd(): string } }).process;
const fs = proc?.getBuiltinModule?.('node:fs') as Fs | undefined;

// Guard: installed node_modules must match package-lock.json for every direct dependency.
// Incident 2026-11-08: lockfile had suncalc 2.1.1, node_modules still had 1.9.0 (radians vs degrees).
// Vitest runs from the repo root (vitest.config / package.json scripts).
const root = proc?.cwd() ?? '.';

describe('dependency sync', () => {
  it('node_modules matches package-lock.json for direct dependencies', () => {
    expect(fs, 'node:fs unavailable (Node >= 20.16 required)').toBeDefined();
    if (!fs) return;
    const pkg = JSON.parse(pkgRaw);
    const lock = JSON.parse(lockRaw);
    const optional = new Set(Object.keys(pkg.optionalDependencies ?? {}));
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...optional,
    ];
    const drift: string[] = [];
    for (const name of names) {
      const locked = lock.packages?.[`node_modules/${name}`]?.version;
      // Read the file, not require(): packages with an exports map (suncalc 2) hide package.json.
      const file = `${root}/node_modules/${name}/package.json`;
      if (!fs.existsSync(file)) {
        if (!optional.has(name)) drift.push(`${name}: missing (lock ${locked})`);
        continue;
      }
      const installed = JSON.parse(fs.readFileSync(file, 'utf8')).version;
      if (installed !== locked) drift.push(`${name}: installed ${installed}, lock ${locked}`);
    }
    expect(drift, `node_modules out of sync with lockfile: run npm install\n${drift.join('\n')}`).toEqual([]);
  });
});
