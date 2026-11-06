// Phone time bar: row one is a window of three controls moved by arrows or swipe; row two is the clock.
import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { FilmButton } from './FilmButton';
import { clock12 } from './TimeBarIcons';
import { AutoButton, PauseButton, PhotoButton, ViewSwitch } from './TimeBarControls';

/** Width of one control in the phone window, and how many show at once. */
const PHONE_SLOT_PX = 44;
const PHONE_VISIBLE = 3;
/** Horizontal drag (px) that moves the phone window by one control. */
const SWIPE_PX = 30;

/**
 * Phone layout: row one is a window showing three controls, moved one control per arrow tap or swipe;
 * row two is the clock. The controls are the same buttons as on desktop.
 */
export function PhoneTimeBar({ timeOfDay }: { timeOfDay: number }) {
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
