import "./editor.css";
import { parseOtbm, serializeOtbm, createEmptyMap, tileKey, type OtbmMap, type OtbmTown, type OtbmWaypoint } from "../../../shared/editor/otbm.ts";
import { WaypointManager } from "../../../shared/editor/WaypointManager.ts";
import { parsePositionString } from "../../../shared/editor/position.ts";
import {
  loadClassicClient,
  itemPreviewCanvas,
  BUILTIN_TILE_IDS,
  CUSTOM_ID_START,
  type ClassicCatalog,
} from "../../../shared/editor/classicClient.ts";
import { otbmMapToRuntime, runtimeToOtbm, setRuntimeCell, type RuntimeMap } from "../../../shared/editor/mapRuntime.ts";

type Tool = "brush" | "erase" | "pan" | "waypoint" | "town";

const TILE = 32;

class EditorApp {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  minimap: HTMLCanvasElement;
  mmCtx: CanvasRenderingContext2D;
  catalog: ClassicCatalog | null = null;
  customSprites = new Map<number, HTMLCanvasElement>();
  paletteIds: number[] = Object.values(BUILTIN_TILE_IDS);
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
  strokeUndo = false;
  lastX = 0;
  lastY = 0;
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
    this.newMap(32, 23, 7);
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  cloneMap(m: OtbmMap): OtbmMap {
    return {
      ...m,
      tiles: new Map(m.tiles),
      towns: m.towns.map((t) => ({ ...t })),
      waypoints: m.waypoints.map((w) => ({ ...w })),
      rawDescriptions: [...m.rawDescriptions],
    };
  }

  pushUndo() {
    this.undo.push(this.cloneMap(this.map));
    if (this.undo.length > 40) this.undo.shift();
    this.redo = [];
  }

  applyMap(m: OtbmMap) {
    this.map = m;
    this.waypointMgr = new WaypointManager(m.waypoints);
    this.runtime = otbmMapToRuntime(m, this.catalog ?? undefined);
    this.draw();
    this.updateMinimap();
    this.setStatus();
  }

  tileItems(x: number, y: number): number[] {
    const key = tileKey(x, y, this.floor);
    const t = this.map.tiles.get(key);
    return t?.items.map((i) => i.id) ?? [];
  }

  setTileItems(x: number, y: number, items: number[]) {
    const key = tileKey(x, y, this.floor);
    if (!items.length) {
      this.map.tiles.delete(key);
    } else {
      this.map.tiles.set(key, {
        x,
        y,
        z: this.floor,
        flags: 0,
        items: items.map((id) => ({ id })),
      });
    }
    setRuntimeCell(this.runtime, x, y, items.length ? items : [BUILTIN_TILE_IDS.grass]);
  }

  buildUi() {
    this.root.innerHTML = `
      <header class="editor-top">
        <div class="menu-group">
          <button data-act="new">Novo</button>
          <button data-act="open">Abrir OTBM</button>
          <button data-act="save">Salvar OTBM</button>
          <button data-act="apply">Aplicar no jogo</button>
        </div>
        <div class="menu-group">
          <button data-tool="brush" class="active">Brush</button>
          <button data-tool="erase">Apagar</button>
          <button data-tool="pan">Pan</button>
          <button data-tool="waypoint">Waypoint</button>
          <button data-tool="town">Templo</button>
        </div>
        <div class="menu-group">
          <button data-act="undo">Desfazer</button>
          <button data-act="redo">Refazer</button>
          <button data-act="goto">Ir para…</button>
          <button data-act="towns">Cidades</button>
          <button data-act="wps">Waypoints</button>
        </div>
        <div class="menu-group">
          <label>Tibia.dat <input type="file" id="file-dat" accept=".dat" hidden /></label>
          <button data-act="pick-dat">DAT</button>
          <label>Tibia.spr <input type="file" id="file-spr" accept=".spr" hidden /></label>
          <button data-act="pick-spr">SPR</button>
          <label>items.xml <input type="file" id="file-xml" accept=".xml" hidden /></label>
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
          <p class="muted" style="font-size:12px;color:var(--muted)">Scroll = zoom · Botão do meio / Pan = mover · Waypoint/Templo: clique no mapa</p>
        </aside>
      </div>
      <footer class="editor-status">
        <span id="st-pos">POS: —</span>
        <span id="st-zoom">ZOOM: 1.00x</span>
        <span id="st-tiles">TILES: 0</span>
        <span id="st-msg"></span>
      </footer>
    `;
    this.statusEl = document.getElementById("st-msg")!;
    this.posEl = document.getElementById("st-pos")!;

    this.root.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.tool = (btn as HTMLElement).dataset.tool as Tool;
        this.root.querySelectorAll("[data-tool]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    const acts: Record<string, () => void> = {
      new: () => this.promptNewMap(),
      open: () => this.openOtbm(),
      save: () => this.saveOtbm(),
      apply: () => this.applyToGame(),
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
      this.paletteIds = [...new Set([...Object.values(BUILTIN_TILE_IDS), ...fromCat])];
      this.renderPalette();
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
      this.renderPalette((e.target as HTMLInputElement).value);
    });

