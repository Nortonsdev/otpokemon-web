import { TILE } from "./species.js";

export const MAP_W = 28;
export const MAP_H = 22;
export const MAP_Z = 7;
export const SPAWN = { x: 8, y: 12, z: MAP_Z };

// 0 grass, 1 path, 2 wall (blocked), 3 roof overlay on grass, 4 house floor (path) + roof
const RAW = `
WWWWWWWWWWWWWWWWWWWWWWWWWWWW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGPPPPPPPPPGGGGGGGGGGGGGGGW
WGGPGGGGGGGPGGGGGRRRRGGGGGGW
WGGPGGGGGGGPGGGGR444RGGGGGGW
WGGPGGGGGGGPGGGGR444RGGGGGGW
WGGPGGGGGGGPGGGGWWWWWGGGGGGW
WGGPPPPPPPPPGGGGGGGGGGGGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGGGGGGGGGCCCCCCCCGGGGGGGGW
WGGGGGGGGGGCCCCCCCCGGGGGGGGW
WGGGGGGGGGGCCCCCCCCGGGGGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGPPPPPPPPPPPPPPPPPGGGGGGGW
WGGPGGGGGGGGGGGGGGGPGGGGGGGW
WGGPPPPPPPPPPPPPPPPPGGGGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WGGGGGGGGGGGGGGGGGGGGGGGGGGW
WWWWWWWWWWWWWWWWWWWWWWWWWWWW
`.trim().split("\n");

const CH = { W: 2, G: 0, P: 1, R: 3, "4": 4, C: 0 };

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
      } else {
        ground[y][x] = kind === 1 ? 1 : 0;
        walls[y][x] = 0;
        roofs[y][x] = 0;
      }
      if (c === "C") wildSpawns.push({ x, y });
    }
  }
  return { w: MAP_W, h: MAP_H, z: MAP_Z, ground, walls, roofs, wildSpawns, tile: TILE };
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

export function tileName(x, y) {
  if (!inBounds(x, y)) return "void";
  if (MAP.walls[y][x]) return "wall";
  if (MAP.roofs[y][x] && MAP.ground[y][x] === 1) return "house";
  if (MAP.roofs[y][x]) return "roof";
  if (MAP.ground[y][x] === 1) return "path";
  return "grass";
}
