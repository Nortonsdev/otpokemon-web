import { loadActiveMap, reloadMap } from "./mapLoader.ts";
import { MAP_W, MAP_H, MAP_Z, SPAWN, ITEMS, buildLegacyMap } from "../shared/mapLegacy.ts";
import { TILESTATE_PROTECTIONZONE, TILESTATE_NOPVPZONE, TILESTATE_PVPZONE } from "../shared/editor/otbm.ts";

export { MAP_W, MAP_H, MAP_Z, SPAWN, ITEMS, buildLegacyMap, reloadMap };

function runtime() {
  return loadActiveMap();
}

export const MAP = new Proxy(
  {},
  {
    get(_t, prop) {
      const r = runtime();
      if (prop === "w") return r.w;
      if (prop === "h") return r.h;
      if (prop === "z") return r.z;
      if (prop === "ground") return r.ground;
      if (prop === "walls") return r.walls;
      if (prop === "roofs") return r.roofs;
      if (prop === "items") return r.items;
      if (prop === "cells") return r.cells;
      if (prop === "flags") return r.flags;
      if (prop === "houses") return r.houses;
      if (prop === "wildSpawns") return r.wildSpawns;
      if (prop === "tile") return r.tile;
      if (prop === "spawn") return r.spawn;
      if (prop === "towns") return r.towns;
      if (prop === "waypoints") return r.waypoints;
      return undefined;
    },
  },
);

export const WILD_GROUPS = [
  { species: "caterpie", want: 3, spots: "wild" },
  {
    species: "charizard",
    want: 3,
    spots: [
      { x: 8, y: 11 },
      { x: 16, y: 8 },
      { x: 4, y: 3 },
    ],
  },
  {
    species: "rapidash",
    want: 3,
    spots: [
      { x: 6, y: 18 },
      { x: 22, y: 11 },
      { x: 27, y: 4 },
    ],
  },
];

export function inBounds(x, y) {
  const r = runtime();
  return x >= 0 && y >= 0 && x < r.w && y < r.h;
}

export function isWater(x, y) {
  return inBounds(x, y) && runtime().ground[y][x] === 4;
}

export function walkable(x, y, opts = {}) {
  const r = runtime();
  if (!inBounds(x, y) || r.walls[y][x] !== 0) return false;
  if (r.ground[y][x] === 4) return !!opts.surf;
  return true;
}

export function hasRoof(x, y) {
  return inBounds(x, y) && runtime().roofs[y][x] === 1;
}

export function itemsAt(x, y) {
  return runtime().items.filter((it) => it.x === x && it.y === y);
}

export function tileName(x, y) {
  if (!inBounds(x, y)) return "void";
  const r = runtime();
  if (r.walls[y][x]) return "wall";
  const g = r.ground[y][x];
  if (g === 1) return "path";
  if (g === 2) return "stone";
  if (g === 3) return "wood floor";
  if (g === 4) return "water";
  if (g === 5) return "cave";
  return "grass";
}

export function currentSpawn() {
  const r = runtime();
  return r.spawn ?? SPAWN;
}

export function tileFlags(x, y) {
  const r = runtime();
  if (!inBounds(x, y) || !r.flags) return 0;
  return r.flags[y]?.[x] || 0;
}

export function isProtectionZone(x, y) {
  return (tileFlags(x, y) & TILESTATE_PROTECTIONZONE) !== 0;
}

export function isNoPvpZone(x, y) {
  return (tileFlags(x, y) & TILESTATE_NOPVPZONE) !== 0;
}

export function isPvpZone(x, y) {
  return (tileFlags(x, y) & TILESTATE_PVPZONE) !== 0;
}
