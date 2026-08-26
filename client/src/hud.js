import { WindowManager } from "./windows.js";
import { SPECIES } from "../../server/species.js";

const ITEM_META = {
  pokeball: { label: "Pokébola", icon: "/assets/items/pokeball.png", catch: true },
  premierball: { label: "Premier Ball", icon: "/assets/items/premierball.png", catch: true },
  small_potion: { label: "Small Potion", icon: "/assets/items/small_potion.png", heal: true },
  great_potion: { label: "Great Potion", icon: "/assets/items/great_potion.png", heal: true },
};

const VIP_DEMO = [
  { name: "Yuutu", online: true },
  { name: "Frajola Roncaria", online: false },
];

function clock() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function genderMark(p) {
  if (!p) return "";
  const g = p.gender || (String(p.uid || "").charCodeAt(0) % 2 ? "m" : "f");
  return g === "f" ? "♀" : "♂";
}

function portraitUrl(p) {
  return `/assets/pokemon/${p.species || "caterpie"}/portrait.png`;
}

export class Hud {
  constructor(net) {
    this.net = net;
    this.windows = new WindowManager(net);
    this.party = { slots: [], out: null, count: 0 };
    this.you = null;
    this.bag = [];
    this.bound = false;
    this.channel = "local";
    this.lines = [];
    this.target = null;
    this.creatures = new Map();
    this.rowDrag = null;
    this.selectedItem = null;
    this.mapData = null;
    this.minimapZoom = 1;
  }

