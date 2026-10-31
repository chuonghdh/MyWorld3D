// Constants of the pedestrian simulation: poses, trait bits, body types, states and tuning.

/** Pose ids written to PedestrianRender.pose. */
export const POSE_WALK = 0;

export const POSE_STAND = 1;

export const POSE_CHAT = 2;

export const POSE_SIT = 3;

/** Bit flags for PedestrianRender.traits (what the person owns; the mesh decides what is worn per season). */
export const TRAIT_HAT = 1;

export const TRAIT_SCARF = 2;

export const TRAIT_BAG = 4;

export const TRAIT_SHORTS = 8;

export const TRAIT_SHORT_SLEEVES = 16;

export const TRAIT_BEARD = 128;

export const TRAIT_MOUSTACHE = 256;

/** Patterned top (one of the four patterns; see outfit.ts). */
export const TRAIT_DOTS = 512;

export const TRAIT_HEARTS = 1024;

export const TRAIT_HSTRIPES = 2048;

export const TRAIT_VSTRIPES = 4096;

export const TRAIT_CHECKS = 8192;

export const TRAIT_DIAGONAL = 16384;

/** The six pattern traits, for picking one at random. */
export const PATTERN_TRAITS = [TRAIT_DOTS, TRAIT_HEARTS, TRAIT_HSTRIPES, TRAIT_VSTRIPES, TRAIT_CHECKS, TRAIT_DIAGONAL];

/** Hair styles that count as long for women: to the shoulders, to the waist, long bob, pigtails. */
export const LONG_FEMALE_STYLES = [4, 8, 7, 9];

/** Hair styles that count as short for women (crop, side parting, curly, ponytail, bun). */
export const SHORT_FEMALE_STYLES = [0, 1, 2, 5, 6];

/** Age groups written to PedestrianRender.body (the mesh index). */
export const BODY_ADULT = 0;

export const BODY_CHILD = 1;

export const BODY_ELDER = 2;

export const BODY_TEEN = 3;

/** Number of hair styles written to PedestrianRender.hairStyle (see personGeometry.ts). */
export const HAIR_STYLE_COUNT = 10;

/** Hard caps: walkers plus dogs never exceed 600 rendered instances. */
export const MAX_WALKERS = 480;

export const MAX_DOGS = 120;

/** Walkers per road segment at trafficMultiplier 1 at full density. */
export const WALKERS_PER_ROAD = 22;

export const SIDEWALK_Y = 0.15;

export const WAIT_DIST = 0.45; // metres from the corner node where walkers wait (1 m before the curb on a 3 m sidewalk)

export const CROSS_MARGIN = 2.0; // seconds of red that must remain after a crossing is finished

export const GIVE_UP_WAIT = 150; // seconds after which a waiting walker turns back

export const DOG_CHANCE = 0.22;

export const PAIR_CHANCE = 0.2;

export const TURN_RATE = 7; // rad/s

export const S_WALK = 0;

export const S_WAIT = 1;

export const S_LOOK = 2;

export const S_CHAT = 3;

export const S_SIT = 4;

export const S_MOVE = 5;

export const S_HIDDEN = 6;

export const N_WALK = 0;

export const N_LOOK = 1;

export const N_SIT = 2;

export const N_HIDE = 3;
