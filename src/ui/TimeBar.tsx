// Floating clock bar: pause, auto/standard time and a digital clock. Kept outside the settings panel
// so it is always within reach, for example to freeze a frame and capture a rendering problem.
import { useWorldStore } from '../store';

function clockText(hours: number): string {
  const total = Math.floor(((hours % 24) + 24) % 24 * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function TimeBar() {
  const paused = useWorldStore((s) => s.toggles.paused);
  const autoTime = useWorldStore((s) => s.toggles.autoTime);
  const timeOfDay = useWorldStore((s) => s.settings.timeOfDay);
  const setToggle = useWorldStore((s) => s.setToggle);

  return (
    <div className="mw-timebar" role="group" aria-label="Time controls">
      <button
        type="button"
        className={`mw-timebar-btn${paused ? ' is-active' : ''}`}
        aria-pressed={paused}
        title="Pause or resume everything (Space)"
        onClick={() => setToggle('paused', !paused)}
      >
        <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
        {paused ? 'Resume' : 'Pause'}
      </button>
      <button
        type="button"
        className={`mw-timebar-btn${autoTime ? ' is-active' : ''}`}
        aria-pressed={autoTime}
        title="Auto: one in-app day lasts 24 real minutes"
        onClick={() => setToggle('autoTime', !autoTime)}
      >
        <span aria-hidden="true">◐</span>
        {autoTime ? 'Auto' : 'Standard'}
      </button>
      <div className="mw-timebar-clock" aria-label="Time of day">
        {clockText(timeOfDay)}
      </div>
    </div>
  );
}
