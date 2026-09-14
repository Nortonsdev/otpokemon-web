import type { ClassicCatalog } from "../../../shared/editor/classicClient.ts";
import { previewForId } from "./previews.ts";

export function renderPalette(opts: {
  ids: number[];
  selectedId: number;
  catalog: ClassicCatalog | null;
  customSprites: Map<number, HTMLCanvasElement>;
  filter: string;
  onPick: (id: number) => void;
}) {
  const grid = document.getElementById("palette");
  const countEl = document.getElementById("brush-count");
  if (!grid || !countEl) return;
  grid.innerHTML = "";
  const q = opts.filter.toLowerCase();
  const ids = opts.ids.filter((id) => {
    if (!q) return true;
    const name = opts.catalog?.items.get(id)?.name ?? String(id);
    return String(id).includes(q) || name.toLowerCase().includes(q);
  });
  countEl.textContent = String(ids.length);
  for (const id of ids) {
    const div = document.createElement("div");
    div.className = "palette-item" + (id === opts.selectedId ? " selected" : "");
    const src = previewForId(id, opts.catalog, opts.customSprites);
    const cv = document.createElement("canvas");
    cv.width = src.width;
    cv.height = src.height;
    cv.getContext("2d")!.drawImage(src, 0, 0);
    div.appendChild(cv);
    const label = opts.catalog?.items.get(id)?.name ?? `#${id}`;
    const span = document.createElement("span");
    span.textContent = label;
    div.appendChild(span);
    div.onclick = () => opts.onPick(id);
    grid.appendChild(div);
  }
}
