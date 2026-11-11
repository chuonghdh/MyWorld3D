// Procedural robot geometry: one merged body per role (torso, head, visor, chest accent, role prop) with vertex
// colours, plus shared limb geometries pivoted at the shoulder / hip. Built once.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import type { AgentId } from '../model/types';
import { mergeParts, type Part } from './geometry';
import { AGENT_COLOR } from './palette';
import { agentRoom } from '../../config/tuning';

export const BODY = '#c9d1dc'; // cool grey, so robots read against the white desks
const VISOR = '#0d1219';
const DARK = '#2a3240';

export const RIG = {
  hipY: 0.5,
  hipX: 0.1,
  shoulderY: 1.1,
  shoulderX: 0.28,
  headY: 1.42,
  torsoY: 0.82,
  torsoR: 0.2,
} as const;

/** Whole-robot scale (readability from the overview) and per-role factors. */
export const ROBOT_SCALE = 1.25;
export const ROLE_SCALE: Partial<Record<AgentId, number>> = { lead: 1.12 };

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function prop(id: AgentId, c: string): Part[] {
  const top = RIG.headY + 0.15;
  switch (id) {
    case 'lead':
      return [
        { geo: new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6).translate(0, top + 0.08, 0), color: DARK },
        { geo: new THREE.SphereGeometry(0.05, 12, 8).translate(0, top + 0.19, 0), color: '#7cc4d6' },
      ];
    case 'buildings':
      return [
        { geo: new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, top - 0.03, 0), color: c },
        { geo: new THREE.CylinderGeometry(0.25, 0.25, 0.02, 20).translate(0, top - 0.02, 0.02), color: c },
      ];
    case 'city-streets':
      return [{ geo: new THREE.ConeGeometry(0.09, 0.22, 12).translate(0, top + 0.11, 0), color: c }];
    case 'traffic-life':
      return [-1, 1].flatMap((s) => [
        { geo: new THREE.CylinderGeometry(0.01, 0.01, 0.18, 6).translate(s * 0.09, top + 0.09, 0), color: DARK },
        { geo: new THREE.SphereGeometry(0.035, 10, 8).translate(s * 0.09, top + 0.19, 0), color: c },
      ]);
    case 'sky-environment':
      return [
        { geo: new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6).translate(0, top + 0.04, 0), color: DARK },
        { geo: new THREE.ConeGeometry(0.15, 0.07, 18, 1, true).rotateX(Math.PI).translate(0, top + 0.12, 0), color: c },
      ];
    case 'audio':
      return [
        { geo: new THREE.TorusGeometry(0.21, 0.025, 8, 24, Math.PI).translate(0, RIG.headY + 0.02, 0), color: DARK },
        ...[-1, 1].map((s) => ({ geo: new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16).rotateZ(Math.PI / 2).translate(s * 0.2, RIG.headY, 0), color: c })),
      ];
    case 'ui-camera':
      return [{ geo: new THREE.CylinderGeometry(0.05, 0.06, 0.08, 16).rotateX(Math.PI / 2).translate(0.07, RIG.headY + 0.01, 0.18), color: c }];
    case 'scene-qa':
      return [-1, 1].map((s) => ({ geo: box(0.06, 0.06, 0.06, s * 0.08, top + 0.03, 0), color: c }));
    case 'architect':
      return [
        { geo: box(0.3, 0.035, 0.3, 0, top + 0.017, 0), color: DARK },
        { geo: new THREE.TorusGeometry(0.05, 0.012, 8, 20).translate(-0.07, RIG.headY + 0.01, 0.162), color: c },
      ];
    case 'graphics-character':
      // Pen-tablet stylus: a slim tilted bar beside the head with a coloured tip.
      return [
        { geo: new THREE.CylinderGeometry(0.014, 0.014, 0.26, 8).rotateZ(-0.5).translate(-0.12, top + 0.1, 0), color: DARK },
        { geo: new THREE.ConeGeometry(0.02, 0.05, 8).rotateZ(-0.5 + Math.PI).translate(-0.19, top - 0.02, 0), color: c },
      ];
    default:
      return [];
  }
}

/** Merged static body for one role. Faces +z. */
export function bodyGeometry(id: AgentId): THREE.BufferGeometry {
  const c = AGENT_COLOR[id];
  const shell = id === 'lead' ? agentRoom.leadRobotColor : BODY;
  const parts: Part[] = [
    { geo: new THREE.CapsuleGeometry(RIG.torsoR, 0.32, 4, 14).translate(0, RIG.torsoY, 0), color: shell },
    { geo: box(0.14, 0.1, 0.02, 0, RIG.torsoY + 0.08, RIG.torsoR + 0.004), color: c }, // chest accent, 4 mm off the torso
    { geo: new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10).translate(0, RIG.headY - 0.2, 0), color: DARK }, // neck
    { geo: new RoundedBoxGeometry(0.36, 0.3, 0.3, 2, 0.06).translate(0, RIG.headY, 0), color: shell },
    { geo: box(0.28, 0.1, 0.02, 0, RIG.headY + 0.02, 0.15 + 0.006), color: VISOR }, // visor, 6 mm off the face
    { geo: box(0.2, 0.025, 0.004, 0, RIG.headY + 0.02, 0.15 + 0.018), color: c }, // visor glow strip in front of the visor
    { geo: box(0.3, 0.1, 0.22, 0, RIG.hipY + 0.02, 0), color: DARK }, // pelvis
    ...prop(id, c),
  ];
  return mergeParts(parts);
}

/** Arm hanging from its pivot (shoulder at origin). */
export function armGeometry(): THREE.BufferGeometry {
  return mergeParts([
    { geo: new THREE.CapsuleGeometry(0.045, 0.34, 3, 8).translate(0, -0.21, 0) },
    { geo: new THREE.SphereGeometry(0.06, 10, 8).translate(0, -0.44, 0) },
  ]);
}
