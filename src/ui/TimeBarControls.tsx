// Time bar buttons shared by the desktop bar and the phone window: pause, auto time, view switch and photo.
import { useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useWorldStore } from '../store';
import { runtime } from '../scene/runtime';
import { CameraIcon, MapIcon, WalkerIcon } from './TimeBarIcons';

/**
 * Two-state view switch: the map seen from above, or walking in the street. Clicking the street half walks
 * from the centre; dragging it onto the map starts the walk at the drop point. The drag ghost is portalled to
 * the body so the bar's transform does not move it.
 */
export function ViewSwitch() {
  const [street, setStreet] = useState(runtime.streetMode);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setStreet(runtime.streetMode), 200);
    return () => window.clearInterval(id);
  }, []);

  const onStreetDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) dragging = true;
      if (dragging) setGhost({ x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGhost(null);
      if (!dragging) {
        if (!runtime.streetMode) runtime.cameraPresetRequests.push('street');
        return;
      }
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (el instanceof HTMLCanvasElement) runtime.streetDrops.push({ x: ev.clientX, y: ev.clientY });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <>
      <div className="mw-viewswitch" role="group" aria-label="View">
        <button
          type="button"
          className={`mw-viewswitch-btn${street ? '' : ' is-active'}`}
          aria-pressed={!street}
          title="Map view: the whole town from above (1)"
          onClick={() => runtime.cameraPresetRequests.push('overview')}
        >
          <MapIcon />
        </button>
        <button
          type="button"
          className={`mw-viewswitch-btn${street ? ' is-active' : ''}`}
          aria-pressed={street}
          title="Street view (2). Drag this onto the map to start walking there."
          onPointerDown={onStreetDown}
          onContextMenu={(e) => e.preventDefault()}
        >
          <WalkerIcon />
        </button>
      </div>
      {ghost &&
        createPortal(
          <div className="mw-walk-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
            <WalkerIcon />
          </div>,
          document.body,
        )}
    </>
  );
}

export function PauseButton() {
  const paused = useWorldStore((s) => s.toggles.paused);
  const setToggle = useWorldStore((s) => s.setToggle);
  return (
    <button
      type="button"
      className={`mw-timebar-btn${paused ? ' is-active' : ''}`}
      aria-pressed={paused}
      title="Pause or resume everything (Space)"
      onClick={() => setToggle('paused', !paused)}
    >
      <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
      <span className="mw-label">{paused ? 'Resume' : 'Pause'}</span>
    </button>
  );
}

export function AutoButton() {
  const autoTime = useWorldStore((s) => s.toggles.autoTime);
  const setToggle = useWorldStore((s) => s.setToggle);
  return (
    <button
      type="button"
      className={`mw-timebar-btn${autoTime ? ' is-active' : ''}`}
      aria-pressed={autoTime}
      title="Auto: one in-app day lasts 24 real minutes"
      onClick={() => setToggle('autoTime', !autoTime)}
    >
      <span aria-hidden="true">◐</span>
      <span className="mw-label">{autoTime ? 'Auto' : 'Standard'}</span>
    </button>
  );
}

export function PhotoButton() {
  return (
    <button
      type="button"
      className="mw-timebar-btn mw-timebar-icon"
      aria-label="Photo"
      title="Save the 3D view as a PNG (no panels)"
      onClick={() => {
        runtime.screenshotRequests++;
      }}
    >
      <CameraIcon />
    </button>
  );
}
