import type { OtbmMap, OtbmTile } from "../../../shared/editor/otbm.ts";
import { tileKey, zoneKindFromTile } from "../../../shared/editor/otbm.ts";
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
  showGrid: boolean;
  showZones: boolean;
  showHouses: boolean;
}

const ZONE_FILL: Record<string, string> = {
  protection: "rgba(46, 196, 102, 0.32)",
  nopvp: "rgba(232, 180, 48, 0.32)",
  pvp: "rgba(214, 64, 64, 0.32)",
  spawn: "rgba(196, 92, 214, 0.28)",
};

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

function visibleRange(state: DrawState) {
  const { canvas, zoom, panX, panY, runtime } = state;
  const viewW = canvas.width / zoom;
  const viewH = canvas.height / zoom;
  const left = panX - viewW / 2;
  const top = panY - viewH / 2;
  return {
    x0: Math.max(0, Math.floor(left / TILE_SIZE) - 1),
    y0: Math.max(0, Math.floor(top / TILE_SIZE) - 1),
    x1: Math.min(runtime.w - 1, Math.ceil((left + viewW) / TILE_SIZE) + 1),
    y1: Math.min(runtime.h - 1, Math.ceil((top + viewH) / TILE_SIZE) + 1),
  };
}

export function drawEditorMap(state: DrawState) {
  const { ctx, canvas, map, runtime, floor, zoom, panX, panY } = state;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#0c0b09";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-panX, -panY);

  const vis = visibleRange(state);
  for (let y = vis.y0; y <= vis.y1; y++) {
    for (let x = vis.x0; x <= vis.x1; x++) {
      const t = map.tiles.get(tileKey(x, y, floor));
      const items = t?.items.map((i) => i.id) ?? [];
      const stack = items.length ? items : [BUILTIN_TILE_IDS.grass];
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      for (const id of stack) {
        const cv = previewForId(id, state.catalog, state.customSprites);
        ctx.drawImage(cv, px, py);
      }
      if (state.showHouses && t?.houseId) {
        ctx.fillStyle = "rgba(212, 168, 72, 0.34)";
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = "rgba(232, 196, 96, 0.85)";
        ctx.lineWidth = 1 / Math.max(zoom, 0.25);
        ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      }
      if (state.showZones) {
        const kind = zoneKindFromTile(t);
        if (kind && ZONE_FILL[kind]) {
          ctx.fillStyle = ZONE_FILL[kind];
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
      if (state.showGrid) {
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 1 / Math.max(zoom, 0.25);
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  ctx.fillStyle = "#ffcc00";
  for (const wp of map.waypoints) {
    if (wp.z !== floor) continue;
    ctx.beginPath();
    ctx.moveTo(wp.x * TILE_SIZE + 8, wp.y * TILE_SIZE + 24);
    ctx.lineTo(wp.x * TILE_SIZE + 8, wp.y * TILE_SIZE + 6);
    ctx.lineTo(wp.x * TILE_SIZE + 22, wp.y * TILE_SIZE + 12);
    ctx.lineTo(wp.x * TILE_SIZE + 8, wp.y * TILE_SIZE + 14);
    ctx.fill();
  }
  ctx.strokeStyle = "#3d8bfd";
  ctx.lineWidth = 2 / Math.max(zoom, 0.25);
  for (const town of map.towns) {
    if (town.templeZ !== floor) continue;
    ctx.strokeRect(town.templeX * TILE_SIZE, town.templeY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  if (state.showZones) {
    ctx.fillStyle = "rgba(196, 92, 214, 0.9)";
    for (const [key, tile] of map.tiles) {
      void key;
      if (tile.z !== floor) continue;
      if (!tile.spawnMonster && !tile.zones?.includes(4)) continue;
      const cx = tile.x * TILE_SIZE + 16;
      const cy = tile.y * TILE_SIZE + 16;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (state.selection) {
    const r = normalizeRect(state.selection);
    ctx.strokeStyle = "rgba(232, 196, 96, 0.95)";
    ctx.fillStyle = "rgba(232, 196, 96, 0.16)";
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

export function tileOverlayHint(tile: OtbmTile | undefined): string {
  const bits: string[] = [];
  if (tile?.houseId) bits.push(`house ${tile.houseId}`);
  const kind = zoneKindFromTile(tile);
  if (kind) bits.push(kind);
  return bits.join(" · ");
}

export function drawMinimap(mm: CanvasRenderingContext2D, runtime: RuntimeMap, view?: { x: number; y: number; w: number; h: number }) {
  const mw = mm.canvas.width;
  const mh = mm.canvas.height;
  mm.fillStyle = "#11100e";
  mm.fillRect(0, 0, mw, mh);
  const sx = mw / runtime.w;
  const sy = mh / runtime.h;
  const stepX = Math.max(1, Math.floor(runtime.w / mw));
  const stepY = Math.max(1, Math.floor(runtime.h / mh));
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
  for (let y = 0; y < runtime.h; y += stepY) {
    for (let x = 0; x < runtime.w; x += stepX) {
      const name = runtime.walls[y][x] ? "wall" : groundTextureName(runtime.ground[y][x]);
      const house = runtime.houses?.[y]?.[x];
      const flags = runtime.flags?.[y]?.[x] || 0;
      mm.fillStyle = house
        ? "#c4a050"
        : flags & 0x0001
          ? "#2ec466"
          : flags & 0x0004
            ? "#e8b430"
            : flags & 0x0010
              ? "#d64040"
              : colors[name] || "#2d5a27";
      mm.fillRect(x * sx, y * sy, Math.max(1, sx * stepX), Math.max(1, sy * stepY));
    }
  }
  if (view) {
    mm.strokeStyle = "#e8c460";
    mm.lineWidth = 1;
    mm.strokeRect(view.x * sx, view.y * sy, Math.max(2, view.w * sx), Math.max(2, view.h * sy));
  }
}
