// Who walks: body type, sex, hair, traits and walking speed of each walker, and the pair structure.

import { TRAIT_HAT, TRAIT_SCARF, TRAIT_BAG, TRAIT_SHORTS, TRAIT_SHORT_SLEEVES, TRAIT_BEARD, TRAIT_MOUSTACHE, PATTERN_TRAITS, LONG_FEMALE_STYLES, SHORT_FEMALE_STYLES, BODY_ADULT, BODY_CHILD, BODY_ELDER, BODY_TEEN, MAX_WALKERS, MAX_DOGS, DOG_CHANCE, PAIR_CHANCE, S_HIDDEN } from './constants';
import { doorFromEdge } from './movement';
import type { Pedestrians } from '../pedestrians';

/** Walking speed in m/s by age group and sex (r is a 0..1 spread). Children and teens quick, elders slow, women a touch slower than men. */
export function speedFor(age: number, female: number, r: number): number {
  if (age === BODY_CHILD) return 1.4 + r * 0.25;
  if (age === BODY_TEEN) return 1.4 + r * 0.2;
  if (age === BODY_ELDER) return (female ? 0.78 : 0.82) + r * 0.1;
  return (female ? 1.08 : 1.15) + r * 0.28;
}

/** Grey and white hair colour indices in palettes.ts (elders). */
export const GREY_HAIR = [6, 7, 10, 11];

/**
 * Hair style by age group and sex. Styles (see personGeometry.ts): 0 short crop, 1 side parting with a fringe,
 * 2 curly, 3 bald, 4 long to the shoulders, 5 ponytail, 6 bun, 7 bob, 8 long to the waist, 9 pigtails.
 */
export function hairStyleFor(age: number, female: number, r: number): number {
  if (age === BODY_CHILD) return female ? (r < 0.5 ? 9 : r < 0.75 ? 0 : 1) : r < 0.5 ? 0 : 1;
  if (female) {
    // Women and girls (teens included): 90 percent long, 10 percent short.
    if (r < 0.9) return LONG_FEMALE_STYLES[Math.min(LONG_FEMALE_STYLES.length - 1, Math.floor((r / 0.9) * LONG_FEMALE_STYLES.length))];
    return SHORT_FEMALE_STYLES[Math.min(SHORT_FEMALE_STYLES.length - 1, Math.floor(((r - 0.9) / 0.1) * SHORT_FEMALE_STYLES.length))];
  }
  if (age === BODY_TEEN) return r < 0.5 ? 0 : r < 0.8 ? 1 : 2;
  if (age === BODY_ELDER) return r < 0.4 ? 3 : r < 0.7 ? 0 : r < 0.9 ? 1 : 2;
  return r < 0.3 ? 0 : r < 0.55 ? 1 : r < 0.7 ? 2 : r < 0.9 ? 3 : 0;
}

