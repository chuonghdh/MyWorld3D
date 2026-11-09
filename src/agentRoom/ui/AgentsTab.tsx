// Agents tab: roster rows and the selected agent's details.
import type { AgentId, AgentSnapshot } from '../model/types';
import { useRoomMirror } from '../store';
import { AGENT_COLOR, AGENT_LABEL } from '../world/palette';
import { bubbleText } from './bubbleText';
import { STATUS_PILL, placeText } from './metrics';
import { useUi } from './uiStore';

function lastLine(id: AgentId): string {
  const log = useRoomMirror.getState().log;
  for (let i = log.length - 1; i >= 0; i--) if (log[i]!.agent === id) return bubbleText(log[i]!);
  return 'No activity yet';
}

/** Enter/Space select; ArrowUp/ArrowDown move focus within the listbox. */
function onRowKey(e: React.KeyboardEvent<HTMLDivElement>, id: AgentId) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    useUi.getState().select(id);
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const sib = e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
    if (sib instanceof HTMLElement && sib.classList.contains('row')) sib.focus();
  }
}

export function AgentRow({ a }: { a: AgentSnapshot }) {
  const selected = useUi((s) => s.selected);
  const select = useUi((s) => s.select);
  const pill = STATUS_PILL[a.status];
  const place = useRoomMirror((s) => s.places[a.id]);
  return (
    <div className="row" role="option" tabIndex={0} aria-selected={selected === a.id} onClick={() => select(a.id)} onKeyDown={(e) => onRowKey(e, a.id)} onMouseEnter={() => useUi.getState().set({ hovered: a.id })} onMouseLeave={() => useUi.getState().set({ hovered: null })}>
      <span className="chip" style={{ background: AGENT_COLOR[a.id] }}>
        {AGENT_LABEL[a.id][0]}
      </span>
      <div className="grow">
        <div>{AGENT_LABEL[a.id]}</div>
        <div className="line">
          {placeText(place)} · {lastLine(a.id)}
        </div>
      </div>
      <span className="pill" data-tone={pill.tone}>
        {pill.label}
      </span>
    </div>
  );
}

function Details({ id }: { id: AgentId }) {
  const a = useRoomMirror((s) => s.agents.find((x) => x.id === id));
  const log = useRoomMirror((s) => s.log);
  const { followId, set, goTo } = useUi();
  if (!a) return null;
  const mine = log.filter((e) => e.agent === id).slice(-6).reverse();
  return (
    <div className="card">
      <div className="eyebrow">Selected</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
        <b style={{ color: AGENT_COLOR[id] }}>{AGENT_LABEL[id]}</b>
        <span className="pill" data-tone={STATUS_PILL[a.status].tone}>
          {STATUS_PILL[a.status].label}
        </span>
      </div>
      <div className="line">Last tool: {a.lastTool ?? 'none'}</div>
      <ul className="feed">
        {mine.map((e) => (
          <li key={e.seq}>{bubbleText(e)}</li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="btn" onClick={() => goTo(id)}>
          Focus
        </button>
        <button className="btn" aria-pressed={followId === id} onClick={() => set({ followId: followId === id ? null : id })}>
          Follow
        </button>
      </div>
    </div>
  );
}

export function AgentsTab() {
  const agents = useRoomMirror((s) => s.agents);
  const selected = useUi((s) => s.selected);
  const shown = agents;
  return (
    <div role="listbox" aria-label="Agents">
      {selected && <Details id={selected} />}
      {shown.map((a) => (
        <AgentRow key={a.id} a={a} />
      ))}
    </div>
  );
}
