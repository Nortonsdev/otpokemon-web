import { WindowManager } from "./windows.js";

const LOOK_FILE = {
  1: "bulbasaur",
  4: "charmander",
  7: "squirtle",
  10: "caterpie",
};

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
  const look = LOOK_FILE[p.look] || "caterpie";
  return `/assets/pokemon/${look}/portrait.png`;
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
    this.renderBags();
    this.renderHotbar();
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.selectItem(null);
    });
  }

  selectItem(item) {
    if (item === "pokeball") {
      const balls = this.bag.find((i) => i.item === "pokeball");
      if (!balls?.count) item = null;
    }
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
    const el = document.getElementById("hud-target-name");
    if (el) el.textContent = creature ? creature.plate || creature.name : "Sem alvo";
    this.renderBattle();
  }

  handle(msg) {
    if (msg.t === "map") {
      this.you = msg.you;
      this.party = msg.party;
      this.bag = msg.bag || [];
      this.creatures = new Map((msg.creatures || []).map((c) => [c.id, c]));
      if (msg.hud) this.windows.merge(msg.hud);
      if (this.bound) this.windows.applyAll();
      this.render();
    }
    if (msg.t === "party") {
      this.party = msg.party;
      this.bag = msg.bag || this.bag;
      this.render();
    }
    if (msg.t === "say") this.log(`${msg.name}: ${msg.text}`, "local");
    if (msg.t === "info") this.log(msg.text, /causou |Pegou|escapou|vivo|derrotado/.test(msg.text) ? "combate" : "sistema");
    if (msg.t === "err") this.log(msg.text, "sistema");
    if (msg.t === "moved" && this.you && msg.id === this.you.id) {
      this.you.x = msg.x;
      this.you.y = msg.y;
      this.you.dir = msg.dir;
    }
    if (msg.t === "moved") {
      const c = this.creatures.get(msg.id);
      if (c) {
        c.x = msg.x;
        c.y = msg.y;
      }
    }
    if (msg.t === "appear") {
      this.creatures.set(msg.creature.id, msg.creature);
      this.renderBattle();
    }
    if (msg.t === "disappear") {
      this.creatures.delete(msg.id);
      if (this.target?.id === msg.id) this.setTarget(null);
      else this.renderBattle();
    }
    if (msg.t === "down") {
      const c = this.creatures.get(msg.id);
      if (c) {
        c.dead = true;
        c.hp = 0;
        c.plate = `${c.name} [${c.level || 5}]  0/${c.hpMax}`;
      }
      this.renderBattle();
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
  }

  render() {
    const nameEl = document.getElementById("hud-name");
    if (!nameEl) return;
    nameEl.textContent = this.you?.name || "—";
    document.getElementById("hud-level").textContent = this.you?.level || 1;

    const hp = this.you?.hp ?? 150;
    const hpMax = this.you?.hpMax ?? 150;
    document.getElementById("player-hp-text").textContent = `${hp} / ${hpMax}`;
    document.getElementById("player-hp-fill").style.width = `${(hp / hpMax) * 100}%`;

    const out = this.party.out != null ? this.party.slots[this.party.out] : null;
    const pokeText = document.getElementById("poke-hp-text");
    const pokeFill = document.getElementById("poke-hp-fill");
    const outTitle = document.getElementById("out-title");
    const outImg = document.getElementById("out-portrait");
    if (!out) {
      pokeText.textContent = "0 / 0";
      pokeFill.style.width = "0%";
      if (outTitle) outTitle.textContent = "Nenhum Pokémon fora";
      if (outImg) outImg.removeAttribute("src");
    } else {
      pokeText.textContent = `${out.hp} / ${out.hpMax}`;
      pokeFill.style.width = `${(out.hp / Math.max(1, out.hpMax)) * 100}%`;
      if (outTitle) outTitle.textContent = `[${out.level}] ${out.name}`;
      if (outImg) outImg.src = portraitUrl(out);
    }

    this.renderPokebar();
    this.renderBattle();
    this.renderBags();
    this.renderHotbar(out);
  }

  renderPokebar() {
    const list = document.getElementById("pokebar-list");
    if (!list) return;
    list.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const p = this.party.slots?.[i];
      const row = document.createElement("div");
      const isOut = this.party.out === i;
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
    const balls = this.bag.find((i) => i.item === "pokeball");
    const fillGrid = (id, count, first) => {
      const grid = document.getElementById(id);
      if (!grid) return;
      grid.innerHTML = "";
      for (let i = 0; i < count; i++) {
        const cell = document.createElement("div");
        cell.className = "bag-cell";
        if (i === 0 && first) {
          cell.classList.add("has-item");
          if (this.selectedItem === "pokeball") cell.classList.add("use-with");
          cell.innerHTML = `<img class="portrait" src="/assets/hud/slots/pokeball.png" alt="ball" style="width:24px;height:24px;image-rendering:pixelated" /><span class="bag-count">${first}</span>`;
          cell.title = `Pokébola ×${first} — botão direito para usar`;
          cell.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.selectItem(this.selectedItem === "pokeball" ? null : "pokeball");
          };
        }
        grid.appendChild(cell);
      }
    };
    fillGrid("bolsa", 10, balls?.count || 0);
    fillGrid("mochila", 10, 0);
  }

  renderHotbar(out) {
    const bar = document.getElementById("hotbar");
    if (!bar) return;
    const known = out ? moveCount(out.species) : 0;
    bar.innerHTML = "";
    for (let i = 1; i <= 20; i++) {
      const n = i <= 10 ? i : i - 10;
      const on = out && i <= 10 && n <= known;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hot-slot" + (on ? " on" : " off");
      btn.title = i <= 10 ? `M${n}` : "";
      if (i <= 10) {
        btn.innerHTML = `<img src="/assets/hud/moves/${n}_${on ? "on" : "off"}.png" alt="M${n}" /><span>M${n}</span>`;
        if (on) btn.onclick = () => this.net.send({ t: "move", n });
      } else if (i === 11) {
        const balls = this.bag.find((b) => b.item === "pokeball");
        const count = balls?.count || 0;
        btn.className = "hot-slot on" + (this.selectedItem === "pokeball" ? " use-with" : "");
        btn.title = count ? `Pokébola ×${count} — botão direito para usar` : "Pokébola";
        btn.innerHTML = `<img src="/assets/hud/slots/pokeball.png" alt="ball" /><span>${count}</span>`;
        btn.oncontextmenu = (e) => {
          e.preventDefault();
          this.selectItem(this.selectedItem === "pokeball" ? null : "pokeball");
        };
      } else {
        btn.textContent = "+";
      }
      bar.appendChild(btn);
    }
  }
}

function moveCount(species) {
  if (species === "bulbasaur") return 2;
  if (species === "charmander") return 1;
  if (species === "squirtle") return 1;
  if (species === "caterpie") return 1;
  return 0;
}
