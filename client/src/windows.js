const STORAGE_KEY = "otpokemon-hud-v4";

export const WINDOW_DEFS = [
  { id: "minimap", title: "Minimapa" },
  { id: "vip", title: "Lista VIP" },
  { id: "pokebar", title: "Lista de Pokemon", wrench: true },
  { id: "battle", title: "Batalha" },
  { id: "status", title: "PokeInfo" },
  { id: "inv", title: "Inventário" },
  { id: "chat", title: "Chat" },
];

const DEFAULTS = {
  minimap: { x: 6, y: 28, open: true, locked: true, min: false },
  vip: { x: 6, y: 196, open: true, locked: true, min: false },
  pokebar: { x: 6, y: 198, open: true, locked: true, min: false },
  battle: { x: 6, y: 0, open: true, locked: true, min: false, bottom: 118 },
  status: { x: 0, y: 28, open: true, locked: true, min: false, right: 6 },
  inv: { x: 0, y: 168, open: true, locked: true, min: false, right: 6 },
  chat: { open: true, dock: true },
};

const DOCKED = new Set(["chat"]);

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export class WindowManager {
  constructor(net) {
    this.net = net;
    this.layout = clone(DEFAULTS);
    this.bound = false;
    this.reorder = false;
    this.drag = null;
    this.persistTimer = null;
  }

  loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.merge(parsed);
    } catch {
      /* ignore */
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
    for (const def of WINDOW_DEFS) {
      const el = document.querySelector(`[data-win="${def.id}"]`);
      if (!el) continue;
      this.decorate(el, def);
    }
    this.renderTaskbar();
    this.applyAll();
    window.addEventListener("mousemove", (e) => this.onMove(e));
    window.addEventListener("mouseup", () => this.onUp());
  }

  decorate(el, def) {
    if (DOCKED.has(def.id)) return;
    const head = el.querySelector(".win-head") || el.querySelector("header");
    if (!head) return;
    head.classList.add("win-head");
    if (!head.querySelector(".win-tools")) {
      const tools = document.createElement("span");
      tools.className = "win-tools";
      tools.innerHTML = `
        <button type="button" data-act="lock" title="Trancar">🔒</button>
        ${def.wrench ? `<button type="button" data-act="wrench" title="Reordenar party">🔧</button>` : ""}
        <button type="button" data-act="min" title="Minimizar">−</button>
        <button type="button" data-act="close" title="Fechar">×</button>
      `;
      head.appendChild(tools);
    }
    head.addEventListener("mousedown", (e) => this.onHeadDown(def.id, e));
    head.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      this.action(def.id, btn.dataset.act);
    });
  }

  action(id, act) {
    const w = this.layout[id];
    if (!w) return;
    if (act === "lock") w.locked = !w.locked;
    if (act === "min") w.min = !w.min;
    if (act === "close") w.open = false;
    if (act === "wrench") {
      this.reorder = !this.reorder;
      document.body.classList.toggle("pokebar-reorder", this.reorder);
    }
    this.applyAll();
    this.persist();
  }

  open(id) {
    const w = this.layout[id];
    if (!w) return;
    w.open = true;
    w.min = false;
    this.applyAll();
    this.persist();
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
    e.preventDefault();
  }

  onMove(e) {
    if (!this.drag) return;
    const w = this.layout[this.drag.id];
    w.x = Math.max(0, e.clientX - this.drag.dx);
    w.y = Math.max(24, e.clientY - this.drag.dy);
    this.applyOne(this.drag.id);
  }

  onUp() {
    if (!this.drag) return;
    this.drag = null;
    this.persist();
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
    el.style.left = `${w.x}px`;
    el.style.top = `${w.y}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.transform = "none";
    if (w.right != null && w.x === 0) {
      el.style.left = "auto";
      el.style.right = `${w.right}px`;
    } else if (w.bottom != null && w.y === 0) {
      el.style.top = "auto";
      el.style.bottom = `${w.bottom}px`;
    }
    const lockBtn = el.querySelector('[data-act="lock"]');
    if (lockBtn) {
      lockBtn.classList.toggle("lock-on", !!w.locked);
      lockBtn.title = w.locked ? "Trancada (clique para mover)" : "Destrancada — arraste o título";
    }
    const wrenchBtn = el.querySelector('[data-act="wrench"]');
    if (wrenchBtn) {
      wrenchBtn.classList.toggle("on", this.reorder && id === "pokebar");
      wrenchBtn.title = this.reorder ? "Reordenando (arraste as linhas)" : "Reordenar party";
    }
  }

  renderTaskbar() {
    const bar = document.getElementById("hud-taskbar");
    if (!bar) return;
    bar.innerHTML = "";
    for (const def of WINDOW_DEFS) {
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.net.send({ t: "hud", layout: payload });
    }, 200);
  }
}
