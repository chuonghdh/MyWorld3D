// Film picker: Follow You (manual, real-time, length and output size) or Follow a Bird (auto, frame by frame, fixed
// length and 1080p). No prose: the toggle is the choice. A bottom sheet on phones.
import { useEffect, useState } from 'react';
import { film } from '../config/tuning';
import { filmSizeFor, clampSeconds, filmUnavailableReason, type FilmResolution } from './filmUtils';
import { isRecordingSupported } from '../film/recorder';
import { autoEncodeSupport } from '../film/autoRun';
import { filmViewSize } from '../film/resizeBridge';
import { startAutoFilm, startManualFilm } from './filmSession';
import './film.css';

type FilmMode = 'manual' | 'auto';

/** Size of the 3D view (WebGL canvas, device pixels), or the window size when it is not mounted yet. */
function windowSize(): { width: number; height: number } {
  return filmViewSize() ?? { width: window.innerWidth, height: window.innerHeight };
}

export function FilmPicker({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<FilmMode>('manual');
  const [seconds, setSeconds] = useState<number>(film.manualDefaultSeconds);
  const [res, setRes] = useState<FilmResolution>('hd');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Checked once when the picker opens: no recorder, or no MP4/WebM encoder, disables manual Record.
  const [manualUnavailable] = useState(() => filmUnavailableReason(typeof MediaRecorder !== 'undefined', isRecordingSupported()));
  // Auto support is probed once (no encoder is opened). A reason disables the Auto option (reason in its tooltip).
  const [auto, setAuto] = useState<{ checked: boolean; reason: string | null }>({ checked: false, reason: null });
  const win = windowSize();
  const size = filmSizeFor(res, win);

  useEffect(() => {
    let live = true;
    void autoEncodeSupport().then((reason) => {
      if (live) setAuto({ checked: true, reason });
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isAuto = mode === 'auto';
  const shownSeconds = isAuto ? film.autoSeconds : seconds;
  const shownReason = mode === 'manual' ? manualUnavailable : auto.reason;
  const startDisabled = busy || (mode === 'manual' ? manualUnavailable !== null : !auto.checked || auto.reason !== null);

  const start = () => {
    if (mode === 'auto') {
      setBusy(true);
      void startAutoFilm().then((err) => {
        setBusy(false);
        if (err) setError(err);
        else onClose();
      });
      return;
    }
    const err = startManualFilm({ seconds: clampSeconds(seconds), width: size.width, height: size.height });
    if (err) setError(err);
    else onClose();
  };

  const pick = (next: FilmMode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="mw-film-picker" role="dialog" aria-label="Film">
      <div className="mw-film-modes" role="radiogroup" aria-label="Film mode">
        <button type="button" role="radio" aria-checked={mode === 'manual'} className={mode === 'manual' ? 'is-on' : undefined} onClick={() => pick('manual')}>
          Follow You
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'auto'}
          className={mode === 'auto' ? 'is-on' : undefined}
          disabled={auto.reason !== null}
          title={auto.reason ?? undefined}
          onClick={() => pick('auto')}
        >
          Follow a Bird
        </button>
      </div>
      {/* Same rows in both modes so the picker keeps its height; Follow a Bird shows its fixed values read-only. */}
      <fieldset
        className={isAuto ? 'mw-film-fields is-fixed' : 'mw-film-fields'}
        disabled={isAuto || manualUnavailable !== null}
      >
        <div className="mw-film-row">
          <label htmlFor="mw-film-length">
            <span>Length</span>
            <span>{shownSeconds} s</span>
          </label>
          <input
            id="mw-film-length"
            type="range"
            min={film.manualMinSeconds}
            max={Math.max(film.manualMaxSeconds, film.autoSeconds)}
            step={1}
            value={shownSeconds}
            onChange={(e) => setSeconds(clampSeconds(Number(e.target.value)))}
          />
        </div>
        <div className="mw-film-row">
          <label htmlFor="mw-film-res">
            <span>Output</span>
            <span>MP4 (H.264)</span>
          </label>
          <select id="mw-film-res" value={isAuto ? 'hd' : res} onChange={(e) => setRes(e.target.value as FilmResolution)}>
            <option value="hd">Full HD {film.width1080} x {film.height1080}</option>
            {!isAuto && <option value="window">Window size {win.width - (win.width % 2)} x {win.height - (win.height % 2)}</option>}
          </select>
        </div>
      </fieldset>
      {(shownReason ?? error) && (
        <p className="mw-film-error" role="alert" title={shownReason ?? error ?? undefined}>
          {shownReason ?? error}
        </p>
      )}
      <div className="mw-film-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="mw-film-start" onClick={start} disabled={startDisabled}>
          Record
        </button>
      </div>
    </div>
  );
}
