/**
 * OTBM round-trip + runtime conversion tests (no live server required).
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseOtbm,
  serializeOtbm,
  createEmptyMap,
  tileKey,
  TILESTATE_PROTECTIONZONE,
  TILESTATE_PVPZONE,
  TILESTATE_NOPVPZONE,
  ZONE_PROTECTION,
  ZONE_PVP,
  ZONE_NOPVP,
  ZONE_SPAWN,
  applyHouseToTile,
  applyZoneToTile,
  applySpawnToTile,
  applyPokeZoneToTile,
  applyPzPadToTile,
  ZONE_POKEZONE,
  ZONE_PZ_PAD,
  ZONE_POKEZONE_ID_BASE,
  ZONE_PZ_ID_BASE,
} from "../shared/editor/otbm.ts";
import { otbmMapToRuntime, runtimeToOtbm } from "../shared/editor/mapRuntime.ts";
import { BUILTIN_TILE_IDS } from "../shared/editor/tileCatalog.ts";
import { floodFill } from "../shared/editor/brushes.ts";
import { buildLegacyMap } from "../shared/mapLegacy.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const map = createEmptyMap();
map.width = 8;
map.height = 6;
map.rawDescriptions = ["hello"];
for (let y = 0; y < 6; y++) {
  for (let x = 0; x < 8; x++) {
    map.tiles.set(tileKey(x, y, 7), {
      x,
      y,
      z: 7,
      flags: 0,
      items: [{ id: BUILTIN_TILE_IDS.grass }],
    });
  }
}
map.tiles.get(tileKey(2, 2, 7)).items = [{ id: BUILTIN_TILE_IDS.water }];
map.tiles.get(tileKey(3, 2, 7)).items = [{ id: BUILTIN_TILE_IDS.wall }];
map.tiles.get(tileKey(4, 2, 7)).items = [{ id: BUILTIN_TILE_IDS.grass }, { id: BUILTIN_TILE_IDS.flower }];
map.towns = [{ id: 1, name: "Spawn", templeX: 4, templeY: 3, templeZ: 7 }];
map.waypoints = [{ name: "gate", x: 1, y: 1, z: 7 }];
applyHouseToTile(map.tiles.get(tileKey(5, 2, 7)), 12);
applyZoneToTile(map.tiles.get(tileKey(5, 2, 7)), "protection");
applyZoneToTile(map.tiles.get(tileKey(6, 2, 7)), "pvp");
applyZoneToTile(map.tiles.get(tileKey(7, 2, 7)), "nopvp");
applyHouseToTile(map.tiles.get(tileKey(4, 3, 7)), 3);
applyHouseToTile(map.tiles.get(tileKey(5, 3, 7)), 3);
applySpawnToTile(map.tiles.get(tileKey(1, 1, 7)), "25-1");
applyPokeZoneToTile(map.tiles.get(tileKey(0, 0, 7)), 2);
applyPokeZoneToTile(map.tiles.get(tileKey(0, 1, 7)), 2);
applyPzPadToTile(map.tiles.get(tileKey(0, 1, 7)), 7, 2);
applySpawnToTile(map.tiles.get(tileKey(0, 1, 7)), "0010", 7);
applyZoneToTile(map.tiles.get(tileKey(0, 0, 7)), "pvp");

const bytes = await serializeOtbm(map);
assert(bytes[4] === 0xfe, "OTBM NODE_START");
const text = new TextDecoder().decode(bytes);
assert(text.includes("Saved with YATME"), "YATME signature in OTBM");
assert(text.includes("pz:7"), "spawn→pz payload in OTBM");

const re = parseOtbm(bytes);
assert(re.width === 8 && re.height === 6, "size roundtrip");
assert(re.tiles.size === map.tiles.size, `tile count ${re.tiles.size}`);
assert(re.tiles.get(tileKey(2, 2, 7)).items[0].id === BUILTIN_TILE_IDS.water, "water tile");
assert(re.tiles.get(tileKey(3, 2, 7)).items[0].id === BUILTIN_TILE_IDS.wall, "wall tile");
assert(re.tiles.get(tileKey(4, 2, 7)).items.map((i) => i.id).join(",") === `${BUILTIN_TILE_IDS.grass},${BUILTIN_TILE_IDS.flower}`, "stack");
assert(re.towns[0].name === "Spawn", "town");
assert(re.waypoints[0].name === "gate", "waypoint");
assert(re.tiles.get(tileKey(5, 2, 7)).houseId === 12, "HOUSETILE house id");
assert((re.tiles.get(tileKey(5, 2, 7)).flags & TILESTATE_PROTECTIONZONE) === TILESTATE_PROTECTIONZONE, "PZ flag");
assert(re.tiles.get(tileKey(5, 2, 7)).zones.includes(ZONE_PROTECTION), "PZ zone id");
assert((re.tiles.get(tileKey(6, 2, 7)).flags & TILESTATE_PVPZONE) === TILESTATE_PVPZONE, "PVP flag");
assert(re.tiles.get(tileKey(6, 2, 7)).zones.includes(ZONE_PVP), "PVP zone id");
assert((re.tiles.get(tileKey(7, 2, 7)).flags & TILESTATE_NOPVPZONE) === TILESTATE_NOPVPZONE, "NOPVP flag");
assert(re.tiles.get(tileKey(7, 2, 7)).zones.includes(ZONE_NOPVP), "NOPVP zone id");
assert(re.tiles.get(tileKey(4, 3, 7)).houseId === 3, "house area 4,3");
assert(re.tiles.get(tileKey(5, 3, 7)).houseId === 3, "house area 5,3");
assert(re.tiles.get(tileKey(1, 1, 7)).spawnMonster?.dexId === "0025-1", "spawn shiny pikachu dex id");
assert(re.tiles.get(tileKey(1, 1, 7)).zones.includes(ZONE_SPAWN), "spawn zone id");
const pokeTile = re.tiles.get(tileKey(0, 0, 7));
assert(pokeTile.pokeZoneId === 2, "pokezone id field");
assert(pokeTile.zones.includes(ZONE_POKEZONE), "pokezone kind");
assert(pokeTile.zones.includes(ZONE_POKEZONE_ID_BASE + 2), "pokezone packed id");
assert((pokeTile.flags & TILESTATE_PVPZONE) === TILESTATE_PVPZONE, "PVP still paints over pokezone");
const pzTile = re.tiles.get(tileKey(0, 1, 7));
assert(pzTile.pokeZoneId === 2 && pzTile.pzId === 7, "PZ ⊆ PokeZone fields");
assert(pzTile.zones.includes(ZONE_PZ_PAD) && pzTile.zones.includes(ZONE_PZ_ID_BASE + 7), "PZ packed id");
assert(pzTile.spawnMonster?.dexId === "0010" && pzTile.spawnMonster?.pzId === 7, "spawn→pz link");

const again = await serializeOtbm(re);
const re2 = parseOtbm(again);
assert(re2.tiles.get(tileKey(2, 2, 7)).items[0].id === BUILTIN_TILE_IDS.water, "second roundtrip");
assert(re2.tiles.get(tileKey(0, 1, 7)).spawnMonster?.pzId === 7, "second roundtrip spawn pz");

const runtime = otbmMapToRuntime(re);
assert(runtime.w === 8 && runtime.h === 6 && runtime.z === 7, "runtime size");
assert(runtime.ground[2][2] === 4, `water ground ${runtime.ground[2][2]}`);
assert(runtime.walls[2][3] === 1, "wall flag");
assert(runtime.items.some((it) => it.kind === "flower" && it.x === 4 && it.y === 2), "flower item");
assert(runtime.cells[2][2].items[0] === BUILTIN_TILE_IDS.water, "cell water");
assert(runtime.spawn.x === 4 && runtime.spawn.y === 3, "temple spawn");
assert(runtime.houses[2][5] === 12, "runtime house");
assert(runtime.houses[3][4] === 3 && runtime.houses[3][5] === 3, "runtime house area");
assert((runtime.flags[2][5] & TILESTATE_PROTECTIONZONE) === TILESTATE_PROTECTIONZONE, "runtime PZ");
assert((runtime.flags[2][6] & TILESTATE_PVPZONE) === TILESTATE_PVPZONE, "runtime PVP");
assert((runtime.flags[2][7] & TILESTATE_NOPVPZONE) === TILESTATE_NOPVPZONE, "runtime NOPVP");
const pkSpawn = runtime.wildSpawns.find((s) => s.x === 1 && s.y === 1);
assert(pkSpawn?.dexId === "0025-1" && pkSpawn.species === "pikachu" && pkSpawn.shiny === true, "runtime shiny pikachu spawn");
assert(runtime.pokeZoneIds[0][0] === 2 && runtime.pokeZones.some((z) => z.id === 2), "runtime pokezone");
assert(runtime.pzIds[1][0] === 7, "runtime pz pad");
const pad = runtime.pzPads.find((p) => p.id === 7);
assert(pad?.pokeZoneId === 2 && pad.tiles.some((t) => t.x === 0 && t.y === 1), "runtime pzPads");
const catSpawn = runtime.wildSpawns.find((s) => s.x === 0 && s.y === 1);
assert(catSpawn?.dexId === "0010" && catSpawn.pzId === 7, "runtime spawn→pz");

const back = runtimeToOtbm(runtime);
assert(back.tiles.get(tileKey(2, 2, 7)).items[0].id === BUILTIN_TILE_IDS.water, "runtime→otbm water");
assert(back.tiles.get(tileKey(1, 1, 7)).spawnMonster?.dexId === "0025-1", "runtime→otbm spawn dex");
assert(back.tiles.get(tileKey(0, 1, 7)).spawnMonster?.pzId === 7, "runtime→otbm spawn pz");
assert(back.tiles.get(tileKey(0, 1, 7)).pzId === 7, "runtime→otbm pz pad");

applyPzPadToTile(re.tiles.get(tileKey(2, 0, 7)), 3);
assert(re.tiles.get(tileKey(2, 0, 7)).pokeZoneId === 1 && re.tiles.get(tileKey(2, 0, 7)).pzId === 3, "PZ auto-paints PokeZone");
const wipe = re.tiles.get(tileKey(2, 0, 7));
applyPokeZoneToTile(wipe, null);
assert(!wipe.pokeZoneId && !wipe.pzId, "apagar PokeZone remove PZ no sqm");

let filled = 0;
floodFill(map, 0, 0, 7, 8, 6, (x, y) => {
  map.tiles.set(tileKey(x, y, 7), { x, y, z: 7, flags: 0, items: [{ id: BUILTIN_TILE_IDS.path }] });
  filled++;
});
assert(filled > 10, `flood fill ${filled}`);
assert(map.tiles.get(tileKey(2, 2, 7)).items[0].id === BUILTIN_TILE_IDS.water, "fill did not eat water");

const legacy = buildLegacyMap();
const legacyOtbm = runtimeToOtbm(legacy);
const legacyBytes = await serializeOtbm(legacyOtbm);
const legacyParsed = parseOtbm(legacyBytes);
const legacyRt = otbmMapToRuntime(legacyParsed);
assert(legacyRt.w === legacy.w && legacyRt.h === legacy.h, "legacy size");
assert(legacyRt.walls[0][0] === 1, "legacy border wall");

const tmp = mkdtempSync(path.join(os.tmpdir(), "otp-map-"));
process.env.MAP_DATA_DIR = tmp;
const { saveOtbmBuffer, loadActiveMap, exportOtbmBytes } = await import("../server/mapLoader.ts");
const saved = await saveOtbmBuffer(bytes, "world.otbm");
assert(saved.ground[2][2] === 4, "loader water");
const active = loadActiveMap();
assert(active.w === 8, "active cache");
assert(active.pokeZones.some((z) => z.id === 2), "loader pokeZones");
assert(active.pzPads.some((p) => p.id === 7 && p.pokeZoneId === 2), "loader pzPads");
assert(active.wildSpawns.some((s) => s.x === 0 && s.y === 1 && s.pzId === 7), "loader spawn→pz");
const exported = await exportOtbmBytes();
assert(parseOtbm(exported).tiles.get(tileKey(2, 2, 7)).items[0].id === BUILTIN_TILE_IDS.water, "export");
assert((parseOtbm(exported).tiles.get(tileKey(5, 2, 7)).flags & TILESTATE_PROTECTIONZONE) === TILESTATE_PROTECTIONZONE, "export SAFE");
rmSync(tmp, { recursive: true, force: true });

const parsedAreas = parseOtbm(bytes);
parsedAreas.tiles.set(tileKey(0, 5, 7), {
  x: 0,
  y: 5,
  z: 7,
  flags: TILESTATE_NOPVPZONE,
  houseId: 9,
  items: [{ id: BUILTIN_TILE_IDS.path }],
});
const withNew = await serializeOtbm(parsedAreas);
const reNew = parseOtbm(withNew);
assert(reNew.tiles.get(tileKey(0, 5, 7))?.houseId === 9, "new HOUSETILE survives _areaSequence");
assert(reNew.tiles.get(tileKey(0, 5, 7))?.items[0].id === BUILTIN_TILE_IDS.path, "new path tile survives _areaSequence");
assert((reNew.tiles.get(tileKey(0, 5, 7)).flags & TILESTATE_NOPVPZONE) === TILESTATE_NOPVPZONE, "new NOPVP survives _areaSequence");

const { isCombatSafeZone } = await import("../shared/safeZone.js");
assert(isCombatSafeZone(5, 2, { flags: runtime.flags, spawn: { x: 99, y: 99 } }), "OTBM SAFE gates swap far from temple");
assert(!isCombatSafeZone(0, 0, { flags: runtime.flags, spawn: { x: 99, y: 99 } }), "non-SAFE tile blocks swap");
assert(isCombatSafeZone(99, 99, { flags: runtime.flags, spawn: { x: 99, y: 99 } }), "temple radius still safe");

console.log("OTBM OK", { tiles: re.tiles.size, bytes: bytes.length, fill: filled });
