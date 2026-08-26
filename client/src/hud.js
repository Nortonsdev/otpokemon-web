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

export class Hud {
  constructor(net) {
    this.net = net;
    this.party = { slots: [], out: null, count: 0 };
    this.you = null;
    this.bag = [];
    this.bound = false;
    this.channel = "local";
    this.lines = [];
    this.target = null;
  }

  bindGame() {
    if (this.bound) return;
    this.bound = true;
    const sendChat = () => {
      const input = document.getElementById("chat-input");
      const text = input.value.trim();
      input.value = "";
      if (!text) return;
      if (text.toLowerCase() === "catch") this.net.send({ t: "catch" });
      else this.net.send({ t: "say", text });
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
    if (!el) return;
    el.textContent = creature ? creature.plate || creature.name : "Sem alvo";
  }

  handle(msg) {
    if (msg.t === "map") {
      this.you = msg.you;
      this.party = msg.party;
      this.bag = msg.bag || [];
      this.render();
    }
    if (msg.t === "party") {
      this.party = msg.party;
      this.bag = msg.bag || this.bag;
      this.render();
    }
    if (msg.t === "say") this.log(`${msg.name}: ${msg.text}`, "local");
    if (msg.t === "info") this.log(msg.text, /Hit for|used |fled|Gotcha|broke free/.test(msg.text) ? "combate" : "sistema");
    if (msg.t === "err") this.log(msg.text, "sistema");
    if (msg.t === "moved" && this.you && msg.id === this.you.id) {
      this.you.x = msg.x;
      this.you.y = msg.y;
      this.you.dir = msg.dir;
    }
    if (msg.t === "fx") this.log(`Hit for ${msg.dmg}.`, "combate");
    if (msg.t === "target") {
      this.setTarget({ id: msg.id, name: msg.name, plate: msg.plate });
    }
    if (msg.t === "appear" && this.target?.id === msg.creature?.id) this.setTarget(msg.creature);
    if (msg.t === "disappear" && this.target?.id === msg.id) this.setTarget(null);
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
    if (!out) {
      pokeText.textContent = "0 / 0";
      pokeFill.style.width = "0%";
    } else {
      pokeText.textContent = `${out.hp} / ${out.hpMax}`;
      pokeFill.style.width = `${(out.hp / out.hpMax) * 100}%`;
    }

    const slots = document.getElementById("slots");
    slots.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const p = this.party.slots?.[i];
      const el = document.createElement("div");
      el.className = "slot" + (p ? "" : " empty") + (this.party.out === i ? " out" : "");
      const look = p ? LOOK_FILE[p.look] : null;
      const ratio = p ? Math.max(0, Math.min(1, p.hp / Math.max(1, p.hpMax))) : 0;
      el.innerHTML = p
        ? `<img class="portrait" src="/assets/pokemon/${look}/portrait.png" alt="${p.name}" />
           <div class="slot-hp"><div class="slot-hp-fill" style="width:${ratio * 100}%"></div></div>`
        : `<img class="portrait" src="/assets/hud/slots/pokeball.png" alt="empty" />`;
      el.title = p ? `${p.name} [${p.level}] ${p.hp}/${p.hpMax}` : "empty";
      el.onclick = () => this.net.send({ t: "pokebar", slot: i });
      slots.appendChild(el);
    }

    this.renderBags();
    this.renderHotbar(out);
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
          cell.innerHTML = `<img class="portrait" src="/assets/hud/slots/pokeball.png" alt="ball" style="width:24px;height:24px;image-rendering:pixelated" /><span class="bag-count">${first}</span>`;
          cell.title = `Poké Ball ×${first}`;
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