    document.getElementById("floor-up")!.addEventListener("click", () => this.setFloor(this.floor + 1));
    document.getElementById("floor-down")!.addEventListener("click", () => this.setFloor(this.floor - 1));
  }

  msg(t: string) {
    this.statusEl.textContent = t;
  }

  setFloor(z: number) {
    this.floor = Math.max(0, Math.min(15, z));
    document.getElementById("floor-label")!.textContent = String(this.floor);
    this.draw();
  }

  newMap(w: number, h: number, z: number) {
    this.pushUndo();
    const m = createEmptyMap();
    m.width = w;
    m.height = h;
    m.tiles.clear();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const key = tileKey(x, y, z);
        m.tiles.set(key, {
          x,
          y,
          z,
          flags: 0,
          items: [{ id: BUILTIN_TILE_IDS.grass }],
        });
      }
    }
    m.towns = [
      { id: 1, name: "Spawn", templeX: Math.floor(w / 2), templeY: Math.floor(h / 2), templeZ: z },
    ];
    m.waypoints = [];
    this.floor = z;
    this.setFloor(z);
    this.applyMap(m);
  }

  promptNewMap() {
    const w = Number(prompt("Largura (sqm)", "32") || "32");
    const h = Number(prompt("Altura (sqm)", "23") || "23");
    const z = Number(prompt("Andar Z", "7") || "7");
    this.newMap(w, h, z);
  }

  async openOtbm() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".otbm";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      this.pushUndo();
      const m = parseOtbm(new Uint8Array(await f.arrayBuffer()));
      this.applyMap(m);
      this.msg(`Mapa aberto: ${f.name}`);
    };
    input.click();
  }

  async saveOtbm() {
    this.map.towns = this.map.towns ?? [];
    this.map.waypoints = this.waypointMgr.getAll();
    const bytes = await serializeOtbm(this.map);
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "map.otbm";
    a.click();
    this.msg("OTBM exportado.");
  }

  async applyToGame() {
    this.map.waypoints = this.waypointMgr.getAll();
    const bytes = await serializeOtbm(this.map);
    const res = await fetch("/api/map", {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-map-filename": "world.otbm" },
      body: bytes,
    });
    if (!res.ok) {
      this.msg("Falha ao aplicar mapa no servidor.");
      return;
    }
    this.msg("Mapa aplicado — entre no jogo para ver.");
  }

  doUndo() {
    if (!this.undo.length) return;
    this.redo.push(this.cloneMap(this.map));
    this.applyMap(this.undo.pop()!);
  }

  doRedo() {
    if (!this.redo.length) return;
    this.undo.push(this.cloneMap(this.map));
    this.applyMap(this.redo.pop()!);
  }

  promptGoto() {
    const raw = prompt("Posição (x, y, z) ou {x=…, y=…, z=…}", `${this.panX}, ${this.panY}, ${this.floor}`);
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
      c.width = TILE;
      c.height = TILE;
      const cx = c.getContext("2d")!;
      cx.drawImage(img, 0, 0, TILE, TILE);
      this.customSprites.set(id, c);
      this.paletteIds.push(id);
      this.selectedId = id;
      this.renderPalette();
      this.msg(`PNG adicionado à paleta (#${id}).`);
    };
    input.click();
  }

  previewFor(id: number): HTMLCanvasElement | null {
    if (this.customSprites.has(id)) return this.customSprites.get(id)!;
    if (this.catalog) {
      const c = itemPreviewCanvas(this.catalog, id);
      if (c) return c;
    }
    const builtin = Object.entries(BUILTIN_TILE_IDS).find(([, v]) => v === id)?.[0];
    if (builtin) {
      const c = document.createElement("canvas");
      c.width = TILE;
      c.height = TILE;
      const ctx = c.getContext("2d")!;
      const img = new Image();
      img.src = `/assets/tiles/${builtin === "wood" ? "wood" : builtin}.png`;
      img.onload = () => {
        ctx.drawImage(img, 0, 0, TILE, TILE);
        this.draw();
      };
      return c;
    }
    return null;
  }

  renderPalette(filter = "") {
    const grid = document.getElementById("palette")!;
    grid.innerHTML = "";
    const q = filter.toLowerCase();
    const ids = this.paletteIds.filter((id) => {
      if (!q) return true;
      const name = this.catalog?.items.get(id)?.name ?? String(id);
      return String(id).includes(q) || name.toLowerCase().includes(q);
    });
    document.getElementById("brush-count")!.textContent = String(ids.length);
    for (const id of ids) {
      const div = document.createElement("div");
      div.className = "palette-item" + (id === this.selectedId ? " selected" : "");
      const cv = this.previewFor(id) ?? document.createElement("canvas");
      cv.width = TILE;
      cv.height = TILE;
      div.appendChild(cv);
      const label = this.catalog?.items.get(id)?.name ?? `#${id}`;
      div.innerHTML += `<span>${label}</span>`;
      div.onclick = () => {
        this.selectedId = id;
        this.renderPalette(filter);
      };
      grid.appendChild(div);
    }
  }

  centerOn(tx: number, ty: number) {
    this.panX = tx * TILE;
    this.panY = ty * TILE;
    this.draw();
  }

  screenToTile(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) * (this.canvas.width / rect.width);
    const sy = (clientY - rect.top) * (this.canvas.height / rect.height);
    const wx = (sx - this.canvas.width / 2) / this.zoom + this.panX;
    const wy = (sy - this.canvas.height / 2) / this.zoom + this.panY;
    return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE), sx, sy };
  }

  bindCanvas() {
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoom = Math.max(0.25, Math.min(4, this.zoom * f));
      document.getElementById("st-zoom")!.textContent = `ZOOM: ${this.zoom.toFixed(2)}x`;
      this.draw();
    });
    this.canvas.addEventListener("mousedown", (e) => {
      if (this.tool === "pan" || e.button === 1) {
        this.panning = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        return;
      }
      this.strokeUndo = false;
      this.painting = true;
      this.paintAt(e.clientX, e.clientY);
    });
    window.addEventListener("mousemove", (e) => {
      const t = this.screenToTile(e.clientX, e.clientY);
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
      if (this.painting) this.paintAt(e.clientX, e.clientY);
    });
    window.addEventListener("mouseup", () => {
      this.painting = false;
      this.panning = false;
    });
  }

  paintAt(clientX: number, clientY: number) {
    const { x, y } = this.screenToTile(clientX, clientY);
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
    if (this.tool === "brush") {
      this.setTileItems(x, y, [this.selectedId]);
    } else if (this.tool === "erase") {
      this.setTileItems(x, y, []);
    }
    this.draw();
    this.updateMinimap();
    this.setStatus();
  }

  draw() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.fillStyle = "#0a0c10";
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.save();
    this.ctx.translate(w / 2, h / 2);
    this.ctx.scale(this.zoom, this.zoom);
    this.ctx.translate(-this.panX, -this.panY);

    for (let y = 0; y < this.runtime.h; y++) {
      for (let x = 0; x < this.runtime.w; x++) {
        const items = this.tileItems(x, y);
        const top = items[items.length - 1] ?? BUILTIN_TILE_IDS.grass;
        const cv = this.previewFor(top);
        const px = x * TILE;
        const py = y * TILE;
        if (cv) this.ctx.drawImage(cv, px, py);
        else {
          this.ctx.fillStyle = "#2d5a27";
          this.ctx.fillRect(px, py, TILE, TILE);
        }
        this.ctx.strokeStyle = "rgba(255,255,255,0.04)";
        this.ctx.strokeRect(px, py, TILE, TILE);
      }
    }

    for (const wp of this.waypointMgr.getByFloor(this.floor)) {
      this.ctx.fillStyle = "#ffcc00";
      this.ctx.fillRect(wp.x * TILE + 12, wp.y * TILE + 12, 8, 8);
    }
    for (const town of this.map.towns) {
      if (town.templeZ !== this.floor) continue;
      this.ctx.strokeStyle = "#3d8bfd";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(town.templeX * TILE, town.templeY * TILE, TILE, TILE);
    }

    this.ctx.restore();
  }

  updateMinimap() {
    const mw = this.minimap.width;
    const mh = this.minimap.height;
    this.mmCtx.fillStyle = "#111";
    this.mmCtx.fillRect(0, 0, mw, mh);
    const sx = mw / this.runtime.w;
    const sy = mh / this.runtime.h;
    for (let y = 0; y < this.runtime.h; y++) {
      for (let x = 0; x < this.runtime.w; x++) {
        const g = this.runtime.ground[y][x];
        this.mmCtx.fillStyle = ["#2d5a27", "#8b7355", "#888", "#6b4423", "#2266aa", "#444"][g] || "#2d5a27";
        this.mmCtx.fillRect(x * sx, y * sy, Math.max(1, sx), Math.max(1, sy));
      }
    }
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
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      this.applyMap(parseOtbm(new Uint8Array(buf)));
      this.msg("Mapa atual do jogo carregado.");
    } catch {
      /* offline */
    }
  }
}

const app = new EditorApp(document.getElementById("app")!);
app.renderPalette();
app.loadFromServer();
