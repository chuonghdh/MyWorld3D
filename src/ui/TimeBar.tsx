// Top control bar: pause, auto/standard time, digital clock, a Map / Street view switch and Photo.
// It folds to a small analog clock with an expand button, so it stays out of the way.
// On phones (up to 600 px) it becomes a two-row panel: a window of three controls that slides one control
// at a time, and the clock on the row below.
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useWorldStore } from '../store';
import { runtime } from '../scene/runtime';
import { isNarrowViewport } from './uiUtils';
import { FilmButton } from './FilmButton';

/** Width of one control in the phone window, and how many show at once. */
const PHONE_SLOT_PX = 44;
const PHONE_VISIBLE = 3;
/** Horizontal drag (px) that moves the phone window by one control. */
const SWIPE_PX = 30;

function clockText(hours: number): string {
  const total = Math.floor((((hours % 24) + 24) % 24) * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 12-hour clock text and AM/PM for a time of day in hours. */
function clock12(hours: number): { text: string; period: 'AM' | 'PM' } {
  const total = Math.floor((((hours % 24) + 24) % 24) * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return { text: `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, period: hh < 12 ? 'AM' : 'PM' };
}

/** True on phones; follows the viewport when it is resized or rotated. */
function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(() => isNarrowViewport('(max-width: 600px)'));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 600px)');
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return phone;
}

/** Small analog clock face; the hands follow the time of day. */
function AnalogClock({ hours }: { hours: number }) {
  const minutes = (((hours % 24) + 24) % 24) * 60;
  const hour = ((minutes / 60) % 12) * 30;
  const minute = (minutes % 60) * 6;
  return (
    <svg className="mw-clock-analog" viewBox="0 0 40 40" role="img" aria-label={`Time ${clockText(hours)}`}>
      <circle cx="20" cy="20" r="18" />
      <line x1="20" y1="20" x2="20" y2="11" transform={`rotate(${hour} 20 20)`} className="hour" />
      <line x1="20" y1="20" x2="20" y2="6" transform={`rotate(${minute} 20 20)`} className="minute" />
      <circle cx="20" cy="20" r="1.8" className="pivot" />
    </svg>
  );
}

function MapIcon() {
  // A town seen from above: a square with two crossing streets.
  return (
    <svg className="mw-icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" />
      <path d="M10 2.5v15M2.5 10h15" />
    </svg>
  );
}

function WalkerIcon() {
  // A walking person, in the style of a street-view pegman.
  return (
    <svg className="mw-icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="4.2" r="2" />
      <path d="M10 6.8v5.2M6 9.2l4-1.6 4 1.6M10 12l-3 5.2M10 12l3 5.2" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg className="mw-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 6.5h3l1.2-2h5.6l1.2 2h3v9.5H3z" />
      <circle cx="10" cy="11" r="2.8" />
    </svg>
  );
}

/**
 * Two-state view switch: the map seen from above, or walking in the street. Clicking the street half walks
 * from the centre; dragging it onto the map starts the walk at the drop point. The drag ghost is portalled to
 * the body so the bar's transform does not move it.
 */
function ViewSwitch() {
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

function PauseButton() {
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

function AutoButton() {
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

function PhotoButton() {
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

/**
 * Phone layout: row one is a window showing three controls, moved one control per arrow tap or swipe;
 * row two is the clock. The controls are the same buttons as on desktop.
 */
function PhoneTimeBar({ timeOfDay }: { timeOfDay: number }) {
  // Controls in order: pause, auto, map, street, photo, film (the view switch contributes its two buttons).
  const COUNT = 6;
  const maxStart = COUNT - PHONE_VISIBLE;
  const [start, setStart] = useState(0);
  const drag = useRef<number | null>(null);
  const step = (d: number) => setStart((s) => Math.min(maxStart, Math.max(0, s + d)));

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = e.clientX;
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current === null) return;
    const dx = e.clientX - drag.current;
    drag.current = null;
    if (dx <= -SWIPE_PX) step(1);
    else if (dx >= SWIPE_PX) step(-1);
  };

  const clock = clock12(timeOfDay);
  return (
    <div className="mw-timebar mw-timebar-phone" role="group" aria-label="Time controls">
      <div className="mw-m-row">
        <button
          type="button"
          className="mw-m-arrow"
          aria-label="Previous controls"
          disabled={start === 0}
          onClick={() => step(-1)}
        >
          ‹
        </button>
        <div className="mw-m-window" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (drag.current = null)}>
          <div className="mw-m-track" style={{ transform: `translateX(${-start * PHONE_SLOT_PX}px)` }}>
            <PauseButton />
            <AutoButton />
            <ViewSwitch />
            <PhotoButton />
            <FilmButton />
          </div>
        </div>
        <button
          type="button"
          className="mw-m-arrow"
          aria-label="Next controls"
          disabled={start === maxStart}
          onClick={() => step(1)}
        >
          ›
        </button>
      </div>
      <div className="mw-timebar-clock mw-m-clock" aria-label="Time of day">
        {clock.text}
        <span className="mw-clock-period">{clock.period}</span>
      </div>
    </div>
  );
}

export function TimeBar() {
  const timeOfDay = useWorldStore((s) => s.settings.timeOfDay);
  const phone = usePhoneLayout();
  const [collapsed, setCollapsed] = useState(false);

  if (phone) return <PhoneTimeBar timeOfDay={timeOfDay} />;

  if (collapsed) {
    return (
      <div className="mw-timebar mw-timebar-folded" role="group" aria-label="Time controls">
        <div className="mw-clock-folded">
          <AnalogClock hours={timeOfDay} />
          <span className="mw-clock-period" aria-hidden="true">
            {clock12(timeOfDay).period}
          </span>
        </div>
        <button
          type="button"
          className="mw-timebar-btn mw-timebar-fold"
          aria-label="Expand the time bar"
          title="Show the controls"
          onClick={() => setCollapsed(false)}
        >
          ▸
        </button>
      </div>
    );
  }

  return (
    <div className="mw-timebar" role="group" aria-label="Time controls">
      <PauseButton />
      <AutoButton />
      <div className="mw-timebar-clock" aria-label="Time of day">
        {clock12(timeOfDay).text}
        <span className="mw-clock-period">{clock12(timeOfDay).period}</span>
      </div>
      <ViewSwitch />
      <PhotoButton />
      <FilmButton />
      <button
        type="button"
        className="mw-timebar-btn mw-timebar-fold"
        aria-label="Fold the time bar"
        title="Fold to the clock"
        onClick={() => setCollapsed(true)}
      >
        ◂
      </button>
    </div>
  );
}
