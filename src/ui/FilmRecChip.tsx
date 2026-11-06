// REC chip while a film is recording: elapsed time and Stop. DOM only, never drawn into the video.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { elapsedText } from './filmUtils';
import { getFilmStatus, stopFilm, subscribeFilm } from './filmSession';
import './film.css';

/** Refresh interval of the elapsed time, ms. */
const TICK_MS = 250;
/** How long an outcome message (saved, failed, cancelled) stays on screen, ms. */
const MESSAGE_MS = 4000;

export function FilmRecChip() {
  const status = useSyncExternalStore(subscribeFilm, getFilmStatus, getFilmStatus);
  const [now, setNow] = useState(() => Date.now());
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    if (!status.message || status.recording || status.saving) return;
    setShowMessage(true);
    const id = window.setTimeout(() => setShowMessage(false), MESSAGE_MS);
    return () => window.clearTimeout(id);
  }, [status.message, status.recording, status.saving]);

  useEffect(() => {
    if (!status.recording) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [status.recording]);

  if (status.saving) {
    return (
      <div className="mw-rec-chip" role="status">
        Saving film...
      </div>
    );
  }
  if (!status.recording) {
    return status.message && showMessage ? (
      <div className="mw-rec-chip" role="status">
        {status.message}
      </div>
    ) : null;
  }
  return (
    <div className="mw-rec-chip is-live" role="status" aria-label="Recording">
      <span className="mw-rec-dot" aria-hidden="true" />
      <span>REC {elapsedText(now - status.startedAt)}</span>
      <span>/ {elapsedText(status.seconds * 1000)}</span>
      <button type="button" onClick={() => void stopFilm()}>
        Stop
      </button>
    </div>
  );
}
