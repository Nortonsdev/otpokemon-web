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

function mon(number, look, name, types, hp, atk, def, spa, spd, spe, catchRate, moves, abilities = []) {
  return {
    number,
    look,
    name,
    types,
    catchRate,
    abilities,
    baseStats: { hp, atk, def, spa, spd, spe },
    moves,
  };
}

const M1 = (name) => [{ id: 1, name, power: 10 }];

export const SPECIES = {
  bulbasaur: mon(1, 1, "Bulbasaur", ["grass", "poison"], 45, 49, 49, 65, 65, 45, 45, [
    { id: 1, name: "Vine Whip", power: 10 },
    { id: 2, name: "Spore", power: 8 },
  ]),
  ivysaur: mon(2, 2, "Ivysaur", ["grass", "poison"], 60, 62, 63, 80, 80, 60, 45, M1("Vine Whip")),
  venusaur: mon(3, 3, "Venusaur", ["grass", "poison"], 80, 82, 83, 100, 100, 80, 45, M1("Vine Whip")),
  charmander: mon(4, 4, "Charmander", ["fire"], 39, 52, 43, 60, 50, 65, 45, M1("Scratch")),
  charmeleon: mon(5, 5, "Charmeleon", ["fire"], 58, 64, 58, 80, 65, 80, 45, M1("Scratch")),
  charizard: mon(6, 6, "Charizard", ["fire", "flying"], 78, 84, 78, 109, 85, 100, 50, M1("Scratch"), ["fly"]),
  squirtle: mon(7, 7, "Squirtle", ["water"], 44, 48, 65, 50, 64, 43, 45, M1("Water Gun")),
  wartortle: mon(8, 8, "Wartortle", ["water"], 59, 63, 80, 65, 80, 58, 45, M1("Water Gun")),
  blastoise: mon(9, 9, "Blastoise", ["water"], 79, 83, 100, 85, 105, 78, 45, M1("Water Gun"), ["surf"]),
  caterpie: mon(10, 10, "Caterpie", ["bug"], 45, 30, 35, 20, 20, 45, 50, M1("Tackle")),
  metapod: mon(11, 11, "Metapod", ["bug"], 50, 20, 55, 25, 25, 30, 45, M1("Tackle")),
  butterfree: mon(12, 12, "Butterfree", ["bug", "flying"], 60, 45, 50, 90, 80, 70, 45, M1("Tackle")),
  weedle: mon(13, 13, "Weedle", ["bug", "poison"], 40, 35, 30, 20, 20, 50, 45, M1("Tackle")),
  kakuna: mon(14, 14, "Kakuna", ["bug", "poison"], 45, 25, 50, 25, 25, 35, 45, M1("Tackle")),
  beedrill: mon(15, 15, "Beedrill", ["bug", "poison"], 65, 90, 40, 45, 80, 75, 45, M1("Tackle")),
  pidgey: mon(16, 16, "Pidgey", ["normal", "flying"], 40, 45, 40, 35, 35, 56, 45, M1("Tackle")),
  pidgeotto: mon(17, 17, "Pidgeotto", ["normal", "flying"], 63, 60, 55, 50, 50, 71, 45, M1("Tackle")),
  pidgeot: mon(18, 18, "Pidgeot", ["normal", "flying"], 83, 80, 75, 70, 70, 101, 45, M1("Tackle")),
  raticate: mon(20, 20, "Raticate", ["normal"], 55, 81, 60, 50, 70, 97, 45, M1("Tackle")),
  rapidash: mon(78, 78, "Rapidash", ["fire"], 65, 100, 70, 80, 80, 105, 50, M1("Tackle"), ["ride"]),
};

export const LOOK_NAME = Object.fromEntries(Object.values(SPECIES).map((s) => [s.look, s.name.toLowerCase()]));

export function speciesKeyByLook(look) {
  return Object.keys(SPECIES).find((k) => SPECIES[k].look === look) || "caterpie";
}

export const STARTERS = ["bulbasaur", "charmander", "squirtle"];

export const BALL = {
  item: "pokeball",
  rate: 1,
};
