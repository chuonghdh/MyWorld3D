// Agent room look (pure parts): robot poses, seeded skyline, window mullions, partitions, arcs.
import { describe, expect, it } from 'vitest';
import { dampAngle, robotPose } from '../src/agentRoom/world/robotPose';
import { skylineLayout } from '../src/agentRoom/world/Outside';
import { mullions } from '../src/agentRoom/world/WindowWall';
import { partitions } from '../src/agentRoom/world/Decor';
import { arcPoint } from '../src/agentRoom/world/Arcs';
import { DESK, ROOM, SPECIALISTS, deskPose } from '../src/agentRoom/world/layout';

describe('robot poses', () => {
  it('gliding keeps arms relaxed at the sides (no gait swing, no leg pose); standing barely moves', () => {
    const w = robotPose('idle', 0.3, 1);
    expect(w.armL).toBe(0);
    expect(w.armR).toBe(0);
    expect(Math.abs(robotPose('idle', 0.3, 0).armL)).toBeLessThan(0.05);
    expect('legL' in w).toBe(false);
  });
  it('typing raises both arms, talking raises the right arm sideways, waiting slumps', () => {
    expect(robotPose('tool', 1, 0).armL).toBeGreaterThan(0.8);
    expect(robotPose('delegating', 1, 0).wave).toBeGreaterThan(0.5);
    expect(robotPose('waiting', 1, 0).lean).toBeGreaterThan(0.1);
  });
  it('heading damping takes the short way round', () => {
    const h = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 1000, 1);
    expect(Math.abs(Math.abs(h) - Math.PI)).toBeLessThan(0.2);
  });
});

describe('scenery', () => {
  it('skyline is a pure function of the seed and stays outside the room', () => {
    expect(skylineLayout(3, 50)).toEqual(skylineLayout(3, 50));
    expect(skylineLayout(3, 50)).not.toEqual(skylineLayout(4, 50));
    for (const b of skylineLayout(3, 200)) expect(b.z + b.d / 2).toBeLessThan(-ROOM.halfD - 1);
  });
  it('mullions stay inside the window sections', () => {
    for (const m of mullions()) expect(Math.abs(m.x) + m.w / 2).toBeLessThanOrEqual(ROOM.halfW + 1e-9);
  });
  it('glass dividers sit between the two desks of each block row', () => {
    const p = partitions();
    expect(p).toHaveLength(4);
    for (const q of p) for (const id of SPECIALISTS) expect(Math.abs(q.x - deskPose(id).pos.x)).toBeGreaterThan(DESK.w / 2);
  });
  it('arcs start and end at head height and lift in the middle', () => {
    expect(arcPoint(0, 0, 4, 0, 0)[1]).toBeCloseTo(arcPoint(0, 0, 4, 0, 1)[1]);
    expect(arcPoint(0, 0, 4, 0, 0.5)[1]).toBeGreaterThan(arcPoint(0, 0, 4, 0, 0)[1]);
  });
});
