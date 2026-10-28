import { beforeEach, describe, expect, it } from 'vitest';
import { useWorldStore } from '../src/store';
import { createEmptyLayout } from '../src/store/model';
import { exportLayout, importLayout, LAYOUT_VERSION } from '../src/store/io';

const BLOCKS = ['b1', 'b2', 'b3'];

function resetStore() {
  const layout = createEmptyLayout(1);
  useWorldStore.setState({
    ...layout,
    past: [],
    future: [],
    toggles: { tiltShift: false, moveBlocks: false, music: false, paused: false, autoTime: false },
  });
  useWorldStore.getState().setBlockOrder(BLOCKS);
  // setBlockOrder is undoable; clear history so each test starts clean.
  useWorldStore.setState({ past: [], future: [] });
}

describe('world store', () => {
  beforeEach(resetStore);

  it('setSetting changes a value', () => {
    useWorldStore.getState().setSetting('windSpeed', 12);
    expect(useWorldStore.getState().settings.windSpeed).toBe(12);
  });

  it('undo and redo restore a setting change', () => {
    const s = useWorldStore.getState;
    s().setSetting('windSpeed', 12);
    expect(s().settings.windSpeed).toBe(12);

    s().undo();
    expect(s().settings.windSpeed).toBe(5);

    s().redo();
    expect(s().settings.windSpeed).toBe(12);
  });

  it('swapBlocks swaps two entries in the order list', () => {
    useWorldStore.getState().swapBlocks('b1', 'b3');
    expect(useWorldStore.getState().blockOrder).toEqual(['b3', 'b2', 'b1']);
  });

  it('resetBlocks restores the base block order', () => {
    const s = useWorldStore.getState;
    s().swapBlocks('b1', 'b2');
    s().resetBlocks();
    expect(s().blockOrder).toEqual(BLOCKS);
  });

  it('history is bounded to 100 steps', () => {
    for (let i = 0; i < 150; i++) useWorldStore.getState().setSetting('windSpeed', i + 0.5);
    expect(useWorldStore.getState().past.length).toBe(100);
  });

  it('exportLayout then importLayout round-trips', () => {
    const s = useWorldStore.getState;
    s().setSetting('townWidth', 300);
    s().setOverride({ type: 'house', id: 'h1' }, { floors: 5, wallColor: '#aabbcc' });
    s().setOverride({ type: 'tree', id: 't1' }, { species: 'oak' });
    s().swapBlocks('b1', 'b2');

    const json = exportLayout(s());
    const result = importLayout(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layout.settings).toEqual(s().settings);
    expect(result.layout.blockOrder).toEqual(s().blockOrder);
    expect(result.layout.baseBlockOrder).toEqual(s().baseBlockOrder);
    expect(result.layout.houseOverrides).toEqual(s().houseOverrides);
    expect(result.layout.treeOverrides).toEqual(s().treeOverrides);
    expect(result.layout.blockOverrides).toEqual(s().blockOverrides);
  });

  it('exported JSON carries the version field', () => {
    const json = exportLayout(useWorldStore.getState());
    expect(JSON.parse(json).version).toBe(LAYOUT_VERSION);
  });

  it('importLayout rejects garbage without throwing', () => {
    const inputs = [
      'not json',
      '',
      'null',
      '[]',
      '42',
      '{}',
      '{"version":1}',
      '{"version":1,"settings":{},"blockOrder":[]}',
      '{"version":1,"settings":{"seed":"x"},"blockOrder":[]}',
      '{"version":1,"blockOrder":[1,2]}',
    ];
    for (const input of inputs) {
      let result: ReturnType<typeof importLayout> | undefined;
      expect(() => {
        result = importLayout(input);
      }).not.toThrow();
      expect(result?.ok).toBe(false);
    }
  });

  it('importLayout rejects an unknown version', () => {
    const json = JSON.stringify({ ...JSON.parse(exportLayout(useWorldStore.getState())), version: 99 });
    const result = importLayout(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/version/i);
  });

  it('importLayout rejects invalid override values', () => {
    const data = JSON.parse(exportLayout(useWorldStore.getState()));
    data.houseOverrides = { h1: { floors: 20 } };
    const result = importLayout(JSON.stringify(data));
    expect(result.ok).toBe(false);
  });
});
