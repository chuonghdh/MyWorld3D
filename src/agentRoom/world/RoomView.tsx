// Room canvas: composes lighting, outside, shell, window wall, decor, desks, hub, robots, trails, arcs and wall. Drives the runtime clock and the UI mirror.
import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Runtime } from '../runtime';
import { useRoomMirror } from '../store';
import { RoomShell } from './RoomShell';
import { Lighting } from './Lighting';
import { Outside } from './Outside';
import { WindowWall } from './WindowWall';
import { Decor } from './Decor';
import { Desks } from './Desks';
import { Hub } from './Hub';
import { Stools } from './Stools';
import { PlantRows } from './PlantRows';
import { LeadDesk } from './LeadDesk';
import { Robots } from './Robots';
import { Trails } from './Trails';
import { Arcs } from './Arcs';
import { Board } from './Board';
import { Pantry } from './Pantry';
import { DeskProps } from './DeskProps';
import { Bursts } from './Bursts';
import { BubbleProjector, type BubbleRefs } from '../ui/Bubbles';
import { useUi } from '../ui/uiStore';
import { onMissed, recordDown } from '../ui/pick';
import { QualityMonitor } from './QualityMonitor';
import { CameraController } from './CameraController';
import { agentRoom } from '../../config/tuning';

/** Largest step fed to the runtime, seconds (a hidden tab must not teleport avatars). */
const MAX_DT = 0.1;

function Driver({ rt }: { rt: Runtime }) {
  const acc = useRef(0);
  const set = useRoomMirror((s) => s.set);
  // Runs first (negative priority) so all views read this frame's state.
  useFrame((_, dt) => {
    const ui = useUi.getState();
    if (!ui.paused) rt.tick(Math.min(dt, MAX_DT) * ui.speed);
    acc.current += dt;
    if (acc.current < 1 / agentRoom.mirrorHz) return;
    acc.current = 0;
    const places = Object.fromEntries(Object.values(rt.world.agents).map((a) => [a.id, { activity: a.activity, arrived: a.arrived }]));
    set({ source: rt.source, now: rt.world.now, agents: Object.values(rt.state.agents), log: rt.log.slice(), places });
  }, -1);
  return null;
}

export function RoomView({ rt, bubbles }: { rt: Runtime; bubbles: React.MutableRefObject<BubbleRefs> }) {
  const d = agentRoom.viewDistance;
  return (
    <Canvas
      camera={{ position: [0, d * 0.6, d * 0.8], fov: 42, near: 0.1, far: 320 }}
      shadows
      onPointerDownCapture={recordDown}
      onPointerMissed={onMissed}
      dpr={[1, 2]}
      onCreated={(s) => {
        (window as unknown as { __agentRoom?: unknown }).__agentRoom = { gl: s.gl, scene: s.scene, camera: s.camera, rt };
      }}
    >
      <Lighting />
      <Driver rt={rt} />
      <QualityMonitor />
      <Outside />
      <RoomShell />
      <WindowWall />
      <Decor />
      <PlantRows />
      <Desks rt={rt} />
      <Hub rt={rt} />
      <Stools />
      <Board rt={rt} />
      <LeadDesk rt={rt} />
      <Pantry world={rt.world} />
      <DeskProps rt={rt} />
      <Bursts rt={rt} />
      <Robots rt={rt} />
      <Trails rt={rt} />
      <Arcs rt={rt} />
      <BubbleProjector rt={rt} refs={bubbles} />
      <CameraController world={rt.world} />
    </Canvas>
  );
}
