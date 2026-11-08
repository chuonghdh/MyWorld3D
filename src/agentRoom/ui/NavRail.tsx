// Left navigation rail: selects the side panel tab.
import { useRef } from 'react';
import { useRoomMirror } from '../store';
import { useUi, type Tab } from './uiStore';
import { Icon } from './Icons';

const ITEMS: { id: Tab; label: string; icon: () => JSX.Element }[] = [
  { id: 'overview', label: 'Overview', icon: Icon.overview },
  { id: 'agents', label: 'Agents', icon: Icon.agents },
  { id: 'tasks', label: 'Tasks', icon: Icon.tasks },
  { id: 'activity', label: 'Activity', icon: Icon.activity },
  { id: 'settings', label: 'Settings', icon: Icon.settings },
];

export function NavRail() {
  const tab = useUi((s) => s.tab);
  const set = useUi((s) => s.set);
  const lastSeq = useRoomMirror((s) => s.log[s.log.length - 1]?.seq ?? 0);
  const seen = useRef(0);
  if (tab === 'activity') seen.current = lastSeq;
  return (
    <nav className="rail surface" aria-label="Sections">
      <div className="logo" aria-hidden="true">
        A
      </div>
      {ITEMS.map((it) => (
        <button key={it.id} aria-current={tab === it.id ? 'page' : undefined} onClick={() => set({ tab: it.id })}>
          <it.icon />
          {it.label}
          {it.id === 'activity' && tab !== 'activity' && lastSeq > seen.current && <span className="badge-dot" />}
        </button>
      ))}
    </nav>
  );
}
