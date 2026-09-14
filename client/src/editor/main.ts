import "./editor.css";
import {
  parseOtbm,
  serializeOtbm,
  createEmptyMap,
  tileKey,
  cloneOtbmMap,
  applyHouseToTile,
  applyZoneToTile,
  tileIsEmpty,
  ZONE_SPAWN,
  type OtbmMap,
  type OtbmTile,
} from "../../../shared/editor/otbm.ts";
import { WaypointManager } from "../../../shared/editor/WaypointManager.ts";
import { parsePositionString } from "../../../shared/editor/position.ts";
import { loadClassicClient, type ClassicCatalog } from "../../../shared/editor/classicClient.ts";
import { otbmMapToRuntime, setRuntimeCell, type RuntimeMap } from "../../../shared/editor/mapRuntime.ts";
import {
  BUILTIN_TILE_IDS,
  BUILTIN_PALETTE_IDS,
  CUSTOM_ID_START,
  TILE_SIZE,
  type PaletteTab,
} from "../../../shared/editor/tileCatalog.ts";
import { floodFill, forEachRectTile, type Rect } from "../../../shared/editor/brushes.ts";
import { loadBuiltinPreviews, rememberPreview } from "./previews.ts";
import { drawEditorMap, drawMinimap, screenToTile, tileOverlayHint } from "./renderer.ts";
import { renderPalette } from "./palette.ts";

type Tool =
  | "brush"
  | "erase"
  | "fill"
  | "select"
  | "rect"
  | "pan"
  | "waypoint"
  | "town"
  | "house"
  | "spawn"
  | "pvp"
  | "nopvp"
  | "protection";

type MetaStamp = "house" | "spawn" | "pvp" | "nopvp" | "protection";
const META_TOOLS: MetaStamp[] = ["house", "spawn", "pvp", "nopvp", "protection"];
function isMetaStamp(t: string | null | undefined): t is MetaStamp {
  return META_TOOLS.includes(t as MetaStamp);
}

const ICONS: Record<string, string> = {
  select: `<rect x="3" y="3" width="10" height="10" stroke-dasharray="2 2"/>`,
  pan: `<path d="M8 1v14M1 8h14M3.5 3.5L8 1l4.5 2.5M3.5 12.5L8 15l4.5-2.5"/>`,
  zoomIn: `<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2L14 14M7 5v4M5 7h4"/>`,
  zoomOut: `<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2L14 14M5 7h4"/>`,
  brush: `<path d="M3 13l3-1 7-7a1.5 1.5 0 0 0-2-2L4 10l-1 3z"/><path d="M9 5l2 2"/>`,
  erase: `<path d="M4 9l5-5 4 4-5 5H4z"/><path d="M3 13h10"/>`,
  fill: `<path d="M3 9l5-6 5 6v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 4c1.2 1 2 2.4 2 4"/>`,
  rect: `<rect x="3" y="4" width="10" height="8"/>`,
  waypoint: `<path d="M4 14V4h7l-2 3 2 3H4"/>`,
  house: `<path d="M2 8l6-5 6 5v6H2z"/><path d="M6 14v-4h4v4"/>`,
  spawn: `<circle cx="8" cy="8" r="3"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2"/>`,
  goto: `<path d="M8 14s5-4.2 5-8a5 5 0 1 0-10 0c0 3.8 5 8 5 8z"/><circle cx="8" cy="6" r="1.4"/>`,
  undo: `<path d="M5 8H2l3-3M2 8l3 3"/><path d="M2 8h8a4 4 0 1 1 0 8"/>`,
  redo: `<path d="M11 8h3l-3-3M14 8l-3 3"/><path d="M14 8H6a4 4 0 1 0 0 8"/>`,
  pvp: `<path d="M4 4l8 8M12 4L4 12"/><path d="M3 7l4-4M9 13l4 0"/>`,
  nopvp: `<path d="M8 2l5 2v4c0 3.2-2.2 5.5-5 6.5C5.2 13.5 3 11.2 3 8V4z"/>`,
  protection: `<circle cx="8" cy="8" r="5"/><path d="M8 5v6M5 8h6"/>`,
  layers: `<path d="M8 3l6 3-6 3-6-3z"/><path d="M3 9l5 2.5L13 9"/><path d="M3 12l5 2.5 5-2.5"/>`,
  grid: `<rect x="3" y="3" width="10" height="10"/><path d="M8 3v10M3 8h10"/>`,
  chevronUp: `<path d="M4 10l4-4 4 4"/>`,
  chevronDown: `<path d="M4 6l4 4 4-4"/>`,
};

function icon(name: string) {
  return `<svg viewBox="0 0 16 16">${ICONS[name] || ""}</svg>`;
}

