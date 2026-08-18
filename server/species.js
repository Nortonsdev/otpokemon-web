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

export const SPECIES = {
  bulbasaur: {
    number: 1,
    look: 1,
    name: "Bulbasaur",
    types: ["grass", "poison"],
    hp: 45,
    catchRate: 10,
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
    hp: 39,
    catchRate: 50,
    moves: [{ id: 1, name: "Scratch", power: 10 }],
  },
  squirtle: {
    number: 7,
    look: 7,
    name: "Squirtle",
    types: ["water"],
    hp: 44,
    catchRate: 50,
    moves: [{ id: 1, name: "Water Gun", power: 10 }],
  },
  caterpie: {
    number: 10,
    look: 10,
    name: "Caterpie",
    types: ["bug"],
    hp: 45,
    catchRate: 50,
    moves: [{ id: 1, name: "Tackle", power: 8 }],
  },
};

export const STARTERS = ["bulbasaur", "charmander", "squirtle"];

export const BALL = {
  item: "pokeball",
  rate: 1,
};
