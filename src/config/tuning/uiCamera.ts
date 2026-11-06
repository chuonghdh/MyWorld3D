/** UI & Camera: store defaults, slider ranges and the weather-lift rule (store/model.ts, ui/SettingsCity.tsx). */
export const uiCamera = {
  /** Default city seed (integer). */
  defaultSeed: 1,
  /** Default time of day in hours (0-24). */
  defaultTimeOfDay: 17.5,
  /** Default wind speed in m/s. */
  defaultWindSpeed: 5,
  /** Default wind direction in degrees. */
  defaultWindDirection: 315,
  /** Default town width in metres. */
  defaultTownWidth: 217,
  /** Default town depth in metres. */
  defaultTownDepth: 217,
  /** Default traffic and people multiplier (0-3). */
  defaultTrafficMultiplier: 1.75,
  /** Default street tree multiplier (0-3). */
  defaultStreetTreeMultiplier: 1,
  /** Default falling-leaf amount, 0-1 fraction. */
  defaultLeafAmount: 1,
  /** Default leaf size multiplier. */
  defaultLeafSize: 1,
  /** Default weather strength, 0-1. */
  defaultWeatherIntensity: 0.6,
  /** Default graphics tier at start. */
  defaultQuality: 'high',
  /** Real seconds one in-app day lasts in auto time (24 minutes). */
  dayLengthS: 24 * 60,
  /** Time-of-day slider maximum (hours). */
  timeMax: 24,
  /** Time-of-day slider step (hours). */
  timeStep: 0.25,
  /** Seconds the overview glides when a side panel opens or closes (view offset, real time, also while paused). */
  panelShiftSeconds: 1.5,
  /** Panel and settings-section slide open time, seconds (ease-out). 0 = instant. */
  panelAnimSeconds: 0.3,
  /** Panel and settings-section slide close time, seconds (ease-in; a little shorter than opening). */
  panelCloseSeconds: 0.22,
  /** Golden Hour button: clock hour it sets (18 = 6:00 PM); auto time is switched off so the clock holds there. */
  goldenHourTime: 18,
  /** Wind speed slider maximum (m/s). */
  windSpeedMax: 20,
  /** Wind speed slider step (m/s). */
  windSpeedStep: 0.1,
  /** Wind direction slider maximum (degrees). */
  windDirectionMax: 359,
  /** Wind direction slider step (degrees). */
  windDirectionStep: 1,
  /** Town width and depth slider minimum (m). */
  townMin: 100,
  /** Town width and depth slider maximum (m). */
  townMax: 400,
  /** Town width and depth slider step (m). */
  townStep: 1,
  /** Traffic and street tree slider maximum (multiplier). */
  multiplierMax: 3,
  /** Traffic and street tree slider step (multiplier). */
  multiplierStep: 0.05,
  /** Weather intensity slider step. */
  intensityStep: 0.01,
  /** Leaf amount slider step, 0-1 fraction. */
  leafAmountStep: 0.01,
  /** Leaf size slider minimum. */
  leafSizeMin: 0.5,
  /** Leaf size slider maximum. */
  leafSizeMax: 3,
  /** Leaf size slider step. */
  leafSizeStep: 0.1,
  /** Picking a non-clear weather below this intensity lifts it (0-1). */
  weatherLiftBelow: 0.15,
  /** Intensity a non-clear weather is lifted to when below the threshold (0-1). */
  weatherLiftTo: 0.6,
  /** Highest orbit distance from the target, metres. The aircraft altitude band depends on it. */
  maxDistance: 600,
  /** Closest orbit distance from the target, metres. */
  minDistance: 4,
  /** Eye height in street view, metres. */
  eyeHeight: 1.7,
  /** Duration of a camera tween, seconds. */
  tweenSeconds: 1,
  /** How far the orbit target may leave the town bounds, metres. */
  panMargin: 40,
  /** Camera height above which a tap selects a whole block, metres. */
  blockEditHeightM: 200,
  /** Lowest orbit angle from straight up, radians (keeps the camera above the ground). */
  maxPolarAngle: Math.PI / 2.05,
  /** OrbitControls damping factor (0-1). */
  dampingFactor: 0.08,
  /** Highest orbit target height, metres. */
  targetHeightMax: 40,
  /** Street walk speed, metres per second. */
  walkSpeed: 2.5,
  /** Street run speed (Shift), metres per second. */
  walkRunSpeed: 6,
  /** Street mouse look: radians per pixel. */
  lookSensitivity: 0.004,
  /** Street pitch limit, radians (up and down). */
  pitchLimit: 1.2,
  /** Whole-map framing margin on the town width (factor). */
  fitMargin: 1.06,
  /** Overview camera direction from the target (unnormalised: up, back). */
  overviewDirection: [0, 2.45, 0.63] as const,
  /** Height of the invisible block-edit pick plane, metres (above every roof). */
  pickHeightM: 150,
  /** Height of block-edit decals above the ground, metres (over roofs, below the pick plane). */
  decalHeightM: 0.3,
  /** Pointer movement above which a click is a drag, pixels. */
  tapSlopPx: 6,
} as const;
