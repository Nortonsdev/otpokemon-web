export const SAFE_ZONE_RADIUS = 12;

export function isSafeZone(x, y, spawn) {
  const sx = spawn?.x ?? 0;
  const sy = spawn?.y ?? 0;
  return Math.max(Math.abs(x - sx), Math.abs(y - sy)) <= SAFE_ZONE_RADIUS;
}
