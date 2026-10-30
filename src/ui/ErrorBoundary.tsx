// Top-level error boundary: a render error anywhere in the app (including inside the R3F Canvas, which rethrows to
// its parent) shows a dark panel with the message and a Reload button instead of an empty white page.
import { Component, createElement, type ReactNode } from 'react';
import { bootRemove } from './boot';

interface State {
  error: Error | null;
}

/** The fallback panel; reuses the boot screen styles from index.html. Exported for tests. */
export function ErrorPanel({ message, onReload }: { message: string; onReload: () => void }) {
  return createElement(
    'div',
    { className: 'mw-boot', role: 'alert' },
    createElement(
      'div',
      { className: 'mw-boot-card' },
      createElement('h1', { className: 'mw-boot-title' }, 'Something went wrong loading the town'),
      createElement('p', { className: 'mw-boot-msg' }, message.slice(0, 400)),
      createElement('button', { type: 'button', className: 'mw-boot-btn', onClick: onReload }, 'Reload'),
    ),
  );
}

export class ErrorBoundary extends Component<{ children?: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown): void {
    bootRemove();
    console.error('[MyWorld3D] render error', error);
  }

  render(): ReactNode {
    if (this.state.error) {
      return createElement(ErrorPanel, {
        message: this.state.error.message || 'Unknown error',
        onReload: () => location.reload(),
      });
    }
    return this.props.children ?? null;
  }
}
