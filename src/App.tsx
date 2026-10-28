import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { getCityLayout } from './city';
import { DEFAULT_HOUSE_BASE, HousePanel, MonumentPanel, SettingsCity, TimeBar, type CityAction } from './ui';
import { QUALITY_PRESETS, TREE_SPECIES, detectDevice, suggestQuality, useWorldStore, type OverrideTarget } from './store';
import * as audio from './audio';
import { Town, monumentBaseFor } from './scene/Town';
import { runtime } from './scene/runtime';
import { PostFX } from './scene/PostFX';
import { getLightingForTime } from './environment';

// Scene shell: the 3D town fills the screen, the city settings sit on the right,
// and the selected house or monument block gets a panel on the left.
export function App() {
  const [selected, setSelected] = useState<OverrideTarget | null>(null);
  const settings = useWorldStore((s) => s.settings);
  const toggles = useWorldStore((s) => s.toggles);
  const setSetting = useWorldStore((s) => s.setSetting);
  const setToggle = useWorldStore((s) => s.setToggle);
  const resetBlocks = useWorldStore((s) => s.resetBlocks);
  const resetHouses = useWorldStore((s) => s.resetHouses);
  const loadLayout = useWorldStore((s) => s.loadLayout);

  const layout = getCityLayout(settings);
  const preset = QUALITY_PRESETS[settings.quality];
  const setSuggestedQuality = useWorldStore((s) => s.setSuggestedQuality);

  const night = useMemo(() => getLightingForTime(settings.timeOfDay).sky.lightsOn, [settings.timeOfDay]);

  // Space pauses and resumes everything (handy for capturing a frame).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON')) return;
      e.preventDefault();
      const st = useWorldStore.getState();
      st.setToggle('paused', !st.toggles.paused);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleAction(action: CityAction, value?: boolean) {
    switch (action) {
      case 'gust':
        runtime.gustRequests++;
        break;
      case 'leafDevil':
        runtime.leafDevilRequests++;
        break;
      case 'sound':
        if (value !== undefined) setSetting('soundEnabled', value);
        audio.init();
        break;
      case 'music':
        setToggle('music', value ?? !toggles.music);
        break;
      case 'tiltShift':
        setToggle('tiltShift', value ?? !toggles.tiltShift);
        break;
      case 'switchTrees': {
        const state = useWorldStore.getState();
        const treeOverrides = { ...state.treeOverrides };
        for (const t of layout.streetTrees) {
          treeOverrides[t.id] = { species: TREE_SPECIES[Math.floor(Math.random() * TREE_SPECIES.length)] };
        }
        loadLayout({ ...state, treeOverrides });
        break;
      }
      case 'wholeMap':
        runtime.wholeMapRequests++;
        break;
      case 'moveBlocks':
        setToggle('moveBlocks', value ?? !toggles.moveBlocks);
        runtime.pendingBlockId = null;
        break;
      case 'resetBlocks':
        resetBlocks();
        break;
      case 'resetHouses':
        resetHouses();
        break;
    }
  }

  const panel = selected?.type === 'house' ? (
    <HousePanel
      houseId={selected.id}
      base={DEFAULT_HOUSE_BASE}
      onAction={(a, id) => {
        if (a === 'original') useWorldStore.getState().clearOverride({ type: 'house', id });
      }}
    />
  ) : selected?.type === 'block' ? (
    <MonumentPanel blockId={selected.id} base={monumentBaseFor(selected.id)} />
  ) : null;

  return (
    <div
      style={{ position: 'fixed', inset: 0 }}
      onPointerDown={() => audio.init()}
    >
      <Canvas
        shadows="soft"
        dpr={[1, preset.dprMax]}
        camera={{ position: [0, 380, 130], fov: 35, near: 1, far: 2000 }}
        onPointerMissed={() => setSelected(null)}
        onCreated={(state) => {
          // Suggest a quality tier from the GPU and device; the user decides whether to apply it.
          try {
            const gl = state.gl.getContext();
            const info = gl.getExtension('WEBGL_debug_renderer_info');
            const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : undefined;
            setSuggestedQuality(suggestQuality(detectDevice(renderer)));
          } catch {
            /* no suggestion */
          }
          // Dev-only handle for profiling from the browser console (draw calls, triangles).
          if (import.meta.env.DEV) (window as unknown as { __r3f?: unknown }).__r3f = state;
        }}
      >
        <Town onSelect={setSelected} />
        <PostFX tiltShift={toggles.tiltShift} night={night} bloomScale={preset.bloom} msaa={preset.msaa} />
        <OrbitControls
          target={[0, 0, 0]}
          enableDamping
          maxPolarAngle={Math.PI / 2.05}
          minDistance={40}
          maxDistance={600}
        />
      </Canvas>

      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)' }}>
        <TimeBar />
      </div>
      <div style={{ position: 'absolute', top: 16, left: 16, width: 280 }}>{panel}</div>
      <div style={{ position: 'absolute', top: 16, right: 16, width: 300 }}>
        <SettingsCity onAction={handleAction} />
      </div>
    </div>
  );
}
