// Film picker: manual film only in this build (length, output size, Start). A bottom sheet on phones.
import { useEffect, useState } from 'react';
import { film } from '../config/tuning';
import { filmSizeFor, clampSeconds, filmUnavailableReason, type FilmResolution } from './filmUtils';
import { isRecordingSupported } from '../film/recorder';
import { startManualFilm } from './filmSession';
import './film.css';

/** Size of the current 3D canvas (device pixels), or the window size when it is not mounted yet. */
function windowSize(): { width: number; height: number } {
  const canvas = document.querySelector('canvas');
  if (canvas instanceof HTMLCanvasElement) return { width: canvas.width, height: canvas.height };
  return { width: window.innerWidth, height: window.innerHeight };
}

export function FilmPicker({ onClose }: { onClose: () => void }) {
  const [seconds, setSeconds] = useState<number>(film.manualDefaultSeconds);
  const [res, setRes] = useState<FilmResolution>('hd');
  const [error, setError] = useState<string | null>(null);
  // Checked once when the picker opens: no recorder, or no MP4/WebM encoder, disables Start.
  const [unavailable] = useState(() => filmUnavailableReason(typeof MediaRecorder !== 'undefined', isRecordingSupported()));
  const win = windowSize();
  const size = filmSizeFor(res, win);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const start = () => {
    const err = startManualFilm({ seconds: clampSeconds(seconds), width: size.width, height: size.height });
    if (err) setError(err);
    else onClose();
  };

  return (
    <div className="mw-film-picker" role="dialog" aria-label="Film">
      <h2>Manual film</h2>
      <p>You drive the camera. The film ends when you press Stop or when the length is reached. Sound follows your volume settings.</p>
      <fieldset className="mw-film-fields" disabled={unavailable !== null}>
      <div className="mw-film-row">
        <label htmlFor="mw-film-length">
          <span>Length</span>
          <span>{seconds} s</span>
        </label>
        <input
          id="mw-film-length"
          type="range"
          min={film.manualMinSeconds}
          max={film.manualMaxSeconds}
          step={1}
          value={seconds}
          onChange={(e) => setSeconds(clampSeconds(Number(e.target.value)))}
        />
      </div>
      <div className="mw-film-row">
        <label htmlFor="mw-film-res">
          <span>Output</span>
          <span>MP4 (H.264)</span>
        </label>
        <select id="mw-film-res" value={res} onChange={(e) => setRes(e.target.value as FilmResolution)}>
          <option value="hd">Full HD {film.width1080} x {film.height1080}</option>
          <option value="window">Window size {win.width - (win.width % 2)} x {win.height - (win.height % 2)}</option>
        </select>
      </div>
      </fieldset>
      {unavailable && <p className="mw-film-error" role="alert">{unavailable}</p>}
      {error && <p className="mw-film-error" role="alert">{error}</p>}
      <div className="mw-film-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="mw-film-start" onClick={start} disabled={unavailable !== null}>
          Start
        </button>
      </div>
    </div>
  );
}
