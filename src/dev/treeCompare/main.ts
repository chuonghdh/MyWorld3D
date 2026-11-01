// Dev-only comparison: procedural street trees (createTreeField) vs Quaternius GLB trees (public/models/quaternius),
// both swayed by one shared WindUniforms object driven like src/scene/useTownFrame.ts.
// Not part of the city build. Served by the dev server at /tree-compare.html (not an entry of vite build).

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Season, TreeSpecies } from '../../core/types';
import { createTreeField, hashString, TriBuilder, type TreeField, type TreeFieldItem } from '../../environment/forest';
import { addBushBefore } from './bushBefore';
import { createRng } from '../../core/rng';
import { createCourtyardGreenery } from '../../environment/greenery';
import { createStreetFlora } from '../../environment/streetflora';
import {
  applyWindSway,
  createWindUniforms,
  seasonLeafColor,
  seasonLeafDensity,
  updateWindUniforms,
  type WindUniforms,
} from '../../environment/trees';
import { gustStrength, triggerGust, windVector, type GustEvent } from '../../environment/wind';
import { applyLeafVariety, setIslandVariety, type LeafVarietyUniforms } from '../../streets/natureTrees';

/** Same scale as useTownGreenery.ts TREE_SCALE, so both rows match the city. */
const TREE_SCALE = 1.35;
/** Same wind config defaults as store/model.ts (windSpeed 5, windDirection 315). */
const WIND = { speed: 5, direction: 315 };
const PROCEDURAL_SPECIES: readonly TreeSpecies[] = ['maple', 'oak', 'birch', 'ginkgo'];
const SPACING = 9;
const PROCEDURAL_Z = -4;
const GLB_Z = 6;
const GLB_FILES: readonly string[] = ['Tree_3', 'Tree_5', 'Birch_3', 'Pine_1', 'DeadTree_3'];
/** Every GLB in public/models/quaternius (45 files), for the gallery. */
const ALL_FILES: readonly string[] = [
  ...Array.from({ length: 10 }, (_, i) => `Birch_${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `DeadBirch_${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `DeadTree_${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `Pine_${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `Tree_${i + 1}`),
];

const uniforms: WindUniforms = createWindUniforms(10);
let gusts: GustEvent[] = [];

// ---- Scene -----------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fc3d9');
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(14, 12, 40);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(12, 4, 3);
controls.update();

scene.add(new THREE.HemisphereLight('#dfeeff', '#6b5a48', 1.1));
const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
sun.position.set(-30, 50, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 150 });
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: '#6f7d4e', roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---- GLB loading: keep each material's textures and vertex colours; only add the wind sway -------
const loader = new GLTFLoader();
const modelCache = new Map<string, Promise<THREE.Object3D>>();

// The GLBs carry no textures: the converted OBJ materials are flat grey (Kd 0.64). The maps are the pack's
// PNG/JPG files in public/models/quaternius/textures, chosen per species (the Blend files are not converted).
const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, Promise<THREE.Texture>>();

function loadTexture(name: string): Promise<THREE.Texture> {
  let p = textureCache.get(name);
  if (!p) {
    p = textureLoader.loadAsync(`/models/quaternius/textures/${name}`).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
    textureCache.set(name, p);
  }
  return p;
}

/** Bark and leaf maps for a model file. */
function texturesFor(file: string): { bark: string; leaf: string } {
  if (/^(Dead)?Birch/.test(file)) return { bark: 'Birch_Bark.png', leaf: 'Birch_Leaves_Green.png' };
  if (/^Pine/.test(file)) return { bark: 'Tree_Bark.jpg', leaf: 'Pine_Leaves.png' };
  return { bark: 'Tree_Bark.jpg', leaf: 'Tree_Leaves.png' };
}

/**
 * Clones every material (keeps its name and flags), binds the species map, and injects the sway on the
 * shared uniforms. Leaves are cut out by alpha (the PNGs are RGBA; the background is transparent).
 */
async function prepareGlb(file: string, root: THREE.Object3D): Promise<void> {
  const names = texturesFor(file);
  const [bark, leaf] = await Promise.all([loadTexture(names.bark), loadTexture(names.leaf)]);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const build = (src: THREE.Material): THREE.MeshStandardMaterial => {
      const m = src.clone() as THREE.MeshStandardMaterial;
      const isLeaf = /leave|leaf/i.test(src.name); // GLB names say "Leaves"
      m.map = isLeaf ? leaf : bark;
      m.color.set(0xffffff);
      if (isLeaf) {
        m.alphaTest = 0.5;
        m.side = THREE.DoubleSide;
      }
      m.needsUpdate = true;
      return applyWindSway(m, uniforms);
    };
    const src = o.material;
    o.material = Array.isArray(src) ? src.map(build) : build(src);
    o.castShadow = true;
    o.receiveShadow = true;
  });
  analyseLeaves(file, root);
}

