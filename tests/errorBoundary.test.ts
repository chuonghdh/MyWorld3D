// Error screen: the top-level boundary turns a render error into the dark panel with a Reload button.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ErrorBoundary, ErrorPanel } from '../src/ui/ErrorBoundary';
import { bootDone, bootRemove } from '../src/ui/boot';

describe('error boundary', () => {
  it('renders its children while there is no error', () => {
    const html = renderToString(createElement(ErrorBoundary, null, createElement('p', null, 'town')));
    expect(html).toBe('<p>town</p>');
  });

  it('stores the error and renders the panel with the message and a Reload button', () => {
    const state = ErrorBoundary.getDerivedStateFromError(new ReferenceError('junctionArms is not defined'));
    const boundary = new ErrorBoundary({});
    boundary.state = state;
    const html = renderToString(boundary.render() as React.ReactElement);
    expect(html).toContain('Something went wrong loading the town');
    expect(html).toContain('junctionArms is not defined');
    expect(html).toContain('Reload');
    expect(html).toContain('role="alert"');
  });

  it('wraps non-Error throws and shortens long messages', () => {
    expect(ErrorBoundary.getDerivedStateFromError('boom').error?.message).toBe('boom');
    const html = renderToString(createElement(ErrorPanel, { message: 'x'.repeat(1000), onReload: () => undefined }));
    expect(html).toContain('x'.repeat(400));
    expect(html).not.toContain('x'.repeat(401));
  });

  it('boot helpers do nothing without a DOM', () => {
    expect(() => {
      bootDone();
      bootRemove();
    }).not.toThrow();
  });
});
