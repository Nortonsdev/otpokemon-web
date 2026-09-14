import { ITEM_BOX_IDS } from "../../../shared/itemBoxCaps.js";

const LEGACY_KEY = "otpokemon-hud-v4";
const POS_PREFIX = "poketibia.win.";
const POS_LAYOUT_VERSION = 2;
const POS_VERSION_KEY = "poketibia.win.layoutVersion";

/** Larguras fixas das janelas de inventário (CSS) — alinhar caixas à esquerda do Inventário. */
const INV_PANEL_W = 128;
const ITEM_BOX_W = 158;
const HUD_MARGIN = 6;
const HUD_GAP = 4;
const CHAT_DOCK_H = 118;

function itemBoxRight(slotIndex) {
  return HUD_MARGIN + INV_PANEL_W + HUD_GAP + slotIndex * (ITEM_BOX_W + HUD_GAP);
}

export const WINDOW_DEFS = [
  { id: "minimap", title: "Minimapa" },
  { id: "vip", title: "Lista VIP" },
  { id: "pokebar", title: "Lista de Pokemon", wrench: true, mini: true, icon: "party.png" },
  { id: "battle", title: "Batalha" },
  { id: "status", title: "Player Info", mini: true, icon: "modulemanager.png" },
  { id: "inv", title: "Inventário", mini: true },
  { id: "bag", title: "Bag", mini: true },
  { id: "coins", title: "Coins", mini: true },
  { id: "pokebag", title: "Pokebag", mini: true },
  { id: "catch", title: "Catch", mini: true },
  { id: "npc", title: "NPC", mini: true, icon: "shop_button.png" },
  { id: "chat", title: "Chat" },
];

const TOP_ICONS = [
  { id: "status", src: "/assets/ui/tibia/modulemanager.png", title: "Player Info" },
  { id: "pokebar", src: "/assets/ui/tibia/party.png", title: "Lista de Pokemon" },
  { id: "npc", src: "/assets/ui/tibia/shop_button.png", title: "Diálogo NPC" },
];

const DEFAULTS = {
  minimap: { x: 6, y: 28, open: true, locked: true, min: false },
  vip: { x: 6, y: 196, open: true, locked: true, min: false },
  pokebar: { x: 6, y: 198, open: true, locked: false, min: false },
  battle: { x: 6, y: 0, open: true, locked: true, min: false, bottom: 118 },
  status: { x: 0, y: 28, open: true, locked: false, min: false, right: 6 },
  inv: { x: 0, y: 0, open: true, locked: false, min: false, right: HUD_MARGIN, bottom: CHAT_DOCK_H },
  bag: {
    x: 0,
    y: 0,
    open: true,
    locked: false,
    min: false,
    expanded: false,
    right: itemBoxRight(0),
    bottom: CHAT_DOCK_H,
  },
  coins: {
    x: 0,
    y: 0,
    open: false,
    locked: false,
    min: false,
    expanded: false,
    right: itemBoxRight(1),
    bottom: CHAT_DOCK_H,
  },
  pokebag: {
    x: 0,
    y: 0,
    open: true,
    locked: false,
    min: false,
    expanded: false,
    right: itemBoxRight(2),
    bottom: CHAT_DOCK_H,
  },
  catch: {
    x: 0,
    y: 0,
    open: false,
    locked: false,
    min: false,
    expanded: false,
    right: itemBoxRight(3),
    bottom: CHAT_DOCK_H,
  },
  npc: { x: 240, y: 200, open: false, locked: false, min: false },
  chat: { open: true, dock: true },
};

const DOCKED = new Set(["chat"]);
const MINI_IDS = new Set(["status", "pokebar", "npc", "bag", "coins", "pokebag", "catch"]);
/** Janelas móveis: se não houver poketibia.win.<id>.lock, usa DEFAULTS (ignora locked legado). */
const MOBILE_LOCK_DEFAULTS = new Set([...MINI_IDS, "inv"]);

const WINDOWS_SRC = "/assets/ui/tibia/windows.png";
const CLIP_BG = [0, 127, 182, 182];
const CLIP_FG = [182, 127, 182, 182];

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sliceToUrl(img, x, y, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const sx = img.width >= x + w && img.height >= y + h ? x : 0;
  const sy = img.width >= x + w && img.height >= y + h ? y : 0;
  ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  return c.toDataURL("image/png");
}

export async function loadMiniWindowChrome() {
  const img = new Image();
  img.src = WINDOWS_SRC;
  await img.decode();
  const bg = sliceToUrl(img, ...CLIP_BG);
  const fg = sliceToUrl(img, ...CLIP_FG);
  const root = document.documentElement.style;
  root.setProperty("--mw-bg", `url("${bg}")`);
  root.setProperty("--mw-fg", `url("${fg}")`);
  document.documentElement.classList.add("mw-ready");
}