/** Prepared model roots by file name (filled as each GLB loads). */
const loadedRoots = new Map<string, THREE.Object3D>();

function loadModel(file: string): Promise<THREE.Object3D> {
  let p = modelCache.get(file);
  if (!p) {
    p = loader.loadAsync(`/models/quaternius/${file}.glb`).then(async (gltf: GLTF) => {
      await prepareGlb(file, gltf.scene);
      loadedRoots.set(file, gltf.scene);
      return gltf.scene;
    });
    modelCache.set(file, p);
  }
  return p;
}

// ---- Rows ------------------------------------------------------------------------------------
const proceduralItems: TreeFieldItem[] = PROCEDURAL_SPECIES.map((species, i) => ({
  id: `cmp-${species}`,
  position: { x: i * SPACING, z: PROCEDURAL_Z },
  species,
  scale: TREE_SCALE,
}));
const proceduralField: TreeField = createTreeField(proceduralItems, { season: 'summer', uniforms, seed: 1 });
scene.add(proceduralField.group);

const glbGroup = new THREE.Group();
glbGroup.name = 'glb-row';
scene.add(glbGroup);

/** Places one clone per GLB file on the GLB row. */
async function buildGlbRow(): Promise<void> {
  const roots = await Promise.all(GLB_FILES.map((f) => loadModel(f)));
  glbGroup.clear();
  GLB_FILES.forEach((file, i) => {
    const obj = roots[i].clone(true);
    obj.position.set(i * SPACING, 0, GLB_Z);
    obj.rotation.y = i * 0.7;
    obj.scale.setScalar(TREE_SCALE);
    obj.name = `glb-${file}`;
    glbGroup.add(obj);
  });
}

// ---- Stats -----------------------------------------------------------------------------------
/** Triangles of visible meshes; an InstancedMesh counts per instance, like budget.test.ts. */
function measure(root: THREE.Object3D): { tris: number; draws: number } {
  let tris = 0;
  let draws = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    const g = o.geometry as THREE.BufferGeometry;
    const per = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
    tris += o instanceof THREE.InstancedMesh ? per * o.count : per;
    draws++;
  });
  return { tris, draws };
}

const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

function triCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
}

/** Triangles of one tree in a season: bark as built, leaves as thinned for that season. */
function treeTrisFor(root: THREE.Object3D, s: Season): number {
  let tris = 0;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const key = o.userData.leafKey as string | undefined;
    if (!key) {
      tris += triCount(o.geometry);
      return;
    }
    const geo = leafGeometry(leafParts.get(key)!, s);
    if (geo) tris += triCount(geo);
  });
  return tris;
}

/** One summary line: islands and triangles per island per GLB, density values, triangles per tree per season. */
async function summary(): Promise<Record<string, unknown>> {
  const islands: Record<string, number> = {};
  const trisPerIsland: Record<string, string> = {};
  const trisBySeason: Record<string, Record<string, number>> = {};
  for (const f of GLB_FILES) {
    const root = await loadModel(f);
    const parts = [...leafParts.values()].filter((p) => p.key.startsWith(`${f}#`));
    islands[f] = parts.reduce((n, p) => n + p.islands.length, 0);
    const sizes = parts.flatMap((p) => p.islands.map((t) => t.length));
    if (sizes.length) trisPerIsland[f] = `${Math.min(...sizes)}-${Math.max(...sizes)}`;
    trisBySeason[f] = Object.fromEntries(SEASONS.map((s) => [s, treeTrisFor(root, s)]));
  }
  return {
    density: Object.fromEntries(SEASONS.map((s) => [s, seasonLeafDensity(s)])),
    islands,
    trisPerIsland,
    trisBySeason,
    rowNowTris: Math.round(measure(glbGroup).tris),
    procedural: Math.round(measure(proceduralField.group).tris),
    failures: leafFailures,
  };
}

