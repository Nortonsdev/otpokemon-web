import { itemPreviewCanvas, type ClassicCatalog } from "../../../shared/editor/classicClient.ts";
import { BUILTIN_TILE_IDS, TILE_SIZE, builtinNameForId } from "../../../shared/editor/tileCatalog.ts";

const cache = new Map<number, HTMLCanvasElement>();
const loading = new Map<number, Promise<HTMLCanvasElement>>();

function canvasFromImage(img: CanvasImageSource): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE_SIZE;
  c.height = TILE_SIZE;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE);
  return c;
}

export function solidPreview(color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE_SIZE;
  c.height = TILE_SIZE;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  return c;
}

export async function loadBuiltinPreviews(): Promise<void> {
  const jobs = Object.entries(BUILTIN_TILE_IDS).map(async ([name, id]) => {
    if (cache.has(id)) return;
    const img = new Image();
    img.src = `/assets/tiles/${name}.png`;
    try {
      await img.decode();
      cache.set(id, canvasFromImage(img));
    } catch {
      cache.set(id, solidPreview("#2d5a27"));
    }
  });
  await Promise.all(jobs);
}

export function previewForId(
  id: number,
  catalog: ClassicCatalog | null,
  custom: Map<number, HTMLCanvasElement>,
): HTMLCanvasElement {
  if (custom.has(id)) return custom.get(id)!;
  if (cache.has(id)) return cache.get(id)!;
  if (catalog) {
    const fromDat = itemPreviewCanvas(catalog, id);
    if (fromDat) {
      cache.set(id, fromDat);
      return fromDat;
    }
  }
  const name = builtinNameForId(id);
  if (name && !loading.has(id)) {
    const img = new Image();
    img.src = `/assets/tiles/${name}.png`;
    const pending = img
      .decode()
      .then(() => {
        const c = canvasFromImage(img);
        cache.set(id, c);
        loading.delete(id);
        return c;
      })
      .catch(() => {
        loading.delete(id);
        return solidPreview("#2d5a27");
      });
    loading.set(id, pending);
  }
  return cache.get(id) ?? solidPreview("#1b3a18");
}

export function rememberPreview(id: number, canvas: HTMLCanvasElement) {
  cache.set(id, canvas);
}
