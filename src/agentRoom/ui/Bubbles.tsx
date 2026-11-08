// DOM speech bubbles (no drei Html). The projector runs in useFrame and writes element styles directly;
// it reads the runtime and never changes it.
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AgentId } from '../model/types';
import type { Runtime } from '../runtime';
import { ALL_AGENTS } from '../engine/state';
import { AGENT_COLOR, AGENT_LABEL } from '../world/palette';
import { bubbleText } from './bubbleText';
import { agentRoom } from '../../config/tuning';
import { useUi } from './uiStore';

const HEAD_Y = 2.15; // above the scaled robot head
const v = new THREE.Vector3();

/** Element registry shared by the DOM layer and the projector. */
export type BubbleRefs = Partial<Record<AgentId, HTMLDivElement | null>>;

export function BubbleLayer({ refs }: { refs: React.MutableRefObject<BubbleRefs> }) {
  return (
    <div className="bubbles" aria-hidden="true">
      {ALL_AGENTS.map((id) => (
        <div
          key={id}
          className="bubble"
          ref={(el) => {
            refs.current[id] = el;
          }}
          style={{ borderColor: AGENT_COLOR[id] }}
        >
          <b style={{ color: AGENT_COLOR[id] }}>{AGENT_LABEL[id]}</b>
          <span />
        </div>
      ))}
    </div>
  );
}

export function BubbleProjector({ rt, refs }: { rt: Runtime; refs: React.MutableRefObject<BubbleRefs> }) {
  const { camera, size } = useThree();
  const lastText = useRef<Partial<Record<AgentId, string>>>({});
  useFrame(() => {
    const now = rt.world.now;
    const life = agentRoom.bubbleLifeSec * 1000;
    const latest: Partial<Record<AgentId, string>> = {};
    for (let i = rt.log.length - 1; i >= 0; i--) {
      const e = rt.log[i]!;
      if (now - e.t > life) break;
      if (latest[e.agent] === undefined) latest[e.agent] = bubbleText(e);
    }
    for (const id of ALL_AGENTS) {
      const el = refs.current[id];
      if (!el) continue;
      const text = latest[id];
      const p = rt.world.agents[id].pos;
      v.set(p.x, HEAD_Y, p.z).project(camera);
      // Hover shows the agent's name (label) even with no speech text; otherwise a bubble needs text and the toggle.
      const visible = v.z < 1 && (useUi.getState().hovered === id || (text !== undefined && useUi.getState().showBubbles));
      el.style.opacity = visible ? '1' : '0';
      if (!visible) continue;
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`;
      if (lastText.current[id] !== text) {
        lastText.current[id] = text;
        const span = el.lastElementChild as HTMLElement | null;
        if (span) span.textContent = text ?? '';
      }
    }
  });
  return null;
}