  bindGame() {
    if (this.bound) return;
    this.bound = true;
    this.windows.bind();
    const sendChat = () => {
      const input = document.getElementById("chat-input");
      const text = input.value.trim();
      input.value = "";
      if (!text) return;
      this.net.send({ t: "say", text });
    };
    document.getElementById("chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChat();
    });
    document.getElementById("chat-send").onclick = sendChat;
    document.getElementById("chat-tabs").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-ch]");
      if (!btn) return;
      this.channel = btn.dataset.ch;
      for (const b of document.querySelectorAll("#chat-tabs button")) {
        b.classList.toggle("active", b === btn);
      }
      this.flushLog();
    });
    document.getElementById("minimap-zoom-in")?.addEventListener("click", () => {
      this.minimapZoom = Math.min(2.5, this.minimapZoom + 0.25);
      this.drawMinimap();
    });
    document.getElementById("minimap-zoom-out")?.addEventListener("click", () => {
      this.minimapZoom = Math.max(0.5, this.minimapZoom - 0.25);
      this.drawMinimap();
    });
    this.renderVip();
    this.render();
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.selectItem(null);
        document.getElementById("chat-input")?.blur();
      }
    });
  }

  selectItem(item) {
    if (item && !this.bag.find((i) => i.item === item && i.count > 0)) item = null;
    this.selectedItem = item || null;
    document.body.classList.toggle("use-with", !!this.selectedItem);
    this.renderBags();
    const out = this.party.out != null ? this.party.slots[this.party.out] : null;
    this.renderHotbar(out);
  }

  log(text, ch = "sistema") {
    this.lines.push({ ch, text, ts: clock() });
    if (this.lines.length > 200) this.lines.shift();
    this.flushLog();
  }

  flushLog() {
    const log = document.getElementById("chat-log");
    if (!log) return;
    log.innerHTML = "";
    for (const line of this.lines) {
      const show =
        (this.channel === "global" && (line.ch === "global" || line.ch === "local")) ||
        (this.channel === "local" && line.ch === "local") ||
        (this.channel === "sistema" && line.ch === "sistema") ||
        (this.channel === "combate" && line.ch === "combate");
      if (!show) continue;
      const el = document.createElement("div");
      el.className = `line ch-${line.ch}`;
      el.innerHTML = `<span class="ts">${line.ts}</span>${line.text}`;
      log.appendChild(el);
    }
    log.scrollTop = log.scrollHeight;
  }

  setTarget(creature) {
    this.target = creature;
    this.renderBattle();
  }

  handle(msg) {
    if (msg.t === "map") {
      this.you = msg.you;
      this.party = msg.party;
      this.bag = msg.bag || [];
      this.creatures = new Map((msg.creatures || []).map((c) => [c.id, c]));
      this.mapData = msg.map;
      if (msg.hud) this.windows.merge(msg.hud);
      if (this.bound) this.windows.applyAll();
      this.render();
      this.drawMinimap();
    }
    if (msg.t === "party") {
      this.party = msg.party;
      this.bag = msg.bag || this.bag;
      this.render();
    }
    if (msg.t === "say") this.log(`${msg.name}: ${msg.text}`, "local");
    if (msg.t === "info") this.log(msg.text, /causou |Catch successful|escapou|vivo|derrotado|Fly|Ride|Hide|Surf|curou|Recovery/.test(msg.text) ? "combate" : "sistema");
    if (msg.t === "err") this.log(msg.text, "sistema");
    if (msg.t === "moved" && this.you && msg.id === this.you.id) {
      this.you.x = msg.x;
      this.you.y = msg.y;
      this.you.dir = msg.dir;
      this.drawMinimap();
    }
    if (msg.t === "moved") {
      const c = this.creatures.get(msg.id);
      if (c) {
        c.x = msg.x;
        c.y = msg.y;
      }
      this.drawMinimap();
    }
    if (msg.t === "appear") {
      this.creatures.set(msg.creature.id, msg.creature);
      this.renderBattle();
      this.drawMinimap();
    }
    if (msg.t === "disappear") {
      this.creatures.delete(msg.id);
      if (this.target?.id === msg.id) this.setTarget(null);
      else this.renderBattle();
      this.drawMinimap();
    }
    if (msg.t === "down") {
      const c = this.creatures.get(msg.id);
      if (c) {
        c.dead = true;
        c.hp = 0;
        c.plate = `${c.name} [${c.level || 5}]  0/${c.hpMax}`;
      }
      this.renderBattle();
      this.drawMinimap();
    }
    if (msg.t === "fx") {
      const c = this.creatures.get(msg.to);
      if (c && msg.hp != null) {
        c.hp = msg.hp;
        if (c.name) c.plate = `${c.name} [${c.level || 5}]  ${c.hp}/${c.hpMax}`;
      }
      this.renderBattle();
    }
    if (msg.t === "target") {
      this.setTarget({ id: msg.id, name: msg.name, plate: msg.plate });
    }
    if (msg.t === "outfit" && msg.creature) {
      if (this.you && msg.creature.id === this.you.id) this.you = { ...this.you, ...msg.creature };
      this.creatures.set(msg.creature.id, msg.creature);
      this.renderOrders();
    }
  }

  renderVip() {
    const list = document.getElementById("vip-list");
    if (!list) return;
    list.innerHTML = "";
    for (const row of VIP_DEMO) {
      const li = document.createElement("li");
      li.className = row.online ? "vip-on" : "vip-off";
      li.textContent = row.name;
      list.appendChild(li);
    }
  }

  drawMinimap() {
    const canvas = document.getElementById("minimap-canvas");
    if (!canvas || !this.mapData) return;
    const ctx = canvas.getContext("2d");
    const w = this.mapData.w;
    const h = this.mapData.h;
    const scale = (canvas.width / w) * this.minimapZoom;
    const sy = (canvas.height / h) * this.minimapZoom;
    const s = Math.min(scale, sy);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const colors = ["#3a7d2a", "#8a7a52", "#555", "#2a4a22", "#6b4a2a", "#2a4a6a", "#4a3828"];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const g = this.mapData.ground[y][x];
        const wall = this.mapData.walls[y][x];
        ctx.fillStyle = wall ? "#333" : colors[g] || "#3a7d2a";
        ctx.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s));
      }
    }
    for (const [, c] of this.creatures) {
      if (c.dead) continue;
      ctx.fillStyle = c.kind === "player" ? "#7dce6a" : c.wild ? "#e0af68" : "#7aa2f7";
      ctx.fillRect(c.x * s, c.y * s, Math.max(2, s), Math.max(2, s));
    }
    if (this.you) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.strokeRect(this.you.x * s - 1, this.you.y * s - 1, s + 2, s + 2);
    }
  }

  render() {
    const nameEl = document.getElementById("hud-name");
    if (!nameEl) return;
    nameEl.textContent = this.you?.name || "—";
    const lv = this.you?.level || 1;
    document.getElementById("hud-level").textContent = lv;
    document.getElementById("status-level").textContent = lv;

    const hp = this.you?.hp ?? 150;
    const hpMax = this.you?.hpMax ?? 150;
    const hpPct = Math.round((hp / hpMax) * 100);
    document.getElementById("player-hp-fill").style.width = `${hpPct}%`;
    document.getElementById("player-hp-pct").textContent = `${hpPct}%`;

    const xpPct = this.you?.xpPct ?? 0;
    document.getElementById("hud-xp-fill").style.width = `${xpPct}%`;
    document.getElementById("hud-xp-pct").textContent = `${xpPct.toFixed(1)}%`;
    document.getElementById("hud-fish-fill").style.width = `${this.you?.fishPct ?? 0}%`;
    document.getElementById("hud-fish-pct").textContent = `${this.you?.fishPct ?? 0}%`;
    document.getElementById("hud-stm-fill").style.width = `${this.you?.stmPct ?? 100}%`;
    document.getElementById("hud-stm-pct").textContent = `${this.you?.stmPct ?? 100}%`;

    const balls = this.bag.find((i) => i.item === "pokeball")?.count || 0;
    document.getElementById("hud-balls").textContent = balls;
    const gold = document.getElementById("hud-gold");
    const goldSide = document.getElementById("hud-gold-side");
    const goldVal = this.you?.gold ?? 0;
    if (gold) gold.textContent = goldVal.toFixed(2);
    if (goldSide) goldSide.textContent = goldVal.toFixed(2);

    const out = this.party.out != null ? this.party.slots[this.party.out] : null;
    const portrait = document.getElementById("player-portrait");
    if (portrait) portrait.src = out ? portraitUrl(out) : "/assets/human/portrait.png";
    document.getElementById("out-nature").textContent = out?.nature || "—";
    const spec = out ? SPECIES[out.species] : null;
    const abs = spec?.abilities || [];
    document.getElementById("out-ability").textContent = abs.length ? abs.join(", ") : "—";

    this.renderPokebar();
    this.renderBattle();
    this.renderBags();
    this.renderHotbar(out);
    this.renderOrders();
  }

  renderOrders() {
    const bar = document.getElementById("order-bar");
    if (!bar) return;
    const mount = this.party.mount;
    const out = this.party.out != null ? this.party.slots[this.party.out] : null;
    const specKey = mount?.species || out?.species;
    const abs = (specKey && SPECIES[specKey]?.abilities) || [];
    bar.innerHTML = "";
    if (!abs.length) {
      bar.classList.add("hidden");
      return;
    }
    bar.classList.remove("hidden");
    for (const ab of abs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "order-btn" + (mount?.ability === ab ? " on" : "");
      btn.textContent = ab === "fly" ? "FLY" : ab === "ride" ? "RIDE" : ab === "hide" ? "HIDE" : "SURF";
      btn.title = btn.textContent;
      btn.onclick = () => this.net.send({ t: "order", ability: ab });
      bar.appendChild(btn);
    }
  }

  renderPokebar() {
    const list = document.getElementById("pokebar-list");
    if (!list) return;
    list.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const p = this.party.slots?.[i];
      const row = document.createElement("div");
      const isOut = this.party.out === i || this.party.mount?.slot === i;
      row.className = "poke-row" + (p ? "" : " empty") + (isOut ? " out" : "");
      row.dataset.slot = String(i);
      if (p) {
        const ratio = Math.max(0, Math.min(1, p.hp / Math.max(1, p.hpMax)));
        const pct = Math.round(ratio * 100);
        row.innerHTML = `
          <img class="poke-ico" src="${portraitUrl(p)}" alt="${p.name}" />
          <span class="poke-gender">${genderMark(p)}</span>
          <div class="poke-meta">
            <div class="poke-name">[${p.level}] ${p.name}</div>
            <div class="poke-hp"><div class="poke-hp-fill" style="width:${pct}%"></div></div>
          </div>
          <span class="poke-pct">${pct}%</span>
        `;
        row.onclick = (e) => {
          if (this.rowDrag) return;
          if (e.target.closest(".win-tools")) return;
          this.net.send({ t: "pokebar", slot: i });
        };
        row.addEventListener("mousedown", (e) => this.onRowDown(i, e));
      }
      list.appendChild(row);
    }
  }

  onRowDown(from, e) {
    if (!this.windows.reorder || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const onMove = (ev) => {
      if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) > 4) this.rowDrag = from;
    };
    const onUp = (ev) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const over = ev.target.closest?.(".poke-row");
      const to = over ? Number(over.dataset.slot) : NaN;
      if (this.rowDrag != null && Number.isInteger(to) && to !== from) {
        this.net.send({ t: "partyOrder", from, to });
      }
      setTimeout(() => {
        this.rowDrag = null;
      }, 0);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  renderBattle() {
    const list = document.getElementById("battle-list");
    if (!list) return;
    list.innerHTML = "";
    const rows = [...this.creatures.values()].filter((c) => {
      if (!c) return false;
      if (c.dead) return false;
      if (c.id === this.you?.id) return false;
      if (c.masterId && c.masterId === this.you?.id) return false;
      return c.kind === "wild" || c.wild || c.kind === "player";
    });
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "battle-empty";
      empty.textContent = "—";
      list.appendChild(empty);
      return;
    }
    for (const c of rows) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "battle-row" + (this.target?.id === c.id ? " targeted" : "");
      const ratio = Math.max(0, Math.min(1, (c.hp ?? 1) / Math.max(1, c.hpMax ?? 1)));
      el.innerHTML = `<span>${c.plate || c.name}</span><span class="battle-hp"><span style="width:${ratio * 100}%"></span></span>`;
      el.onclick = () => this.net.send({ t: "target", id: c.id });
      list.appendChild(el);
    }
  }

  renderBags() {
    const grid = document.getElementById("bolsa");
    if (!grid) return;
    grid.innerHTML = "";
    const items = ["small_potion", "great_potion", "premierball", "pokeball"];
    for (const key of items) {
      const meta = ITEM_META[key];
      const entry = this.bag.find((i) => i.item === key);
      const count = entry?.count || 0;
      const cell = document.createElement("div");
      cell.className = "bag-cell has-item" + (this.selectedItem === key ? " use-with" : "");
      cell.innerHTML = `<img src="${meta.icon}" alt="${meta.label}" /><span class="bag-count">${count}</span>`;
      cell.title = `${meta.label} ×${count}`;
      if (meta.catch) {
        cell.oncontextmenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!count) return;
          this.selectItem(this.selectedItem === key ? null : key);
        };
      }
      if (meta.heal) {
        cell.onclick = () => {
          if (!count) return;
          this.net.send({ t: "use", item: key });
        };
      }
      grid.appendChild(cell);
    }
  }

  renderHotbar(out) {
    const bar = document.getElementById("hotbar");
    if (!bar) return;
    const known = out ? moveCount(out.species) : 0;
    bar.innerHTML = "";
    const slots = [
      { key: "Tab", label: "M1", move: 1 },
      { key: "1", label: "M2", move: 2 },
      { key: "2", label: "M3", move: 3 },
      { key: "F", label: "M4", move: 4 },
      { key: "E", label: "M5", move: 5 },
      { key: "R", label: "M6", move: 6 },
      { key: "3", label: "M7", move: 7 },
      { key: "4", label: "M8", move: 8 },
      { key: "A", label: "M9", move: 9 },
      { key: "S", label: "M10", move: 10 },
      { key: "ball", item: "pokeball" },
      { key: "pot", item: "small_potion" },
    ];
    slots.forEach((slot, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hot-slot";
      if (slot.move) {
        const on = out && slot.move <= known;
        btn.classList.add(on ? "on" : "off");
        if (on && out) {
          btn.innerHTML = `<img src="/assets/pokemon/${out.species}/portrait.png" alt="" /><span class="hot-key">${slot.key}</span>`;
          btn.onclick = () => this.net.send({ t: "move", n: slot.move });
        } else {
          btn.innerHTML = `<span class="hot-key">${slot.key}</span>`;
        }
      } else if (slot.item) {
        const entry = this.bag.find((b) => b.item === slot.item);
        const count = entry?.count || 0;
        const meta = ITEM_META[slot.item];
        btn.classList.add(count ? "on" : "off");
        btn.classList.toggle("use-with", this.selectedItem === slot.item);
        btn.innerHTML = `<img src="${meta.icon}" alt="" /><span class="hot-count">${count || ""}</span>`;
        if (meta.catch) {
          btn.oncontextmenu = (e) => {
            e.preventDefault();
            if (!count) return;
            this.selectItem(this.selectedItem === slot.item ? null : slot.item);
          };
        }
        if (meta.heal) {
          btn.onclick = () => count && this.net.send({ t: "use", item: slot.item });
        }
      }
      const angle = (i / slots.length) * Math.PI * 2 - Math.PI / 2;
      const rx = 88 + Math.cos(angle) * 72;
      const ry = 44 + Math.sin(angle) * 28;
      btn.style.left = `${rx}px`;
      btn.style.top = `${ry}px`;
      bar.appendChild(btn);
    });
  }
}

function moveCount(species) {
  return SPECIES[species]?.moves?.length || 0;
}
