/** Continuous HP color: 100% green → 59% yellow → 24% red → 0–2% black. */

const STOPS = [
  { t: 0, rgb: [0, 0, 0] },
  { t: 0.02, rgb: [0, 0, 0] },
  { t: 0.24, rgb: [210, 24, 24] },
  { t: 0.59, rgb: [240, 210, 20] },
  { t: 1, rgb: [47, 194, 74] },
];

export function hpPercent(hp, hpMax) {
  const max = Math.max(1, Number(hpMax) || 1);
  const n = Number(hp);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n / max));
}

function asUnit(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return 0;
  if (n > 1 && n <= 100) return n / 100;
  return Math.max(0, Math.min(1, n));
}

function lerp(a, b, u) {
  return a + (b - a) * u;
}

export function hpColorRgb(pct) {
  const t = asUnit(pct);
  let i = 0;
  while (i < STOPS.length - 2 && t > STOPS[i + 1].t) i += 1;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const span = b.t - a.t;
  const u = span <= 0 ? 0 : (t - a.t) / span;
  return [
    Math.round(lerp(a.rgb[0], b.rgb[0], u)),
    Math.round(lerp(a.rgb[1], b.rgb[1], u)),
    Math.round(lerp(a.rgb[2], b.rgb[2], u)),
  ];
}

export function hpColorCss(pct) {
  const [r, g, b] = hpColorRgb(pct);
  return `rgb(${r}, ${g}, ${b})`;
}

export function hpColorHex(pct) {
  const [r, g, b] = hpColorRgb(pct);
  return (r << 16) | (g << 8) | b;
}
