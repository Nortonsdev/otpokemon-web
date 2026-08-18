export const TILE = 32;
export const STEP_MS = 200;
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

/** Pokemon::getMaxHealth — IVs counted twice; integer /100 as in src/pokemon.cpp. */
export function getMaxHealth(baseStats, ivHp, evHp, level) {
  const hp =
    Math.floor(((2 * baseStats.hp + ivHp + ivHp + Math.floor(evHp / 30)) * level) / 100) +
    level +
    10;
  return Math.max(1, hp);
}

export function applyRubyHealth(mon) {
  const base = mon.baseStats || { hp: mon.baseHp };
  const max = getMaxHealth(base, mon.ivs?.hp ?? 1, mon.evs?.hp ?? 0, mon.level);
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

export const SPECIES = {
  bulbasaur: {
    number: 1,
    look: 1,
    name: "Bulbasaur",
    types: ["grass", "poison"],
    catchRate: 10,
    runOnHealth: 0,
    baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
    moves: [
      { id: 1, name: "Vine Whip", power: 12 },
      { id: 2, name: "Spore", power: 8 },
    ],
  },
  charmander: {
    number: 4,
    look: 4,
    name: "Charmander",
    types: ["fire"],
    catchRate: 50,
    runOnHealth: 0,
    baseStats: { hp: 39, atk: 52, def: 43, spa: 60, spd: 50, spe: 65 },
    moves: [{ id: 1, name: "Scratch", power: 10 }],
  },
  squirtle: {
    number: 7,
    look: 7,
    name: "Squirtle",
    types: ["water"],
    catchRate: 50,
    runOnHealth: 0,
    baseStats: { hp: 44, atk: 48, def: 65, spa: 50, spd: 64, spe: 43 },
    moves: [{ id: 1, name: "Water Gun", power: 10 }],
  },
  caterpie: {
    number: 10,
    look: 10,
    name: "Caterpie",
    types: ["bug"],
    catchRate: 50,
    runOnHealth: 15,
    baseStats: { hp: 45, atk: 30, def: 35, spa: 20, spd: 20, spe: 45 },
    moves: [{ id: 1, name: "Tackle", power: 8 }],
  },
};

export const STARTERS = ["bulbasaur", "charmander", "squirtle"];

export const BALL = {
  item: "pokeball",
  rate: 1,
};
