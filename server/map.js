import { TILE } from "./species.js";

export const MAP_W = 32;
export const MAP_H = 23;
export const MAP_Z = 7;
export const SPAWN = { x: 14, y: 16, z: MAP_Z };

// G grass  P path  W wall  R roof-grass  4 wood house  T tree  S stone  ~ water  D cave
const RAW = `
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
WGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGGGGGTTTGGGGGGGGGGTTTGGGGGGGGW
WGGPPPPPPPPPPPPPPPPPPPPPPPPPGGGW
WGGPGGGGGGGGGGGGGGGGGGGGGGGPGGGW
WGGPGGGGGGGGGGGGGGGGGGGGGGGPGGGW
WGGPGGGTTTGGG4444GGGTTTGGGGPGGGW
WGGPGGGRRRRGG4444GGRRRRGGGGPGGGW
WGGPGGGRRRRGG4444GGRRRRGGGGPGGGW
WGGPGGGWWWWGG4444GGWWWWGGGGPGGGW
WGGPPPPPPPPPPPPPPPPPPPPPPPPPGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGGGGGSSSSSSSSSSSSSSSSGGGGGGGGW
WGGGGGGSCCCCCCCCCCCCCCSGGGGGGGGW
WGGGGGGSCCCCCCCCCCCCCCSGGGGGGGGW
WGGGGGGSCCCCCCCCCCCCCCSGGGGGGGGW
WGGGGGGSSSSSSSSSSSSSSSSGGGGGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGDDDDDDDDDDDDDDDDDDDDDDDDGGGGW
WGGDGGGGGGGGGGGGGGGGGGGGGGGDGGGW
WGGDDDDDDDDDDDDDDDDDDDDDDDDGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGW
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
`.trim().split("\n");

const CH = { W: 2, G: 0, P: 1, R: 3, "4": 4, C: 0, S: 5, T: 3, "~": 6, D: 7 };

export const ITEMS = [
  { x: 6, y: 10, kind: "flower" },
  { x: 7, y: 11, kind: "rose" },
  { x: 5, y: 15, kind: "flower" },
  { x: 24, y: 11, kind: "flower" },
  { x: 25, y: 16, kind: "rose" },
  { x: 12, y: 12, kind: "gold" },
  { x: 13, y: 12, kind: "gold" },
  { x: 12, y: 16, kind: "gold" },
  { x: 6, y: 19, kind: "flower" },
  { x: 26, y: 20, kind: "rose" },
  { x: 18, y: 5, kind: "flower" },
  { x: 14, y: 9, kind: "rose" },
];

export function buildMap() {
  const ground = [];
  const walls = [];
  const roofs = [];
  const wildSpawns = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = RAW[y].trim();
    ground[y] = [];
    walls[y] = [];
    roofs[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      const c = row[x];
      const kind = CH[c] ?? 0;
      if (kind === 2) {
        ground[y][x] = 0;
        walls[y][x] = 1;
        roofs[y][x] = 0;
      } else if (kind === 3) {
        ground[y][x] = 0;
        walls[y][x] = 1;
        roofs[y][x] = 0;
      } else if (kind === 4) {
        ground[y][x] = 3;
        walls[y][x] = 0;
        roofs[y][x] = 1;
      } else if (kind === 5) {
        ground[y][x] = 2;
        walls[y][x] = 0;
        roofs[y][x] = 0;
      } else if (kind === 6) {
        ground[y][x] = 4;
        walls[y][x] = 0;
        roofs[y][x] = 0;
      } else if (kind === 7) {
        ground[y][x] = 5;
        walls[y][x] = 0;
        roofs[y][x] = 0;
      } else {
        ground[y][x] = kind === 1 ? 1 : 0;
        walls[y][x] = 0;
        roofs[y][x] = 0;
      }
      if (c === "C") wildSpawns.push({ x, y });
    }
  }
  return { w: MAP_W, h: MAP_H, z: MAP_Z, ground, walls, roofs, items: ITEMS, wildSpawns, tile: TILE };
}

export const MAP = buildMap();

export const WILD_GROUPS = [
  { species: "caterpie", want: 3, spots: MAP.wildSpawns },
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
  return x >= 0 && y >= 0 && x < MAP.w && y < MAP.h;
}

export function isWater(x, y) {
  return inBounds(x, y) && MAP.ground[y][x] === 4;
}

export function walkable(x, y, opts = {}) {
  if (!inBounds(x, y) || MAP.walls[y][x] !== 0) return false;
  if (MAP.ground[y][x] === 4) return !!opts.surf;
  return true;
}

export function hasRoof(x, y) {
  return inBounds(x, y) && MAP.roofs[y][x] === 1;
}

export function itemsAt(x, y) {
  return ITEMS.filter((it) => it.x === x && it.y === y);
}

export function tileName(x, y) {
  if (!inBounds(x, y)) return "void";
  if (MAP.walls[y][x]) return "wall";
  const g = MAP.ground[y][x];
  if (g === 1) return "path";
  if (g === 2) return "stone";
  if (g === 3) return "wood floor";
  if (g === 4) return "water";
  if (g === 5) return "cave";
  return "grass";
}
