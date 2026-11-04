// Auto film camera driver (video P5). Registered as the auto film source (ui/filmSession.ts): autoRun.ts calls
// setPose(pose) once per frame and then renderFrame(). FilmRig has no useFrame: the fixed-step loop owns the camera.
// During the run the R3F frameloop is 'never' and renderFrame advances every useFrame subscriber by exactly 1/fps of
// film time (simulation, audio tap, PostFX composer), so the world moves with the film, not with encode speed.
// The city, seed, sun, moon and film fov are a snapshot taken when the run starts. The carrier bird (life/filmBird.ts,
// one mesh) joins the scene at run start and is disposed when filming ends; the normal frameloop is then restored.
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getCityLayout } from '../city';
import { useWorldStore } from '../store';
import { getMoonDirection, getSunDirection } from '../environment/sun';
import { currentFilmTime, type AutoFilmInputs } from '../film/autoRun';
import { film } from '../config/tuning';
import { createFixedStepper } from '../film/fixedStep';
import { registerAutoFilmSource } from '../ui/filmSession';
import { birdPoseAt, createFilmBird, type FilmBird, type FilmPathPose } from '../life/filmBird';
import { buildFilmPath, wallFloorFn, type FilmPath, type FilmPose } from './filmPath';
import { filmClipPlanes } from './filmLook';
import { clipPlanesStale } from './cameraMath';
import { resetAudioTap } from '../film/audioSnapshot';

/** True from the auto run start until filming ends: CameraRig leaves the camera to the film. */
let autoHolds = false;

export function autoFilmHoldsCamera(): boolean {
  return autoHolds;
}

export function FilmRig() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const get = useThree((s) => s.get);
  const advance = useThree((s) => s.advance);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const filming = useWorldStore((s) => s.toggles.filming);
  const path = useRef<FilmPath | null>(null);
  const bird = useRef<FilmBird | null>(null);
  const loopHeld = useRef(false);
  const scratch = useRef<FilmPose>({ position: [0, 0, 0], target: [0, 0, 0] });

  // Register the source. The run takes its snapshot here, once per auto film.
  useEffect(() => {
    const sample = (t: number): FilmPathPose => {
      const p = path.current;
      const out = scratch.current;
      if (p) p.poseAt(t, out);
      return {
        x: out.position[0], y: out.position[1], z: out.position[2],
        tx: out.target[0], ty: out.target[1], tz: out.target[2],
      };
    };
    registerAutoFilmSource((): AutoFilmInputs | null => {
      const settings = useWorldStore.getState().settings;
      const layout = getCityLayout(settings);
      path.current = buildFilmPath({
        layout,
        seed: settings.seed,
        sun: getSunDirection(settings.timeOfDay),
        moon: getMoonDirection(settings.timeOfDay),
        fovDeg: camera.fov,
      });
      const floor = wallFloorFn(layout);
      if (!bird.current) {
        bird.current = createFilmBird();
        scene.add(bird.current.group);
      }
      autoHolds = true;
      // Fixed film-time steps: stop the real-time loop; each renderFrame advances the whole scene by 1/fps.
      setFrameloop('never');
      loopHeld.current = true;
      const stepper = createFixedStepper(film.fps, get().clock.elapsedTime, (ts) => advance(ts, true));
      return {
        path: path.current,
        canvas: gl.domElement,
        setPose: (pose: FilmPose) => {
          const { position, target } = pose;
          camera.position.set(position[0], position[1], position[2]);
          camera.lookAt(target[0], target[1], target[2]);
          // Clip planes from the height above the route floor (risk 15); CameraRig does not run them during the film.
          const want = filmClipPlanes(position[1] - floor(position[0], position[2]));
          if (clipPlanesStale(camera.near, camera.far, want)) {
            camera.near = want.near;
            camera.far = want.far;
            camera.updateProjectionMatrix();
          }
          bird.current?.update(birdPoseAt(currentFilmTime(), sample));
        },
        // One fixed step: simulation, audio tap and the PostFX composer (priority 1) run with dt = 1/fps.
        renderFrame: () => stepper.step(),
      };
    });
    return () => registerAutoFilmSource(null);
  }, [gl, scene, camera, get, advance, setFrameloop]);

  // Filming ends (saved or cancelled): release the camera, remove the bird, restore the real-time loop.
  useEffect(() => {
    if (filming) return;
    autoHolds = false;
    resetAudioTap();
    if (bird.current) {
      scene.remove(bird.current.group);
      bird.current.dispose();
      bird.current = null;
    }
    path.current = null;
    if (loopHeld.current) {
      loopHeld.current = false;
      setFrameloop('always');
    }
  }, [filming, scene, setFrameloop]);

  return null;
}
