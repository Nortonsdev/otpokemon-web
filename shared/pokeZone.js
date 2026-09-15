/** PokeZone (área de wander do spawn OTBM) — radius vem do editor quando existir. */

export const DEFAULT_POKE_ZONE_RADIUS = 3;

export function chebyshev(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * @param {number | null | undefined} radius — null/undefined = sem clamp (runtime sem PZ).
 */
export function isInPokeZone(x, y, anchorX, anchorY, radius) {
  if (radius == null || radius < 0) return true;
  return chebyshev(x, y, anchorX, anchorY) <= radius;
}

/**
 * @param {Array<{ x: number; y: number; radius?: number }> | undefined} spawns
 * @returns {{ anchorX: number; anchorY: number; radius: number } | null}
 */
export function pokeZoneForSpawnTile(spawns, anchorX, anchorY) {
  if (!spawns?.length) return null;
  const spot = spawns.find((s) => s.x === anchorX && s.y === anchorY);
  if (!spot || spot.radius == null) return null;
  return { anchorX: spot.x, anchorY: spot.y, radius: spot.radius };
}
