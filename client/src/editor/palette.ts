import type { ClassicCatalog } from "../../../shared/editor/classicClient.ts";
import { displayNameForId, paletteTabForId, type PaletteTab } from "../../../shared/editor/tileCatalog.ts";
import { previewForId } from "./previews.ts";

export function renderPalette(opts: {
  ids: number[];
  selectedId: number;
  catalog: ClassicCatalog | null;
  customSprites: Map<number, HTMLCanvasElement>;
  filter: string;
  tab: PaletteTab;
  onPick: (id: number) => void;
}) {
  const grid = document.getElementById("palette");
  const countEl = document.getElementById("brush-count");
  if (!grid || !countEl) return;
  grid.innerHTML = "";
  const q = opts.filter.toLowerCase();
  const ids = opts.ids.filter((id) => {
    if (opts.tab !== "all" && opts.tab !== "raw") {
      if (paletteTabForId(id, opts.catalog) !== opts.tab) return false;
    }
    if (!q) return true;
    const name = displayNameForId(id, opts.catalog);
    return String(id).includes(q) || name.toLowerCase().includes(q);
  });
  countEl.textContent = String(ids.length);
  for (const id of ids) {
    const div = document.createElement("div");
    div.className = "palette-item" + (id === opts.selectedId ? " selected" : "");
    div.title = `${displayNameForId(id, opts.catalog)} (#${id})`;
    const src = previewForId(id, opts.catalog, opts.customSprites);
    const cv = document.createElement("canvas");
    cv.width = src.width;
    cv.height = src.height;
    cv.getContext("2d")!.drawImage(src, 0, 0);
    div.appendChild(cv);
    const span = document.createElement("span");
    span.textContent = displayNameForId(id, opts.catalog);
    div.appendChild(span);
    div.onclick = () => opts.onPick(id);
    grid.appendChild(div);
  }
}
