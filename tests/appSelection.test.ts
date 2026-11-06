import { beforeEach, describe, expect, it } from 'vitest';
import { useWorldStore } from '../src/store';

const APP_SOURCE = import.meta.glob('../src/App.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// App keeps the selection in the store; CameraRig reads the same field for the orbit pivot.
describe('selection single source of truth', () => {
  beforeEach(() => useWorldStore.setState({ selected: null }));

  it('setSelected stores a house, block or tree target and clearing sets null', () => {
    useWorldStore.getState().setSelected({ type: 'house', id: 'h1' });
    expect(useWorldStore.getState().selected).toEqual({ type: 'house', id: 'h1' });
    useWorldStore.getState().setSelected({ type: 'block', id: 'b1' });
    expect(useWorldStore.getState().selected).toEqual({ type: 'block', id: 'b1' });
    useWorldStore.getState().setSelected(null);
    expect(useWorldStore.getState().selected).toBeNull();
  });

  it('App.tsx reads selection from the store, not from React state', () => {
    const src = Object.values(APP_SOURCE)[0];
    expect(src).toMatch(/const selected = useWorldStore\(\(s\) => s\.selected\)/);
    expect(src).toMatch(/const setSelected = useWorldStore\(\(s\) => s\.setSelected\)/);
    expect(src).not.toMatch(/useState<OverrideTarget/);
  });
});
