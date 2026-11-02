// Dev-only tree view. Shows one representative tree per city type (grouped tree, pine, birch), built with
// loadNatureAssets (natureAssetFromGltf, splitFoliage, attachWeather) and createNatureTreeField. Pick types,
// season and weather here; every tuning in src/streets/natureTrees.ts is the same one the city gets.
// Not part of the city build. Served by the dev server at /tree-compare.html.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Season } from '../../core/types';
import { WEATHER_KINDS, type WeatherKind } from '../../core/weatherKinds';
import { createWindUniforms, updateWindUniforms, type WindUniforms } from '../../environment/trees';
import type { TreeField } from '../../environment/forest';
import { gustStrength, triggerGust, windVector, type GustEvent } from '../../environment/wind';
import { loadNatureAssets } from './labLoader';
import { LabLeafEmitter } from './labLeaves';
import { crownDiscsFromGroup } from '../../environment/leaves';
import {
  createNatureTreeField,
  NATURE_TYPES,
  TREE_SCALE,
  type NatureAsset,
  type NatureTreeItem,
} from './labNatureTrees';

type GroupName = 'tree' | 'pine' | 'birch';
import { weatherTargets } from '../../weather/weatherState';
import { setSurfaceWeather } from '../../weather/wet';

/** City default weather intensity (weather/index.ts createWeather), so the lab snow matches the city. */
const WEATHER_INTENSITY = 0.6;
const WIND = { speed: 5, direction: 315 };
const GRID_SPACING = 7;

const ui = {
  types: document.getElementById('types') as HTMLDivElement,
  weather: document.getElementById('weather') as HTMLSelectElement,
  status: document.getElementById('status') as HTMLDivElement,
  seasons: [...document.querySelectorAll<HTMLButtonElement>('[data-season]')],
  all: document.getElementById('all') as HTMLButtonElement,
  none: document.getElementById('none') as HTMLButtonElement,
};

// ---- Scene -----------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fc3d9');
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 800);
camera.position.set(0, 30, 60);
const controls = new OrbitControls(camera, renderer.domElement);

scene.add(new THREE.HemisphereLight('#dfeeff', '#6b5a48', 1.1));
const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
sun.position.set(-30, 50, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 300 });
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: '#6b7a4b', roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---- Representative trees: one per city type, grouped tree / pine / birch ------------------------
// Groups follow the species: birch, conifer (evergreen) and the rest as tree. Each type is one tree at the city's
// scale (TREE_SCALE, as natureItems applies to every slot), so the asset builder and the field are the city's.
const uniforms: WindUniforms = createWindUniforms(10);
let gusts: GustEvent[] = [];
const groupOf = (k: number): GroupName => {
  const t = NATURE_TYPES[k];
  return t.species === 'birch' ? 'birch' : t.evergreen ? 'pine' : 'tree';
};
const GROUP_NAMES: readonly GroupName[] = ['tree', 'pine', 'birch'];
const picked = new Set<number>(NATURE_TYPES.map((_, i) => i));
let season: Season = 'summer';
let assets: NatureAsset[] = [];
let field: TreeField | null = null;
// Lab-only falling leaves from the crowns, autumn only (labLeaves.ts). The city does not use it.
const leafEmitter = new LabLeafEmitter(scene);

/** One representative tree per type; columns are groups, rows the types inside each group. */
const representatives: NatureTreeItem[] = NATURE_TYPES.map((_, k) => {
  const g = GROUP_NAMES.indexOf(groupOf(k));
  const row = NATURE_TYPES.slice(0, k).filter((_, j) => groupOf(j) === groupOf(k)).length;
  return {
    id: `rep-${NATURE_TYPES[k].file}`,
    position: { x: g * GRID_SPACING * 2, z: row * GRID_SPACING },
    scale: TREE_SCALE,
    type: k,
    yaw: 0,
  };
});

function rebuild(): void {
  if (assets.length === 0) return;
  if (field) {
    field.group.removeFromParent();
    field.dispose();
  }
  const shown = representatives.filter((t) => picked.has(t.type));
  field = createNatureTreeField(shown, assets, season);
  scene.add(field.group);
  leafEmitter.setDiscs(crownDiscsFromGroup(field.group));
  controls.target.set(GRID_SPACING * 2, 4, GRID_SPACING * 1.5);
  camera.position.set(GRID_SPACING * 2, 10, GRID_SPACING * 1.5 + 26);
  controls.update();
  ui.status.textContent = `${shown.length} trees shown (${season}, ${ui.weather.value})`;
}

