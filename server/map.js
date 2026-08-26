import { TILE } from "./species.js";

export const MAP_W = 28;
export const MAP_H = 22;
export const MAP_Z = 7;
export const SPAWN = { x: 8, y: 12, z: MAP_Z };

// 0 grass, 1 path, 2 wall, 3 roof on grass, 4 house floor + roof, 5 stone plaza
const RAW = `
WWWWWWWWWWWWWWWWWWWWWWWWWWWW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGPPPPPPPPPGGGGGGGGGGGGGGGW
WGGPGGGGGGGPGGGGGRRRRGGGGGGW
WGGPGGGGGGGPGGGGR444RGGGGGGW
WGGPGGGGGGGPGGGGR444RGGGGGGW
WGGPGGGGGGGPGGGGWWGWWGGGGGGW
WGGPPPPPPPPPGGGGGGGGGGGGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGGGGGSSSSSSSSSSGGGGGGGGGGW
WGGGGGGSCCCCCCCCSGGGGGGGGGGW
WGGGGGGSCCCCCCCCSGGGGGGGGGGW
WGGGGGGSCCCCCCCCSGGGGGGGGGGW
WGGGGGGSSSSSSSSSSGGGGGGGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGPPPPPPPPPPPPPPPPPGGGGGGGW
WGGPGGGGGGGGGGGGGGGPGGGGGGGW
WGGPPPPPPPPPPPPPPPPPGGGGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WWWWWWWWWWWWWWWWWWWWWWWWWWWW
`.trim().split("\n");

const CH = { W: 2, G: 0, P: 1, R: 3, "4": 4, C: 0, S: 5 };

export const ITEMS = [
  { x: 4, y: 9, kind: "flower" },
  { x: 5, y: 10, kind: "rose" },
  { x: 3, y: 14, kind: "flower" },
  { x: 19, y: 10, kind: "flower" },
  { x: 20, y: 15, kind: "rose" },
  { x: 9, y: 10, kind: "gold" },
  { x: 10, y: 10, kind: "gold" },
  { x: 9, y: 14, kind: "gold" },
  { x: 4, y: 17, kind: "flower" },
  { x: 22, y: 18, kind: "rose" },
  { x: 16, y: 4, kind: "flower" },
  { x: 12, y: 8, kind: "rose" },
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
        walls[y][x] = 0;
        roofs[y][x] = 1;
      } else if (kind === 4) {
        ground[y][x] = 1;
        walls[y][x] = 0;
        roofs[y][x] = 1;
      } else if (kind === 5) {
        ground[y][x] = 2;
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

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP.w && y < MAP.h;
}

export function walkable(x, y) {
  return inBounds(x, y) && MAP.walls[y][x] === 0;
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
  if (MAP.roofs[y][x] && MAP.ground[y][x] === 1) return "house";
  if (MAP.roofs[y][x]) return "roof";
  const dropped = itemsAt(x, y);
  if (dropped.length) return dropped.map((it) => it.kind).join(", ");
  if (MAP.ground[y][x] === 1) return "path";
  if (MAP.ground[y][x] === 2) return "stone";
  return "grass";
}
