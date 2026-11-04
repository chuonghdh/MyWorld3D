// Camera button next to Photo: opens the film picker. Always visible; the picker explains when recording is unavailable.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorldStore } from '../store';
import { FilmPicker } from './FilmPicker';

function FilmIcon() {
  // A cine camera: body, lens and a reel.
  return (
    <svg className="mw-icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="6" width="11" height="8" rx="1.5" />
      <path d="M13.5 9.2l4-2.2v6l-4-2.2" />
    </svg>
  );
}

export function FilmButton() {
  const [open, setOpen] = useState(false);
  const filming = useWorldStore((s) => s.toggles.filming);
  return (
    <>
      <button
        type="button"
        className={`mw-timebar-btn mw-timebar-icon${open || filming ? ' is-active' : ''}`}
        aria-label="Film"
        aria-expanded={open}
        disabled={filming}
        title="Record a film of the town (MP4)"
        onClick={() => setOpen((o) => !o)}
      >
        <FilmIcon />
      </button>
      {open && !filming && createPortal(<FilmPicker onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
