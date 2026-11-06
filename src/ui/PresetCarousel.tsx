// Horizontal picture carousel for the house Type (HousePanel). One radio card per preset: thumbnail on top
// (rendered by scene/houseThumbs.ts, HouseGlyph until it arrives), label below. Slides by arrow buttons,
// drag or swipe (scroll-snap), the mouse wheel and Left/Right/Home/End on the focused card (roving tabindex).
// The current card is centred on open without animation, smoothly after that.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { HouseGlyph } from './controls';
import { selectionTickCue } from './panelCue';
import './carousel.css';

export interface CarouselItem<T extends string> {
  value: T;
  label: string;
}

/** Pixels a press may move before it counts as a drag (then the click does not pick). */
const DRAG_SLOP_PX = 6;

function Thumb({ src }: { src: string | undefined }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [src]);
  return (
    <span className="mw-carousel-pic" aria-hidden="true">
      <span className="mw-carousel-glyph">
        <HouseGlyph />
      </span>
      {src && <img src={src} alt="" draggable={false} className={loaded ? 'is-loaded' : undefined} onLoad={() => setLoaded(true)} />}
    </span>
  );
}

export function PresetCarousel<T extends string>({
  label,
  items,
  value,
  thumbs,
  onChange,
}: {
  label: string;
  items: readonly CarouselItem<T>[];
  value: T;
  thumbs: Partial<Record<T, string>>;
  onChange: (v: T) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<T, HTMLButtonElement>());
  const firstCentre = useRef(true);
  const drag = useRef<{ id: number; x: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [ends, setEnds] = useState({ start: true, end: true });

  const updateEnds = () => {
    const el = track.current;
    if (!el) return;
    setEnds({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  };

  // Centre the current card: instant the first time (panel opening), smooth on later changes.
  useLayoutEffect(() => {
    const el = track.current;
    const card = cards.current.get(value);
    if (!el || !card) return;
    const left = card.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2;
    el.scrollTo({ left, behavior: firstCentre.current ? 'auto' : 'smooth' });
    firstCentre.current = false;
    updateEnds();
  }, [value]);

  // Vertical wheel scrolls the strip sideways (needs a non-passive listener to keep the panel from scrolling).
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY, behavior: 'auto' });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const pick = (v: T) => {
    if (v === value) return;
    onChange(v);
    selectionTickCue();
  };

  const step = (dir: -1 | 1) => {
    const el = track.current;
    const first = cards.current.values().next().value as HTMLButtonElement | undefined;
    if (!el || !first) return;
    el.scrollBy({ left: dir * (first.offsetWidth + 10), behavior: 'smooth' });
  };

  const onKey = (e: ReactKeyboardEvent, index: number) => {
    let next = index;
    if (e.key === 'ArrowLeft') next = index - 1;
    else if (e.key === 'ArrowRight') next = index + 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else return;
    e.preventDefault();
    next = Math.max(0, Math.min(items.length - 1, next));
    const v = items[next].value;
    pick(v);
    cards.current.get(v)?.focus({ preventScroll: true });
  };

  // Mouse drag (touch and pen use the native swipe with scroll-snap).
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !track.current) return;
    drag.current = { id: e.pointerId, x: e.clientX, left: track.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = track.current;
    if (!d || !el || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > DRAG_SLOP_PX) {
      d.moved = true;
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
    }
    if (d.moved) el.scrollLeft = d.left - dx;
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = track.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved || !el) return;
    suppressClick.current = true;
    el.classList.remove('is-dragging');
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="mw-field mw-carousel">
      <div className="mw-carousel-head">
        <span className="mw-muted">{label}</span>
        <span className="mw-carousel-current">{items.find((i) => i.value === value)?.label}</span>
      </div>
      <div className="mw-carousel-body">
        <button type="button" className="mw-carousel-arrow is-prev" aria-label="Previous types" disabled={ends.start} onClick={() => step(-1)}>
          ‹
        </button>
        <div
          ref={track}
          className="mw-carousel-track"
          role="radiogroup"
          aria-label={label}
          onScroll={updateEnds}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={(e) => {
            if (!suppressClick.current) return;
            suppressClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          {items.map((item, i) => {
            const on = item.value === value;
            return (
              <button
                key={item.value}
                ref={(el) => {
                  if (el) cards.current.set(item.value, el);
                  else cards.current.delete(item.value);
                }}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                className={on ? 'mw-carousel-card is-on' : 'mw-carousel-card'}
                onClick={() => pick(item.value)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <Thumb src={thumbs[item.value]} />
                <span className="mw-carousel-label">{item.label}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="mw-carousel-arrow is-next" aria-label="Next types" disabled={ends.end} onClick={() => step(1)}>
          ›
        </button>
      </div>
    </div>
  );
}
