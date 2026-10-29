// Instanced meshes for pedestrians and their dogs.
//   - one InstancedMesh per age group (adult, child, elder, teen), about 420 triangles per person (all parts,
//     including the hidden hair, garments and face; see personGeometry.ts). Each mesh serves both sexes through
//     the morph attributes and holds every hair style, garment and face,
//   - one InstancedMesh for dogs (about 130 triangles), one for leashes, one for umbrellas.
// That is at most 7 draw calls for all people. The walk cycle, poses, outfits and sex are resolved in the vertex
// shader from per-instance attributes (see rigShader.ts and outfit.ts), so update() only writes matrices and a
// few floats per instance and allocates nothing.
//
// Readability: people are drawn at 1.1x scale. From the default top-down camera an adult is only about
// 0.5 m wide, so the extra 10 percent plus wide shoulders, saturated tops and dark hair keep them readable
// without turning them into cartoon figures. In addition people grow by up to 70 percent when the (perspective)
// camera is high above the town (camera y from 60 m to 300 m), so they stay visible as coloured figures in
// the whole-map view; at street level the boost is zero. The camera is read in onBeforeRender, no wiring needed.

import * as THREE from 'three';
import { BODY_ADULT, BODY_CHILD, BODY_ELDER, BODY_TEEN, POSE_WALK, type PedestrianRender } from '../pedestrians';
import { finish, writeInstance, type VisualContext } from '../meshKit';
import { RigBuilder } from './rigBuilder';
import { buildPerson, gaitOf, triangleCount, type BodyKind, type PersonModel } from './personGeometry';
import { buildDog, type DogModel } from './dogGeometry';
import { PALETTE_SIZES, type SeasonName } from './palettes';
import { FLAG, outfitFlags } from './outfit';
import { applySeasonPalette, createDogMaterials, createPeopleUniforms, createPersonMaterials, type PeopleUniforms } from './rigShader';

export interface PeopleMeshes {
  group: THREE.Group;
  /** The adult mesh (kept for backwards compatibility). */
  pedestrians: THREE.InstancedMesh;
  /** Adult, child, elder and teen meshes, indexed by BODY_*. */
  bodies: THREE.InstancedMesh[];
  dogs: THREE.InstancedMesh;
  leashes: THREE.InstancedMesh;
  umbrellas: THREE.InstancedMesh;
  /** Geometry facts for tests and tooling. */
  models: { person: PersonModel[]; dog: DogModel; umbrellaTriangles: number };
  setNight(on: boolean): void;
  update(pedestrians: readonly PedestrianRender[], ctx: VisualContext): void;
  dispose(): void;
}

/** Visual scale of every person (see header). */
export const PEOPLE_READ_SCALE = 1.1;
const DOG_SCALE = 1.15;
const TWO_PI = Math.PI * 2;
/** Mesh order matches the BODY_* constants (index = body id). */
const KINDS: BodyKind[] = ['adult', 'child', 'elder', 'teen'];
const UMBRELLA_COLORS = ['#c0392b', '#2c4a9c', '#e8b030', '#2d6a3d', '#6a3a7a', '#222228', '#e07a9a', '#1f7a82', '#f1f0e8', '#d9622b'];

function instancedAttr(mesh: THREE.InstancedMesh, name: string, itemSize: number, capacity: number): Float32Array {
  const arr = new Float32Array(capacity * itemSize);
  const attr = new THREE.InstancedBufferAttribute(arr, itemSize);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute(name, attr);
  return arr;
}

function buildUmbrella(): THREE.BufferGeometry {
  const b = new RigBuilder();
  b.set(0, 0, 0xffffff);
  b.frustum(0, 0, 0.2, 0, 0.55, 0.03, 8, 1, 1, false, false);
  b.set(0, 0, 0x3a3a3e);
  b.box(0, -0.78, 0.04, 0, 0.022, 0.022, 0.022, 0.022, 0, true, false);
  return b.build();
}

