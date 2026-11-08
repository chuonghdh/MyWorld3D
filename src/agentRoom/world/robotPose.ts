// Robot poses (pure): state + phase + walking speed -> joint angles and body offsets.
import type { AgentStatus } from '../model/types';

export interface Pose {
  bob: number;
  lean: number;
  armL: number;
  armR: number;
  /** Side raise of the right arm (talking / waving), radians. */
  wave: number;
}

/** speed01: 0 standing, 1 full gliding speed. Positive arm angles swing forward. Zero gravity: no legs. */
export function robotPose(status: AgentStatus, phase: number, speed01: number): Pose {
  const s = Math.max(0, Math.min(1, speed01));
  if (s > 0.05) {
    // Gliding, zero gravity: arms hang relaxed at the sides (no gait swing).
    return { bob: 0, lean: 0.06 * s, armL: 0, armR: 0, wave: 0 };
  }
  const breathe = Math.sin(phase * 1.6) * 0.012;
  switch (status) {
    case 'tool': {
      const t = Math.sin(phase * 14) * 0.06;
      return { bob: breathe, lean: 0.1, armL: 0.95 + t, armR: 0.95 - t, wave: 0 };
    }
    case 'thinking':
      return { bob: breathe, lean: 0.03, armL: 0.15, armR: 1.5 + Math.sin(phase * 2) * 0.05, wave: 0.25 };
    case 'delegating':
      return { bob: breathe, lean: -0.02, armL: 0.1, armR: 0.6, wave: 0.9 + Math.sin(phase * 6) * 0.35 };
    case 'waiting':
      return { bob: breathe - 0.02, lean: 0.18, armL: 0, armR: 0, wave: 0 };
    case 'done':
      return { bob: Math.max(0, Math.sin(phase * 5)) * 0.06, lean: -0.04, armL: 0.2, armR: 0.2, wave: 0.3 };
    case 'error':
      return { bob: breathe, lean: -0.08, armL: -0.2, armR: -0.2, wave: 0 };
    default:
      return { bob: breathe, lean: 0, armL: Math.sin(phase * 1.6) * 0.04, armR: -Math.sin(phase * 1.6) * 0.04, wave: 0 };
  }
}

/** Office activity -> pose. Seated agents sip from a mug (right arm); no legs (zero gravity). */
export function activityPose(activity: string, status: AgentStatus, phase: number, speed01: number, arrived: boolean): Pose {
  if (!arrived || speed01 > 0.05) return robotPose(status, phase, speed01);
  switch (activity) {
    case 'relax': {
      const sip = Math.max(0, Math.sin(phase * 0.9)) ** 8; // a sip every ~7 s
      return { bob: 0, lean: -0.12, armL: 0.35, armR: 1.1 + sip * 0.9, wave: 0.1 };
    }
    case 'huddle':
    case 'report':
      return robotPose('delegating', phase, 0);
    case 'work':
      return { ...robotPose('tool', phase, 0), lean: 0.12}; // seated, typing
    case 'wait':
      return { ...robotPose(status === 'error' ? 'error' : 'waiting', phase, 0)};
    default:
      return robotPose('idle', phase, 0);
  }
}

/** Shortest-way heading damping (radians), frame-rate independent. */
export function dampAngle(from: number, to: number, lambda: number, dt: number): number {
  let d = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * (1 - Math.exp(-lambda * dt));
}
