import { tileKey, type OtbmMap } from "./otbm.ts";

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function normalizeRect(a: Rect): Rect {
  return {
    x0: Math.min(a.x0, a.x1),
    y0: Math.min(a.y0, a.y1),
    x1: Math.max(a.x0, a.x1),
    y1: Math.max(a.y0, a.y1),
  };
}

export function forEachRectTile(rect: Rect, w: number, h: number, fn: (x: number, y: number) => void) {
  const r = normalizeRect(rect);
  const x0 = Math.max(0, r.x0);
  const y0 = Math.max(0, r.y0);
  const x1 = Math.min(w - 1, r.x1);
  const y1 = Math.min(h - 1, r.y1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) fn(x, y);
  }
}

export function topItemId(map: OtbmMap, x: number, y: number, z: number): number | null {
  const items = map.tiles.get(tileKey(x, y, z))?.items;
  if (!items?.length) return null;
  return items[items.length - 1]?.id ?? null;
}

/**
 * 4-connected flood fill of tiles whose top item matches the seed.
 * Empty tiles (no OTBM entry) match other empty tiles.
 */
export function floodFill(
  map: OtbmMap,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  paint: (x: number, y: number) => void,
): number {
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  const target = topItemId(map, x, y, z);
  const seen = new Set<string>();
  const stack: Array<[number, number]> = [[x, y]];
  let n = 0;
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const key = `${cx},${cy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (topItemId(map, cx, cy, z) !== target) continue;
    paint(cx, cy);
    n++;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return n;
}
