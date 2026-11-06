// Top control bar: pause, auto/standard time, digital clock, a Map / Street view switch and Photo.
// It folds to a small analog clock with an expand button, so it stays out of the way.
// On phones (up to 600 px) it becomes a two-row panel (see TimeBarPhone.tsx).
import { useEffect, useState } from 'react';
import { useWorldStore } from '../store';
import { isNarrowViewport } from './uiUtils';
import { FilmButton } from './FilmButton';
import { slideVars, useSlide } from './slide';
import { panelCue } from './panelCue';
import { AnalogClock, clock12 } from './TimeBarIcons';
import { AutoButton, PauseButton, PhotoButton, ViewSwitch } from './TimeBarControls';
import { PhoneTimeBar } from './TimeBarPhone';

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

export function TimeBar() {
  const timeOfDay = useWorldStore((s) => s.settings.timeOfDay);
  const phone = usePhoneLayout();
  const [collapsed, setCollapsed] = useState(false);

  if (phone) return <PhoneTimeBar timeOfDay={timeOfDay} />;

  // Both shapes stay mounted: the controls and the small analog clock slide in and out sideways (same timings as
  // the panels, always animated), and the bar width follows. Hidden parts are out of the tab order (.mw-hslide).
  return <TimeBarSliding timeOfDay={timeOfDay} collapsed={collapsed} setCollapsed={setCollapsed} />;
}

function TimeBarSliding({
  timeOfDay,
  collapsed,
  setCollapsed,
}: {
  timeOfDay: number;
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
}) {
  const controls = useSlide(!collapsed, false);
  const folded = useSlide(collapsed, false);
  const flip = () => {
    setCollapsed(!collapsed);
    panelCue(collapsed);
  };
  return (
    <div
      className={`mw-timebar mw-timebar-sliding${collapsed ? ' mw-timebar-folded' : ''}`}
      role="group"
      aria-label="Time controls"
      style={slideVars()}
    >
      <div className={folded.expanded ? 'mw-hslide is-open' : 'mw-hslide'} aria-hidden={!collapsed}>
        <div className="mw-hslide-inner">
          <div className="mw-hslide-row">
            <div className="mw-clock-folded">
              <AnalogClock hours={timeOfDay} />
              <span className="mw-clock-period" aria-hidden="true">
                {clock12(timeOfDay).period}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className={controls.expanded ? 'mw-hslide is-open' : 'mw-hslide'} aria-hidden={collapsed}>
        <div className="mw-hslide-inner">
          <div className="mw-hslide-row">
            <PauseButton />
            <AutoButton />
            <div className="mw-timebar-clock" aria-label="Time of day">
              {clock12(timeOfDay).text}
              <span className="mw-clock-period">{clock12(timeOfDay).period}</span>
            </div>
            <ViewSwitch />
            <PhotoButton />
            <FilmButton />
          </div>
        </div>
      </div>
      <button
        type="button"
        className="mw-timebar-btn mw-timebar-fold"
        aria-label={collapsed ? 'Expand the time bar' : 'Fold the time bar'}
        title={collapsed ? 'Show the controls' : 'Fold to the clock'}
        onClick={flip}
      >
        {collapsed ? '▸' : '◂'}
      </button>
    </div>
  );
}
