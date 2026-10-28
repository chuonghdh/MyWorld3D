// Maps the camera to an audio listener. Pure, unit tested.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ListenerState {
  x: number;
  y: number;
  z: number;
  /** Horizontal unit vector (yaw only). */
  forward: Vec3;
  up: Vec3;
  /** Camera height above the ground in metres; drives the zoom attenuation. */
  height: number;
}

export const STREET_HEIGHT = 8;
export const EAR_HEIGHT = 2;
export const MAX_RAY = 400;

/**
 * Above 8 m the listener stands on the ground point the camera looks at (ray hits y = 0, at most
 * 400 m from the camera, ear height 2 m); at or below 8 m it is the camera itself. Forward is the
 * camera yaw only. For a straight-down view the camera up vector gives the yaw.
 */
export function listenerFromCamera(cameraPos: Vec3, cameraDir: Vec3, cameraUp: Vec3): ListenerState {
  const dl = Math.hypot(cameraDir.x, cameraDir.y, cameraDir.z) || 1;
  const d = { x: cameraDir.x / dl, y: cameraDir.y / dl, z: cameraDir.z / dl };

  let hx = d.x;
  let hz = d.z;
  let hl = Math.hypot(hx, hz);
  if (hl < 0.05) {
    hx = cameraUp.x;
    hz = cameraUp.z;
    hl = Math.hypot(hx, hz);
  }
  const forward: Vec3 = hl < 1e-6 ? { x: 0, y: 0, z: -1 } : { x: hx / hl, y: 0, z: hz / hl };

  const height = cameraPos.y;
  let x = cameraPos.x;
  let y = cameraPos.y;
  let z = cameraPos.z;
  if (height > STREET_HEIGHT) {
    let t = MAX_RAY;
    if (d.y < -1e-4) t = Math.min(MAX_RAY, -cameraPos.y / d.y);
    else t = Math.min(MAX_RAY, height); // not looking down: look-ahead of one camera height
    if (d.y < -1e-4) {
      x = cameraPos.x + d.x * t;
      z = cameraPos.z + d.z * t;
    } else {
      x = cameraPos.x + forward.x * t;
      z = cameraPos.z + forward.z * t;
    }
    y = EAR_HEIGHT;
  }
  return { x, y, z, forward, up: { x: 0, y: 1, z: 0 }, height };
}
