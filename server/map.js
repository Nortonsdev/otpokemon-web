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

/** Grass/path ring around temple spawn — wild meadow (excludes fixed NPC tiles). */
const MEADOW_NPC_AVOID = new Set(["10,10", "20,10", "8,4", "11,12", "14,13", "17,12"]);

export function meadowWildSpots() {
  const r = runtime();
  const cx = r.spawn?.x ?? SPAWN.x;
  const cy = r.spawn?.y ?? SPAWN.y;
  const spots = [];
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (!walkable(x, y)) continue;
      const tn = tileName(x, y);
      if (tn !== "grass" && tn !== "path") continue;
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) > 8) continue;
      if (MEADOW_NPC_AVOID.has(`${x},${y}`)) continue;
      spots.push({ x, y });
    }
  }
  if (spots.length) return spots;
  return r.wildSpawns?.length ? r.wildSpawns : [{ x: cx, y: cy }];
}

/**
 * Meadow wilds — só Kanto #1–151 (nomes oficiais via shared/kantoDex.js + server/species.js).
 * Manter em sync com tools/extract_otp207_sprites.py MEADOW_WILD_SPECIES.
 */
const MEADOW_WILD_SPECIES = [
  "bulbasaur",
  "ivysaur",
  "venusaur",
  "charmander",
  "charmeleon",
  "squirtle",
  "wartortle",
  "blastoise",
  "caterpie",
  "metapod",
  "butterfree",
  "weedle",
  "kakuna",
  "beedrill",
  "pidgey",
  "pidgeotto",
  "pidgeot",
  "raticate",
  "rapidash",
];

/** One living wild per milestone species in the meadow (~19 distinct looks). */
export const WILD_GROUPS = MEADOW_WILD_SPECIES.map((species) => ({
  species,
  want: 1,
  spots: "meadow",
}));

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
