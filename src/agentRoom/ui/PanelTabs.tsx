// Overview, Tasks, Activity and Settings tabs. Honest by source: no invented progress, simulated items labelled.
import { useState } from 'react';
import type { RoomEvent } from '../model/types';
import { useRoomMirror } from '../store';
import { AGENT_COLOR, AGENT_LABEL } from '../world/palette';
import { bubbleText } from './bubbleText';
import { SOURCE_LINE, clockText, metricsOf } from './metrics';
import { useUi } from './uiStore';

const MESSAGE_KINDS: RoomEvent['kind'][] = ['delegate', 'subagent_done', 'notify'];

export function OverviewTab() {
  const agents = useRoomMirror((s) => s.agents);
  const source = useRoomMirror((s) => s.source);
  const m = metricsOf(agents);
  return (
    <div>
      <div className="grid2">
        <div className="stat"><span className="eyebrow">Active</span><b>{m.active}</b></div>
        <div className="stat"><span className="eyebrow">Waiting for you</span><b>{m.waiting}</b></div>
        <div className="stat"><span className="eyebrow">Done</span><b>{m.done}</b></div>
        <div className="stat"><span className="eyebrow">Errors</span><b>{m.errors}</b></div>
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <div className="eyebrow">Source</div>
        <div>{SOURCE_LINE[source].label}: {SOURCE_LINE[source].note}</div>
      </div>
      <div className="eyebrow" style={{ margin: '10px 0 4px' }}>Latest</div>
      <ActivityList limit={6} messagesOnly={false} />
    </div>
  );
}

export function TasksTab() {
  const doc = useUi((s) => s.replayDoc);
  const source = useRoomMirror((s) => s.source);
  const log = useRoomMirror((s) => s.log);
  const tasks =
    source === 'replay' && doc
      ? doc.tasks.map((t) => ({ id: t.id, title: t.title, state: t.status, owner: t.owner }))
      : log.flatMap((e) => (e.kind === 'task_state' ? [{ id: e.task, title: '', state: e.state, owner: e.agent as string }] : []));
  if (tasks.length === 0) return <div className="line">No task events from this source yet.</div>;
  return (
    <div>
      {tasks.map((t) => (
        <div className="card" key={t.id}>
          <div className="eyebrow">
            {t.id}
            {source === 'simulation' ? ' / simulated' : ''}
          </div>
          {t.title && <div>{t.title}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <span className="pill" data-tone={t.state === 'done' ? 'ok' : t.state === 'blocked' ? 'bad' : 'signal'}>{t.state}</span>
            <span className="pill" data-tone="quiet">{t.owner}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityList({ limit, messagesOnly }: { limit: number; messagesOnly: boolean }) {
  const log = useRoomMirror((s) => s.log);
  const rows = log.filter((e) => !messagesOnly || MESSAGE_KINDS.includes(e.kind)).slice(-limit).reverse();
  return (
    <ul className="feed">
      {rows.map((e) => (
        <li key={e.seq}>
          <span className="t">{clockText(e.t)}</span>
          <b style={{ color: AGENT_COLOR[e.agent] }}>{AGENT_LABEL[e.agent]}</b> {bubbleText(e)}
        </li>
      ))}
    </ul>
  );
}

export function ActivityTab() {
  const [messagesOnly, setMessagesOnly] = useState(false);
  return (
    <div>
      <label className="toggle">
        <span>Messages only</span>
        <input type="checkbox" checked={messagesOnly} onChange={(e) => setMessagesOnly(e.target.checked)} />
      </label>
      <ActivityList limit={40} messagesOnly={messagesOnly} />
    </div>
  );
}

export function SettingsTab() {
  const { showTrails, showBubbles, quality, director, set } = useUi();
  const source = useRoomMirror((s) => s.source);
  return (
    <div>
      <label className="toggle">
        <span>Walking paths</span>
        <input type="checkbox" checked={showTrails} onChange={(e) => set({ showTrails: e.target.checked })} />
      </label>
      <label className="toggle">
        <span>Speech bubbles</span>
        <input type="checkbox" checked={showBubbles} onChange={(e) => set({ showBubbles: e.target.checked })} />
      </label>
      <label className="toggle">
        <span>Director camera</span>
        <input type="checkbox" checked={director} onChange={(e) => set({ director: e.target.checked, followId: null })} />
      </label>
      <label className="toggle">
        <span>Quality</span>
        <select value={quality} onChange={(e) => set({ quality: e.target.value as 'high' | 'performance' })}>
          <option value="high">High</option>
          <option value="performance">Performance</option>
        </select>
      </label>
      <div className="card">
        <div className="eyebrow">About this data</div>
        <div>{SOURCE_LINE[source].note}.</div>
      </div>
    </div>
  );
}
