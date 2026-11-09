// Agent Working Room page entry (agent-room.html, ADR 0013).
// Source choice: ?source=simulation forces the demo; otherwise the replay file is used when present.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './ui/theme.css';
import { createLiveRuntime, createReplayRuntime, createSimulationRuntime, type Runtime } from './runtime';
import { bridgeUp, connectLive } from './bridgeClient/live';
import { createHookMapper } from './mapping/hook';
import { loadRegistry } from './bridgeClient/loadRegistry';
import { loadReplay } from './bridgeClient/loadReplay';
import { buildReplayEvents } from './replay/build';
import { RoomView } from './world/RoomView';
import { BubbleLayer, type BubbleRefs } from './ui/Bubbles';
import { AppShell } from './ui/AppShell';
import { useUi } from './ui/uiStore';
import { agentRoom } from '../config/tuning';

/** Source order: Live (bridge up) -> Replay (replay file) -> Simulation. ?source=live|replay|simulation forces one. */
async function chooseRuntime(): Promise<Runtime> {
  const want = new URLSearchParams(location.search).get('source');
  if (want === 'simulation') return createSimulationRuntime();
  if (want !== 'replay' && (want === 'live' || (await bridgeUp()))) {
    const rt = createLiveRuntime();
    const mapper = createHookMapper('live', [], await loadRegistry());
    connectLive(
      (m) => rt.feed(mapper.map(m.payload, 0)),
      (c) => useUi.getState().set({ connection: c }),
    );
    return rt;
  }
  const doc = await loadReplay();
  const events = doc ? buildReplayEvents(doc) : [];
  if (doc && events.length > 0) {
    useUi.getState().set({ replayDoc: doc });
    return createReplayRuntime(events);
  }
  return createSimulationRuntime();
}

function AgentRoom() {
  const [rt, setRt] = useState<Runtime | null>(null);
  const [gen, setGen] = useState(0);
  const seed = useRef(agentRoom.simSeed);
  const bubbles = useRef<BubbleRefs>({});
  useEffect(() => {
    let live = true;
    void chooseRuntime().then((r) => live && setRt(r));
    return () => {
      live = false;
    };
  }, []);
  const reseed = useCallback(() => {
    seed.current += 1;
    setRt(createSimulationRuntime(seed.current));
    setGen((g) => g + 1);
  }, []);
  if (!rt) return null;
  return (
    <>
      <RoomView key={`${rt.source}-${gen}`} rt={rt} bubbles={bubbles} />
      <BubbleLayer refs={bubbles} />
      <AppShell rt={rt} onReseed={reseed} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AgentRoom />
  </React.StrictMode>,
);
