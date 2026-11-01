// LAB COPY of the City & Streets tree knobs (cityStreets in src/config/tuning.ts). The lab must not import from src/config,
// so a lab edit cannot touch the city. tests/tuningParity.test.ts checks these values equal the config values.
// Edit here only for lab experiments; keep equal to config until the user approves a merge.

export const LAB_TUNING = {
  /** Share of conifer spots that get a pine, 0-1. */
  pineShare: 0.6,
  /** Pine snow cover ramp start and full, as upward normal y. */
  pineSnowUp: [0.85, 0.97],
  /** Maximum snow on pines, 0-1. */
  pineSnowCover: 0.35,
  /** Tree scale on top of the layout scale, multiplier. */
  treeScale: 1.35,
  /** Extra leaf clusters per broadleaf tree, fraction. */
  clusterExtra: 0.5,
  /** Width of the tree border belt from the town edge, metres. */
  borderDepth: 6,
  /** Share of broadleaf leaves that cast shadows, fraction. */
  shadowLeafFraction: 0.5,
} as const;