// ---- Wind driver (same order as useTownFrame: vector from config and gusts, then uniforms) --
const clock = new THREE.Clock();
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  gusts = triggerGust(gusts, clock.getElapsedTime(), 6);
});

renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  const wind = windVector(t, WIND, gusts);
  updateWindUniforms(uniforms, t, wind, gustStrength(t, gusts));
  controls.update();
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Gallery: every GLB in one grid, loaded on demand --------------------------------------------
const GALLERY_COLS = 9;
const GALLERY_SPACING = 10;
const galleryGroup = new THREE.Group();
galleryGroup.name = 'glb-gallery';
galleryGroup.visible = false;
scene.add(galleryGroup);
const defaultView = { pos: camera.position.clone(), target: controls.target.clone() };
let galleryOn = false;
let galleryBuilt = false;
const statusEl = document.getElementById('status') as HTMLDivElement;
const galleryBtn = document.getElementById('gallery') as HTMLButtonElement;

/** Canvas label with the file name, always facing the camera. */
function labelSprite(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(28, 24, 22, 0.8)';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#f1ebe3';
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(4, 1, 1);
  return sprite;
}

async function buildGallery(): Promise<void> {
  const roots = await Promise.all(ALL_FILES.map((f) => loadModel(f)));
  ALL_FILES.forEach((file, i) => {
    const x = (i % GALLERY_COLS) * GALLERY_SPACING;
    const z = Math.floor(i / GALLERY_COLS) * GALLERY_SPACING;
    const obj = roots[i].clone(true);
    obj.position.set(x, 0, z);
    obj.rotation.y = i * 0.7;
    obj.scale.setScalar(TREE_SCALE);
    obj.name = `gallery-${file}`;
    galleryGroup.add(obj);
    const label = labelSprite(file);
    label.position.set(x, 0.6, z + 4);
    galleryGroup.add(label);
  });
  await applySeason(season);
}

async function showGallery(on: boolean): Promise<void> {
  galleryOn = on;
  proceduralField.group.visible = !on;
  glbGroup.visible = !on;
  galleryGroup.visible = on;
  if (on) {
    camera.position.set(40, 62, 124);
    controls.target.set(40, 3, 20);
  } else {
    camera.position.copy(defaultView.pos);
    controls.target.copy(defaultView.target);
  }
  controls.update();
  galleryBtn.textContent = on ? 'Back to compare row' : 'All 45';
  if (!on || galleryBuilt) return;
  galleryBuilt = true;
  statusEl.textContent = `Loading ${ALL_FILES.length} trees...`;
  const t0 = performance.now();
  try {
    await buildGallery();
    statusEl.textContent = '';
    console.info('[treeCompare] gallery', JSON.stringify({ ms: Math.round(performance.now() - t0), trees: ALL_FILES.length, tris: Math.round(measure(galleryGroup).tris) }));
  } catch (err) {
    galleryBuilt = false;
    statusEl.textContent = 'Gallery failed to load (see console).';
    console.error('[treeCompare] gallery load failed', err);
  }
}

galleryBtn.addEventListener('click', () => void showGallery(!galleryOn));

// ---- Shrubs: procedural courtyard bushes (greenery.ts) next to Kenney Nature Kit bushes (CC0) -----
const KENNEY_SHRUBS = [
  'plant_bush',
  'plant_bushDetailed',
  'plant_bushLarge',
  'plant_bushTriangle',
  'plant_bushSmall',
  'plant_flatTall',
  'plant_flatShort',
] as const;
const KENNEY_FLOWERS = ['flower_purpleA', 'flower_redA', 'flower_yellowA', 'grass_large'] as const;
/** Native Kenney bushes are 0.2 to 0.6 m wide; x3 gives about the 0.55 to 0.85 m radius of greenery.ts addBush. */
const KENNEY_SHRUB_SCALE = 3;
const shrubGroup = new THREE.Group();
shrubGroup.name = 'shrub-compare';
shrubGroup.visible = false;
scene.add(shrubGroup);
let shrubsOn = false;
let shrubsBuilt = false;
const shrubBtn = document.getElementById('shrubs') as HTMLButtonElement;

