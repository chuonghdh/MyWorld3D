// Camera bar: Overview, Hub, Wall, desk picker, fullscreen. Keys: 0 overview, 1 hub, 2-9 desks, W wall, Esc clear, F follow, Space pause.
import { useEffect, useState } from 'react';
import type { AgentId } from '../model/types';
import { SPECIALISTS } from '../world/layout';
import { AGENT_LABEL } from '../world/palette';
import { useRoomMirror } from '../store';
import { controlsFor } from './metrics';
import { useUi, type PresetId } from './uiStore';
import { Icon } from './Icons';

/** Key -> action (pure, tested). 1 = hub, 2..9 = the 8 desks in roster order. */
export function keyAction(key: string): { preset?: PresetId; cmd?: 'clear' | 'follow' | 'pause' } | null {
  if (key === '0') return { preset: 'overview' };
  if (key === '1') return { preset: 'hub' };
  const n = Number(key);
  if (Number.isInteger(n) && n >= 2 && n <= 9) return { preset: SPECIALISTS[n - 2] as AgentId };
  if (key === 'w' || key === 'W') return { preset: 'wall' };
  if (key === 'Escape') return { cmd: 'clear' };
  if (key === 'f' || key === 'F') return { cmd: 'follow' };
  if (key === ' ') return { cmd: 'pause' };
  return null;
}

function useKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const a = keyAction(e.key);
      if (!a) return;
      const ui = useUi.getState();
      if (a.preset) ui.goTo(a.preset);
      else if (a.cmd === 'clear') ui.set({ selected: null, followId: null });
      else if (a.cmd === 'follow' && ui.selected) ui.set({ followId: ui.followId ? null : ui.selected });
      else if (a.cmd === 'pause' && controlsFor(useRoomMirror.getState().source).playPause) ui.set({ paused: !ui.paused });
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}

const PRESET_LABEL = { overview: 'Overview', hub: 'Discuss table', wall: 'Board' } as const;

/** True below 640 px wide (the camera bar collapses to one button there). */
function useNarrow(): boolean {
  const q = '(max-width: 640px)';
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

export function CameraBar() {
  const preset = useUi((s) => s.camera.preset);
  const goTo = useUi((s) => s.goTo);
  const director = useUi((s) => s.director);
  useKeys();
  const desk = (SPECIALISTS as readonly string[]).includes(preset) ? preset : '';
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  if (narrow && !open) {
    return (
      <div className="cambar collapsed">
        <div className="surface">
          <button className="btn btn-ghost" aria-label="Camera presets" aria-expanded={false} onClick={() => setOpen(true)}>
            <Icon.overview />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="cambar" onClick={(e) => narrow && (e.target as HTMLElement).closest('button') && setOpen(false)}>
      <div className="surface" role="toolbar" aria-label="Camera" title="Keys: 0 overview, 1 discuss table, 2-9 desks, W board, F follow, Esc clear, Space pause">
        {(['overview', 'hub', 'wall'] as const).map((p) => (
          <button key={p} className="btn btn-ghost" aria-pressed={preset === p} aria-label={PRESET_LABEL[p]} title={PRESET_LABEL[p]} onClick={() => goTo(p)}>
            {p === 'overview' ? <Icon.overview /> : p === 'hub' ? <Icon.agents /> : <Icon.tasks />}
            <span className="lbl">{PRESET_LABEL[p]}</span>
          </button>
        ))}
        <select aria-label="Desks" value={desk} onChange={(e) => e.target.value && goTo(e.target.value as AgentId)}>
          <option value="">Desks</option>
          {SPECIALISTS.map((id) => (
            <option key={id} value={id}>
              {AGENT_LABEL[id]}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost" aria-pressed={director} aria-label="Director" onClick={() => useUi.getState().set({ director: !director, followId: null })} title="Director: follow the latest event">
          <Icon.activity />
          <span className="lbl">Director</span>
        </button>
        <button className="btn btn-ghost" aria-label="Fullscreen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)}>
          <Icon.fullscreen />
        </button>
      </div>
    </div>
  );
}
