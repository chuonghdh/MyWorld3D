// Camera height as a plain text line above the edit badge (bottom centre). No box: text with a soft shadow, so it reads
// on light and dark ground. Reads runtime.cameraHeight on a 10 Hz timer and re-renders only when the text changes.
// Hidden in street walk (runtime.streetMode) and while filming (CSS, see film.css).
import { useEffect, useState } from 'react';
import { runtime } from '../core/runtime';
import { useWorldStore } from '../store';
import { formatHeight } from './heightText';

const TICK_MS = 100;

export function HeightLabel() {
  const [text, setText] = useState<string | null>(null);
  const filming = useWorldStore((s) => s.toggles.filming);
  useEffect(() => {
    const tick = () => {
      const next = runtime.streetMode ? null : formatHeight(runtime.cameraHeight);
      setText((prev) => (prev === next ? prev : next));
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  if (!text || filming) return null;
  return (
    <div className="mw-height-label" aria-hidden="true">
      {text}
    </div>
  );
}