// ---- Controls --------------------------------------------------------------------------------
/** Group checkbox above its type checkboxes; toggling a group tunes that group alone. */
function buildPicker(): void {
  ui.types.textContent = '';
  for (const g of GROUP_NAMES) {
    const members = NATURE_TYPES.map((_, k) => k).filter((k) => groupOf(k) === g);
    const head = document.createElement('label');
    head.style.fontWeight = '600';
    const headBox = document.createElement('input');
    headBox.type = 'checkbox';
    headBox.checked = members.every((k) => picked.has(k));
    headBox.addEventListener('change', () => {
      for (const k of members) (headBox.checked ? picked.add(k) : picked.delete(k));
      ui.types.querySelectorAll<HTMLInputElement>(`input[data-group="${g}"]`).forEach((b) => (b.checked = headBox.checked));
      rebuild();
    });
    head.append(headBox, ` ${g}`);
    ui.types.appendChild(head);
    for (const k of members) {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.paddingLeft = '18px';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.dataset.group = g;
      box.checked = picked.has(k);
      box.addEventListener('change', () => {
        if (box.checked) picked.add(k);
        else picked.delete(k);
        headBox.checked = members.every((m) => picked.has(m));
        rebuild();
      });
      label.append(box, ` ${NATURE_TYPES[k].file}`);
      ui.types.appendChild(label);
    }
  }
}

function setAll(on: boolean): void {
  NATURE_TYPES.forEach((_, k) => (on ? picked.add(k) : picked.delete(k)));
  ui.types.querySelectorAll<HTMLInputElement>('input').forEach((b) => (b.checked = on));
  rebuild();
}

function setSeasonButtons(next: Season): void {
  season = next;
  leafEmitter.setEnabled(next === 'autumn');
  for (const b of ui.seasons) b.classList.toggle('active', b.dataset.season === next);
  applyWeather(ui.weather.value as WeatherKind);
  field?.setSeason(next);
  ui.status.textContent = `${picked.size} types shown (${season}, ${ui.weather.value})`;
}

function applyWeather(kind: WeatherKind): void {
  // The same targets the city's weather eases toward, at full intensity; written to the shared surface uniforms.
  const t = weatherTargets(kind, WEATHER_INTENSITY);
  setSurfaceWeather(t.wet, t.snowCover, { r: 0.55, g: 0.62, b: 0.7 }, 1);
}

ui.weather.innerHTML = WEATHER_KINDS.map((k) => `<option value="${k}">${k}</option>`).join('');
ui.weather.value = 'clear';
ui.weather.addEventListener('change', () => {
  applyWeather(ui.weather.value as WeatherKind);
  rebuild();
});
// Collapse the control panel to its header; the scene keeps running underneath.
const panel = document.getElementById('ui') as HTMLDivElement;
const toggle = document.getElementById('toggle') as HTMLButtonElement;
toggle.addEventListener('click', () => {
  const collapsed = panel.classList.toggle('collapsed');
  toggle.textContent = collapsed ? 'show' : 'hide';
  toggle.setAttribute('aria-expanded', String(!collapsed));
});
ui.all.addEventListener('click', () => setAll(true));
ui.none.addEventListener('click', () => setAll(false));
for (const b of ui.seasons) b.addEventListener('click', () => setSeasonButtons(b.dataset.season as Season));
buildPicker();
applyWeather('clear');
setSeasonButtons('summer');

window.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target !== renderer.domElement) return;
  gusts = triggerGust(gusts, clock.getElapsedTime(), 6);
});

// ---- Loop ------------------------------------------------------------------------------------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  updateWindUniforms(uniforms, t, windVector(t, WIND, gusts), gustStrength(t, gusts));
  leafEmitter.update(t, windVector(t, WIND, gusts), camera, { x: controls.target.x, z: controls.target.z });
  controls.update();
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

loadNatureAssets(uniforms)
  .then((a) => {
    assets = a;
    rebuild();
  })
  .catch((err: unknown) => {
    console.error('[treeCompare] nature assets failed', err);
    ui.status.textContent = 'GLB load failed (see console)';
  });
