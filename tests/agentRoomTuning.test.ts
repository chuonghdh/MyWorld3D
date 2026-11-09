// Tuning parity for the agentRoom section (ADR 0013). Split from tests/tuningParity.test.ts, which is over the
// 350-line limit and may not grow. Values are read from source text, as in that file.
import { describe, expect, it } from 'vitest';

const FILE = '/src/config/tuning/agentRoom.ts';
const RAW = import.meta.glob('/src/config/tuning/agentRoom.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function propValue(name: string): string {
  const m = new RegExp(`^[ \\t]*${name}:[ \\t]*(.+?),[ \\t]*$`, 'm').exec(RAW[FILE] ?? '');
  if (!m) throw new Error(`${FILE}: property ${name} not found`);
  return (m[1] ?? '').trim();
}

const AGENT_ROOM_KNOBS: [string, string][] = [
  ['bridgePort', '4317'],
  ['bridgeRingSize', '500'],
  ['mirrorHz', '10'],
  ['wallRedrawHz', '4'],
  ['bubbleLifeSec', '6'],
  ['arcLifeSec', '2.5'],
  ['trailLength', '32'],
  ['simSeed', '8'],
  ['simEventsPerMin', '30'],
  ['avatarWalkSpeed', '5.6'],
  ['easeRampM', '1.5'],
  ['easeMinSpeedFrac', '0.15'],
  ['idleAfterSec', '20'],
  ['viewDistance', '18'],
  ['simLoopEvents', '400'],
  ['meetHoldSec', '8'],
  ['replayStepSec', '1.5'],
  ['roomSeed', '21'],
  ['qualityDefault', "'high' as 'high' | 'performance'"],
  ['roomHalfWidth', '12.5'],
  ['reportHoldSec', '6'],
  ['celebrateSec', '1.5'],
  ['directorDwellSec', '6'],
  ['followRealClock', 'true as boolean'],
  ['boardPanelOpacity', '0.15'],
  ['boardTickerHz', '12'],
  ['boardTickerPxPerSec', '90'],
  ['leadDeskYaw', '0'],
  ['leadRobotColor', "'#ff8a1f'"],
  ['tableLightColor', "'#ffd84a'"],
  ['discussTableColor', "'#3aa8ff'"],
  ['tableLightIntensity', '10'],
  ['flyLeanRad', '0.28'],
  ['hoverAmpM', '0.05'],
  ['plantTallCount', '2'],
  ['plantShortCount', '1'],
  ['plantTallHeightM', '1.7'],
  ['plantShortHeightM', '0.7'],
  ['camFocusDistance', '7.5'],
  ['camDampTarget', '4'],
  ['camDampDistance', '2'],
  ['camFitMax', '2.2'],
];

describe('agent room knobs in config', () => {
  it.each(AGENT_ROOM_KNOBS)('config value: %s', (name, value) => {
    expect(propValue(name)).toBe(value);
  });
});