class EditorApp {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  minimap: HTMLCanvasElement;
  mmCtx: CanvasRenderingContext2D;
  catalog: ClassicCatalog | null = null;
  customSprites = new Map<number, HTMLCanvasElement>();
  paletteIds: number[] = [...BUILTIN_PALETTE_IDS];
  selectedId = BUILTIN_TILE_IDS.grass;
  tool: Tool = "brush";
  stamp: MetaStamp | "item" = "item";
  floor = 7;
  zoom = 1;
  panX = 0;
  panY = 0;
  map: OtbmMap = createEmptyMap();
  runtime: RuntimeMap;
  undo: OtbmMap[] = [];
  redo: OtbmMap[] = [];
  waypointMgr = new WaypointManager([]);
  painting = false;
  panning = false;
  spacePan = false;
  strokeUndo = false;
  lastX = 0;
  lastY = 0;
  selection: Rect | null = null;
  selecting = false;
  recting = false;
  paletteFilter = "";
  paletteTab: PaletteTab = "terrain";
  showGrid = true;
  showZones = true;
  showHouses = true;
  houseId = 1;
  statusEl!: HTMLElement;
  posEl!: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.runtime = otbmMapToRuntime(this.map);
    this.buildUi();
    this.canvas = document.getElementById("map-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.minimap = document.getElementById("minimap") as HTMLCanvasElement;
    this.mmCtx = this.minimap.getContext("2d")!;
    this.bindCanvas();
    this.bindKeys();
    this.newMap(32, 23, 7, false);
    window.addEventListener("resize", () => this.resize());
    this.resize();
    loadBuiltinPreviews().then(() => {
      this.refreshPalette();
      this.draw();
    });
  }

  pushUndo() {
    this.undo.push(cloneOtbmMap(this.map));
    if (this.undo.length > 40) this.undo.shift();
    this.redo = [];
  }

  applyMap(m: OtbmMap) {
    this.map = m;
    this.waypointMgr = new WaypointManager(m.waypoints);
    this.runtime = otbmMapToRuntime(m, this.catalog ?? undefined, this.floor);
    this.draw();
    this.updateMinimap();
    this.setStatus();
  }

  ensureTile(x: number, y: number): OtbmTile {
    const key = tileKey(x, y, this.floor);
    let t = this.map.tiles.get(key);
    if (!t) {
      t = { x, y, z: this.floor, flags: 0, items: [{ id: BUILTIN_TILE_IDS.grass }] };
      this.map.tiles.set(key, t);
    }
    return t;
  }

  pruneTile(t: OtbmTile) {
    if (tileIsEmpty(t)) this.map.tiles.delete(tileKey(t.x, t.y, t.z));
  }

  syncRuntime(x: number, y: number) {
    if (this.floor !== this.runtime.z) return;
    if (x < 0 || y < 0 || x >= this.runtime.w || y >= this.runtime.h) return;
    const t = this.map.tiles.get(tileKey(x, y, this.floor));
    setRuntimeCell(this.runtime, x, y, t?.items.map((i) => i.id) ?? [], this.catalog ?? undefined);
    if (this.runtime.flags?.[y]) this.runtime.flags[y][x] = t?.flags || 0;
    if (this.runtime.houses?.[y]) this.runtime.houses[y][x] = t?.houseId || 0;
  }

  setTileItems(x: number, y: number, items: number[]) {
    const t = this.ensureTile(x, y);
    t.items = items.map((id) => ({ id }));
    this.pruneTile(t);
    this.syncRuntime(x, y);
  }

  currentHouseId() {
    const el = document.getElementById("house-id") as HTMLInputElement | null;
    const n = Number(el?.value || this.houseId);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }

  effectiveMeta(): MetaStamp | null {
    if (isMetaStamp(this.tool)) return this.tool;
    if (isMetaStamp(this.stamp)) return this.stamp;
    return null;
  }

  highlightTools() {
    this.root.querySelectorAll("[data-tool]").forEach((b) => b.classList.remove("active"));
    this.root.querySelector(`[data-tool="${this.tool}"]`)?.classList.add("active");
    if (this.stamp !== "item" && this.stamp !== this.tool) {
      this.root.querySelector(`[data-tool="${this.stamp}"]`)?.classList.add("active");
    }
  }

  applyMetaToSelection(kind: MetaStamp, clear = false) {
    if (!this.selection) return;
    this.pushUndo();
    forEachRectTile(this.selection, this.runtime.w, this.runtime.h, (x, y) => this.paintMetaAt(x, y, clear, kind));
    this.draw();
    this.updateMinimap();
    this.setStatus();
  }

