import type { ClassicCatalog } from "../../../shared/editor/classicClient.ts";
import { displayNameForId, paletteTabForId, type PaletteTab } from "../../../shared/editor/tileCatalog.ts";
import { previewForId } from "./previews.ts";
import { KANTO_DEX, speciesDexId } from "../../../shared/kantoDex.js";

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

export function renderSpawnPalette(opts: {
  filter: string;
  selectedId: string | null;
  shiny: boolean;
  onPick: (dexId: string) => void;
}) {
  const grid = document.getElementById("palette");
  const countEl = document.getElementById("brush-count");
  if (!grid || !countEl) return;
  grid.innerHTML = "";
  const q = opts.filter.toLowerCase().trim();
  const rows = KANTO_DEX.filter((e) => {
    if (!q) return true;
    const id = speciesDexId(e.slug, opts.shiny) || "";
    return (
      e.name.toLowerCase().includes(q) ||
      e.slug.toLowerCase().includes(q) ||
      String(e.number).includes(q) ||
      id.toLowerCase().includes(q)
    );
  });
  countEl.textContent = String(rows.length);
  for (const e of rows) {
    const dexId = speciesDexId(e.slug, opts.shiny)!;
    const div = document.createElement("div");
    div.className = "palette-item spawn-mon" + (opts.selectedId === dexId ? " selected" : "");
    div.title = `${dexId} ${opts.shiny ? "Shiny " : ""}${e.name}`;
    const img = document.createElement("img");
    img.src = `/assets/pokemon/${e.slug}/portrait.png`;
    img.alt = e.name;
    img.width = 32;
    img.height = 32;
    img.className = opts.shiny ? "spawn-portrait shiny" : "spawn-portrait";
    img.onerror = () => {
      img.replaceWith(Object.assign(document.createElement("span"), { textContent: `#${e.number}` }));
    };
    div.appendChild(img);
    const span = document.createElement("span");
    span.textContent = `${dexId} ${e.name}`;
    div.appendChild(span);
    div.onclick = () => opts.onPick(dexId);
    grid.appendChild(div);
  }
}
