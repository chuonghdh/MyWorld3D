// Agent room camera presets and runtime seek (pure).
import { describe, expect, it } from 'vitest';
import { LIMITS, OVERVIEW_CORNERS, OVERVIEW_FIT, PRESET_ORDER, clampTarget, dampK, fitScale, overviewFit, presetPose, projectNdc, viewShift } from '../src/agentRoom/world/cameraPresets';
import { deskPose, SPECIALISTS } from '../src/agentRoom/world/layout';
import { createSimulationRuntime } from '../src/agentRoom/runtime';
import { agentRoom } from '../src/config/tuning';

const VD = agentRoom.viewDistance;
const FD = agentRoom.camFocusDistance;

describe('camera presets', () => {
  it('12 targets: overview, hub, wall and 9 desks', () => {
    expect(PRESET_ORDER).toHaveLength(12);
  });
  it('every preset target is inside the clamp and its distance inside the limits', () => {
    for (const id of PRESET_ORDER) {
      const p = presetPose(id, VD, FD);
      expect(clampTarget(p.target)).toEqual(p.target);
      const d = Math.hypot(p.pos[0] - p.target[0], p.pos[1] - p.target[1], p.pos[2] - p.target[2]);
      expect(d).toBeGreaterThanOrEqual(LIMITS.minDistance);
      expect(d).toBeLessThanOrEqual(LIMITS.maxDistance);
    }
  });
  it('desk presets look at the desk from its front side at focus distance', () => {
    for (const id of SPECIALISTS) {
      const p = presetPose(id, VD, FD);
      const desk = deskPose(id).pos;
      expect(p.target[0]).toBeCloseTo(desk.x);
      expect(p.pos[2]).toBeGreaterThan(desk.z);
      expect(Math.hypot(p.pos[0] - p.target[0], p.pos[1] - p.target[1], p.pos[2] - p.target[2])).toBeCloseTo(FD);
    }
  });
  it('fit scale and view shift', () => {
    const none = { left: 0, top: 0, right: 0, bottom: 0 };
    expect(fitScale(1920, 1080, none, agentRoom.camFitMax)).toBe(1);
    const ins = { left: 84, top: 76, right: 404, bottom: 68 };
    const k = fitScale(1920, 1080, ins, agentRoom.camFitMax);
    expect(k).toBeGreaterThan(1);
    expect(k).toBeLessThanOrEqual(agentRoom.camFitMax);
    expect(viewShift(ins)).toEqual({ x: 160, y: -4 });
  });
  it('damping is frame-rate independent', () => {
    const two = 1 - (1 - dampK(4, 1 / 60)) ** 2;
    expect(two).toBeCloseTo(dampK(4, 2 / 60), 10);
  });
});

describe('overview fit', () => {
  it.each([
    [1600, 900, { left: 84, top: 76, right: 404, bottom: 68 }],
    [974, 600, { left: 84, top: 76, right: 404, bottom: 68 }],
    [1920, 1080, { left: 0, top: 0, right: 0, bottom: 0 }],
  ])('%sx%s: every office corner projects inside the padded free area', (w, h, ins) => {
    const p = overviewFit(w, h, ins, 42);
    const limX = ((w - ins.left - ins.right) / w) * (1 - OVERVIEW_FIT.pad) + 1e-6;
    const limY = ((h - ins.top - ins.bottom) / h) * (1 - OVERVIEW_FIT.pad) + 1e-6;
    let tight = 0;
    for (const c of OVERVIEW_CORNERS) {
      const [x, y] = projectNdc(c, p.pos, p.target, 42, w / h);
      expect(Math.abs(x)).toBeLessThanOrEqual(limX);
      expect(Math.abs(y)).toBeLessThanOrEqual(limY);
      tight = Math.max(tight, Math.abs(x) / limX, Math.abs(y) / limY);
    }
    expect(tight).toBeGreaterThan(0.97); // fitted, not just far away
  });
});

describe('runtime seek', () => {
  it('seek(n) equals playing the first n events', () => {
    const a = createSimulationRuntime(4);
    for (let i = 0; i < 300; i++) a.tick(0.1);
    const n = a.progress().index;
    const b = createSimulationRuntime(4);
    b.seek(n);
    expect(b.state).toEqual(a.state);
    b.restart();
    expect(b.progress().index).toBe(0);
    expect(b.state.seq).toBe(0);
  });
});
