import type { RuntimeMap } from "../shared/editor/mapRuntime.ts";

export const MAP_W = 32;
export const MAP_H = 23;
export const MAP_Z = 7;
export const SPAWN = { x: 14, y: 16, z: MAP_Z };

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

const CH: Record<string, number> = { W: 2, G: 0, P: 1, R: 3, "4": 4, C: 0, S: 5, T: 3, "~": 6, D: 7 };

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

export function buildLegacyMap(): RuntimeMap {
  const w = MAP_W;
  const h = MAP_H;
  const ground: number[][] = [];
  const walls: number[][] = [];
  const roofs: number[][] = [];
  const cells: Array<Array<{ items: number[] }>> = [];
  const wildSpawns: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < h; y++) {
    const row = RAW[y].trim();
    ground[y] = [];
    walls[y] = [];
    roofs[y] = [];
    cells[y] = [];
    for (let x = 0; x < w; x++) {
      const c = row[x];
      const kind = CH[c] ?? 0;
      const items = [106];
      if (kind === 2 || kind === 3) {
        items.push(2200);
      } else if (kind === 4) {
        items[0] = 42337;
        items.push(1088);
      } else if (kind === 5) items[0] = 26121;
      else if (kind === 6) items[0] = 4597;
      else if (kind === 7) items[0] = 44092;
      else if (kind === 1) items[0] = 351;
      cells[y][x] = { items };

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

  return {
    w,
    h,
    z: MAP_Z,
    ground,
    walls,
    roofs,
    items: ITEMS.map((it) => ({ ...it })),
    cells,
    wildSpawns,
    spawn: SPAWN,
    tile: 32,
    towns: [
      {
        id: 1,
        name: "Pallet",
        templeX: SPAWN.x,
        templeY: SPAWN.y,
        templeZ: SPAWN.z,
      },
    ],
    waypoints: [],
  };
}