export function createPeopleMeshes(pedestrianCapacity = 512, dogCapacity = 256): PeopleMeshes {
  const group = new THREE.Group();
  group.name = 'people';
  const uniforms: PeopleUniforms = createPeopleUniforms();

  // --- People ---
  const models: PersonModel[] = KINDS.map((k) => buildPerson(k));
  const materials = models.map((m) => createPersonMaterials(m, uniforms));
  const gait: Float32Array[] = [];
  const look: Float32Array[] = [];
  const look2: Float32Array[] = [];
  const bodies = models.map((m, i) => {
    const mesh = new THREE.InstancedMesh(m.geometry, materials[i].material, pedestrianCapacity);
    mesh.name = 'pedestrians-' + KINDS[i];
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.customDepthMaterial = materials[i].depth;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gait.push(instancedAttr(mesh, 'aGait', 4, pedestrianCapacity));
    look.push(instancedAttr(mesh, 'aLook', 4, pedestrianCapacity));
    look2.push(instancedAttr(mesh, 'aLook2', 4, pedestrianCapacity));
    group.add(mesh);
    return mesh;
  });

  // --- Dogs ---
  const dogModel = buildDog();
  const dogMats = createDogMaterials(uniforms);
  const dogs = new THREE.InstancedMesh(dogModel.geometry, dogMats.material, dogCapacity);
  dogs.name = 'dogs';
  dogs.count = 0;
  dogs.frustumCulled = false;
  dogs.castShadow = true;
  dogs.customDepthMaterial = dogMats.depth;
  dogs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dogAttr = instancedAttr(dogs, 'aDog', 4, dogCapacity);
  group.add(dogs);

  // --- Leashes: one thin box per dog, stretched from the hand to the collar by its instance matrix ---
  const leashGeo = new THREE.BoxGeometry(0.014, 0.014, 1);
  leashGeo.translate(0, 0, 0.5);
  const leashMat = new THREE.MeshLambertMaterial({ color: '#7a2a24' });
  const leashes = new THREE.InstancedMesh(leashGeo, leashMat, dogCapacity);
  leashes.name = 'leashes';
  leashes.count = 0;
  leashes.frustumCulled = false;
  leashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(leashes);

  // --- Umbrellas ---
  const umbrellaGeo = buildUmbrella();
  const umbrellaMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const umbrellas = new THREE.InstancedMesh(umbrellaGeo, umbrellaMat, pedestrianCapacity);
  umbrellas.name = 'umbrellas';
  umbrellas.count = 0;
  umbrellas.frustumCulled = false;
  umbrellas.castShadow = true;
  umbrellas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const umbrellaTmp = new THREE.Color();
  for (let i = 0; i < pedestrianCapacity; i++) umbrellas.setColorAt(i, umbrellaTmp.set(UMBRELLA_COLORS[i % UMBRELLA_COLORS.length]));
  const umbrellaColours = UMBRELLA_COLORS.map((c) => new THREE.Color(c));
  group.add(umbrellas);

  let viewBoost = 1;
  const readCamera = (_r: THREE.WebGLRenderer, _s: THREE.Scene, camera: THREE.Camera): void => {
    // Shadow passes use orthographic light cameras: keep the boost of the last main render.
    if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return;
    const t = Math.min(1, Math.max(0, (camera.position.y - 60) / 240));
    viewBoost = 1 + 0.7 * t * t * (3 - 2 * t);
  };
  for (const m of [...bodies, dogs]) m.onBeforeRender = readCamera;

  const counts = new Int32Array(KINDS.length);
  let lastSeason: SeasonName | '' = '';
  const emissive = [materials.map((m) => m.material), [dogMats.material]].flat();

  const setNight = (on: boolean): void => {
    // A faint cool floor so tops and trousers never fall to black under the night lighting.
    for (const m of emissive) m.emissive.setHex(on ? 0x1b1d26 : 0x000000);
  };

  function writeLeash(index: number, hx: number, hy: number, hz: number, ex: number, ey: number, ez: number): void {
    let zx = ex - hx;
    let zy = ey - hy;
    let zz = ez - hz;
    const len = Math.hypot(zx, zy, zz) || 1e-4;
    zx /= len;
    zy /= len;
    zz /= len;
    // x axis = normalize(up x z) = (zz, 0, -zx) normalised.
    let xx = zz;
    let xz = -zx;
    const xl = Math.hypot(xx, xz);
    if (xl < 1e-4) {
      xx = 1;
      xz = 0;
    } else {
      xx /= xl;
      xz /= xl;
    }
    // y axis = z x x
    const yx = zy * xz;
    const yy = zz * xx - zx * xz;
    const yz = -zy * xx;
    const e = leashes.instanceMatrix.array as Float32Array;
    const o = index * 16;
    e[o] = xx;
    e[o + 1] = 0;
    e[o + 2] = xz;
    e[o + 3] = 0;
    e[o + 4] = yx;
    e[o + 5] = yy;
    e[o + 6] = yz;
    e[o + 7] = 0;
    e[o + 8] = zx * len;
    e[o + 9] = zy * len;
    e[o + 10] = zz * len;
    e[o + 11] = 0;
    e[o + 12] = hx;
    e[o + 13] = hy;
    e[o + 14] = hz;
    e[o + 15] = 1;
  }

  return {
    group,
    pedestrians: bodies[BODY_ADULT],
    bodies,
    dogs,
    leashes,
    umbrellas,
    models: { person: models, dog: dogModel, umbrellaTriangles: triangleCount(umbrellaGeo) },
    setNight,
    update(list, ctx) {
      uniforms.uTime.value = ctx.time;
      if (ctx.season !== lastSeason) {
        lastSeason = ctx.season;
        applySeasonPalette(uniforms, ctx.season);
      }
      for (const m of emissive) (m as unknown as { uniformsNeedUpdate: boolean }).uniformsNeedUpdate = true;
      const season = ctx.season;
      const rain = ctx.rain ?? 0;
      const rainOn = rain > 0.05;
      const umbrellaShare = Math.min(0.92, 0.35 + rain * 0.8);
      counts[0] = counts[1] = counts[2] = counts[3] = 0;
      let d = 0;
      let u = 0;

      for (let n = 0; n < list.length; n++) {
        const ped = list[n];
        const bi = ped.body === BODY_CHILD ? BODY_CHILD : ped.body === BODY_ELDER ? BODY_ELDER : ped.body === BODY_TEEN ? BODY_TEEN : BODY_ADULT;
        const idx = counts[bi];
        if (idx >= pedestrianCapacity) continue;
        counts[bi] = idx + 1;
        const model = models[bi];
        const mesh = bodies[bi];
        const female = ped.female ? 1 : 0;
        const spec = gaitOf(KINDS[bi], female);
        const scale = PEOPLE_READ_SCALE * viewBoost * ped.scale * spec.heightK;
        writeInstance(mesh, idx, ped.position.x, ped.position.z, ped.heading, ped.y, scale);

        // One outfit per season (a pure function of the walker's traits), plus the umbrella bit in the rain.
        const r2 = ped.phase / TWO_PI;
        let flags = outfitFlags(season, ped.traits, r2, ped.umbrellaRank);
        const umbrella = rainOn && ped.umbrellaRank < umbrellaShare;
        if (umbrella) flags |= FLAG.UMBRELLA;

        const g = gait[bi];
        const o4 = idx * 4;
        const walking = ped.pose === POSE_WALK && ped.speed > 0.02;
        g[o4] = walking ? (TWO_PI * ped.speed) / spec.cycle : 0;
        g[o4 + 1] = ped.phase;
        g[o4 + 2] = walking ? 0 : ped.pose === POSE_WALK ? 1 : ped.pose;
        g[o4 + 3] = spec.amp;
        const lk = look[bi];
        lk[o4] = ped.top % PALETTE_SIZES.top;
        lk[o4 + 1] = ped.pants % PALETTE_SIZES.pants;
        lk[o4 + 2] = ped.hair % PALETTE_SIZES.hair;
        lk[o4 + 3] = ped.skin % PALETTE_SIZES.skin;
        const l2 = look2[bi];
        l2[o4] = ped.accent % PALETTE_SIZES.accent;
        l2[o4 + 1] = flags;
        l2[o4 + 2] = female;
        l2[o4 + 3] = ped.hairStyle;

        if (umbrella && u < pedestrianCapacity) {
          // Held in the right hand: a little to the right and ahead, canopy above the head.
          const c = Math.cos(ped.heading);
          const s = Math.sin(ped.heading);
          const ux = ped.position.x - c * 0.22 * scale + s * 0.22 * scale;
          const uz = ped.position.z + s * 0.22 * scale + c * 0.22 * scale;
          const sitDrop = ped.pose === 3 ? model.seatDrop * scale : 0;
          // Colour follows the person, not the packed slot, so it stays fixed as others open or close theirs.
          const colour = umbrellaColours[Math.floor(((ped.umbrellaRank * 9973) % 1) * umbrellaColours.length)];
          umbrellas.setColorAt(u, colour);
          writeInstance(umbrellas, u, ux, uz, ped.heading, ped.y + (model.headTop + 0.3) * scale - sitDrop, 0.85 * Math.max(0.8, scale));
          u++;
        }

        const dog = ped.dog;
        if (dog && d < dogCapacity) {
          writeInstance(dogs, d, dog.position.x, dog.position.z, dog.heading, ped.y, DOG_SCALE * viewBoost);
          const da = dogAttr;
          const o = d * 4;
          const moving = dog.speed > 0.05;
          da[o] = moving ? (TWO_PI * dog.speed) / dogModel.cycleLength : 0;
          da[o + 1] = dog.phase;
          da[o + 2] = dog.coat % PALETTE_SIZES.coat;
          da[o + 3] = moving ? 1 : 0;
          // Leash: from the walker's hand to the dog's collar.
          const handY = ped.y + model.hip[0] * scale * 0.95;
          const fx = Math.sin(dog.heading);
          const fz = Math.cos(dog.heading);
          writeLeash(
            d,
            dog.leashHand.x,
            handY,
            dog.leashHand.z,
            dog.position.x + fx * dogModel.collarZ * DOG_SCALE * viewBoost,
            ped.y + dogModel.collarY * DOG_SCALE * viewBoost,
            dog.position.z + fz * dogModel.collarZ * DOG_SCALE * viewBoost,
          );
          d++;
        }
      }

      for (let b = 0; b < KINDS.length; b++) {
        const mesh = bodies[b];
        finish(mesh, counts[b]);
        (mesh.geometry.getAttribute('aGait') as THREE.BufferAttribute).needsUpdate = true;
        (mesh.geometry.getAttribute('aLook') as THREE.BufferAttribute).needsUpdate = true;
        (mesh.geometry.getAttribute('aLook2') as THREE.BufferAttribute).needsUpdate = true;
      }
      finish(dogs, d);
      (dogs.geometry.getAttribute('aDog') as THREE.BufferAttribute).needsUpdate = true;
      leashes.count = d;
      leashes.instanceMatrix.needsUpdate = true;
      finish(umbrellas, u);
    },
    dispose() {
      for (const mesh of bodies) mesh.geometry.dispose();
      for (const m of materials) {
        m.material.dispose();
        m.depth.dispose();
      }
      dogs.geometry.dispose();
      dogMats.material.dispose();
      dogMats.depth.dispose();
      leashGeo.dispose();
      leashMat.dispose();
      umbrellaGeo.dispose();
      umbrellaMat.dispose();
    },
  };
}
