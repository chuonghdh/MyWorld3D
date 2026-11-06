// Clock text helpers and the small SVG icons used by the time bar (analog clock, map, walker, camera).

export function clockText(hours: number): string {
  const total = Math.floor((((hours % 24) + 24) % 24) * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 12-hour clock text and AM/PM for a time of day in hours. */
export function clock12(hours: number): { text: string; period: 'AM' | 'PM' } {
  const total = Math.floor((((hours % 24) + 24) % 24) * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return { text: `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, period: hh < 12 ? 'AM' : 'PM' };
}

/** Small analog clock face; the hands follow the time of day. */
export function AnalogClock({ hours }: { hours: number }) {
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

export function MapIcon() {
  // A town seen from above: a square with two crossing streets.
  return (
    <svg className="mw-icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" />
      <path d="M10 2.5v15M2.5 10h15" />
    </svg>
  );
}

export function WalkerIcon() {
  // A walking person, in the style of a street-view pegman.
  return (
    <svg className="mw-icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="4.2" r="2" />
      <path d="M10 6.8v5.2M6 9.2l4-1.6 4 1.6M10 12l-3 5.2M10 12l3 5.2" />
    </svg>
  );
}

export function CameraIcon() {
  return (
    <svg className="mw-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 6.5h3l1.2-2h5.6l1.2 2h3v9.5H3z" />
      <circle cx="10" cy="11" r="2.8" />
    </svg>
  );
}
