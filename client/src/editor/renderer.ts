import type { OtbmMap } from "../../../shared/editor/otbm.ts";
import { tileKey } from "../../../shared/editor/otbm.ts";
import type { RuntimeMap } from "../../../shared/editor/mapRuntime.ts";
import { BUILTIN_TILE_IDS, TILE_SIZE, groundTextureName } from "../../../shared/editor/tileCatalog.ts";
import type { Rect } from "../../../shared/editor/brushes.ts";
import { normalizeRect } from "../../../shared/editor/brushes.ts";
import { previewForId } from "./previews.ts";
import type { ClassicCatalog } from "../../../shared/editor/classicClient.ts";

export interface DrawState {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  map: OtbmMap;
  runtime: RuntimeMap;
  floor: number;
  zoom: number;
  panX: number;
  panY: number;
  catalog: ClassicCatalog | null;
  customSprites: Map<number, HTMLCanvasElement>;
  selection: Rect | null;
}

export function screenToTile(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  zoom: number,
  panX: number,
  panY: number,
) {
  const rect = canvas.getBoundingClientRect();
  const sx = (clientX - rect.left) * (canvas.width / rect.width);
  const sy = (clientY - rect.top) * (canvas.height / rect.height);
  const wx = (sx - canvas.width / 2) / zoom + panX;
  const wy = (sy - canvas.height / 2) / zoom + panY;
  return { x: Math.floor(wx / TILE_SIZE), y: Math.floor(wy / TILE_SIZE), sx, sy };
}

export function drawEditorMap(state: DrawState) {
  const { ctx, canvas, map, runtime, floor, zoom, panX, panY } = state;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#0a0c10";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-panX, -panY);

  for (let y = 0; y < runtime.h; y++) {
    for (let x = 0; x < runtime.w; x++) {
      const t = map.tiles.get(tileKey(x, y, floor));
      const items = t?.items.map((i) => i.id) ?? [];
      const stack = items.length ? items : [BUILTIN_TILE_IDS.grass];
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      for (const id of stack) {
        const cv = previewForId(id, state.catalog, state.customSprites);
        ctx.drawImage(cv, px, py);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  }

  ctx.fillStyle = "#ffcc00";
  for (const wp of map.waypoints) {
    if (wp.z !== floor) continue;
    ctx.fillRect(wp.x * TILE_SIZE + 12, wp.y * TILE_SIZE + 12, 8, 8);
  }
  ctx.strokeStyle = "#3d8bfd";
  ctx.lineWidth = 2;
  for (const town of map.towns) {
    if (town.templeZ !== floor) continue;
    ctx.strokeRect(town.templeX * TILE_SIZE, town.templeY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  if (state.selection) {
    const r = normalizeRect(state.selection);
    ctx.strokeStyle = "rgba(61, 139, 253, 0.95)";
    ctx.fillStyle = "rgba(61, 139, 253, 0.18)";
    ctx.lineWidth = 1 / Math.max(zoom, 0.25);
    const x = r.x0 * TILE_SIZE;
    const y = r.y0 * TILE_SIZE;
    const rw = (r.x1 - r.x0 + 1) * TILE_SIZE;
    const rh = (r.y1 - r.y0 + 1) * TILE_SIZE;
    ctx.fillRect(x, y, rw, rh);
    ctx.strokeRect(x, y, rw, rh);
  }

  ctx.restore();
}

export function drawMinimap(mm: CanvasRenderingContext2D, runtime: RuntimeMap) {
  const mw = mm.canvas.width;
  const mh = mm.canvas.height;
  mm.fillStyle = "#111";
  mm.fillRect(0, 0, mw, mh);
  const sx = mw / runtime.w;
  const sy = mh / runtime.h;
  const colors: Record<string, string> = {
    grass: "#2d5a27",
    path: "#8b7355",
    stone: "#888",
    wood: "#6b4423",
    water: "#2266aa",
    cave: "#444",
    marble: "#c8c0b4",
    wall: "#222",
  };
  for (let y = 0; y < runtime.h; y++) {
    for (let x = 0; x < runtime.w; x++) {
      const name = runtime.walls[y][x] ? "wall" : groundTextureName(runtime.ground[y][x]);
      mm.fillStyle = colors[name] || "#2d5a27";
      mm.fillRect(x * sx, y * sy, Math.max(1, sx), Math.max(1, sy));
    }
  }
}