/** Kenney model with its flat colours kept, and the same wind sway as the trees. */
function loadKenney(file: string): Promise<THREE.Object3D> {
  const key = `kenney/${file}`;
  let p = modelCache.get(key);
  if (!p) {
    p = loader.loadAsync(`/models/kenney-nature/${file}.glb`).then((gltf: GLTF) => {
      gltf.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const src = o.material as THREE.MeshStandardMaterial;
        const m = new THREE.MeshStandardMaterial({ color: src.color.clone(), flatShading: true, roughness: 0.9, metalness: 0 });
        applyWindSway(m, uniforms);
        o.material = m;
        o.castShadow = true;
        o.receiveShadow = true;
      });
      return gltf.scene;
    });
    modelCache.set(key, p);
  }
  return p;
}

async function buildShrubs(): Promise<void> {
  const shrubs = await Promise.all(KENNEY_SHRUBS.map(loadKenney));
  const flowers = await Promise.all(KENNEY_FLOWERS.map(loadKenney));

  // Row A (z = 0): bushes before the rework (x -6) and after it (x +6), same seeds and positions.
  const greenery = createCourtyardGreenery([{ minX: -4, maxX: 4, minZ: -4, maxZ: 4 }], 1);
  const bushes = greenery.getObjectByName('greenery-bushes');
  const before = new TriBuilder();
  for (let i = 0; i < 6; i++) addBushBefore(before, createRng(100 + i * 17), (i % 3) * 2.2 - 2.2, Math.floor(i / 3) * 2.4 - 1.2, 1 + i * 31, 0.7);
  let beforeMeshGeometry: THREE.BufferGeometry;
  const beforeMesh = new THREE.Mesh((beforeMeshGeometry = before.build()), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
  beforeMesh.name = 'bushes-before';
  beforeMeshGeometry = beforeMesh.geometry;
  beforeMesh.position.x = -6;
  shrubGroup.add(beforeMesh);
  shrubGroup.add(labelAt('before', -6, 0, -4.5));
  if (bushes instanceof THREE.Mesh) {
    const after = new THREE.Mesh(bushes.geometry, bushes.material);
    after.name = 'bushes-after';
    after.position.x = 6;
    shrubGroup.add(after);
    shrubGroup.add(labelAt('after (greenery bushes)', 6, 0, -4.5));
  }

  // Row B (z = 8): Kenney bushes at scale 3.
  KENNEY_SHRUBS.forEach((name, i) => {
    const obj = shrubs[i].clone(true);
    obj.position.set(i * 3.2 - 10, 0, 8);
    obj.rotation.y = i * 0.9;
    obj.scale.setScalar(KENNEY_SHRUB_SCALE);
    shrubGroup.add(obj);
    shrubGroup.add(labelAt(name, i * 3.2 - 10, 0, 5.5));
  });

  // Row C (z = 14): Kenney flowers and grass at native size, next to the street flora below.
  KENNEY_FLOWERS.forEach((name, i) => {
    const obj = flowers[i].clone(true);
    obj.position.set(i * 2.2 - 3.5, 0, 14);
    shrubGroup.add(obj);
    shrubGroup.add(labelAt(name, i * 2.2 - 3.5, 0, 11.8));
  });

  // Row D (z = 20): current street flora (createStreetFlora, rings in one tree pit).
  const flora = createStreetFlora([{ position: { x: 4, z: 20 }, species: 'oak', scale: 1.35, setting: 'street' }], [], {
    season: 'summer',
    seed: 1,
  });
  shrubGroup.add(flora.group);
  shrubGroup.add(labelAt('street-flora', 4, 0, 17.8));

  const per: Record<string, number> = {};
  KENNEY_SHRUBS.forEach((name, i) => (per[name] = Math.round(measure(shrubs[i]).tris)));
  const procTris = bushes instanceof THREE.Mesh ? triCountOf(bushes.geometry) : 0;
  const beforeTris = triCountOf(beforeMeshGeometry);
  console.info(
    '[treeCompare] shrubs',
    JSON.stringify({ kenneyTrisPerBush: per, proceduralCourtyardBushesTris: procTris, beforeSampleTris: beforeTris, streetFloraTris: Math.round(measure(flora.group).tris) }),
  );
}

function triCountOf(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
}

/** A label sprite placed at ground level in front of a row. */
function labelAt(text: string, x: number, y: number, z: number): THREE.Sprite {
  const s = labelSprite(text);
  s.position.set(x, y + 0.6, z);
  s.scale.set(3.2, 0.8, 1);
  return s;
}

async function showShrubs(on: boolean): Promise<void> {
  shrubsOn = on;
  shrubBtn.textContent = on ? 'Hide shrubs' : 'Shrubs';
  if (!on) {
    shrubGroup.visible = false;
    await showGallery(galleryOn);
    return;
  }
  proceduralField.group.visible = false;
  glbGroup.visible = false;
  galleryGroup.visible = false;
  shrubGroup.visible = true;
  camera.position.set(0, 13, -6);
  controls.target.set(0, 0.5, 9);
  controls.update();
  if (shrubsBuilt) return;
  shrubsBuilt = true;
  statusEl.textContent = 'Loading shrubs...';
  try {
    await buildShrubs();
    statusEl.textContent = '';
  } catch (err) {
    shrubsBuilt = false;
    statusEl.textContent = 'Shrubs failed to load (see console).';
    console.error('[treeCompare] shrubs load failed', err);
  }
}

shrubBtn.addEventListener('click', () => void showShrubs(!shrubsOn));

// ---- Seasons (GLB row and gallery) ------------------------------------------------------------
// The pack has no seasonal models or textures. Only the leaf materials are recoloured, with the leaf palette
// of trees.ts (seasonLeafColor). Bark keeps its texture. Multiplying a green map by the palette colour
// can only darken it: winter shows as dark brown leaves, not as frost.
let season: Season = 'summer';

/** Palette species for a model file: Birch uses birch, Pine uses ginkgo (dark green), the rest oak. */
function speciesFor(file: string): TreeSpecies {
  if (/Birch/.test(file)) return 'birch';
  if (file.startsWith('Pine')) return 'ginkgo';
  return 'oak';
}

// ---- Leaf islands: each leaf mesh splits into connected pieces (triangles sharing a vertex index) ----
interface LeafPart {
  key: string;
  /** Full leaf geometry as loaded. */
  full: THREE.BufferGeometry;
  /** Triangle indices of each island. */
  islands: number[][];
}
const leafParts = new Map<string, LeafPart>();
/** Thinned leaf geometry per part and season; null = no leaves that season. */
const leafGeoCache = new Map<string, THREE.BufferGeometry | null>();
const leafFailures: string[] = [];

function islandsOf(geo: THREE.BufferGeometry): number[][] {
  const vcount = geo.getAttribute('position').count;
  const idx = geo.index ? geo.index.array : null;
  const tcount = (idx ? idx.length : vcount) / 3;
  const v = (t: number, k: number) => (idx ? idx[3 * t + k] : 3 * t + k);
  const parent = new Int32Array(vcount);
  for (let i = 0; i < vcount; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let t = 0; t < tcount; t++) {
    const ra = find(v(t, 0));
    const rb = find(v(t, 1));
    if (rb !== ra) parent[rb] = ra;
    const rc = find(v(t, 2));
    const rr = find(ra);
    if (rc !== rr) parent[rc] = rr;
  }
  const byRoot = new Map<number, number[]>();
  for (let t = 0; t < tcount; t++) {
    const r = find(v(t, 0));
    const list = byRoot.get(r);
    if (list) list.push(t);
    else byRoot.set(r, [t]);
  }
  return [...byRoot.values()];
}

/** Records every leaf mesh of a loaded model: its key (copied into clones via userData) and its islands. */
function analyseLeaves(file: string, root: THREE.Object3D): void {
  let k = 0;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    if (!/leave|leaf/i.test(o.material.name)) return;
    const key = `${file}#${k++}`;
    const part: LeafPart = { key, full: o.geometry, islands: islandsOf(o.geometry) };
    if (part.islands.length <= 1) leafFailures.push(`${key} single island`);
    // Same leaf variety as the city: per-island randoms and the leaf shader (once per material).
    setIslandVariety(o.geometry, part.islands, hashString(key) >>> 0);
    if (!o.material.userData.variety) applyLeafVariety(o.material as THREE.MeshStandardMaterial);
    leafParts.set(key, part);
    o.userData.leafKey = key;
  });
}

