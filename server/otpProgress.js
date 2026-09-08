const STM_MAX_MINUTES = 42 * 60;

export function staminaClock(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

export function playerProgressFields(src = {}) {
  const exp = src.exp ?? 2100;
  const expNext = Math.max(1, src.expNext ?? 10000);
  const expPercent =
    src.expPercent ?? src.xpPct ?? Math.max(0, Math.min(100, Math.round((exp / expNext) * 100)));
  const staminaMinutes = src.staminaMinutes ?? STM_MAX_MINUTES;
  const stmPercent =
    src.stmPercent ??
    src.stmPct ??
    Math.max(0, Math.min(100, Math.round((staminaMinutes / STM_MAX_MINUTES) * 100)));
  return {
    exp,
    expNext,
    expPercent,
    xpPct: expPercent,
    staminaMinutes,
    stmPercent,
    stmPct: stmPercent,
    cap: src.cap ?? 400,
    trophies: src.trophies ?? 0,
  };
}
