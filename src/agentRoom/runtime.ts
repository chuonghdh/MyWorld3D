// Room runtime (ADR 0013): owns engine state, the live world buffer and the event feed. Plain TS, no React.
// Feeds: the labelled simulation and the replay of real harness history. The live feed plugs in through `push`.
import type { RoomEvent, Source } from './model/types';
import { initialState, type RoomState } from './engine/state';
import { apply } from './engine/reduce';
import { simulate } from './engine/sim';
import { spaceForPlayback } from './replay/build';
import { createLiveWorld, stepWorld, type LiveWorld } from './world/liveWorld';
import { agentRoom } from '../config/tuning';

const LOG_MAX = 40;

/** Office plan timing from the tuning knobs (ms). */
export const TIMING = { meetMs: agentRoom.meetHoldSec * 1000, reportMs: agentRoom.reportHoldSec * 1000, idleMs: agentRoom.idleAfterSec * 1000 } as const;

export interface Runtime {
  source: Source;
  state: RoomState;
  world: LiveWorld;
  log: RoomEvent[];
  push: (e: RoomEvent) => void;
  /** Advance by dt seconds of room time. */
  tick: (dt: number) => void;
  /** Back to the start of the first batch. */
  restart: () => void;
  /** Jump to event index i of the first batch (state rebuilt by folding events 0..i-1; pure). */
  seek: (i: number) => void;
  /** Events in the first batch, and how many of the current batch were played. */
  progress: () => { index: number; total: number };
}

/** Next batch of events for the room clock; called when the current batch is used up. */
type NextBatch = (loop: number, clockMs: number) => RoomEvent[];

function createRuntime(source: Source, nextBatch: NextBatch): Runtime {
  let loop = 0;
  let queue = nextBatch(0, 0);
  let qi = 0;
  let seqBase = 0;
  let clock = 0;
  const rt: Runtime = {
    source,
    state: initialState(source),
    world: createLiveWorld(agentRoom.trailLength, TIMING),
    log: [],
    push(e) {
      rt.state = apply(rt.state, e);
      rt.log.push(e);
      if (rt.log.length > LOG_MAX) rt.log.shift();
    },
    restart() {
      rt.seek(0);
    },
    seek(i) {
      loop = 0;
      seqBase = 0;
      queue = nextBatch(0, 0);
      const n = Math.max(0, Math.min(i, queue.length));
      rt.state = initialState(source);
      rt.log = [];
      for (let k = 0; k < n; k++) rt.push(queue[k]!);
      qi = n;
      clock = n > 0 ? queue[n - 1]!.t : 0;
    },
    progress: () => ({ index: qi, total: queue.length }),
    tick(dt) {
      clock += dt * 1000;
      while (queue[qi] && queue[qi]!.t <= clock) {
        const e = queue[qi++]!;
        rt.push({ ...e, seq: e.seq + seqBase });
      }
      if (queue.length > 0 && qi >= queue.length) {
        loop++;
        seqBase = rt.state.seq;
        queue = nextBatch(loop, clock);
        qi = 0;
      }
      stepWorld(rt.world, rt.state, dt, clock, agentRoom.avatarWalkSpeed, TIMING);
    },
  };
  return rt;
}

export function createSimulationRuntime(seed: number = agentRoom.simSeed): Runtime {
  const step = 60000 / agentRoom.simEventsPerMin;
  return createRuntime('simulation', (loop, clock) =>
    simulate(seed + loop, agentRoom.simLoopEvents, agentRoom.simEventsPerMin, loop === 0 ? 0 : clock + step),
  );
}

/**
 * Live: no scheduled feed. Each live event is stamped with the room clock when it arrives, so office timing
 * (huddles, idle -> pantry) runs on one clock. `feed` maps and pushes it.
 */
export function createLiveRuntime(): Runtime & { feed: (events: RoomEvent[]) => void } {
  const rt = createRuntime('live', () => []);
  const feed = (events: RoomEvent[]) => {
    for (const e of events) rt.push({ ...e, t: rt.world.now });
  };
  return Object.assign(rt, { feed });
}

/** Replays real events in order, one every replayStepSec, then loops after a pause of one step. */
export function createReplayRuntime(events: readonly RoomEvent[]): Runtime {
  const step = agentRoom.replayStepSec * 1000;
  return createRuntime('replay', (loop, clock) => spaceForPlayback(events, step, loop === 0 ? 0 : clock + step));
}