  buildUi() {
    this.root.innerHTML = `
      <div class="editor-stage">
        <div class="canvas-wrap"><canvas id="map-canvas"></canvas></div>

        <aside class="brushes-panel glass">
          <header>BRUSHES <span id="brush-count">0</span></header>
          <div class="brush-tabs">
            <button type="button" data-tab="all">ALL</button>
            <button type="button" data-tab="terrain" class="active">TERRAIN</button>
            <button type="button" data-tab="doodad">DOODAD</button>
            <button type="button" data-tab="items">ITEMS</button>
            <button type="button" data-tab="raw">RAW</button>
          </div>
          <select id="tileset-filter"><option>All Tilesets</option></select>
          <input class="search" id="palette-search" placeholder="Search brushes..." />
          <div class="palette-grid" id="palette"></div>
        </aside>

        <header class="top-chrome glass">
          <nav class="menus">
            <div class="menu" data-menu="file">
              <button type="button">FILE</button>
              <div class="menu-list glass">
                <button type="button" data-act="new">Novo mapa</button>
                <button type="button" data-act="open">Abrir OTBM</button>
                <button type="button" data-act="save">Salvar OTBM</button>
                <button type="button" data-act="apply">Aplicar no jogo</button>
                <div class="sep"></div>
                <button type="button" data-act="pick-dat">Carregar DAT</button>
                <button type="button" data-act="pick-spr">Carregar SPR</button>
                <button type="button" data-act="pick-xml">Carregar XML</button>
                <button type="button" data-act="png">Importar PNG</button>
              </div>
            </div>
            <div class="menu" data-menu="edit">
              <button type="button">EDIT</button>
              <div class="menu-list glass">
                <button type="button" data-act="undo">Desfazer</button>
                <button type="button" data-act="redo">Refazer</button>
              </div>
            </div>
            <div class="menu" data-menu="map">
              <button type="button">MAP</button>
              <div class="menu-list glass">
                <button type="button" data-act="towns">Cidades / templos</button>
                <button type="button" data-act="wps">Waypoints</button>
                <button type="button" data-act="goto">Ir para…</button>
              </div>
            </div>
            <div class="menu" data-menu="view">
              <button type="button">VIEW</button>
              <div class="menu-list glass">
                <button type="button" data-act="toggle-grid">Grade</button>
                <button type="button" data-act="toggle-zones">Zonas</button>
                <button type="button" data-act="toggle-houses">Casas</button>
              </div>
            </div>
          </nav>
          <div class="tools">
            <button class="tool-btn" data-tool="select" title="Selecionar (M)">${icon("select")}</button>
            <button class="tool-btn" data-tool="pan" title="Mover mapa (Espaço)">${icon("pan")}</button>
            <button class="tool-btn active" data-tool="brush" title="Pincel (B)">${icon("brush")}</button>
            <button class="tool-btn" data-tool="erase" title="Apagar (E)">${icon("erase")}</button>
            <button class="tool-btn" data-tool="fill" title="Preencher (F)">${icon("fill")}</button>
            <button class="tool-btn" data-tool="rect" title="Retângulo (R)">${icon("rect")}</button>
            <button class="tool-btn" data-tool="waypoint" title="Waypoint">${icon("waypoint")}</button>
            <button class="tool-btn" data-tool="house" title="Casa (HOUSETILE)">${icon("house")}</button>
            <button class="tool-btn" data-tool="spawn" title="Spawn">${icon("spawn")}</button>
            <button class="tool-btn" data-act="goto" title="Ir para…">${icon("goto")}</button>
          </div>
          <div class="tools">
            <button class="tool-btn zone-pvp" data-tool="pvp" title="PVP">${icon("pvp")}</button>
            <button class="tool-btn zone-nopvp" data-tool="nopvp" title="non-PVP">${icon("nopvp")}</button>
            <button class="tool-btn zone-safe" data-tool="protection" title="SAFE — save / non-combat (OTBM PZ)">${icon("protection")}</button>
          </div>
          <div class="tools">
            <button class="tool-btn" data-act="undo" title="Desfazer">${icon("undo")}</button>
            <button class="tool-btn" data-act="redo" title="Refazer">${icon("redo")}</button>
            <button class="tool-btn" data-act="zoom-out" title="Zoom −">${icon("zoomOut")}</button>
            <button class="tool-btn" data-act="zoom-in" title="Zoom +">${icon("zoomIn")}</button>
          </div>
        </header>

        <a class="guest-link" href="/">Jogo</a>

        <aside class="floor-dock glass">
          <button type="button" id="floor-up" title="Andar acima (Z−)">${icon("chevronUp")}</button>
          <strong id="floor-label">7</strong>
          <button type="button" id="floor-down" title="Andar abaixo (Z+)">${icon("chevronDown")}</button>
          <button type="button" id="btn-layers" title="Mostrar zonas/casas">${icon("layers")}</button>
          <button type="button" id="btn-grid" class="active" title="Grade">${icon("grid")}</button>
          <input class="house-id" id="house-id" type="number" min="1" value="1" title="House ID" />
        </aside>

        <footer class="status-pill glass">
          <span id="st-pos">POS 0, 0, 7</span>
          <span id="st-zoom">ZOOM 1.00x</span>
          <span id="st-tiles">TILES 0</span>
        </footer>
        <span id="st-msg" class="status-msg"></span>
        <div class="minimap-dock"><canvas id="minimap" width="168" height="118"></canvas></div>
      </div>
      <input type="file" id="file-dat" accept=".dat" hidden />
      <input type="file" id="file-spr" accept=".spr" hidden />
      <input type="file" id="file-xml" accept=".xml" hidden />
    `;
    this.statusEl = document.getElementById("st-msg")!;
    this.posEl = document.getElementById("st-pos")!;

    this.root.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => this.setTool((btn as HTMLElement).dataset.tool as Tool));
    });

    const acts: Record<string, () => void> = {
      new: () => this.promptNewMap(),
      open: () => this.openOtbm(),
      save: () => void this.saveOtbm(),
      apply: () => void this.applyToGame(),
      undo: () => this.doUndo(),
      redo: () => this.doRedo(),
      goto: () => this.promptGoto(),
      towns: () => this.editTowns(),
      wps: () => this.editWaypoints(),
      "pick-dat": () => (document.getElementById("file-dat") as HTMLInputElement).click(),
      "pick-spr": () => (document.getElementById("file-spr") as HTMLInputElement).click(),
      "pick-xml": () => (document.getElementById("file-xml") as HTMLInputElement).click(),
      png: () => this.importPng(),
      "toggle-grid": () => this.toggleGrid(),
      "toggle-zones": () => this.toggleZones(),
      "toggle-houses": () => this.toggleHouses(),
      "zoom-in": () => this.setZoom(this.zoom * 1.1),
      "zoom-out": () => this.setZoom(this.zoom * 0.9),
    };
    this.root.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        acts[(btn as HTMLElement).dataset.act!]?.();
        this.closeMenus();
      });
    });

    this.root.querySelectorAll(".menu > button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = (btn as HTMLElement).parentElement!;
        const open = menu.classList.contains("open");
        this.closeMenus();
        if (!open) menu.classList.add("open");
      });
    });
    document.addEventListener("click", () => this.closeMenus());

    this.root.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.paletteTab = (btn as HTMLElement).dataset.tab as PaletteTab;
        this.root.querySelectorAll("[data-tab]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.refreshPalette();
      });
    });

    let datBuf: ArrayBuffer | null = null;
    let sprBuf: ArrayBuffer | null = null;
    let xmlText: string | undefined;
    const tryLoadAssets = async () => {
      if (!datBuf || !sprBuf) return;
      this.catalog = await loadClassicClient(datBuf, sprBuf, xmlText);
      const fromCat = [...this.catalog.items.values()]
        .filter((e) => e.spriteIds.length && (e.isGround || e.id < 2000))
        .slice(0, 200)
        .map((e) => e.id);
      this.paletteIds = [...new Set([...BUILTIN_PALETTE_IDS, ...fromCat, ...this.customSprites.keys()])];
      this.refreshPalette();
      this.draw();
      this.msg("Assets carregados (DAT+SPR clássicos).");
    };
    (document.getElementById("file-dat") as HTMLInputElement).onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) datBuf = await f.arrayBuffer();
      await tryLoadAssets();
    };
    (document.getElementById("file-spr") as HTMLInputElement).onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) sprBuf = await f.arrayBuffer();
      await tryLoadAssets();
    };
    (document.getElementById("file-xml") as HTMLInputElement).onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) xmlText = await f.text();
      await tryLoadAssets();
    };

    document.getElementById("palette-search")!.addEventListener("input", (e) => {
      this.paletteFilter = (e.target as HTMLInputElement).value;
      this.refreshPalette();
    });
    document.getElementById("floor-up")!.addEventListener("click", () => this.setFloor(this.floor - 1));
    document.getElementById("floor-down")!.addEventListener("click", () => this.setFloor(this.floor + 1));
    document.getElementById("btn-grid")!.addEventListener("click", () => this.toggleGrid());
    document.getElementById("btn-layers")!.addEventListener("click", () => {
      const on = !(this.showZones && this.showHouses);
      this.showZones = on;
      this.showHouses = on;
      document.getElementById("btn-layers")!.classList.toggle("active", on);
      this.draw();
    });
    document.getElementById("house-id")!.addEventListener("input", (e) => {
      this.houseId = this.currentHouseId();
      void e;
    });
  }

  closeMenus() {
    this.root.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
  }

  toggleGrid() {
    this.showGrid = !this.showGrid;
    document.getElementById("btn-grid")!.classList.toggle("active", this.showGrid);
    this.draw();
  }

  toggleZones() {
    this.showZones = !this.showZones;
    document.getElementById("btn-layers")!.classList.toggle("active", this.showZones || this.showHouses);
    this.draw();
  }

  toggleHouses() {
    this.showHouses = !this.showHouses;
    document.getElementById("btn-layers")!.classList.toggle("active", this.showZones || this.showHouses);
    this.draw();
  }

  setTool(tool: Tool) {
    if (isMetaStamp(tool)) this.stamp = tool;
    this.tool = tool;
    this.highlightTools();
    this.canvas.style.cursor = tool === "pan" ? "grab" : tool === "select" || tool === "rect" ? "cell" : "crosshair";
    if (isMetaStamp(tool) && this.selection) {
      this.applyMetaToSelection(tool, false);
      this.selection = null;
      const label = tool === "protection" ? "SAFE" : tool === "house" ? `HOUSETILE ${this.currentHouseId()}` : tool;
      this.msg(`Área: ${label}`);
    }
  }

  msg(t: string) {
    this.statusEl.textContent = t;
  }

  setFloor(z: number) {
    this.floor = Math.max(0, Math.min(15, z));
    document.getElementById("floor-label")!.textContent = String(this.floor);
    this.runtime = otbmMapToRuntime(this.map, this.catalog ?? undefined, this.floor);
    this.draw();
    this.updateMinimap();
  }

  newMap(w: number, h: number, z: number, recordUndo = true) {
    if (recordUndo) this.pushUndo();
    const m = createEmptyMap();
    m.width = w;
    m.height = h;
    m.rawDescriptions = ["Saved with YATME"];
    m.description = "Saved with YATME";
    m.tiles.clear();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        m.tiles.set(tileKey(x, y, z), {
          x,
          y,
          z,
          flags: 0,
          items: [{ id: BUILTIN_TILE_IDS.grass }],
        });
      }
    }
    m.towns = [{ id: 1, name: "Spawn", templeX: Math.floor(w / 2), templeY: Math.floor(h / 2), templeZ: z }];
    m.waypoints = [];
    const tx = m.towns[0].templeX;
    const ty = m.towns[0].templeY;
    for (let y = ty - 1; y <= ty + 1; y++) {
      for (let x = tx - 1; x <= tx + 1; x++) {
        const t = m.tiles.get(tileKey(x, y, z));
        if (t) applyZoneToTile(t, "protection");
      }
    }
    this.selection = null;
    this.floor = z;
    document.getElementById("floor-label")!.textContent = String(z);
    this.panX = (w * TILE_SIZE) / 2;
    this.panY = (h * TILE_SIZE) / 2;
    this.applyMap(m);
    this.msg(`Novo mapa ${w}×${h} z=${z}`);
  }

  promptNewMap() {
    const w = Number(prompt("Largura (sqm)", String(this.runtime.w)) || this.runtime.w);
    const h = Number(prompt("Altura (sqm)", String(this.runtime.h)) || this.runtime.h);
    const z = Number(prompt("Andar Z", String(this.floor)) || this.floor);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return;
    this.newMap(Math.min(256, Math.floor(w)), Math.min(256, Math.floor(h)), Math.max(0, Math.min(15, Math.floor(z))));
  }

  async openOtbm() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".otbm";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const m = parseOtbm(new Uint8Array(await f.arrayBuffer()));
        this.pushUndo();
        this.selection = null;
        if (m.towns[0]) this.floor = m.towns[0].templeZ;
        this.applyMap(m);
        this.centerOn(m.towns[0]?.templeX ?? 0, m.towns[0]?.templeY ?? 0);
        this.msg(`Mapa aberto: ${f.name} (${m.tiles.size} tiles)`);
      } catch (err) {
        this.msg(`Falha ao abrir OTBM: ${err instanceof Error ? err.message : err}`);
      }
    };
    input.click();
  }

  async saveOtbm() {
    this.map.waypoints = this.waypointMgr.getAll();
    const bytes = await serializeOtbm(this.map);
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "map.otbm";
    a.click();
    URL.revokeObjectURL(a.href);
    this.msg("OTBM exportado (assinatura: Saved with YATME).");
  }

  async applyToGame() {
    this.map.waypoints = this.waypointMgr.getAll();
    const bytes = await serializeOtbm(this.map);
    const urls = ["/api/map", "/api/ws?otpMap=1"];
    let last = "Falha ao aplicar mapa";
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/octet-stream", "x-map-filename": "world.otbm" },
          body: bytes,
        });
        const text = await res.text();
        if (res.ok) {
          this.msg("Mapa aplicado — entre no jogo (ou reentre) para ver o mundo idêntico.");
          return;
        }
        last = `Falha ao aplicar mapa (${res.status}): ${text.slice(0, 180)}`;
      } catch (err) {
        last = `Falha de rede ao aplicar: ${err instanceof Error ? err.message : err}`;
      }
    }
    this.msg(last);
  }

  doUndo() {
    if (!this.undo.length) return;
    this.redo.push(cloneOtbmMap(this.map));
    this.applyMap(this.undo.pop()!);
    this.msg("Desfeito.");
  }

  doRedo() {
    if (!this.redo.length) return;
    this.undo.push(cloneOtbmMap(this.map));
    this.applyMap(this.redo.pop()!);
    this.msg("Refeito.");
  }

  promptGoto() {
    const raw = prompt("Posição (x, y, z) ou {x=…, y=…, z=…}", `${Math.floor(this.panX / TILE_SIZE)}, ${Math.floor(this.panY / TILE_SIZE)}, ${this.floor}`);
    const pos = raw ? parsePositionString(raw) : null;
    if (!pos) return;
    this.centerOn(Number(pos.x), Number(pos.y));
    this.setFloor(Number(pos.z));
  }

  editTowns() {
    const scrim = document.createElement("div");
    scrim.className = "modal-scrim";
    let towns = this.map.towns.map((t) => ({ ...t }));
    let sel = towns[0]?.id ?? null;
    const render = () => {
      scrim.innerHTML = `
        <div class="modal">
          <h2>Cidades / templos (YATME)</h2>
          <div class="list" id="town-list"></div>
          <div id="town-detail"></div>
          <div class="row">
            <button type="button" id="t-add">Adicionar</button>
            <button type="button" id="t-rm">Remover</button>
            <button type="button" id="t-goto">Ir ao templo</button>
            <button type="button" id="t-ok">Aplicar</button>
            <button type="button" id="t-cancel">Cancelar</button>
          </div>
        </div>`;
      const list = scrim.querySelector("#town-list")!;
      for (const t of towns) {
        const b = document.createElement("button");
        b.textContent = `${t.name} (#${t.id})`;
        if (t.id === sel) b.classList.add("selected");
        b.onclick = () => {
          sel = t.id;
          render();
        };
        list.appendChild(b);
      }
      const cur = towns.find((t) => t.id === sel);
      const det = scrim.querySelector("#town-detail")!;
      if (cur) {
        det.innerHTML = `
          <label>Nome <input id="tn" value="${cur.name}" /></label>
          <label>Templo X <input id="tx" type="number" value="${cur.templeX}" /></label>
          <label>Templo Y <input id="ty" type="number" value="${cur.templeY}" /></label>
          <label>Templo Z <input id="tz" type="number" value="${cur.templeZ}" /></label>`;
        (det.querySelector("#tn") as HTMLInputElement).oninput = (e) => {
          cur.name = (e.target as HTMLInputElement).value;
        };
        (det.querySelector("#tx") as HTMLInputElement).oninput = (e) => {
          cur.templeX = Number((e.target as HTMLInputElement).value);
        };
        (det.querySelector("#ty") as HTMLInputElement).oninput = (e) => {
          cur.templeY = Number((e.target as HTMLInputElement).value);
        };
        (det.querySelector("#tz") as HTMLInputElement).oninput = (e) => {
          cur.templeZ = Number((e.target as HTMLInputElement).value);
        };
      }
      scrim.querySelector("#t-add")!.addEventListener("click", () => {
        const id = towns.reduce((m, t) => Math.max(m, t.id), 0) + 1;
        towns.push({ id, name: "Cidade", templeX: 0, templeY: 0, templeZ: 7 });
        sel = id;
        render();
      });
      scrim.querySelector("#t-rm")!.addEventListener("click", () => {
        towns = towns.filter((t) => t.id !== sel);
        sel = towns[0]?.id ?? null;
        render();
      });
      scrim.querySelector("#t-goto")!.addEventListener("click", () => {
        if (!cur) return;
        this.centerOn(cur.templeX, cur.templeY);
        this.setFloor(cur.templeZ);
      });
      scrim.querySelector("#t-ok")!.addEventListener("click", () => {
        this.pushUndo();
        this.map.towns = towns;
        this.applyMap(this.map);
        scrim.remove();
      });
      scrim.querySelector("#t-cancel")!.addEventListener("click", () => scrim.remove());
    };
    render();
    document.body.appendChild(scrim);
  }

  editWaypoints() {
    const scrim = document.createElement("div");
    scrim.className = "modal-scrim";
    const mgr = new WaypointManager(this.waypointMgr.getAll());
    let sel: string | null = mgr.getAll()[0]?.name ?? null;
    const render = () => {
      scrim.innerHTML = `
        <div class="modal">
          <h2>Waypoints</h2>
          <div class="list" id="wp-list"></div>
          <div id="wp-detail"></div>
          <div class="row">
            <button type="button" id="w-add">Adicionar</button>
            <button type="button" id="w-rm">Remover</button>
            <button type="button" id="w-goto">Ir</button>
            <button type="button" id="w-ok">Aplicar</button>
            <button type="button" id="w-cancel">Cancelar</button>
          </div>
        </div>`;
      const list = scrim.querySelector("#wp-list")!;
      for (const wp of mgr.getAll()) {
        const b = document.createElement("button");
        b.textContent = `${wp.name} (${wp.x}, ${wp.y}, ${wp.z})`;
        if (wp.name === sel) b.classList.add("selected");
        b.onclick = () => {
          sel = wp.name;
          render();
        };
        list.appendChild(b);
      }
      const cur = sel ? mgr.getByName(sel) : null;
      const det = scrim.querySelector("#wp-detail")!;
      if (cur) {
        det.innerHTML = `
          <label>Nome <input id="wn" value="${cur.name}" /></label>
          <label>X <input id="wx" type="number" value="${cur.x}" /></label>
          <label>Y <input id="wy" type="number" value="${cur.y}" /></label>
          <label>Z <input id="wz" type="number" value="${cur.z}" /></label>`;
        (det.querySelector("#wn") as HTMLInputElement).oninput = (e) => {
          try {
            mgr.rename(cur.name, (e.target as HTMLInputElement).value);
            sel = (e.target as HTMLInputElement).value;
          } catch {
            /* ignore dup */
          }
        };
        (det.querySelector("#wx") as HTMLInputElement).oninput = (e) => {
          try {
            mgr.move(cur.name, Number((e.target as HTMLInputElement).value), cur.y, cur.z);
          } catch {
            /* */
          }
        };
        (det.querySelector("#wy") as HTMLInputElement).oninput = (e) => {
          try {
            mgr.move(cur.name, cur.x, Number((e.target as HTMLInputElement).value), cur.z);
          } catch {
            /* */
          }
        };
        (det.querySelector("#wz") as HTMLInputElement).oninput = (e) => {
          try {
            mgr.move(cur.name, cur.x, cur.y, Number((e.target as HTMLInputElement).value));
          } catch {
            /* */
          }
        };
      }
      scrim.querySelector("#w-add")!.addEventListener("click", () => {
        const name = mgr.generateUniqueName();
        mgr.add({ name, x: 0, y: 0, z: this.floor });
        sel = name;
        render();
      });
      scrim.querySelector("#w-rm")!.addEventListener("click", () => {
        if (sel) mgr.remove(sel);
        sel = mgr.getAll()[0]?.name ?? null;
        render();
      });
      scrim.querySelector("#w-goto")!.addEventListener("click", () => {
        if (!cur) return;
        this.centerOn(cur.x, cur.y);
        this.setFloor(cur.z);
      });
      scrim.querySelector("#w-ok")!.addEventListener("click", () => {
        this.pushUndo();
        this.waypointMgr = mgr;
        this.map.waypoints = mgr.getAll();
        this.applyMap(this.map);
        scrim.remove();
      });
      scrim.querySelector("#w-cancel")!.addEventListener("click", () => scrim.remove());
    };
    render();
    document.body.appendChild(scrim);
  }

  importPng() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const id = CUSTOM_ID_START + this.customSprites.size;
      const img = new Image();
      img.src = URL.createObjectURL(f);
      await img.decode();
      const c = document.createElement("canvas");
      c.width = TILE_SIZE;
      c.height = TILE_SIZE;
      c.getContext("2d")!.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE);
      this.customSprites.set(id, c);
      rememberPreview(id, c);
      this.paletteIds.push(id);
      this.selectedId = id;
      this.refreshPalette();
      this.msg(`PNG adicionado à paleta (#${id}).`);
    };
    input.click();
  }

  refreshPalette() {
    renderPalette({
      ids: this.paletteIds,
      selectedId: this.selectedId,
      catalog: this.catalog,
      customSprites: this.customSprites,
      filter: this.paletteFilter,
      tab: this.paletteTab,
      onPick: (id) => {
        this.selectedId = id;
        this.stamp = "item";
        if (isMetaStamp(this.tool)) this.setTool("brush");
        else this.highlightTools();
        this.refreshPalette();
      },
    });
  }

  centerOn(tx: number, ty: number) {
    this.panX = tx * TILE_SIZE + TILE_SIZE / 2;
    this.panY = ty * TILE_SIZE + TILE_SIZE / 2;
    this.draw();
  }

  bindKeys() {
    window.addEventListener("keydown", (e) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        this.spacePan = true;
        this.canvas.style.cursor = "grab";
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) this.doRedo();
        else this.doUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        this.doRedo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void this.saveOtbm();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        this.openOtbm();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (this.selection) {
          e.preventDefault();
          this.eraseSelection();
        }
      }
      if (e.key === "Escape") {
        this.selection = null;
        this.draw();
      }
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === "b" || e.key === "B") this.setTool("brush");
        if (e.key === "e" || e.key === "E") this.setTool("erase");
        if (e.key === "f" || e.key === "F") this.setTool("fill");
        if (e.key === "r" || e.key === "R") this.setTool("rect");
        if (e.key === "m" || e.key === "M") this.setTool("select");
        if (e.key === "h" || e.key === "H") this.setTool("house");
        if (e.key === "s" || e.key === "S") this.setTool("protection");
        if (e.key === "p" || e.key === "P") this.setTool("pvp");
        if (e.key === "n" || e.key === "N") this.setTool("nopvp");
        if (e.key === "g" || e.key === "G") this.toggleGrid();
        if (e.key === "+" || e.key === "=") this.setZoom(this.zoom * 1.1);
        if (e.key === "-" || e.key === "_") this.setZoom(this.zoom * 0.9);
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.spacePan = false;
        this.canvas.style.cursor = this.tool === "pan" ? "grab" : "crosshair";
      }
    });
  }

  setZoom(z: number) {
    this.zoom = Math.max(0.25, Math.min(4, z));
    document.getElementById("st-zoom")!.textContent = `ZOOM ${this.zoom.toFixed(2)}x`;
    this.draw();
    this.updateMinimap();
  }

  bindCanvas() {
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("mousedown", (e) => {
      if (this.tool === "pan" || this.spacePan || e.button === 1 || (e.button === 2 && this.tool !== "house" && this.tool !== "pvp" && this.tool !== "nopvp" && this.tool !== "protection" && this.tool !== "spawn")) {
        this.panning = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.canvas.style.cursor = "grabbing";
        return;
      }
      const t = screenToTile(this.canvas, e.clientX, e.clientY, this.zoom, this.panX, this.panY);
      if (this.tool === "select" || this.tool === "rect") {
        this.selecting = true;
        this.recting = this.tool === "rect";
        this.selection = { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
        this.draw();
        return;
      }
      this.strokeUndo = false;
      this.painting = true;
      this.paintAt(e.clientX, e.clientY, e.altKey || e.button === 2);
    });
    window.addEventListener("mousemove", (e) => {
      const t = screenToTile(this.canvas, e.clientX, e.clientY, this.zoom, this.panX, this.panY);
      this.posEl.textContent = `POS ${t.x}, ${t.y}, ${this.floor}`;
      const hint = tileOverlayHint(this.map.tiles.get(tileKey(t.x, t.y, this.floor)));
      if (hint) this.posEl.textContent += ` · ${hint}`;
      if (this.panning) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.panX -= dx / this.zoom;
        this.panY -= dy / this.zoom;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.draw();
        this.updateMinimap();
        return;
      }
      if (this.selecting && this.selection) {
        this.selection = { ...this.selection, x1: t.x, y1: t.y };
        this.draw();
        return;
      }
      if (this.painting) this.paintAt(e.clientX, e.clientY, e.altKey || e.buttons === 2);
    });
    window.addEventListener("mouseup", () => {
      if (this.recting && this.selection) {
        this.strokeUndo = false;
        this.fillSelection(true);
        this.recting = false;
        this.selection = null;
      }
      this.painting = false;
      this.panning = false;
      this.selecting = false;
      this.canvas.style.cursor = this.tool === "pan" || this.spacePan ? "grab" : this.tool === "select" || this.tool === "rect" ? "cell" : "crosshair";
    });
    this.minimap.addEventListener("click", (e) => {
      const rect = this.minimap.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * this.runtime.w);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * this.runtime.h);
      this.centerOn(x, y);
    });
  }

  eraseSelection(recordUndo = true) {
    if (!this.selection) return;
    if (recordUndo) this.pushUndo();
    const meta = this.effectiveMeta();
    forEachRectTile(this.selection, this.runtime.w, this.runtime.h, (x, y) => {
      if (meta) this.paintMetaAt(x, y, true, meta);
      else this.setTileItems(x, y, []);
    });
    this.draw();
    this.updateMinimap();
    this.setStatus();
    this.msg(meta ? "Zona/casa apagada na seleção." : "Seleção apagada.");
  }

  fillSelection(recordUndo = true) {
    if (!this.selection) return;
    if (recordUndo) this.pushUndo();
    const meta = this.effectiveMeta();
    forEachRectTile(this.selection, this.runtime.w, this.runtime.h, (x, y) => {
      if (meta) this.paintMetaAt(x, y, false, meta);
      else this.setTileItems(x, y, [this.selectedId]);
    });
    this.draw();
    this.updateMinimap();
    this.setStatus();
    this.msg(meta ? `Área ${meta === "protection" ? "SAFE" : meta}.` : "Seleção preenchida.");
  }

  paintMetaAt(x: number, y: number, clear: boolean, kind: MetaStamp | null = this.effectiveMeta()) {
    if (!kind) return;
    const t = this.ensureTile(x, y);
    if (kind === "house") {
      applyHouseToTile(t, clear ? null : this.currentHouseId());
      this.msg(clear ? "House removida." : `HOUSETILE house ${this.currentHouseId()}`);
    } else if (kind === "spawn") {
      if (clear) {
        delete t.spawnMonster;
        t.zones = t.zones?.filter((id) => id !== ZONE_SPAWN);
        if (!t.zones?.length) delete t.zones;
      } else applyZoneToTile(t, "spawn");
    } else {
      applyZoneToTile(t, clear ? null : kind);
      const label = kind === "protection" ? "SAFE" : kind === "nopvp" ? "non-PVP" : "PVP";
      this.msg(clear ? `${label} removida.` : `${label} (OTBM flag)`);
    }
    this.pruneTile(t);
    this.syncRuntime(x, y);
  }

  paintAt(clientX: number, clientY: number, clear = false) {
    const { x, y } = screenToTile(this.canvas, clientX, clientY, this.zoom, this.panX, this.panY);
    if (x < 0 || y < 0 || x >= this.runtime.w || y >= this.runtime.h) return;
    if (!this.strokeUndo && this.tool !== "pan") {
      this.pushUndo();
      this.strokeUndo = true;
    }
    if (this.tool === "waypoint") {
      const name = this.waypointMgr.generateUniqueName();
      try {
        this.waypointMgr.add({ name, x, y, z: this.floor });
      } catch {
        /* position taken */
      }
      this.map.waypoints = this.waypointMgr.getAll();
      this.draw();
      return;
    }
    if (this.tool === "town") {
      if (!this.map.towns.length) {
        this.map.towns.push({ id: 1, name: "Spawn", templeX: x, templeY: y, templeZ: this.floor });
      } else {
        this.map.towns[0].templeX = x;
        this.map.towns[0].templeY = y;
        this.map.towns[0].templeZ = this.floor;
      }
      this.runtime.spawn = { x, y, z: this.floor };
      this.draw();
      return;
    }
    const meta = this.effectiveMeta();
    if (meta && this.tool !== "fill" && this.tool !== "erase" && this.tool !== "rect" && this.tool !== "select") {
      if (this.selection) {
        forEachRectTile(this.selection, this.runtime.w, this.runtime.h, (tx, ty) => this.paintMetaAt(tx, ty, clear, meta));
        this.painting = false;
      } else this.paintMetaAt(x, y, clear, meta);
      this.draw();
      this.updateMinimap();
      this.setStatus();
      return;
    }
    if (this.tool === "fill") {
      if (this.selection) this.fillSelection(false);
      else {
        floodFill(this.map, x, y, this.floor, this.runtime.w, this.runtime.h, (tx, ty) => {
          if (meta) this.paintMetaAt(tx, ty, clear, meta);
          else this.setTileItems(tx, ty, [this.selectedId]);
        });
        this.draw();
        this.updateMinimap();
        this.setStatus();
      }
      this.painting = false;
      return;
    }
    if (this.tool === "brush") {
      if (this.selection) {
        this.fillSelection(false);
        this.painting = false;
        return;
      }
      if (meta) this.paintMetaAt(x, y, clear, meta);
      else this.setTileItems(x, y, [this.selectedId]);
    } else if (this.tool === "erase") {
      if (this.selection) {
        this.eraseSelection(false);
        this.painting = false;
        return;
      }
      if (meta) this.paintMetaAt(x, y, true, meta);
      else this.setTileItems(x, y, []);
    }
    this.draw();
    this.updateMinimap();
    this.setStatus();
  }

  draw() {
    drawEditorMap({
      ctx: this.ctx,
      canvas: this.canvas,
      map: this.map,
      runtime: this.runtime,
      floor: this.floor,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      catalog: this.catalog,
      customSprites: this.customSprites,
      selection: this.selection,
      showGrid: this.showGrid,
      showZones: this.showZones,
      showHouses: this.showHouses,
    });
  }

  updateMinimap() {
    const viewW = this.canvas.width / this.zoom / TILE_SIZE;
    const viewH = this.canvas.height / this.zoom / TILE_SIZE;
    drawMinimap(this.mmCtx, this.runtime, {
      x: this.panX / TILE_SIZE - viewW / 2,
      y: this.panY / TILE_SIZE - viewH / 2,
      w: viewW,
      h: viewH,
    });
  }

  setStatus() {
    document.getElementById("st-tiles")!.textContent = `TILES ${this.map.tiles.size.toLocaleString("en-US")}`;
  }

  resize() {
    const wrap = this.canvas.parentElement!;
    this.canvas.width = wrap.clientWidth;
    this.canvas.height = wrap.clientHeight;
    this.draw();
    this.updateMinimap();
  }

  async loadFromServer() {
    const urls = ["/api/map", "/api/ws?otpMap=1"];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        if (!buf.byteLength) continue;
        this.applyMap(parseOtbm(new Uint8Array(buf)));
        this.msg("Mapa atual do jogo carregado.");
        return;
      } catch {
        /* try next */
      }
    }
    this.msg("Editor offline do /api/map — pintando localmente.");
  }
}

const app = new EditorApp(document.getElementById("app")!);
app.refreshPalette();
app.loadFromServer();
