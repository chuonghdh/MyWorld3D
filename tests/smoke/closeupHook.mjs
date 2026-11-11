// Close-up camera control without a src/ hook (T-0020). The production build exposes no scene handle, but three.js
// announces every WebGLRenderer and Scene to a global `__THREE_DEVTOOLS__` EventTarget when one exists. This init
// script defines it, keeps the main scene (the one that holds the 'people' group) and wraps renderer.render:
// right before each main-scene render it can place the camera next to one instance of an instanced mesh (walkers
// move several metres per software-GL frame, so the target is re-read on every render) and restore it afterwards.
// Order of injection: after INIT_SCRIPT (counters.mjs). State lives on window.__closeup.

export const CLOSEUP_HOOK = `(() => {
  const st = { scene: null, renderer: null, camera: null, shot: null };
  window.__closeup = st;
  const dev = new EventTarget();
  window.__THREE_DEVTOOLS__ = dev;
  const isMain = (scene) => {
    if (!scene) return false;
    if (st.scene) return scene === st.scene;
    if (scene.getObjectByName && scene.getObjectByName('people')) { st.scene = scene; return true; }
    return false;
  };
  const place = (cam, shot) => {
    const mesh = st.scene.getObjectByName(shot.mesh);
    if (!mesh || mesh.count <= shot.index) return false;
    const e = mesh.instanceMatrix.array;
    const o = shot.index * 16;
    const w = mesh.matrixWorld.elements;
    const lx = e[o + 12], ly = e[o + 13], lz = e[o + 14];
    const px = w[0] * lx + w[4] * ly + w[8] * lz + w[12];
    const py = w[1] * lx + w[5] * ly + w[9] * lz + w[13];
    const pz = w[2] * lx + w[6] * ly + w[10] * lz + w[14];
    const scale = Math.hypot(e[o + 4], e[o + 5], e[o + 6]);
    // Local +z of the instance is the walking direction (writeInstance rotates about y by the heading).
    const fx = e[o + 8], fz = e[o + 10];
    const fl = Math.hypot(fx, fz) || 1;
    const heading = Math.atan2(fx / fl, fz / fl);
    const a = heading + shot.yaw;
    const ty = py + shot.chest * scale;
    const cx = px + Math.sin(a) * shot.distance;
    const cz = pz + Math.cos(a) * shot.distance;
    const cy = ty + shot.distance * shot.lift;
    cam.position.set(cx, cy, cz);
    cam.lookAt(px, ty, pz);
    cam.updateMatrixWorld(true);
    return true;
  };
  const hookRenderer = (r) => {
    st.renderer = r;
    const orig = r.render.bind(r);
    r.render = (scene, camera) => {
      if (!isMain(scene) || !camera.isPerspectiveCamera) return orig(scene, camera);
      st.camera = camera;
      if (!st.shot) return orig(scene, camera);
      const saved = { p: camera.position.clone(), q: camera.quaternion.clone(), near: camera.near };
      st.placed = place(camera, st.shot);
      if (st.placed) { camera.near = 0.05; camera.updateProjectionMatrix(); }
      orig(scene, camera);
      camera.position.copy(saved.p); camera.quaternion.copy(saved.q); camera.near = saved.near;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    };
  };
  dev.addEventListener('observe', (ev) => {
    const o = ev.detail;
    if (o && o.isWebGLRenderer) hookRenderer(o);
    else if (o && o.isScene && !st.scene) st.candidate = o;
  });
})();`;
