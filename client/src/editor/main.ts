import "./editor.css";
import {
  parseOtbm,
  serializeOtbm,
  createEmptyMap,
  tileKey,
  cloneOtbmMap,
  type OtbmMap,
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
} from "../../../shared/editor/tileCatalog.ts";
import { floodFill, forEachRectTile, type Rect } from "../../../shared/editor/brushes.ts";
import { loadBuiltinPreviews, previewForId, rememberPreview } from "./previews.ts";
import { drawEditorMap, drawMinimap, screenToTile } from "./renderer.ts";
import { renderPalette } from "./palette.ts";

type Tool = "brush" | "erase" | "fill" | "select" | "pan" | "waypoint" | "town";

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
  paletteFilter = "";
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

  tileItems(x: number, y: number): number[] {
    const t = this.map.tiles.get(tileKey(x, y, this.floor));
    return t?.items.map((i) => i.id) ?? [];
  }

  setTileItems(x: number, y: number, items: number[]) {
    const key = tileKey(x, y, this.floor);
    if (!items.length) this.map.tiles.delete(key);
    else {
      this.map.tiles.set(key, {
        x,
        y,
        z: this.floor,
        flags: 0,
        items: items.map((id) => ({ id })),
      });
    }
    if (this.floor === this.runtime.z) {
      setRuntimeCell(this.runtime, x, y, items.length ? items : [BUILTIN_TILE_IDS.grass], this.catalog ?? undefined);
    }
  }

  buildUi() {
    this.root.innerHTML = `
      <header class="editor-top">
        <div class="menu-group">
          <button data-act="new" title="Novo mapa">Novo</button>
          <button data-act="open" title="Abrir .otbm (RME / YATME)">Abrir OTBM</button>
          <button data-act="save" title="Baixar .otbm">Salvar OTBM</button>
          <button data-act="apply" title="POST /api/map → world.otbm">Aplicar no jogo</button>
        </div>
        <div class="menu-group">
          <button data-tool="brush" class="active" title="Pincel (B)">Brush</button>
          <button data-tool="erase" title="Apagar (E)">Apagar</button>
          <button data-tool="fill" title="Preencher (F)">Preencher</button>
          <button data-tool="select" title="Selecionar (M)">Selecionar</button>
          <button data-tool="pan" title="Mover (H / espaço)">Pan</button>
          <button data-tool="waypoint">Waypoint</button>
          <button data-tool="town">Templo</button>
        </div>
        <div class="menu-group">
          <button data-act="undo" title="Ctrl+Z">Desfazer</button>
          <button data-act="redo" title="Ctrl+Y">Refazer</button>
          <button data-act="goto">Ir para…</button>
          <button data-act="towns">Cidades</button>
          <button data-act="wps">Waypoints</button>
        </div>
        <div class="menu-group">
          <input type="file" id="file-dat" accept=".dat" hidden />
          <button data-act="pick-dat">DAT</button>
          <input type="file" id="file-spr" accept=".spr" hidden />
          <button data-act="pick-spr">SPR</button>
          <input type="file" id="file-xml" accept=".xml" hidden />
          <button data-act="pick-xml">XML</button>
          <button data-act="png">+ PNG</button>
        </div>
        <a href="/" style="color:var(--accent);margin-left:auto;text-decoration:none">← Jogo</a>
      </header>
      <div class="editor-body">
        <aside class="palette">
          <header>Brushes <span id="brush-count"></span></header>
          <input class="search" id="palette-search" placeholder="Buscar id ou nome…" />
          <div class="palette-grid" id="palette"></div>
        </aside>
        <div class="canvas-wrap"><canvas id="map-canvas"></canvas></div>
        <aside class="sidebar">
          <h3>Andar (Z)</h3>
          <div class="floor-controls">
            <button id="floor-down">▼</button>
            <strong id="floor-label">7</strong>
            <button id="floor-up">▲</button>
          </div>
          <h3>Minimapa</h3>
          <div class="minimap"><canvas id="minimap" width="200" height="120"></canvas></div>
          <p class="muted" style="font-size:12px;color:var(--muted)">
            Scroll = zoom · Espaço/meio = pan · Preencher = flood fill · Selecionar + Delete = apagar retângulo · Ctrl+S salva OTBM
          </p>
        </aside>
      </div>
      <footer class="editor-status">
        <span id="st-pos">POS: —</span>
        <span id="st-zoom">ZOOM: 1.00x</span>
        <span id="st-tiles">TILES: 0</span>
        <span id="st-tool">FERRAMENTA: brush</span>
        <span id="st-msg"></span>
      </footer>
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
    };
    this.root.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => acts[(btn as HTMLElement).dataset.act!]?.());
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

    document.getElementById("floor-up")!.addEventListener("click", () => this.setFloor(this.floor + 1));
    document.getElementById("floor-down")!.addEventListener("click", () => this.setFloor(this.floor - 1));
  }

  setTool(tool: Tool) {
    this.tool = tool;
    this.root.querySelectorAll("[data-tool]").forEach((b) => b.classList.remove("active"));
    this.root.querySelector(`[data-tool="${tool}"]`)?.classList.add("active");
    const label = document.getElementById("st-tool");
    if (label) label.textContent = `FERRAMENTA: ${tool}`;
    this.canvas.style.cursor = tool === "pan" ? "grab" : tool === "select" ? "cell" : "crosshair";
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
    try {
      const res = await fetch("/api/map", {
        method: "POST",
        headers: { "content-type": "application/octet-stream", "x-map-filename": "world.otbm" },
        body: bytes,
      });
      const text = await res.text();
      if (!res.ok) {
        this.msg(`Falha ao aplicar mapa (${res.status}): ${text.slice(0, 180)}`);
        return;
      }
      this.msg("Mapa aplicado — entre no jogo (ou reentre) para ver o mundo idêntico.");
    } catch (err) {
      this.msg(`Falha de rede ao aplicar: ${err instanceof Error ? err.message : err}`);
    }
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
      onPick: (id) => {
        this.selectedId = id;
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
      if (tag === "INPUT" || tag === "TEXTAREA") return;
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
      if (e.key === "Escape") this.selection = null;
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === "b" || e.key === "B") this.setTool("brush");
        if (e.key === "e" || e.key === "E") this.setTool("erase");
        if (e.key === "f" || e.key === "F") this.setTool("fill");
        if (e.key === "m" || e.key === "M") this.setTool("select");
        if (e.key === "h" || e.key === "H") this.setTool("pan");
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
    document.getElementById("st-zoom")!.textContent = `ZOOM: ${this.zoom.toFixed(2)}x`;
    this.draw();
  }

  bindCanvas() {
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("mousedown", (e) => {
      if (this.tool === "pan" || this.spacePan || e.button === 1 || e.button === 2) {
        this.panning = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.canvas.style.cursor = "grabbing";
        return;
      }
      const t = screenToTile(this.canvas, e.clientX, e.clientY, this.zoom, this.panX, this.panY);
      if (this.tool === "select") {
        this.selecting = true;
        this.selection = { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
        this.draw();
        return;
      }
      this.strokeUndo = false;
      this.painting = true;
      this.paintAt(e.clientX, e.clientY);
    });
    window.addEventListener("mousemove", (e) => {
      const t = screenToTile(this.canvas, e.clientX, e.clientY, this.zoom, this.panX, this.panY);
      this.posEl.textContent = `POS: ${t.x}, ${t.y}, ${this.floor}`;
      if (this.panning) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.panX -= dx / this.zoom;
        this.panY -= dy / this.zoom;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.draw();
        return;
      }
      if (this.selecting && this.selection) {
        this.selection = { ...this.selection, x1: t.x, y1: t.y };
        this.draw();
        return;
      }
      if (this.painting) this.paintAt(e.clientX, e.clientY);
    });
    window.addEventListener("mouseup", () => {
      this.painting = false;
      this.panning = false;
      this.selecting = false;
      this.canvas.style.cursor = this.tool === "pan" || this.spacePan ? "grab" : this.tool === "select" ? "cell" : "crosshair";
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
    forEachRectTile(this.selection, this.runtime.w, this.runtime.h, (x, y) => this.setTileItems(x, y, []));
    this.draw();
    this.updateMinimap();
    this.setStatus();
    this.msg("Seleção apagada.");
  }

  fillSelection(recordUndo = true) {
    if (!this.selection) return;
    if (recordUndo) this.pushUndo();
    forEachRectTile(this.selection, this.runtime.w, this.runtime.h, (x, y) => this.setTileItems(x, y, [this.selectedId]));
    this.draw();
    this.updateMinimap();
    this.setStatus();
    this.msg("Seleção preenchida.");
  }

  paintAt(clientX: number, clientY: number) {
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
    if (this.tool === "fill") {
      if (this.selection) this.fillSelection(false);
      else {
        floodFill(this.map, x, y, this.floor, this.runtime.w, this.runtime.h, (tx, ty) => {
          this.setTileItems(tx, ty, [this.selectedId]);
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
      this.setTileItems(x, y, [this.selectedId]);
    } else if (this.tool === "erase") {
      if (this.selection) {
        this.eraseSelection(false);
        this.painting = false;
        return;
      }
      this.setTileItems(x, y, []);
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
    });
  }

  updateMinimap() {
    drawMinimap(this.mmCtx, this.runtime);
  }

  setStatus() {
    document.getElementById("st-tiles")!.textContent = `TILES: ${this.map.tiles.size}`;
  }

  resize() {
    const wrap = this.canvas.parentElement!;
    this.canvas.width = wrap.clientWidth;
    this.canvas.height = wrap.clientHeight;
    this.draw();
  }

  async loadFromServer() {
    try {
      const res = await fetch("/api/map");
      if (!res.ok) {
        this.msg(`Servidor sem OTBM ativo (${res.status}) — mapa novo local.`);
        return;
      }
      const buf = await res.arrayBuffer();
      if (!buf.byteLength) return;
      this.applyMap(parseOtbm(new Uint8Array(buf)));
      this.msg("Mapa atual do jogo carregado.");
    } catch {
      this.msg("Editor offline do /api/map — pintando localmente.");
    }
  }
}

const app = new EditorApp(document.getElementById("app")!);
app.refreshPalette();
app.loadFromServer();
