// File path -> owning agent (ADR 0013). Static copy of the ownership table in docs/agents/README.md, then claim globs.
// Data, not a knob: it changes only when the ownership table changes.
import type { AgentId } from '../model/types';

/** Ordered: the first matching prefix wins, so exact files come before their folders. */
export const OWNERSHIP: readonly [string, AgentId][] = [
  ['src/scene/audioBridge.ts', 'audio'],
  ['src/ui/SoundMixer.tsx', 'audio'],
  ['docs/AUDIO.md', 'audio'],
  ['tests/audio', 'audio'],
  ['tests/helpers/fakeAudio.ts', 'audio'],
  ['src/scene/CameraRig.tsx', 'ui-camera'],
  ['src/scene/camera', 'ui-camera'],
  ['src/scene/Selection.tsx', 'ui-camera'],
  ['src/scene/selectionMath.ts', 'ui-camera'],
  ['src/scene/BlockEditor.tsx', 'ui-camera'],
  ['src/scene/blockEdit', 'ui-camera'],
  ['src/scene/pivotMath.ts', 'ui-camera'],
  ['src/film/filmClock.ts', 'ui-camera'],
  ['src/film/autoPath.ts', 'ui-camera'],
  ['src/buildings/', 'buildings'],
  ['src/city/', 'city-streets'],
  ['src/streets/', 'city-streets'],
  ['src/traffic/people/', 'graphics-character'], // narrower prefix first: people rendering split from Traffic & Life (T-0031)
  ['src/traffic/', 'traffic-life'],
  ['src/life/', 'traffic-life'],
  ['src/sky/', 'sky-environment'],
  ['src/environment/', 'sky-environment'],
  ['src/weather/', 'sky-environment'],
  ['src/aircraft/', 'sky-environment'],
  ['src/audio/', 'audio'],
  ['src/ui/', 'ui-camera'],
  ['src/store/', 'ui-camera'],
  ['src/agentRoom/', 'architect'],
  ['src/config/tuning/agentRoom', 'architect'],
  ['tools/agent-bridge/', 'architect'],
  ['agent-room.html', 'architect'],
  ['src/scene/', 'scene-qa'],
  ['src/core/', 'scene-qa'],
  ['src/App.tsx', 'scene-qa'],
  ['src/main.tsx', 'scene-qa'],
  ['src/dev/treeCompare/', 'scene-qa'],
  ['tree-compare.html', 'scene-qa'],
  ['public/models/', 'scene-qa'],
  ['tests/helpers/', 'scene-qa'],
  ['harness/', 'architect'],
  ['.claude/', 'architect'],
  ['package.json', 'architect'],
];

/** A claim from harness/state/claims.json, reduced to what the mapping needs. */
export interface ClaimLike {
  owner: string;
  globs: string[];
  status: string;
}

const AGENT_IDS: readonly AgentId[] = [
  'lead', 'buildings', 'city-streets', 'traffic-life', 'sky-environment', 'audio', 'ui-camera', 'scene-qa', 'architect', 'graphics-character',
];

export function asAgentId(name: string): AgentId | null {
  return (AGENT_IDS as readonly string[]).includes(name) ? (name as AgentId) : null;
}

/** Repo-relative, forward slashes, no leading ./ . Absolute paths are cut at the repo folder name when present. */
export function normalizePath(path: string, repoName = 'myworld3d'): string {
  let p = path.replace(/\\/g, '/');
  const i = p.toLowerCase().lastIndexOf(`/${repoName.toLowerCase()}/`);
  if (i >= 0) p = p.slice(i + repoName.length + 2);
  return p.replace(/^\.\//, '');
}

/** Minimal glob: `**` any depth, `*` within one segment. */
export function globMatch(glob: string, path: string): boolean {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .split('**')
    .map((part) => part.replace(/\*/g, '[^/]*'))
    .join('.*');
  return new RegExp(`^${re}$`).test(path);
}

/** Owner of a path: ownership table first, then active claims, else null. */
export function ownerOf(path: string, claims: readonly ClaimLike[] = []): AgentId | null {
  const p = normalizePath(path);
  for (const [prefix, owner] of OWNERSHIP) if (p === prefix || p.startsWith(prefix)) return owner;
  for (const c of claims) {
    if (c.status !== 'active') continue;
    const id = asAgentId(c.owner);
    if (id && c.globs.some((g) => globMatch(g, p))) return id;
  }
  return null;
}