/** Non-indexed copy of the given triangles with every attribute carried over. */
function subsetGeometry(src: THREE.BufferGeometry, tris: number[]): THREE.BufferGeometry {
  const idx = src.index ? src.index.array : null;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.getAttribute(name);
    const arr = new Float32Array(tris.length * 3 * a.itemSize);
    tris.forEach((t, ti) => {
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx[3 * t + k] : 3 * t + k;
        for (let c = 0; c < a.itemSize; c++) arr[(ti * 3 + k) * a.itemSize + c] = a.array[vi * a.itemSize + c];
      }
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  out.computeBoundingSphere();
  return out;
}

/**
 * Leaf geometry for a season, built once and cached. The island order is a seeded shuffle (seed from the
 * part key), so spring and autumn keep a prefix of the summer islands. Winter density is 0: no leaves.
 */
function leafGeometry(part: LeafPart, s: Season): THREE.BufferGeometry | null {
  const cacheKey = `${part.key}|${s}`;
  const cached = leafGeoCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const density = seasonLeafDensity(s);
  let geo: THREE.BufferGeometry | null = null;
  if (density >= 1) geo = part.full;
  else if (density > 0) {
    const rng = createRng(hashString(part.key) >>> 0);
    const order = part.islands.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const kept = order.slice(0, Math.round(order.length * density));
    geo = subsetGeometry(part.full, kept.flatMap((i) => part.islands[i]).sort((a, b) => a - b));
  }
  leafGeoCache.set(cacheKey, geo);
  return geo;
}

async function applySeason(next: Season): Promise<void> {
  await Promise.all(GLB_FILES.map((f) => loadModel(f)));
  [...loadedRoots].forEach(([file, root]) => {
    const leaf = seasonLeafColor(speciesFor(file), next);
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!/leave|leaf/i.test(m.name)) continue;
        const mat = m as THREE.MeshStandardMaterial;
        // Autumn: white base, the shader's luminance-matched ramp sets the colour (as in natureTrees.ts).
        mat.color.copy(next === 'autumn' ? new THREE.Color(0xffffff) : leaf);
        const v = mat.userData.variety as LeafVarietyUniforms | undefined;
        if (v) {
          v.uAutumn.value = next === 'autumn' ? 1 : 0;
          v.uVary.value = next === 'spring' ? 0.6 : next === 'summer' ? 1 : 0.5;
        }
      }
    });
  });
  // Clones share geometry by reference at clone time, so swap the geometry on the row's own meshes.
  for (const rowGroup of [glbGroup, galleryGroup]) rowGroup.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const part = leafParts.get(o.userData.leafKey as string);
    if (!part) return;
    const geo = leafGeometry(part, next);
    o.visible = geo !== null;
    if (geo) o.geometry = geo;
  });
}

async function setSeason(next: Season): Promise<void> {
  season = next;
  document.querySelectorAll<HTMLButtonElement>('[data-season]').forEach((b) => {
    b.classList.toggle('active', b.dataset.season === next);
  });
  try {
    await applySeason(next);
  } catch (err) {
    console.error('[treeCompare] season failed', err);
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-season]').forEach((b) => {
  b.addEventListener('click', () => void setSeason(b.dataset.season as Season));
});

// ---- Boot: failures are logged; success prints one summary line -----------------------------
buildGlbRow()
  .then(() => applySeason(season))
  .then(async () => {
    console.info('[treeCompare] summary', JSON.stringify(await summary()));
  })
  .catch((err: unknown) => console.error('[treeCompare] GLB load failed', err));
