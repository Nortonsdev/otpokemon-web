import { KANTO_BY_SLUG } from "../shared/kantoDex.js";

export const TILE = 32;
export const STEP_MS = 200;
export const ATK_MS = 1000;
export const PLAYER_HP = 150;
export const PARTY_CAP = 6;

export const DIR = {
  N: 0,
  NE: 1,
  E: 2,
  SE: 3,
  S: 4,
  SW: 5,
  W: 6,
  NW: 7,
};

export const DELTA = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

export const SPRITE_DIR = ["north", "east", "east", "south", "south", "west", "west", "north"];

export function opposite(dir) {
  return (dir + 4) % 8;
}

export function behind(x, y, dir) {
  const d = DELTA[opposite(dir)];
  return { x: x + d.x, y: y + d.y };
}

/** Milestone HP: level + base only (no IVs / EVs / nature). */
export function getMaxHealth(baseStats, level) {
  const hp = Math.floor((2 * (baseStats.hp || baseStats) * level) / 100) + level + 10;
  return Math.max(1, hp);
}

export function applyRubyHealth(mon) {
  const base = mon.baseStats || { hp: mon.baseHp };
  const max = getMaxHealth(base, mon.level);
  const prevMax = mon.hpMax;
  if (prevMax && prevMax !== max && mon.hp != null) {
    if (mon.hp >= prevMax) mon.hp = max;
    else mon.hp = Math.max(1, Math.round((mon.hp * max) / prevMax));
  } else if (mon.hp == null) {
    mon.hp = max;
  }
  mon.hpMax = max;
  if (mon.hp > mon.hpMax) mon.hp = mon.hpMax;
  if (mon.hp < 0) mon.hp = 0;
  return mon;
}

function mon(slug, look, types, hp, atk, def, spa, spd, spe, catchRate, moves, abilities = []) {
  const dex = KANTO_BY_SLUG[slug];
  if (!dex) throw new Error(`Species "${slug}" is not Kanto #1–151`);
  return {
    slug,
    number: dex.number,
    look,
    name: dex.name,
    types,
    catchRate,
    abilities,
    baseStats: { hp, atk, def, spa, spd, spe },
    moves,
  };
}

const M1 = (name) => [{ id: 1, name, power: 10 }];

/** Kanto com sprites/stats no milestone (subset de #1–151). */
export const SPECIES = {
  bulbasaur: mon("bulbasaur", 1, ["grass", "poison"], 45, 49, 49, 65, 65, 45, 45, [
    { id: 1, name: "Vine Whip", power: 10 },
    { id: 2, name: "Spore", power: 8 },
  ]),
  ivysaur: mon("ivysaur", 2, ["grass", "poison"], 60, 62, 63, 80, 80, 60, 45, M1("Vine Whip")),
  venusaur: mon("venusaur", 3, ["grass", "poison"], 80, 82, 83, 100, 100, 80, 45, M1("Vine Whip")),
  charmander: mon("charmander", 4, ["fire"], 39, 52, 43, 60, 50, 65, 45, M1("Scratch")),
  charmeleon: mon("charmeleon", 5, ["fire"], 58, 64, 58, 80, 65, 80, 45, M1("Scratch")),
  charizard: mon("charizard", 6, ["fire", "flying"], 78, 84, 78, 109, 85, 100, 50, M1("Scratch"), ["fly"]),
  squirtle: mon("squirtle", 7, ["water"], 44, 48, 65, 50, 64, 43, 45, M1("Water Gun")),
  wartortle: mon("wartortle", 8, ["water"], 59, 63, 80, 65, 80, 58, 45, M1("Water Gun")),
  blastoise: mon("blastoise", 9, ["water"], 79, 83, 100, 85, 105, 78, 45, M1("Water Gun"), ["surf"]),
  caterpie: mon("caterpie", 10, ["bug"], 45, 30, 35, 20, 20, 45, 50, M1("Tackle")),
  metapod: mon("metapod", 11, ["bug"], 50, 20, 55, 25, 25, 30, 45, M1("Tackle")),
  butterfree: mon("butterfree", 12, ["bug", "flying"], 60, 45, 50, 90, 80, 70, 45, M1("Tackle")),
  weedle: mon("weedle", 13, ["bug", "poison"], 40, 35, 30, 20, 20, 50, 45, M1("Tackle")),
  kakuna: mon("kakuna", 14, ["bug", "poison"], 45, 25, 50, 25, 25, 35, 45, M1("Tackle")),
  beedrill: mon("beedrill", 15, ["bug", "poison"], 65, 90, 40, 45, 80, 75, 45, M1("Tackle")),
  pidgey: mon("pidgey", 16, ["normal", "flying"], 40, 45, 40, 35, 35, 56, 45, M1("Tackle")),
  pidgeotto: mon("pidgeotto", 17, ["normal", "flying"], 63, 60, 55, 50, 50, 71, 45, M1("Tackle")),
  pidgeot: mon("pidgeot", 18, ["normal", "flying"], 83, 80, 75, 70, 70, 101, 45, M1("Tackle")),
  raticate: mon("raticate", 20, ["normal"], 55, 81, 60, 50, 70, 97, 45, M1("Tackle")),
  rapidash: mon("rapidash", 78, ["fire"], 65, 100, 70, 80, 80, 105, 50, M1("Tackle"), ["ride"]),
};

export const PLAYABLE_KANTO_SLUGS = Object.keys(SPECIES);

export const LOOK_NAME = Object.fromEntries(
  Object.entries(SPECIES).map(([slug, s]) => [s.look, slug])
);

export function speciesKeyByLook(look) {
  return LOOK_NAME[look] || "caterpie";
}

export const STARTERS = ["bulbasaur", "charmander", "squirtle"];

/** OTP2072026 — Premierball client id 3030, ballsusage id 2 */
export const CATCH_BALL_ITEMS = ["premierball", "ultraball", "masterball"];

export const BALL = {
  pokeball: { item: "pokeball", rate: 1 },
  premierball: { item: "premierball", rate: 1, guaranteed: true, clientId: 3030 },
  ultraball: { item: "ultraball", rate: 1, guaranteed: true },
  masterball: { item: "masterball", rate: 1, guaranteed: true },
};

export const POTIONS = {
  small_potion: { heal: 35 },
  great_potion: { heal: 80 },
};