export function createPeople(sys: Pedestrians): void {
  const rng = sys.rng;
  let nextId = 1;
  let dogs = 0;
  const setLook = (i: number, age: number, female: number): void => {
    sys.body[i] = age;
    sys.female[i] = female;
    sys.top[i] = Math.floor(rng() * 16);
    sys.pants[i] = Math.floor(rng() * 12);
    const hairRoll = rng();
    if (age === BODY_ELDER) {
      // Most elders have grey or white hair.
      sys.hair[i] = hairRoll < 0.75 ? GREY_HAIR[Math.floor(rng() * GREY_HAIR.length)] : Math.floor(rng() * 6);
    } else if (age === BODY_ADULT) {
      sys.hair[i] = Math.floor(hairRoll * 10);
    } else {
      // Children and teens: natural tones only.
      sys.hair[i] = Math.floor(hairRoll * 6);
    }
    sys.hairStyle[i] = hairStyleFor(age, female, rng());
    sys.skin[i] = Math.floor(rng() * 8);
    sys.accent[i] = Math.floor(rng() * 12);
    let t = 0;
    if (rng() < 0.25) t |= TRAIT_HAT;
    if (rng() < 0.65) t |= TRAIT_SCARF;
    if (rng() < (age === BODY_CHILD ? 0.85 : 0.45)) t |= TRAIT_BAG;
    if (rng() < (age === BODY_CHILD ? 0.7 : age === BODY_TEEN ? 0.4 : 0.5)) t |= TRAIT_SHORTS;
    if (rng() < 0.7) t |= TRAIT_SHORT_SLEEVES;
    if (!female && (age === BODY_ADULT || age === BODY_ELDER)) {
      if (rng() < (age === BODY_ELDER ? 0.45 : 0.25)) t |= TRAIT_BEARD;
      if (rng() < (age === BODY_ELDER ? 0.3 : 0.15)) t |= TRAIT_MOUSTACHE;
    }
    // Patterned tops for 70 percent of walkers (men and women), one of six patterns.
    if (rng() < 0.7) t |= PATTERN_TRAITS[Math.min(PATTERN_TRAITS.length - 1, Math.floor(rng() * PATTERN_TRAITS.length))];
    sys.traits[i] = t;
    sys.phase[i] = rng() * Math.PI * 2;
    sys.rank[i] = rng();
    sys.scale[i] = 0.95 + rng() * 0.1;
    sys.ids[i] = nextId++;
    sys.lat[i] = (rng() - 0.5) * 1.5;
    sys.hd[i] = rng() * Math.PI * 2;
    sys.idleTimer[i] = 6 + rng() * 60;
    sys.speed[i] = speedFor(age, female, rng());
    sys.state[i] = S_HIDDEN;
    sys.timer[i] = 0;
  };
  const addDog = (owner: number, side: number): void => {
    if (dogs >= MAX_DOGS) return;
    sys.dogIndex[owner] = dogs;
    sys.dogSide[owner] = side;
    sys.dogOwner[dogs] = owner;
    sys.dogPhase[dogs] = rng() * Math.PI * 2;
    sys.dogCoat[dogs] = Math.floor(rng() * 5);
    dogs++;
  };

  let i = 0;
  while (i < MAX_WALKERS) {
    if (i + 1 < MAX_WALKERS && rng() < PAIR_CHANCE) {
      // Pairs: elder couple, adult couple (opposite sexes), parent and child, parent and teen, two teens.
      const kind = rng();
      const couple = kind < 0.5;
      const leadBody = kind < 0.2 ? BODY_ELDER : kind < 0.85 ? BODY_ADULT : BODY_TEEN;
      const followBody = kind < 0.2 ? BODY_ELDER : kind < 0.5 ? BODY_ADULT : kind < 0.7 ? BODY_CHILD : BODY_TEEN;
      const leadFemale = rng() < 0.5 ? 1 : 0;
      const followFemale = couple ? 1 - leadFemale : rng() < 0.5 ? 1 : 0;
      setLook(i, leadBody, leadFemale);
      setLook(i + 1, followBody, followFemale);
      sys.follower[i] = i + 1;
      sys.leader[i + 1] = i;
      // The adult waits for a child, so the pair walks at the child's own pace (the child's wobble is render only).
      if (followBody === BODY_CHILD) sys.speed[i] = sys.speed[i + 1];
      else sys.speed[i + 1] = sys.speed[i];
      sys.rank[i + 1] = sys.rank[i];
      sys.lat[i] = -0.35;
      sys.lat[i + 1] = 0.35;
      if (rng() < DOG_CHANCE) addDog(i, -1);
      i += 2;
    } else {
      const r = rng();
      setLook(i, r < 0.7 ? BODY_ADULT : r < 0.8 ? BODY_TEEN : BODY_ELDER, rng() < 0.5 ? 1 : 0);
      if (rng() < DOG_CHANCE) addDog(i, sys.lat[i] > 0 ? -1 : 1);
      i += 1;
    }
  }
  for (let k = 0; k < MAX_WALKERS; k++) doorFromEdge(sys, k);
}
