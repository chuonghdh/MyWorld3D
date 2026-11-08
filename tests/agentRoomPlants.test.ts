// Room plants (seeded, off the walking network): counts follow the knobs, tall and short are both present, plants stay
// inside the room, clear of every walking line and apart from each other.
import { describe, expect, it } from 'vitest';
import { plantSpots } from '../src/agentRoom/world/plants';
import { corridorLines } from '../src/agentRoom/world/corridors';
import { ROOM } from '../src/agentRoom/world/layout';
import { PLANT_SPOTS } from '../src/agentRoom/world/Decor';
import { agentRoom } from '../src/config/tuning';

function segDist(p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

describe('room plants', () => {
  const plants = plantSpots();
  it('places the configured count of tall and short plants', () => {
    expect(plants.length).toBe(agentRoom.plantTallCount + agentRoom.plantShortCount);
    expect(plants.filter((p) => p.tall).length).toBe(agentRoom.plantTallCount);
  });
  it('keeps plants inside the room and clear of every walking line', () => {
    const segs = corridorLines().flatMap((line) => line.slice(1).map((b, i) => [line[i]!, b] as const));
    for (const p of plants) {
      expect(Math.abs(p.x)).toBeLessThan(ROOM.halfW);
      expect(Math.abs(p.z)).toBeLessThan(ROOM.halfD - 0.5);
      for (const [a, b] of segs) expect(segDist(p, a, b)).toBeGreaterThan(0.8);
    }
  });
  it('keeps plants apart from each other and from the corner plants', () => {
    const all = [...plants, ...PLANT_SPOTS.map(([x, z]) => ({ x, z }))];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i]!.x - all[j]!.x, all[i]!.z - all[j]!.z)).toBeGreaterThan(1.4);
  });
});
