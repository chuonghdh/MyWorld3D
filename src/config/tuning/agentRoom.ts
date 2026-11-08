/** Agent Working Room (agent-room.html): bridge, overlay timing, motion and demo simulation (ADR 0013). Owner: Technical Architect. */
export const agentRoom = {
  /** Local bridge port on 127.0.0.1 (tools/agent-bridge, SSE stream and hook POST). */
  bridgePort: 4317,
  /** Events the bridge keeps for reconnect replay (Last-Event-ID), count. */
  bridgeRingSize: 500,
  /** Rate of the zustand UI mirror copied from the live world buffer, updates per second. */
  mirrorHz: 10,
  /** Mission-control wall texture redraws, per second. */
  wallRedrawHz: 4,
  /** How long a speech bubble stays visible, seconds. */
  bubbleLifeSec: 6,
  /** How long a communication arc between two agents stays visible, seconds. */
  arcLifeSec: 2.5,
  /** Points kept in each agent's path trail, count. */
  trailLength: 32,
  /** Seed of the labelled simulation demo. */
  simSeed: 8,
  /** Simulation demo event rate, events per minute. */
  simEventsPerMin: 30,
  /** Agent walking and flying speed in the room, metres per second (doubled from 2.8). */
  avatarWalkSpeed: 5.6,
  /** Ease-in / ease-out ramp at each end of a move, metres of path (0 turns the ease off). */
  easeRampM: 1.5,
  /** Speed at the very start and end of a move, as a fraction of full speed (0 to 1). */
  easeMinSpeedFrac: 0.15,
  /** Seconds without events before an agent shows as idle. */
  idleAfterSec: 20,
  /** Camera distance from the room centre, metres. */
  viewDistance: 18,
  /** Demo events generated per simulation loop, count. */
  simLoopEvents: 400,
  /** How long a delegated specialist stays at the hub meeting before walking back, seconds. */
  meetHoldSec: 8,
  /** Replay playback: seconds between replayed events (real history is compressed to this pace). */
  replayStepSec: 1.5,
  /** Seed of the room scenery (floor noise, skyline, lit windows). Separate from simSeed so the demo never moves the scenery. */
  roomSeed: 21,
  /** Starting render quality: 'high' (shadows) or 'performance'. */
  qualityDefault: 'high' as 'high' | 'performance',
  /** Half width of the office (x), metres. The floor plan (desk blocks, aisle, board, pantry) scales with it. */
  roomHalfWidth: 12.5,
  /** After finishing, how long an agent stays at the board to report before going back, seconds. */
  reportHoldSec: 6,
  /** Length of the celebration burst when an agent finishes, seconds. */
  celebrateSec: 1.5,
  /** Director camera: seconds to stay on one event before moving to the next. */
  directorDwellSec: 6,
  /** Window sky and interior light follow the local clock (true) or stay at blue hour (false). */
  followRealClock: true as boolean,
  /** Opacity of the dark tint over the city picture on the board (0 = picture only, 1 = dark). */
  boardPanelOpacity: 0.15,
  /** Board ticker redraw rate (status messages scroll on the board canvas), redraws per second. */
  boardTickerHz: 12,
  /** Board ticker scroll speed, board canvas pixels per simulated second. */
  boardTickerPxPerSec: 90,
  /** Lead robot body colour (torso and head), so the lead reads apart from the grey specialists. */
  leadRobotColor: '#ff8a1f',
  /** Colour of the warm light over the discuss table centre (yellow). */
  tableLightColor: '#ffd84a',
  /** Colour of the discuss table top (bright blue). */
  discussTableColor: '#3aa8ff',
  /** Guest desk centre x, metres (upper-left of the room, an empty area). */
  guestDeskX: -8,
  /** Guest desk centre z, metres. */
  guestDeskZ: -5,
  /** Intensity of the light over the discuss table centre, candela. */
  tableLightIntensity: 10,
  /** Forward pitch of a flying (gliding) robot at full speed, radians. Zero gravity: no legs. */
  flyLeanRad: 0.28,
  /** Hover bob amplitude of a floating robot, metres. */
  hoverAmpM: 0.05,
  /** Extra tall plants placed on the room floor (seeded, off the walkways), count. */
  plantTallCount: 2,
  /** Extra short plants placed on the room floor (seeded, off the walkways), count. */
  plantShortCount: 1,
  /** Height of a tall plant, metres. */
  plantTallHeightM: 1.7,
  /** Height of a short plant, metres. */
  plantShortHeightM: 0.7,
  /** Lead desk yaw, radians: 0 faces the member desks head-on (the lead sits on the far side, away from them). */
  leadDeskYaw: 0,
  /** Camera distance when focusing an agent or desk, metres. */
  camFocusDistance: 7.5,
  /** Camera target damping rate, per second (higher follows faster). */
  camDampTarget: 4,
  /** Camera distance damping rate, per second. */
  camDampDistance: 2,
  /** Largest distance multiplier used to fit the view into the space between panels. */
  camFitMax: 2.2,
} as const;
