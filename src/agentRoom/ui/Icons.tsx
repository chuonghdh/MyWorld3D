// Inline SVG icons (currentColor, 20 px). No icon library.
import type { ReactElement } from 'react';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function I({ children }: { children: ReactElement | ReactElement[] }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...P}>
      {children}
    </svg>
  );
}

export const Icon = {
  overview: () => (
    <I>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </I>
  ),
  agents: () => (
    <I>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2" />
      <path d="M16 4.5a3 3 0 0 1 0 6M18 14.5c1.7.6 2.8 2.3 3 5" />
    </I>
  ),
  tasks: () => (
    <I>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8 9l1.6 1.6L13 7.2M8 15.5h8" />
    </I>
  ),
  activity: () => (
    <I>
      <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
    </I>
  ),
  settings: () => (
    <I>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </I>
  ),
  play: () => (
    <I>
      <path d="M7 4.5v15l12-7.5z" />
    </I>
  ),
  pause: () => (
    <I>
      <path d="M8 5v14M16 5v14" />
    </I>
  ),
  restart: () => (
    <I>
      <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" />
    </I>
  ),
  fullscreen: () => (
    <I>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </I>
  ),
};
