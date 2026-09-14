/**
 * OTBM (YATME/RME) → gameplay runtime for otpokemon-web server + Phaser client.
 */

import type { OtbmMap, OtbmTile } from "./otbm";
import { tileKey } from "./otbm";
import type { ClassicCatalog } from "./classicClient";
import { BUILTIN_TILE_IDS } from "./classicClient";

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

const WALL = new Set([BUILTIN_TILE_IDS.wall, 2200]);
const ROOF = new Set([BUILTIN_TILE_IDS.roof, 1088]);
const ITEM_KIND: Record<number, string> = {
  [BUILTIN_TILE_IDS.flower]: "flower",
  [BUILTIN_TILE_IDS.rose]: "rose",
  [BUILTIN_TILE_IDS.gold]: "gold",
  102: "flower",
  3658: "rose",
  3031: "gold",
};

function groundFromId(id: number): number {
  if (id === BUILTIN_TILE_IDS.path || id === 351) return 1;
  if (id === BUILTIN_TILE_IDS.stone || id === 26121) return 2;
  if (id === BUILTIN_TILE_IDS.wood || id === 42337) return 3;
  if (id === BUILTIN_TILE_IDS.water || id === 4597) return 4;
  if (id === BUILTIN_TILE_IDS.cave || id === 44092) return 5;
  return 0;
}

export function otbmMapToRuntime(otbm: OtbmMap, catalog?: ClassicCatalog): RuntimeMap {
  let maxX = 0;
  let maxY = 0;
  for (const t of otbm.tiles.values()) {
    maxX = Math.max(maxX, t.x);
    maxY = Math.max(maxY, t.y);
  }
  const w = Math.max(otbm.width === 65535 ? 0 : otbm.width, maxX + 1);
  const h = Math.max(otbm.height === 65535 ? 0 : otbm.height, maxY + 1);
  const z = 7;
  const ground: number[][] = [];
  const walls: number[][] = [];
  const roofs: number[][] = [];
  const cells: Array<Array<{ items: number[] }>> = [];
  const items: RuntimeMap["items"] = [];

  for (let y = 0; y < h; y++) {
    ground[y] = [];
    walls[y] = [];
    roofs[y] = [];
    cells[y] = [];
    for (let x = 0; x < w; x++) {
      ground[y][x] = 0;
      walls[y][x] = 0;
      roofs[y][x] = 0;
      cells[y][x] = { items: [BUILTIN_TILE_IDS.grass] };
    }
  }

  for (const tile of otbm.tiles.values()) {
    if (tile.x >= w || tile.y >= h) continue;
    const stack = tile.items.map((it) => it.id);
    cells[tile.y][tile.x] = { items: stack.length ? [...stack] : [BUILTIN_TILE_IDS.grass] };
    let g = 0;
    let wall = 0;
    let roof = 0;
    for (const id of stack) {
      const meta = catalog?.items.get(id);
      if (WALL.has(id) || meta?.blocks) {
        wall = 1;
        continue;
      }
      if (ROOF.has(id)) {
        roof = 1;
        continue;
      }
      const kind = ITEM_KIND[id];
      if (kind) {
        items.push({ x: tile.x, y: tile.y, kind, itemId: id });
        continue;
      }
      if (meta?.isGround || !meta?.blocks) g = groundFromId(id);
    }
    ground[tile.y][tile.x] = g;
    walls[tile.y][tile.x] = wall;
    roofs[tile.y][tile.x] = roof;
  }

  const temple = otbm.towns[0];
  const spawn = temple
    ? { x: temple.templeX, y: temple.templeY, z: temple.templeZ }
    : { x: Math.floor(w / 2), y: Math.floor(h / 2), z };

  return {
    w,
    h,
    z,
    ground,
    walls,
    roofs,
    items,
    cells,
    wildSpawns: [],
    spawn,
    tile: 32,
    towns: otbm.towns,
    waypoints: otbm.waypoints,
  };
}

export function runtimeTileAt(runtime: RuntimeMap, x: number, y: number, z: number): OtbmTile | null {
  if (x < 0 || y < 0 || x >= runtime.w || y >= runtime.h) return null;
  const items = runtime.cells[y][x].items.map((id) => ({ id }));
  return { x, y, z, flags: 0, items };
}

export function setRuntimeCell(runtime: RuntimeMap, x: number, y: number, items: number[]) {
  runtime.cells[y][x] = { items: [...items] };
  const stack = items;
  let g = 0;
  let wall = 0;
  let roof = 0;
  for (const id of stack) {
    if (WALL.has(id)) wall = 1;
    else if (ROOF.has(id)) roof = 1;
    else g = groundFromId(id);
  }
  runtime.ground[y][x] = g;
  runtime.walls[y][x] = wall;
  runtime.roofs[y][x] = roof;
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
    description: "Saved with OTPokemon Web Editor",
    rawDescriptions: ["Saved with OTPokemon Web Editor"],
    spawnFile: "",
    npcFile: "",
    houseFile: "",
    zoneFile: "",
    tiles,
    towns: runtime.towns ?? [],
    waypoints: runtime.waypoints ?? [],
  };
}
