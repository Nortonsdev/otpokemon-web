/** Remere TILESTATE_PROTECTIONZONE — editor SAFE tool writes this into OTBM. */
export const TILESTATE_PROTECTIONZONE = 0x0001;

export const SAFE_ZONE_RADIUS = 12;

/** Temple Chebyshev radius — extra save area even if the OTBM has no SAFE paint. */
export function isSafeZone(x, y, spawn) {
  const sx = spawn?.x ?? 0;
  const sy = spawn?.y ?? 0;
  return Math.max(Math.abs(x - sx), Math.abs(y - sy)) <= SAFE_ZONE_RADIUS;
}

export function isOtbmSafeTile(flagsAtTile) {
  return ((flagsAtTile || 0) & TILESTATE_PROTECTIONZONE) !== 0;
}

/**
 * Catch ↔ party swap is allowed only here:
 * OTBM SAFE (protection zone) painted in the editor, or temple radius.
 */
export function isCombatSafeZone(x, y, opts = {}) {
  const flags = opts.flags;
  if (isOtbmSafeTile(flags?.[y]?.[x])) return true;
  if (opts.spawn) return isSafeZone(x, y, opts.spawn);
  return false;
}
