/** Film camera (video recording): picker, length limits, output sizes and bitrates (ui/FilmPicker.tsx, ui/filmSession.ts). */
export const film = {
  /** Frame rate of the recorded video, frames per second. */
  fps: 30,
  /** Manual film length preselected in the picker, real seconds. */
  manualDefaultSeconds: 30,
  /** Shortest manual film, real seconds. */
  manualMinSeconds: 1,
  /** Longest manual film, real seconds; the recording stops by itself at this length. */
  manualMaxSeconds: 60,
  /** Full HD output width, pixels. */
  width1080: 1920,
  /** Full HD output height, pixels. */
  height1080: 1080,
  /** Auto film length, real seconds (fixed-step dry run, see film/autoPath.ts). */
  autoSeconds: 60,
  /** Game minutes an auto film covers when game time runs (60 s real = 60 virtual minutes). */
  autoVirtualMinutes: 60,
  /** Video bitrate of the recorded film, bits per second (MediaRecorder videoBitsPerSecond). */
  videoBitrate1080: 12000000,
  /** Auto film audio track (AAC, 48 kHz stereo), bits per second. */
  audioBitrate: 192000,
  /** Auto film audio peak target, dBFS. The overview is far from the sounds (inverse distance law), so the film mix is scaled to this peak. */
  audioPeakTargetDb: -3,
  /** Auto film: most frames waiting inside the VideoEncoder; encodeFrame waits above this (memory bound). */
  encodeQueueMax: 4,
  /** Auto film: seconds between H.264 keyframes (GOP length = keyframeIntervalS x fps). */
  keyframeIntervalS: 2,
  /** Auto film: how far the bird looks up from the horizon, degrees. ESTIMATE, measure in P6 (scene/filmPath.ts). */
  skyTiltDeg: 35,
  /** Auto film: seconds the bird holds on the perch before the film ends (scene/filmPath.ts). */
  perchHoldSeconds: 3,
  /** Auto film: height above the highest roof that the cruise and perch flight keeps, metres. ESTIMATE, measure in P6. */
  cruiseClearanceM: 15,
  /** Auto film: lateral distance kept from building walls on the descent street, metres. ESTIMATE, measure in P6. */
  streetClearanceM: 3,
} as const;
