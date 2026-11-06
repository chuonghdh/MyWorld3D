import { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { getCityLayout } from './city';
import {
  BlockEditOverlay, BlockPanel, DEFAULT_HOUSE_BASE, EditModeChip, HelpOverlay, HousePanel, MonumentPanel, PanelFocusContext,
  SettingsCity, TimeBar, FilmRecChip, isNarrowViewport, type CityAction, type PanelId,
} from './ui';
import { rectCentre, useBlockEdit } from './ui/useBlockEdit';
import { QUALITY_PRESETS, TREE_SPECIES, detectDevice, suggestQuality, useWorldStore, type OverrideTarget } from './store';
import * as audio from './audio';
import { Town, monumentBaseFor } from './scene/Town';
import { houseBaseFor } from './scene/townBlocks';
import { runtime } from './scene/runtime';
import { CameraRig } from './scene/CameraRig';
import { FilmRig } from './scene/FilmRig';
import { canvasFrameloop, useFilmLoopHold } from './film/loopHold';
import { BlockEditor } from './scene/BlockEditor';
import { PostFX } from './scene/PostFX';
import { ScreenshotRequest } from './scene/ScreenshotRequest';
import { FirstFrame } from './scene/FirstFrame';
import { getLightingForTime } from './environment';

// Scene shell: the 3D town fills the screen, the city settings sit on the right,
// and the selected house or monument block gets a panel on the left.
export function App() {
  const [selected, setSelected] = useState<OverrideTarget | null>(null);
  // One side panel open at a time. Phones start with every panel folded to an icon.
  const [activePanel, setActivePanel] = useState<PanelId | null>(() => (isNarrowViewport('(max-width: 600px)') ? null : 'settings'));
  const focus = useMemo(() => ({ active: activePanel, setActive: setActivePanel }), [activePanel]);
  // Choosing a house or monument opens its panel and folds the settings panel. On phones a block picked in block
  // mode keeps the map visible (the open panel would cover it and its + / - icons); the panel icon is in the top row.
  const select = useCallback((target: OverrideTarget | null) => {
    // Selection is locked while a film is recorded.
    if (useWorldStore.getState().toggles.filming) return;
    setSelected(target);
    const keepMap = target?.type === 'block' && useWorldStore.getState().editMode === 'block' && isNarrowViewport('(max-width: 600px)');
    if (target && !keepMap) setActivePanel('selection');
  }, []);
  const settings = useWorldStore((s) => s.settings);
  const toggles = useWorldStore((s) => s.toggles);
  const setSetting = useWorldStore((s) => s.setSetting);
  const setToggle = useWorldStore((s) => s.setToggle);
  const resetBlocks = useWorldStore((s) => s.resetBlocks);
  const resetHouses = useWorldStore((s) => s.resetHouses);
  const loadLayout = useWorldStore((s) => s.loadLayout);
  // Starting a film drops the current selection so no panel or block outline is recorded by accident.
  useEffect(() => {
    if (toggles.filming) setSelected(null);
  }, [toggles.filming]);

  const layout = getCityLayout(settings);
  const editMode = useWorldStore((s) => s.editMode);
  const blockEdit = useBlockEdit(layout, selected, select);
  // Growing from the panel on a phone folds the full-screen panel so the suggestion boxes on the map are visible.
  const toggleGrowFromPanel = () => {
    if (!blockEdit.growing && isNarrowViewport('(max-width: 600px)')) setActivePanel(null);
    blockEdit.toggleGrow();
  };
  const preset = QUALITY_PRESETS[settings.quality];
  const setSuggestedQuality = useWorldStore((s) => s.setSuggestedQuality);
  // Auto film holds the loop ('never', fixed film-time steps). Controlled prop: R3F re-applies it on every render.
  const filmLoopHeld = useFilmLoopHold((s) => s.held);

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
        runtime.cameraPresetRequests.push('overview');
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
      base={houseBaseFor(layout, selected.id) ?? DEFAULT_HOUSE_BASE}
      onAction={(a, id) => {
        if (a === 'original') useWorldStore.getState().clearOverride({ type: 'house', id });
      }}
    />
  ) : blockEdit.blockId && blockEdit.rect ? (
    <BlockPanel
      merged={blockEdit.merged}
      cols={blockEdit.cols}
      rows={blockEdit.rows}
      widthM={blockEdit.rect.maxX - blockEdit.rect.minX}
      depthM={blockEdit.rect.maxZ - blockEdit.rect.minZ}
      canGrow={blockEdit.suggestions.length > 0}
      growing={blockEdit.growing}
      onToggleGrow={toggleGrowFromPanel}
      onSplit={blockEdit.split}
    />
  ) : selected?.type === 'block' && layout.blocks.some((b) => b.id === selected.id) ? (
    <MonumentPanel blockId={selected.id} base={monumentBaseFor(layout.blocks.find((b) => b.id === selected.id))} />
  ) : null;

  return (
    <div
      style={{ position: 'fixed', inset: 0 }}
      onPointerDown={() => audio.init()}
    >
      <Canvas
        shadows="soft"
        frameloop={canvasFrameloop(filmLoopHeld)}
        dpr={[1, preset.dprMax]}
        camera={{ position: [0, 380, 130], fov: 35, near: 1, far: 2000 }}
        onPointerMissed={() => setSelected(null)}
        onCreated={(state) => {
          // Explicit grade (was R3F's implicit default): ACES filmic, unit exposure. Keeps the warm look.
          state.gl.toneMapping = THREE.ACESFilmicToneMapping;
          state.gl.toneMappingExposure = 1;
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
        <CameraRig />
        <FilmRig />
        <Town onSelect={select} selected={blockEdit.blockId ? null : selected} />
        <BlockEditor
          layout={layout}
          pickEnabled={editMode === 'block' && !toggles.moveBlocks}
          selectedRect={blockEdit.rect}
          suggestionRects={blockEdit.suggestionRects}
          onTapGround={blockEdit.tapGround}
          onApplySuggestion={blockEdit.apply}
        />
        <PostFX tiltShift={toggles.tiltShift} night={night} bloomScale={preset.bloom} msaa={preset.msaa} />
        <ScreenshotRequest />
        <FirstFrame />
      </Canvas>

      {/* Centred on the full screen width; below 1280 px it shrinks to icons so it clears the side panels. */}
      <div className="mw-topbar-host">
        <TimeBar />
      </div>
      <FilmRecChip />
      <BlockEditOverlay
        at={blockEdit.rect ? rectCentre(blockEdit.rect) : null}
        canGrow={blockEdit.suggestions.length > 0}
        canSplit={blockEdit.merged}
        growing={blockEdit.growing}
        suggestions={blockEdit.growing ? blockEdit.suggestionRects.map((r, i) => ({ ...(r ? rectCentre(r) : { x: 0, z: 0 }), label: blockEdit.suggestionLabels[i] })) : []}
        onToggleGrow={blockEdit.toggleGrow}
        onSplit={blockEdit.split}
        onApply={blockEdit.apply}
      />
      <EditModeChip mode={editMode} busy={blockEdit.busy} />
      <HelpOverlay />
      <PanelFocusContext.Provider value={focus}>
        <div className="mw-left-panel">{panel}</div>
        <div data-mw-right-panel className="mw-right-panel">
          <SettingsCity onAction={handleAction} />
        </div>
      </PanelFocusContext.Provider>
    </div>
  );
}
