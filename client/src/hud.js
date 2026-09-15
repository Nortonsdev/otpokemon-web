import { WindowManager } from "./windows.js";
import { bindChatDock } from "./ui/chatDock.js";
import { SPECIES } from "../../server/species.js";
import { playerProgressFields, staminaClock } from "../../server/otpProgress.js";
import { hpColorCss, hpPercent } from "./hpColor.js";
import { isCombatSafeZone } from "../../shared/safeZone.js";
import { pokemonPlateText } from "../../shared/kantoDex.js";
import {
  ITEM_BOX_COLS,
  ITEM_BOX_COMPACT_ROWS,
  ITEM_BOX_SLOTS,
  itemBoxRowCount,
} from "../../shared/itemBoxCaps.js";
import { BALL_REGISTRY, CATCH_BALL_ITEMS, ballIconHtml } from "./ballIcons.js";

const CATCH_REGISTRY = CATCH_BALL_ITEMS;

const ITEM_META = {
  premierball: { label: "Premier Ball", catch: true },
  ultraball: { label: "Ultra Ball", catch: true },
  masterball: { label: "Master Ball", catch: true },
  pokeball: { label: "Pokébola", icon: "/assets/items/pokeball.png", catch: true },
  small_potion: { label: "Small Potion", icon: "/assets/items/small_potion.png", heal: true },
  great_potion: { label: "Great Potion", icon: "/assets/items/great_potion.png", heal: true },
};

function itemIconHtml(entry, count) {
  if (entry?.item && BALL_REGISTRY[entry.item]) return ballIconHtml(entry.item, count);
  const icon = entry?.icon || entry;
  const n = Math.max(0, Number(count) || 0);
  const stack = n > 0 ? `<span class="item-stack">${n}</span>` : "";
  return `<img class="item-sprite" src="${icon}" alt="" />${stack}`;
}

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

const INV_ROD_SPRITES = [
  { src: "/assets/hud/inventory/slots/oldrod.png", title: "Old Rod" },
  { src: "/assets/hud/inventory/slots/goodrod.png", title: "Good Rod" },
  { src: "/assets/hud/inventory/slots/superrod.png", title: "Super Rod" },
];

const PORTRAIT_TOPS = [36, 83, 130, 177, 224, 271];
const HP_TOPS = [51, 98, 145, 192, 239, 286];
const SLOT_TOPS = [33, 80, 127, 174, 221, 268];

export class Hud {
  constructor(net) {
    this.net = net;
    this.windows = new WindowManager(net);
    this.party = { slots: [], out: null, count: 0 };
    this.you = null;
    this.lootBag = [];
    this.catchBox = [];
    this.mapSpawn = null;
    this.catchPick = null;
    this.bound = false;
    this.channel = "local";
    this.lines = [];
    this.target = null;
    this.creatures = new Map();
    this.rowDrag = null;
    this.selectedItem = null;
    this.mapData = null;
    this.minimapZoom = 1;
    this.catchStats = Object.fromEntries(CATCH_BALL_ITEMS.map((k) => [k, { ok: 0, fail: 0 }]));
    this.moveCdUntil = 0;
    this.outCreatureId = null;
    this.invRodIndex = 0;
  }

