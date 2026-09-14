/**
 * OTBM (YATME/RME) → gameplay runtime for otpokemon-web server + Phaser client.
 */

import type { OtbmMap, OtbmTile } from "./otbm.ts";
import { tileKey } from "./otbm.ts";
import type { ClassicCatalog } from "./classicClient.ts";
import {
  BUILTIN_TILE_IDS,
  GROUND,
  groundIndexFromId,
  isRoofId,
  isWallId,
  itemKindForId,
} from "./tileCatalog.ts";

export interface RuntimeMap {
  w: number;
  h: number;
  z: number;
  ground: number[][];
  walls: number[][];
  roofs: number[][];
  items: Array<{ x: number; y: number; kind: string; itemId?: number }>;
  cells: Array<Array<{ items: number[] }>>;
  wildSpawns: Array<{ x: number; y: number }>;
  spawn: { x: number; y: number; z: number };
  tile: number;
  towns: OtbmMap["towns"];
  waypoints: OtbmMap["waypoints"];
}

export function pickPlayableZ(otbm: OtbmMap): number {
  if (otbm.towns[0]) return otbm.towns[0].templeZ;
  const counts = new Map<number, number>();
  for (const t of otbm.tiles.values()) {
    counts.set(t.z, (counts.get(t.z) || 0) + 1);
  }
  let best = 7;
  let n = -1;
  for (const [z, c] of counts) {
    if (c > n) {
      best = z;
      n = c;
    }
  }
  return best;
}

function emptyGrid(w: number, h: number): RuntimeMap {
  const ground: number[][] = [];
  const walls: number[][] = [];
  const roofs: number[][] = [];
  const cells: Array<Array<{ items: number[] }>> = [];
  for (let y = 0; y < h; y++) {
    ground[y] = [];
    walls[y] = [];
    roofs[y] = [];
    cells[y] = [];
    for (let x = 0; x < w; x++) {
      ground[y][x] = GROUND.grass;
      walls[y][x] = 0;
      roofs[y][x] = 0;
      cells[y][x] = { items: [BUILTIN_TILE_IDS.grass] };
    }
  }
  return {
    w,
    h,
    z: 7,
    ground,
    walls,
    roofs,
    items: [],
    cells,
    wildSpawns: [],
    spawn: { x: Math.floor(w / 2), y: Math.floor(h / 2), z: 7 },
    tile: 32,
    towns: [],
    waypoints: [],
  };
}

function applyStack(
  runtime: RuntimeMap,
  x: number,
  y: number,
  stack: number[],
  catalog?: ClassicCatalog,
) {
  const ids = stack.length ? [...stack] : [BUILTIN_TILE_IDS.grass];
  runtime.cells[y][x] = { items: ids };
  let g = GROUND.grass;
  let wall = 0;
  let roof = 0;
  const kinds: RuntimeMap["items"] = [];
  for (const id of ids) {
    const meta = catalog?.items.get(id);
    if (isWallId(id) || meta?.blocks) {
      wall = 1;
      continue;
    }
    if (isRoofId(id)) {
      roof = 1;
      continue;
    }
    const kind = itemKindForId(id);
    if (kind) {
      kinds.push({ x, y, kind, itemId: id });
      continue;
    }
    if (!meta || meta.isGround || !meta.blocks) g = groundIndexFromId(id);
  }
  runtime.ground[y][x] = g;
  runtime.walls[y][x] = wall;
  runtime.roofs[y][x] = roof;
  runtime.items = runtime.items.filter((it) => !(it.x === x && it.y === y));
  runtime.items.push(...kinds);
}

export function otbmMapToRuntime(otbm: OtbmMap, catalog?: ClassicCatalog, floorZ?: number): RuntimeMap {
  let maxX = 0;
  let maxY = 0;
  for (const t of otbm.tiles.values()) {
    maxX = Math.max(maxX, t.x);
    maxY = Math.max(maxY, t.y);
  }
  const w = Math.max(otbm.width === 65535 ? 0 : otbm.width, maxX + 1, 1);
  const h = Math.max(otbm.height === 65535 ? 0 : otbm.height, maxY + 1, 1);
  const z = floorZ ?? pickPlayableZ(otbm);
  const runtime = emptyGrid(w, h);
  runtime.z = z;

  for (const tile of otbm.tiles.values()) {
    if (tile.z !== z) continue;
    if (tile.x >= w || tile.y >= h || tile.x < 0 || tile.y < 0) continue;
    applyStack(
      runtime,
      tile.x,
      tile.y,
      tile.items.map((it) => it.id),
      catalog,
    );
  }

  const temple = otbm.towns[0];
  runtime.spawn = temple
    ? { x: temple.templeX, y: temple.templeY, z: temple.templeZ }
    : { x: Math.floor(w / 2), y: Math.floor(h / 2), z };
  runtime.towns = otbm.towns;
  runtime.waypoints = otbm.waypoints;
  return runtime;
}

export function runtimeTileAt(runtime: RuntimeMap, x: number, y: number, z: number): OtbmTile | null {
  if (x < 0 || y < 0 || x >= runtime.w || y >= runtime.h) return null;
  const items = runtime.cells[y][x].items.map((id) => ({ id }));
  return { x, y, z, flags: 0, items };
}

export function setRuntimeCell(
  runtime: RuntimeMap,
  x: number,
  y: number,
  items: number[],
  catalog?: ClassicCatalog,
) {
  applyStack(runtime, x, y, items, catalog);
}

export function runtimeToOtbm(runtime: RuntimeMap): OtbmMap {
  const tiles = new Map<string, OtbmTile>();
  const floorZ = runtime.z ?? 7;
  for (let y = 0; y < runtime.h; y++) {
    for (let x = 0; x < runtime.w; x++) {
      const ids = runtime.cells[y][x].items.filter((id) => id > 0);
      if (!ids.length) continue;
      tiles.set(tileKey(x, y, floorZ), {
        x,
        y,
        z: floorZ,
        flags: 0,
        items: ids.map((id) => ({ id })),
      });
    }
  }
  return {
    version: 4,
    width: runtime.w,
    height: runtime.h,
    majorItems: 4,
    minorItems: 4,
    description: "Saved with YATME",
    rawDescriptions: ["Saved with YATME"],
    spawnFile: "",
    npcFile: "",
    houseFile: "",
    zoneFile: "",
    tiles,
    towns: runtime.towns ?? [],
    waypoints: runtime.waypoints ?? [],
  };
}