export class WindowManager {
  constructor(net) {
    this.net = net;
    this.layout = clone(DEFAULTS);
    this.bound = false;
    this.reorder = false;
    this.drag = null;
    this.persistTimer = null;
    this.z = 40;
  }

  loadLocal() {
    let resetInvLayout = false;
    try {
      const ver = Number(localStorage.getItem(POS_VERSION_KEY) || 0);
      resetInvLayout = ver < POS_LAYOUT_VERSION;
    } catch {
      /* ignore */
    }
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (raw) this.merge(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    if (resetInvLayout) {
      try {
        for (const id of ["inv", "bag", "coins", "pokebag", "catch"]) {
          localStorage.removeItem(`${POS_PREFIX}${id}.x`);
          localStorage.removeItem(`${POS_PREFIX}${id}.y`);
          this.layout[id] = clone(DEFAULTS[id]);
        }
        localStorage.setItem(POS_VERSION_KEY, String(POS_LAYOUT_VERSION));
      } catch {
        /* ignore */
      }
    }
    for (const def of WINDOW_DEFS) {
      if (DOCKED.has(def.id)) continue;
      const w = this.layout[def.id];
      if (!w) continue;
      const x = localStorage.getItem(`${POS_PREFIX}${def.id}.x`);
      const y = localStorage.getItem(`${POS_PREFIX}${def.id}.y`);
      if (x != null && x !== "") {
        w.x = num(x, w.x);
        delete w.right;
        delete w.center;
        delete w.wide;
      }
      if (y != null && y !== "") {
        w.y = num(y, w.y);
        delete w.bottom;
      }
      const open = localStorage.getItem(`${POS_PREFIX}${def.id}.open`);
      if (open === "0" || open === "1") w.open = open === "1";
      const min = localStorage.getItem(`${POS_PREFIX}${def.id}.min`);
      if (min === "0" || min === "1") w.min = min === "1";
      const lock = localStorage.getItem(`${POS_PREFIX}${def.id}.lock`);
      if (lock === "0" || lock === "1") w.locked = lock === "1";
      else if (MOBILE_LOCK_DEFAULTS.has(def.id)) w.locked = !!DEFAULTS[def.id].locked;
      const expanded = localStorage.getItem(`${POS_PREFIX}${def.id}.expanded`);
      if (expanded === "0" || expanded === "1") w.expanded = expanded === "1";
      else if (ITEM_BOX_IDS.has(def.id)) w.expanded = !!DEFAULTS[def.id]?.expanded;
    }
  }

  merge(saved) {
    if (!saved || typeof saved !== "object") return;
    for (const def of WINDOW_DEFS) {
      const src = saved[def.id];
      if (!src || typeof src !== "object") continue;
      if (DOCKED.has(def.id)) {
        this.layout[def.id] = { ...DEFAULTS[def.id], open: src.open !== false };
        continue;
      }
      this.layout[def.id] = { ...DEFAULTS[def.id], ...this.layout[def.id], ...src };
    }
  }

  bind() {
    if (this.bound) return;
    this.bound = true;
    this.loadLocal();
    loadMiniWindowChrome().catch(() => {});
    for (const def of WINDOW_DEFS) {
      const el = document.querySelector(`[data-win="${def.id}"]`);
      if (!el) continue;
      this.decorate(el, def);
    }
    this.renderTaskbar();
    this.applyAll();
    window.addEventListener("mousemove", (e) => this.onMove(e));
    window.addEventListener("mouseup", () => this.onUp());
    window.addEventListener("resize", () => this.applyAll());
  }

  decorate(el, def) {
    if (DOCKED.has(def.id)) return;
    if (def.mini) el.classList.add("miniwindow");
    const head = el.querySelector(".win-head") || el.querySelector("header");
    if (!head) return;
    head.classList.add("win-head");
    if (def.mini && !head.querySelector(".mw-icon")) {
      const ic = document.createElement("span");
      ic.className = "mw-icon";
      ic.setAttribute("aria-hidden", "true");
      head.insertBefore(ic, head.firstChild);
    }
    if (!head.querySelector(".win-tools")) {
      const tools = document.createElement("span");
      tools.className = "win-tools";
      const resizeBtn = ITEM_BOX_IDS.has(def.id)
        ? `<button type="button" class="mw-tool mw-resize" data-act="resize" title="Expandir lista de slots"></button>`
        : "";
      tools.innerHTML = `
        ${def.wrench ? `<button type="button" class="mw-tool mw-wrench" data-act="wrench" title="Reordenar party"></button>` : ""}
        <button type="button" class="mw-tool mw-lock" data-act="lock" title="Travar"></button>
        ${resizeBtn}
        <button type="button" class="mw-tool mw-min" data-act="min" title="Minimizar"></button>
        <button type="button" class="mw-tool mw-close" data-act="close" title="Fechar"></button>
      `;
      head.appendChild(tools);
    }
    el.addEventListener("mousedown", () => this.raise(def.id), true);
    head.addEventListener("mousedown", (e) => this.onHeadDown(def.id, e));
    head.addEventListener("dblclick", (e) => {
      if (e.target.closest("[data-act]")) return;
      e.preventDefault();
      this.action(def.id, "min");
    });
    head.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      this.action(def.id, btn.dataset.act);
    });
  }

  raise(id) {
    const el = document.querySelector(`[data-win="${id}"]`);
    if (!el || DOCKED.has(id)) return;
    this.z += 1;
    el.style.zIndex = String(this.z);
  }

  action(id, act) {
    const w = this.layout[id];
    if (!w) return;
    if (act === "lock") w.locked = !w.locked;
    if (act === "min") w.min = !w.min;
    if (act === "close") w.open = false;
    if (act === "resize") w.expanded = !w.expanded;
    if (act === "wrench") {
      this.reorder = !this.reorder;
      document.body.classList.toggle("pokebar-reorder", this.reorder);
    }
    if (act !== "close") this.raise(id);
    this.applyAll();
    this.persist();
  }

  open(id) {
    const w = this.layout[id];
    if (!w) return;
    w.open = true;
    w.min = false;
    this.raise(id);
    this.applyAll();
    this.persist();
  }

  toggle(id) {
    const w = this.layout[id];
    if (!w) return;
    if (!w.open || w.min) this.open(id);
    else {
      w.open = false;
      this.applyAll();
      this.persist();
    }
  }

  onHeadDown(id, e) {
    if (DOCKED.has(id)) return;
    if (e.target.closest("[data-act]")) return;
    if (e.button !== 0) return;
    const w = this.layout[id];
    if (!w || w.locked || !w.open) return;
    const el = document.querySelector(`[data-win="${id}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    w.x = r.left;
    w.y = r.top;
    delete w.right;
    delete w.bottom;
    delete w.center;
    delete w.wide;
    this.drag = { id, dx: e.clientX - r.left, dy: e.clientY - r.top };
    this.raise(id);
    e.preventDefault();
  }

  onMove(e) {
    if (!this.drag) return;
    const w = this.layout[this.drag.id];
    w.x = e.clientX - this.drag.dx;
    w.y = e.clientY - this.drag.dy;
    this.clamp(this.drag.id);
    this.applyOne(this.drag.id);
  }

  onUp() {
    if (!this.drag) return;
    this.clamp(this.drag.id);
    this.applyOne(this.drag.id);
    this.drag = null;
    this.persist();
  }

  clamp(id) {
    const w = this.layout[id];
    const el = document.querySelector(`[data-win="${id}"]`);
    if (!w || !el || DOCKED.has(id)) return;
    const pad = 24;
    const width = el.offsetWidth || 120;
    const height = w.min ? 24 : el.offsetHeight || 48;
    const maxX = Math.max(0, window.innerWidth - Math.min(width, pad));
    const maxY = Math.max(pad, window.innerHeight - Math.min(height, pad));
    w.x = Math.max(0, Math.min(num(w.x, 0), maxX));
    w.y = Math.max(pad, Math.min(num(w.y, pad), maxY));
  }

  applyAll() {
    for (const def of WINDOW_DEFS) this.applyOne(def.id);
    this.renderTaskbar();
  }

  applyOne(id) {
    const el = document.querySelector(`[data-win="${id}"]`);
    const w = this.layout[id];
    if (!el || !w) return;
    if (DOCKED.has(id)) {
      el.classList.toggle("win-closed", !w.open);
      return;
    }
    el.classList.toggle("win-closed", !w.open);
    el.classList.toggle("win-min", !!w.min);
    el.classList.toggle("win-locked", !!w.locked);
    el.classList.toggle("item-box-expanded", !!w.expanded);
    const anchorX = w.x === 0 || w.x == null;
    const anchorY = w.y === 0 || w.y == null;
    if (w.right != null && w.bottom != null && anchorX && anchorY) {
      el.style.left = "auto";
      el.style.right = `${w.right}px`;
      el.style.top = "auto";
      el.style.bottom = `${w.bottom}px`;
      el.style.transform = "none";
      const r = el.getBoundingClientRect();
      if (r.width) {
        w.x = r.left;
        w.y = r.top;
        delete w.right;
        delete w.bottom;
        el.style.left = `${w.x}px`;
        el.style.right = "auto";
        el.style.top = `${w.y}px`;
        el.style.bottom = "auto";
      }
    } else if (w.right != null && anchorX) {
      el.style.left = "auto";
      el.style.right = `${w.right}px`;
      el.style.top = `${w.y}px`;
      el.style.bottom = "auto";
      el.style.transform = "none";
      const r = el.getBoundingClientRect();
      if (r.width) {
        w.x = r.left;
        w.y = r.top;
        delete w.right;
        el.style.left = `${w.x}px`;
        el.style.right = "auto";
      }
    } else if (w.bottom != null && anchorY) {
      el.style.left = `${w.x}px`;
      el.style.right = "auto";
      el.style.top = "auto";
      el.style.bottom = `${w.bottom}px`;
      el.style.transform = "none";
      const r = el.getBoundingClientRect();
      if (r.width) {
        w.x = r.left;
        w.y = r.top;
        delete w.bottom;
        el.style.top = `${w.y}px`;
        el.style.bottom = "auto";
      }
    } else {
      this.clamp(id);
      el.style.left = `${w.x}px`;
      el.style.top = `${w.y}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
      el.style.transform = "none";
    }
    const lockBtn = el.querySelector('[data-act="lock"]');
    if (lockBtn) {
      lockBtn.classList.toggle("lock-on", !!w.locked);
      lockBtn.title = w.locked ? "Trancada (clique para mover)" : "Destrancada — arraste o título";
    }
    const minBtn = el.querySelector('[data-act="min"]');
    if (minBtn) minBtn.title = w.min ? "Restaurar" : "Minimizar";
    const resizeBtn = el.querySelector('[data-act="resize"]');
    if (resizeBtn) {
      resizeBtn.classList.toggle("on", !!w.expanded);
      resizeBtn.title = w.expanded
        ? "Compactar (~5 linhas visíveis)"
        : "Expandir (todos os slots com scroll)";
    }
    const wrenchBtn = el.querySelector('[data-act="wrench"]');
    if (wrenchBtn) {
      wrenchBtn.classList.toggle("on", this.reorder && id === "pokebar");
      wrenchBtn.title = this.reorder ? "Reordenando (arraste as linhas)" : "Reordenar party";
    }
  }

  renderTaskbar() {
    const icons = document.getElementById("hud-top-icons");
    if (icons) {
      if (!icons.dataset.ready) {
        icons.dataset.ready = "1";
        icons.innerHTML = "";
        for (const spec of TOP_ICONS) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "top-icon";
          btn.dataset.winToggle = spec.id;
          btn.title = spec.title;
          btn.innerHTML = `<img src="${spec.src}" alt="" width="16" height="16" />`;
          btn.onclick = () => this.toggle(spec.id);
          icons.appendChild(btn);
        }
      }
      for (const spec of TOP_ICONS) {
        const btn = icons.querySelector(`[data-win-toggle="${spec.id}"]`);
        const w = this.layout[spec.id];
        btn?.classList.toggle("on", !!w?.open);
        btn?.classList.toggle("off", !w?.open);
      }
    }
    const bar = document.getElementById("hud-taskbar");
    if (!bar) return;
    bar.innerHTML = "";
    for (const def of WINDOW_DEFS) {
      if (MINI_IDS.has(def.id)) continue;
      const w = this.layout[def.id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "task-btn" + (w?.open ? " open" : " closed");
      btn.textContent = def.title;
      btn.title = w?.open ? def.title : `Reabrir ${def.title}`;
      btn.onclick = () => this.open(def.id);
      bar.appendChild(btn);
    }
  }

  persist() {
    const payload = clone(this.layout);
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(payload));
      for (const def of WINDOW_DEFS) {
        if (DOCKED.has(def.id)) continue;
        const w = this.layout[def.id];
        if (!w) continue;
        const el = document.querySelector(`[data-win="${def.id}"]`);
        let x = w.x;
        let y = w.y;
        if (el && w.open && el.offsetWidth) {
          const r = el.getBoundingClientRect();
          x = r.left;
          y = r.top;
        }
        if (x != null) localStorage.setItem(`${POS_PREFIX}${def.id}.x`, String(Math.round(x)));
        if (y != null) localStorage.setItem(`${POS_PREFIX}${def.id}.y`, String(Math.round(y)));
        localStorage.setItem(`${POS_PREFIX}${def.id}.open`, w.open ? "1" : "0");
        localStorage.setItem(`${POS_PREFIX}${def.id}.min`, w.min ? "1" : "0");
        localStorage.setItem(`${POS_PREFIX}${def.id}.lock`, w.locked ? "1" : "0");
        if (ITEM_BOX_IDS.has(def.id)) {
          localStorage.setItem(`${POS_PREFIX}${def.id}.expanded`, w.expanded ? "1" : "0");
        }
      }
    } catch {
      /* ignore */
    }
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.net.send({ t: "hud", layout: payload });
    }, 200);
  }
}