  bindGame() {
    if (this.bound) return;
    this.bound = true;
    this.windows.bind();
    bindChatDock();
    const wm = this.windows;
    const applyAll = wm.applyAll.bind(wm);
    wm.applyAll = () => {
      applyAll();
      this.syncInvShortcutState();
    };
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
    document.getElementById("npc-dialog-ok")?.addEventListener("click", () => {
      this.windows.action("npc", "close");
    });
    const invRoot = document.getElementById("hud-inv");
    invRoot?.querySelectorAll("[data-inv-win]").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.invWin;
        if (!id) return;
        this.windows.toggle(id);
        this.syncInvShortcutState();
      });
    });
    invRoot?.querySelectorAll("[data-inv-action]").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (btn.dataset.invAction === "order") {
          const bar = document.getElementById("order-bar");
          if (bar) {
            bar.classList.toggle("inv-order-flash");
            bar.classList.remove("hidden");
            this.renderOrders();
          }
        }
      });
    });
    document.getElementById("inv-rod-cycle")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cycleInvRod();
    });
    invRoot?.querySelectorAll(".inv-otp-rail-btn").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.stopPropagation());
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.selectItem(null);
        this.setTarget(null);
        this.net.send({ t: "target", id: null });
        document.getElementById("chat-input")?.blur();
      }
    });
  }

  noteCatchAttempt(ballItem, ok) {
    const key = CATCH_BALL_ITEMS.includes(ballItem) ? ballItem : ballItem === "pokeball" ? "pokeball" : null;
    if (!key) return;
    if (!this.catchStats[key]) this.catchStats[key] = { ok: 0, fail: 0 };
    if (ok) this.catchStats[key].ok += 1;
    else this.catchStats[key].fail += 1;
    this.renderCatchWindow();
  }

  selectItem(item) {
    if (item && !this.lootBag.find((i) => i.item === item && i.count > 0)) item = null;
    this.selectedItem = item || null;
    document.body.classList.toggle("use-with", !!this.selectedItem);
    this.renderItemWindows();
    const out = this.party.out != null ? this.party.slots[this.party.out] : null;
    this.renderHotbar(out);
    this.renderAttackBar(out);
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

  openNpcDialog(who) {
    if (!who || who.kind !== "npc") return;
    const title = document.getElementById("npc-dialog-title");
    const text = document.getElementById("npc-dialog-text");
    if (title) title.textContent = who.name || "NPC";
    if (text) text.textContent = "Oi, o que você quer?";
    this.windows.open("npc");
  }

  handle(msg) {
    if (msg.t === "map") {
      this.you = msg.you;
      this.party = msg.party;
      this.lootBag = msg.lootBag || msg.bag || [];
      this.catchBox = msg.catchBox || [];
      this.creatures = new Map((msg.creatures || []).map((c) => [c.id, c]));
      this.outCreatureId =
        (msg.creatures || []).find((c) => c.masterId === msg.you?.id)?.id ?? this.outCreatureId;
      this.mapData = msg.map;
      this.mapSpawn = msg.map?.spawn || null;
      if (msg.hud) this.windows.merge(msg.hud);
      if (this.bound) this.windows.applyAll();
      this.render();
      this.drawMinimap();
    }
    if (msg.t === "party") {
      this.party = msg.party;
      if (msg.lootBag) this.lootBag = msg.lootBag;
      else if (msg.bag) this.lootBag = msg.bag;
      if (msg.catchBox) this.catchBox = msg.catchBox;
      if (msg.gold != null && this.you) this.you.gold = msg.gold;
      this.renderActivePokeStatus();
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
      this.renderCatchWindow();
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
      if (msg.creature.masterId === this.you?.id) this.outCreatureId = msg.creature.id;
      this.renderBattle();
      this.drawMinimap();
      this.render();
    }
    if (msg.t === "disappear") {
      this.creatures.delete(msg.id);
      if (this.outCreatureId === msg.id) this.outCreatureId = null;
      if (this.target?.id === msg.id) this.setTarget(null);
      else this.renderBattle();
      this.drawMinimap();
      this.render();
    }
    if (msg.t === "down") {
      const c = this.creatures.get(msg.id);
      if (c) {
        c.dead = true;
        c.hp = 0;
        c.plate = `${pokemonPlateText(c)}  0/${c.hpMax}`;
      }
      if (this.target?.id === msg.id) this.setTarget(null);
      this.renderBattle();
      this.drawMinimap();
    }
    if (msg.t === "fx") {
      if (this.outCreatureId != null && msg.from === this.outCreatureId) {
        this.moveCdUntil = Date.now() + 1000;
        const outMon = this.party.out != null ? this.party.slots[this.party.out] : null;
        this.renderHotbar(outMon);
        this.renderAttackBar(outMon);
      }
      const c = this.creatures.get(msg.to);
      if (c && msg.hp != null) {
        c.hp = msg.hp;
        if (msg.hpMax != null) c.hpMax = msg.hpMax;
        if (c.name) c.plate = `${pokemonPlateText(c)}  ${c.hp}/${c.hpMax}`;
      }
      if (this.you && msg.to === this.you.id && msg.hp != null) {
        this.you.hp = msg.hp;
        if (msg.hpMax != null) this.you.hpMax = msg.hpMax;
        this.render();
      } else {
        this.renderBattle();
      }
    }
    if (msg.t === "target") {
      if (msg.id == null) this.setTarget(null);
      else this.setTarget({ id: msg.id, name: msg.name, plate: msg.plate });
    }
    if (msg.t === "catchAttempt") this.noteCatchAttempt(msg.ball, msg.ok);
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
      ctx.fillStyle =
        c.kind === "player" ? "#7dce6a" : c.kind === "npc" ? "#00d4e8" : c.wild ? "#e0af68" : "#7aa2f7";
      ctx.fillRect(c.x * s, c.y * s, Math.max(2, s), Math.max(2, s));
    }
    if (this.you) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.strokeRect(this.you.x * s - 1, this.you.y * s - 1, s + 2, s + 2);
    }
  }

  render() {
    const nameEl = document.getElementById("pokeinfo-name");
    if (!nameEl) return;
    nameEl.textContent = this.you?.name || "—";
    const lv = this.you?.level || 1;
    document.getElementById("status-level").textContent = lv;

    const progress = playerProgressFields(this.you || {});
    const hp = this.you?.hp ?? 150;
    const hpMax = this.you?.hpMax ?? 150;
    const hpRatio = hpPercent(hp, hpMax);
    const hpPct = Math.round(hpRatio * 100);
    const hpFill = document.getElementById("player-hp-fill");
    hpFill.style.width = `${hpPct}%`;
    hpFill.style.background = hpColorCss(hpRatio);
    document.getElementById("player-hp-pct").textContent = `${hpPct}%`;
    const hpRow = document.getElementById("player-hp-row");
    if (hpRow) {
      const tip = `Health ${hpPct}% (${hp}/${hpMax})`;
      hpRow.title = tip;
      hpRow.dataset.tip = tip;
    }

    const xpPct = progress.expPercent;
    document.getElementById("hud-xp-fill").style.width = `${xpPct}%`;
    document.getElementById("hud-xp-pct").textContent = `${xpPct}%`;
    const xpRow = document.getElementById("player-xp-row");
    if (xpRow) {
      const tip =
        progress.exp != null && progress.expNext != null
          ? `Experience ${xpPct}% (${progress.exp}/${progress.expNext})`
          : `Experience ${xpPct}%`;
      xpRow.title = tip;
      xpRow.dataset.tip = tip;
    }

    const fishPct = this.you?.fishPct ?? 31;
    document.getElementById("hud-fish-fill").style.width = `${fishPct}%`;
    document.getElementById("hud-fish-pct").textContent = `${fishPct}%`;

    const stmPct = progress.stmPercent;
    document.getElementById("hud-stm-fill").style.width = `${stmPct}%`;
    document.getElementById("hud-stm-pct").textContent = `${stmPct}%`;
    const stmRow = document.getElementById("player-stm-row");
    if (stmRow) {
      const tip = `Stamina ${stmPct}% (${staminaClock(progress.staminaMinutes)})`;
      stmRow.title = tip;
      stmRow.dataset.tip = tip;
    }

    const balls = this.lootBag.find((i) => i.item === "pokeball")?.count || 0;
    document.getElementById("hud-balls").textContent = balls;
    const trophies = document.getElementById("hud-trophies");
    if (trophies) trophies.textContent = String(progress.trophies ?? 0);
    const cap = document.getElementById("hud-cap");
    if (cap) cap.textContent = String(progress.cap ?? 400);

    const ballWrap = document.getElementById("player-party-balls");
    if (ballWrap) {
      ballWrap.innerHTML = "";
      for (let i = 0; i < 6; i++) {
        const p = this.party.slots?.[i];
        const el = document.createElement("span");
        el.className = "pi-ball" + (p ? (p.hp > 0 ? " filled" : " faint") : "");
        el.title = p ? `${p.name} ${p.hp}/${p.hpMax}` : "Empty";
        ballWrap.appendChild(el);
      }
    }

    const portrait = document.getElementById("player-portrait");
    if (portrait) {
      portrait.src = "/assets/human/portrait.png";
      portrait.onerror = () => {
        portrait.removeAttribute("src");
        portrait.style.background = "#0a0c12";
      };
    }

    this.renderActivePokeStatus();
    this.renderPokebar();
    this.renderBattle();
    this.renderItemWindows();
    this.renderInvOtp();
    this.syncInvShortcutState();
    const out = this.party.out != null ? this.party.slots[this.party.out] : null;
    this.renderHotbar(out);
    this.renderAttackBar(out);
    this.renderOrders();
  }

  tryUseMove(n) {
    if (!n || n < 1 || n > 5) return;
    const outIdx = this.party.out;
    if (outIdx == null) return;
    const out = this.party.slots?.[outIdx];
    if (!out || n > moveCount(out.species)) return;
    if (Date.now() < this.moveCdUntil) return;
    this.net.send({ t: "move", n });
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

  renderActivePokeStatus() {
    const el = document.getElementById("poke-active-status");
    if (!el) return;
    const outIdx = this.party.out;
    const p = outIdx != null ? this.party.slots?.[outIdx] : null;
    if (!p) {
      el.classList.add("hidden");
      el.innerHTML = "";
      return;
    }
    el.classList.remove("hidden");
    const ratio = hpPercent(p.hp, p.hpMax);
    el.innerHTML = `
      <img src="${portraitUrl(p)}" alt="" />
      <div class="pas-text">
        <strong>${p.dexId ? `${p.dexId} ` : ""}[${p.level}] ${p.name}</strong>
        <div class="pas-hp"><span style="width:${Math.round(ratio * 100)}%;background:${hpColorCss(ratio)}"></span></div>
        <span class="pas-hp-num">${p.hp}/${p.hpMax}</span>
      </div>`;
  }

  renderPokebar() {
    const list = document.getElementById("pokebar-list");
    if (!list) return;
    list.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const p = this.party.slots?.[i];
      const isOut = this.party.out === i || this.party.mount?.slot === i;
      const row = document.createElement("div");
      row.className = "poke-slot" + (p ? "" : " empty") + (isOut ? " out" : "");
      row.dataset.slot = String(i);
      row.style.top = `${SLOT_TOPS[i]}px`;

      const bg = document.createElement("div");
      bg.className = "poke-slot-bg";
      row.appendChild(bg);

      if (p) {
        const ratio = Math.max(0, Math.min(1, p.hp / Math.max(1, p.hpMax)));
        const pct = Math.round(ratio * 100);

        const ico = document.createElement("img");
        ico.className = "poke-ico";
        ico.src = portraitUrl(p);
        ico.alt = p.name;
        ico.style.top = `${PORTRAIT_TOPS[i] - SLOT_TOPS[i]}px`;
        row.appendChild(ico);

        const gender = document.createElement("span");
        gender.className = "poke-gender";
        gender.textContent = genderMark(p);
        row.appendChild(gender);

        const name = document.createElement("div");
        name.className = "poke-name";
        name.textContent = `${p.dexId ? `${p.dexId} ` : ""}[${p.level}] ${p.name}`;
        row.appendChild(name);

        const hp = document.createElement("div");
        hp.className = "poke-hp";
        hp.style.top = `${HP_TOPS[i] - SLOT_TOPS[i]}px`;
        hp.innerHTML = `<div class="poke-hp-fill" style="width:${pct}%"></div>`;
        row.appendChild(hp);

        const pctEl = document.createElement("span");
        pctEl.className = "poke-pct";
        pctEl.style.top = `${HP_TOPS[i] - SLOT_TOPS[i] - 1}px`;
        pctEl.textContent = `${pct}%`;
        row.appendChild(pctEl);

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
      const over = ev.target.closest?.(".poke-slot");
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
      if (c.id === this.you?.id) return false;
      if (c.masterId && c.masterId === this.you?.id) return false;
      if (c.dead && !c.wild) return false;
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
      const label = c.dead ? `${c.name} (corpo)` : c.plate || c.name;
      el.innerHTML = `<span>${label}</span><span class="battle-hp"><span style="width:${ratio * 100}%"></span></span>`;
      el.onclick = () => {
        this.net.send({ t: "target", id: c.id });
        if (!c.dead) this.net.send({ t: "walkTo", x: c.x, y: c.y });
      };
      list.appendChild(el);
    }
  }

  inSafeZone() {
    if (!this.you) return false;
    return isCombatSafeZone(this.you.x, this.you.y, {
      spawn: this.mapSpawn,
      flags: this.mapData?.flags,
    });
  }

  cycleInvRod() {
    this.invRodIndex = (this.invRodIndex + 1) % INV_ROD_SPRITES.length;
    const spec = INV_ROD_SPRITES[this.invRodIndex];
    const img = document.getElementById("inv-rod-img");
    const btn = document.getElementById("inv-rod-btn");
    if (img) img.src = spec.src;
    if (btn) btn.title = spec.title;
  }

  renderInvOtp() {
    const slot = document.getElementById("inv-otp-portrait");
    if (!slot) return;
    const outIdx = this.party.out;
    const p = outIdx != null ? this.party.slots?.[outIdx] : null;
    if (!p) {
      slot.innerHTML = "";
      return;
    }
    slot.innerHTML = `<img src="${portraitUrl(p)}" alt="" />`;
  }

  syncInvShortcutState() {
    for (const btn of document.querySelectorAll("#hud-inv [data-inv-win]")) {
      const id = btn.dataset.invWin;
      const open = this.windows.layout[id]?.open && !this.windows.layout[id]?.min;
      btn.classList.toggle("on", !!open);
    }
  }

  layoutItemBoxGrid(grid, winId) {
    const totalRows = itemBoxRowCount(winId);
    const compactRows = Math.min(ITEM_BOX_COMPACT_ROWS, totalRows);
    grid.style.setProperty("--item-box-rows-total", String(totalRows));
    grid.style.setProperty("--item-box-rows-compact", String(compactRows));
  }

  renderItemWindows() {
    this.renderBagWindow();
    this.renderCoinsWindow();
    this.renderPokebagWindow();
    this.renderCatchWindow();
  }

  renderBagWindow() {
    const grid = document.getElementById("bag-grid");
    if (!grid) return;
    this.layoutItemBoxGrid(grid, "bag");
    grid.innerHTML = "";
    const slots = ITEM_BOX_SLOTS.bag;
    const filled = [];
    for (const entry of this.lootBag) {
      if (!entry?.item || entry.count <= 0) continue;
      if (entry.item === "pokeball") continue;
      const meta = ITEM_META[entry.item] || {
        label: entry.item,
        icon: "/assets/items/pokeball.png",
      };
      filled.push({ ...entry, meta: { ...meta, item: entry.item } });
    }
    filled.sort((a, b) => {
      const ca = a.meta.catch ? 0 : 1;
      const cb = b.meta.catch ? 0 : 1;
      return ca - cb;
    });
    for (let i = 0; i < slots; i++) {
      const row = filled[i];
      const cell = document.createElement("div");
      cell.className = "item-box-cell" + (row ? " has-item" : " empty");
      if (row) {
        cell.innerHTML = itemIconHtml(row.meta, row.count);
        cell.title = `${row.meta.label} ×${row.count}`;
        if (row.meta.catch) {
          cell.onclick = (e) => {
            e.stopPropagation();
            this.selectItem(this.selectedItem === row.item ? null : row.item);
          };
        } else if (row.meta.heal) {
          cell.onclick = () => this.net.send({ t: "use", item: row.item });
        }
        cell.classList.toggle("use-with", this.selectedItem === row.item);
      }
      grid.appendChild(cell);
    }
  }

  renderCoinsWindow() {
    const grid = document.getElementById("coins-grid");
    if (!grid) return;
    this.layoutItemBoxGrid(grid, "coins");
    grid.innerHTML = "";
    const slots = ITEM_BOX_SLOTS.coins;
    const gold = Number(this.you?.gold ?? 0);
    const crystal = Math.floor(gold / 10000);
    const platinum = Math.floor((gold % 10000) / 100);
    const coin = Math.floor(gold % 100);
    const stacks = [
      { label: "Crystal Coin", count: crystal, icon: "/assets/hud/playerinfo/trophy.png" },
      { label: "Platinum Coin", count: platinum, icon: "/assets/hud/playerinfo/pokeballs.png" },
      { label: "Gold Coin", count: coin, icon: "/assets/hud/playerinfo/pokeballs.png" },
    ].filter((s) => s.count > 0);
    if (!stacks.length && gold > 0) {
      stacks.push({
        label: "Gold",
        count: Math.round(gold * 100) / 100,
        icon: "/assets/hud/playerinfo/pokeballs.png",
      });
    }
    for (let i = 0; i < slots; i++) {
      const row = stacks[i];
      const cell = document.createElement("div");
      cell.className = "item-box-cell" + (row ? "" : " empty");
      if (row) {
        cell.innerHTML = `<img src="${row.icon}" alt="" /><span class="bag-count">${row.count}</span>`;
        cell.title = `${row.label} ×${row.count} (${gold.toFixed(2)} gp total)`;
      }
      grid.appendChild(cell);
    }
  }

  renderPokebagWindow() {
    const grid = document.getElementById("pokebag-grid");
    if (!grid) return;
    this.layoutItemBoxGrid(grid, "pokebag");
    grid.innerHTML = "";
    const slots = ITEM_BOX_SLOTS.pokebag;
    for (let i = 0; i < slots; i++) {
      const p = this.party.slots?.[i];
      const cell = document.createElement("div");
      cell.className = "item-box-cell" + (p ? " has-mon" : " empty");
      if (p) {
        const out = this.party.out === i;
        const ballIcon = out ? "/assets/items/premierball.png" : "/assets/items/pokeball.png";
        cell.innerHTML = `<img src="${portraitUrl(p)}" alt="" /><img src="${ballIcon}" alt="" style="width:10px;height:10px;left:70%;top:75%" />`;
        cell.title = `[${p.level}] ${p.name} · ${out ? "Ball aberta" : "Ball carregada"}`;
        cell.onclick = () => this.net.send({ t: "pokebar", slot: i });
      } else {
        cell.title = `Slot ${i + 1} vazio`;
      }
      grid.appendChild(cell);
    }
  }

  renderCatchSwapBar() {
    const bar = document.getElementById("catch-swap-bar");
    if (!bar) return;
    const safe = this.inSafeZone();
    const list = this.catchBox || [];
    const pick = this.catchPick;
    if (pick == null || !list[pick]) {
      bar.classList.add("hidden");
      bar.innerHTML = "";
      return;
    }
    const mon = list[pick];
    bar.classList.remove("hidden");
    bar.innerHTML = `<span>Trocar ${mon.name} →</span>`;
    for (let slot = 0; slot < ITEM_BOX_COLS + 1; slot++) {
      if (slot >= 6) break;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(slot + 1);
      btn.title = safe ? `Slot ${slot + 1} do time` : "Só em zona segura";
      btn.disabled = !safe;
      btn.onclick = () => {
        this.net.send({ t: "catchSwap", catchIndex: pick, partySlot: slot });
        this.catchPick = null;
        this.renderCatchWindow();
      };
      bar.appendChild(btn);
    }
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "×";
    cancel.title = "Cancelar";
    cancel.onclick = () => {
      this.catchPick = null;
      this.renderCatchWindow();
    };
    bar.appendChild(cancel);
  }

  renderCatchWindow() {
    const grid = document.getElementById("catch-grid");
    if (!grid) return;
    this.layoutItemBoxGrid(grid, "catch");
    grid.innerHTML = "";
    const slots = ITEM_BOX_SLOTS.catch;
    const list = this.catchBox || [];
    if (this.catchPick != null && !list[this.catchPick]) this.catchPick = null;
    for (let i = 0; i < slots; i++) {
      const mon = list[i];
      const cell = document.createElement("div");
      cell.className =
        "item-box-cell" +
        (mon ? " has-mon" : " empty") +
        (this.catchPick === i ? " catch-pick" : "");
      if (mon) {
        cell.innerHTML = `<img src="${portraitUrl(mon)}" alt="" />`;
        cell.title = `[${mon.level}] ${mon.name} — clique para trocar com o time (zona segura)`;
        cell.onclick = () => {
          this.catchPick = this.catchPick === i ? null : i;
          this.renderCatchWindow();
        };
      }
      grid.appendChild(cell);
    }
    this.renderCatchSwapBar();
  }

  renderAttackBar(out) {
    const bar = document.getElementById("attack-bar");
    if (!bar) return;
    const hasOut = out != null && this.party.out != null;
    bar.classList.toggle("hidden", !hasOut);
    bar.setAttribute("aria-hidden", hasOut ? "false" : "true");
    bar.innerHTML = "";
    if (!hasOut) return;

    const known = moveCount(out.species);
    const now = Date.now();
    const cdLeft = Math.max(0, this.moveCdUntil - now);
    const cdPct = cdLeft > 0 ? cdLeft / 1000 : 0;

    for (let n = 1; n <= 5; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      const on = n <= known;
      btn.className = "attack-slot" + (on ? " on" : " off");
      btn.title = on ? `Ataque ${n}` : "Sem ataque";
      const moveIcon = `/assets/hud/moves/${n}_${on ? "on" : "off"}.png`;
      btn.innerHTML = `<img src="${moveIcon}" alt="" /><span class="attack-key">${n}</span>`;
      if (on && cdPct > 0) {
        btn.innerHTML += `<span class="attack-cd" style="--cd:${cdPct}"></span>`;
      }
      if (on) {
        btn.onclick = () => this.tryUseMove(n);
      }
      bar.appendChild(btn);
    }

    if (cdPct > 0 && !this._attackCdTimer) {
      this._attackCdTimer = window.setTimeout(() => {
        this._attackCdTimer = null;
        const cur =
          this.party.out != null ? this.party.slots[this.party.out] : null;
        if (cur) this.renderAttackBar(cur);
      }, cdLeft + 20);
    }
  }

  renderHotbar(out) {
    const bar = document.getElementById("hotbar");
    if (!bar) return;
    const known = out ? moveCount(out.species) : 0;
    bar.innerHTML = "";
    const now = Date.now();
    const cdLeft = Math.max(0, this.moveCdUntil - now);
    const cdPct = cdLeft > 0 ? cdLeft / 1000 : 0;
    const slots = [
      { key: "Tab", move: 1 },
      { key: "1", move: 2 },
      { key: "2", move: 3 },
      { key: "3", move: 4 },
      { key: "4", move: 5 },
      { key: "F", move: 6 },
      { key: "E", move: 7 },
      { key: "R", move: 8 },
      { key: "A", move: 9 },
      { key: "S", move: 10 },
      { key: "P", item: "premierball" },
      { key: "U", item: "ultraball" },
      { key: "M", item: "masterball" },
    ];
    const row1 = document.createElement("div");
    row1.className = "hot-row";
    const row2 = document.createElement("div");
    row2.className = "hot-row";
    bar.appendChild(row1);
    bar.appendChild(row2);
    slots.forEach((slot, i) => {
      const row = i < 7 ? row1 : row2;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hot-slot";
      if (slot.move) {
        const on = out && slot.move <= known;
        btn.classList.add(on ? "on" : "off");
        const moveIcon = `/assets/hud/moves/${slot.move}_${on ? "on" : "off"}.png`;
        if (on && out) {
          btn.innerHTML = `<img src="${moveIcon}" alt="" /><span class="hot-key">${slot.key}</span>`;
          if (slot.move === 1 && cdPct > 0) {
            btn.innerHTML += `<span class="hot-cd" style="--cd:${cdPct}"></span>`;
          }
          btn.onclick = () => {
            if (Date.now() < this.moveCdUntil) return;
            this.net.send({ t: "move", n: slot.move });
          };
        } else {
          btn.innerHTML = `<img src="${moveIcon}" alt="" /><span class="hot-key">${slot.key}</span>`;
        }
      } else if (slot.item) {
        const entry = this.lootBag.find((b) => b.item === slot.item);
        const count = entry?.count || 0;
        const meta = { ...ITEM_META[slot.item], item: slot.item };
        btn.classList.add(count ? "on" : "off");
        btn.classList.toggle("use-with", this.selectedItem === slot.item);
        const keyHint = slot.key && slot.key.length === 1 ? `<span class="hot-key">${slot.key}</span>` : "";
        btn.innerHTML = `${itemIconHtml(meta, count)}${keyHint}`;
        if (meta.catch) {
          btn.onclick = (e) => {
            e.preventDefault();
            if (!count) return;
            this.selectItem(this.selectedItem === slot.item ? null : slot.item);
          };
        }
      }
      row.appendChild(btn);
    });
  }
}

function portraitUrl(p) {
  const key = p?.species || "caterpie";
  return `/assets/pokemon/${key}/portrait.png`;
}

function moveCount(species) {
  return SPECIES[species]?.moves?.length || 0;
}
