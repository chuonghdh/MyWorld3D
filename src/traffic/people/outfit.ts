// Seasonal outfits. A walker's clothes are a pure function of the season and the walker's own stable values
// (its traits, a 0..1 phase share and an umbrella rank), so each person wears one consistent set per season and
// the choice never flickers between frames. The result is a bit set of FLAG bits, read by the shader through
// the per-instance attribute aLook2.y (see rigShader.ts). Bits 1-16 match the old layout; 32 is the umbrella.

import {
  TRAIT_BAG,
  TRAIT_BEARD,
  TRAIT_CHECKS,
  TRAIT_DIAGONAL,
  TRAIT_DOTS,
  TRAIT_HAT,
  TRAIT_HEARTS,
  TRAIT_HSTRIPES,
  TRAIT_MOUSTACHE,
  TRAIT_SCARF,
  TRAIT_SHORTS,
  TRAIT_SHORT_SLEEVES,
  TRAIT_VSTRIPES,
} from '../pedestrians';
import type { SeasonName } from './palettes';

/** Flag bits for the shader (aLook2.y). Keep in step with partShows and pickColour in rigShader.ts. */
export const FLAG = {
  HAT: 1,
  SCARF: 2,
  BAG: 4,
  /** Bare shins (summer shorts). */
  BARE_SHINS: 8,
  SHORT_SLEEVES: 16,
  UMBRELLA: 32,
  /** Outer layer: the coat tails and the top take the accent colour, and the sleeves too. */
  COAT: 256,
  BEARD: 512,
  MOUSTACHE: 1024,
  /** Patterned top: polka dots, hearts, horizontal stripes, vertical stripes (shader patternColour). */
  DOTS: 2048,
  HEARTS: 4096,
  HSTRIPES: 8192,
  VSTRIPES: 16384,
  CHECKS: 32768,
  DIAGONAL: 65536,
} as const;

/**
 * Garments for one walker in one season.
 *  - summer: shorts for those who own them, short sleeves on those who own them, no coats;
 *  - spring: trousers, long sleeves;
 *  - autumn: a coat over trousers for about 60 percent of walkers, otherwise trousers;
 *  - winter: a coat over trousers for everyone, hats and scarves on most.
 */
export function outfitFlags(season: SeasonName, traits: number, phaseShare: number, rank: number): number {
  let f = 0;
  const summer = season === 'summer';
  const winter = season === 'winter';
  const autumn = season === 'autumn';
  if ((traits & TRAIT_HAT) !== 0 && (winter || phaseShare < (summer ? 0.5 : 0.35))) f |= FLAG.HAT;
  if ((traits & TRAIT_SCARF) !== 0 && (winter || (autumn && phaseShare < 0.5))) f |= FLAG.SCARF;
  if ((traits & TRAIT_BAG) !== 0) f |= FLAG.BAG;
  if ((traits & TRAIT_BEARD) !== 0) f |= FLAG.BEARD;
  if ((traits & TRAIT_MOUSTACHE) !== 0) f |= FLAG.MOUSTACHE;
  if ((traits & TRAIT_DOTS) !== 0) f |= FLAG.DOTS;
  if ((traits & TRAIT_HEARTS) !== 0) f |= FLAG.HEARTS;
  if ((traits & TRAIT_HSTRIPES) !== 0) f |= FLAG.HSTRIPES;
  if ((traits & TRAIT_VSTRIPES) !== 0) f |= FLAG.VSTRIPES;
  if ((traits & TRAIT_CHECKS) !== 0) f |= FLAG.CHECKS;
  if ((traits & TRAIT_DIAGONAL) !== 0) f |= FLAG.DIAGONAL;
  if (summer && (traits & TRAIT_SHORT_SLEEVES) !== 0) f |= FLAG.SHORT_SLEEVES;
  if (winter || (autumn && rank < 0.6)) f |= FLAG.COAT;
  if (summer && (traits & TRAIT_SHORTS) !== 0) f |= FLAG.BARE_SHINS;
  return f;
}
