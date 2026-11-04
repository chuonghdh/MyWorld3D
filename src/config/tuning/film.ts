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
  autoSeconds: 30,
  /** Game minutes an auto film covers when game time runs (30 s real = 30 virtual minutes). */
  autoVirtualMinutes: 30,
  /** Video bitrate of the recorded film, bits per second (MediaRecorder videoBitsPerSecond). */
  videoBitrate1080: 12000000,
} as const;
