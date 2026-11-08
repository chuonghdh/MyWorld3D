// App shell: rail, top bar, side panel, camera bar. Measures the free canvas area into uiStore.insets.
import { useEffect } from 'react';
import type { Runtime } from '../runtime';
import { NavRail } from './NavRail';
import { TopBar } from './TopBar';
import { AgentsTab } from './AgentsTab';
import { ActivityTab, OverviewTab, SettingsTab, TasksTab } from './PanelTabs';
import { CameraBar } from './CameraBar';
import { useUi, type Insets, type Tab } from './uiStore';

const TITLES: Record<Tab, string> = { overview: 'Overview', agents: 'Agents', tasks: 'Tasks', activity: 'Activity', settings: 'Settings' };

/** Free area = viewport minus rail, top bar, panel and camera bar (read from the laid-out elements). */
export function measureInsets(vw: number, vh: number, rects: { rail?: DOMRect; top?: DOMRect; panel?: DOMRect; cam?: DOMRect }): Insets {
  const mobile = vw < 768;
  const left = mobile || !rects.rail ? 0 : rects.rail.right;
  const top = rects.top ? rects.top.bottom : 0;
  const right = mobile || !rects.panel ? 0 : vw - rects.panel.left;
  const bottom = mobile && rects.panel ? vh - rects.panel.top : rects.cam ? vh - rects.cam.top : 0;
  return { left, top, right, bottom };
}

function useViewInsets() {
  const set = useUi((s) => s.set);
  useEffect(() => {
    const q = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
    const update = () => set({ insets: measureInsets(innerWidth, innerHeight, { rail: q('.rail'), top: q('.topbar'), panel: q('.panel'), cam: q('.cambar .surface') }) });
    const ro = new ResizeObserver(update);
    for (const s of ['.rail', '.topbar', '.panel', '.cambar']) {
      const el = document.querySelector(s);
      if (el) ro.observe(el);
    }
    addEventListener('resize', update);
    update();
    return () => {
      ro.disconnect();
      removeEventListener('resize', update);
    };
  }, [set]);
}

export function AppShell({ rt, onReseed }: { rt: Runtime; onReseed: () => void }) {
  const tab = useUi((s) => s.tab);
  useViewInsets();
  return (
    <>
      <NavRail />
      <TopBar rt={rt} onReseed={onReseed} />
      <aside className="panel surface" aria-label={TITLES[tab]}>
        <header>
          <div className="eyebrow">Agent Working Room</div>
          <h2>{TITLES[tab]}</h2>
        </header>
        <div className="body scroll-thin">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'agents' && <AgentsTab />}
          {tab === 'tasks' && <TasksTab />}
          {tab === 'activity' && <ActivityTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </aside>
      <CameraBar />
    </>
  );
}
