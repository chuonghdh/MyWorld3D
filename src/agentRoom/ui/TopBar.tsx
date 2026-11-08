// Top bar: title, source honesty line, metrics, source-aware playback controls.
import { useEffect, useState } from 'react';
import type { Runtime } from '../runtime';
import { useRoomMirror } from '../store';
import { useUi } from './uiStore';
import { SOURCE_LINE, SPEEDS, controlsFor, metricsOf } from './metrics';
import { Icon } from './Icons';

const CONNECTION = {
  connected: { t: 'Bridge connected', tone: 'ok' },
  reconnecting: { t: 'Reconnecting', tone: 'warn' },
  down: { t: 'Bridge down', tone: 'bad' },
} as const;

function ConnectionPill() {
  const conn = useUi((s) => s.connection);
  return (
    <span className="pill" data-tone={CONNECTION[conn].tone} role="status">
      <span className={`dot${conn === 'reconnecting' ? ' pulse-dot' : ''}`} />
      {CONNECTION[conn].t}
    </span>
  );
}

/** Replay timeline: event index in the first pass; polled at 4 Hz so React does not re-render per frame. */
function Scrubber({ rt }: { rt: Runtime }) {
  const [pos, setPos] = useState(() => rt.progress());
  useEffect(() => {
    const id = setInterval(() => setPos(rt.progress()), 250);
    return () => clearInterval(id);
  }, [rt]);
  return (
    <label className="scrub" title="Replay timeline">
      <span className="eyebrow mono">
        {Math.min(pos.index, pos.total)}/{pos.total}
      </span>
      <input
        type="range"
        min={0}
        max={pos.total}
        value={Math.min(pos.index, pos.total)}
        aria-label="Replay position"
        onChange={(e) => {
          rt.seek(Number(e.target.value));
          setPos(rt.progress());
        }}
      />
    </label>
  );
}

export function TopBar({ rt, onReseed }: { rt: Runtime; onReseed: () => void }) {
  const source = useRoomMirror((s) => s.source);
  const agents = useRoomMirror((s) => s.agents);
  const { paused, speed, set } = useUi();
  const [more, setMore] = useState(false);
  const m = metricsOf(agents);
  const line = SOURCE_LINE[source];
  const c = controlsFor(source);
  const status = m.errors > 0 ? { t: 'Error', tone: 'bad' } : m.waiting > 0 ? { t: 'Needs you', tone: 'warn' } : m.active > 0 ? { t: 'Working', tone: 'ok' } : { t: 'Idle', tone: 'quiet' };
  return (
    <header className="topbar surface">
      <div>
        <h1>Agent Working Room</h1>
        <div className="sub">
          <span className="pill" data-tone={line.tone} role="status" data-source={source}>
            <span className={`dot${source === 'live' ? ' pulse-dot' : ''}`} />
            {line.label}
          </span>{' '}
          <span className="note">{line.note}</span>
        </div>
      </div>
      <div className="metrics">
        <div className="metric">
          <span className="eyebrow">Agents</span>
          <b>{m.agents}</b>
        </div>
        <div className="metric keep">
          <span className="eyebrow">Active</span>
          <b>{m.active}</b>
        </div>
        <div className="metric">
          <span className="eyebrow">Waiting</span>
          <b style={{ color: m.waiting ? 'var(--warn)' : undefined }}>{m.waiting}</b>
        </div>
        <div className="metric">
          <span className="eyebrow">Done</span>
          <b>{m.done}</b>
        </div>
        <div className="metric keep">
          <span className="eyebrow">Status</span>
          <span className="pill" data-tone={status.tone}>
            <span className="dot" />
            {status.t}
          </span>
        </div>
      </div>
      <button className="btn btn-ghost more" aria-label="Playback controls" aria-expanded={more} onClick={() => setMore(!more)}>
        ⋯
      </button>
      <div className={`controls${more ? ' open' : ''}`}>
        {c.playPause && (
          <button className="btn btn-primary" onClick={() => set({ paused: !paused })} aria-label={paused ? 'Play' : 'Pause'}>
            {paused ? <Icon.play /> : <Icon.pause />}
            {paused ? 'Play' : 'Pause'}
          </button>
        )}
        {c.speed && (
          <div className="seg" role="group" aria-label="Playback speed">
            {SPEEDS.map((v) => (
              <button key={v} className="btn btn-ghost mono" aria-pressed={speed === v} onClick={() => set({ speed: v })}>
                {v}x
              </button>
            ))}
          </div>
        )}
        {c.scrubber && <Scrubber rt={rt} />}
        {c.connection && <ConnectionPill />}
        {c.restart && (
          <button className="btn btn-ghost" onClick={() => rt.restart()} aria-label="Restart" title="Restart">
            <Icon.restart />
          </button>
        )}
        {c.reseed && (
          <button className="btn btn-ghost" onClick={onReseed} title="New seed for the demo">
            Reseed
          </button>
        )}
      </div>
    </header>
  );
}
