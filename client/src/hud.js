const LOOK_FILE = {
  1: "bulbasaur",
  4: "charmander",
  7: "squirtle",
  10: "caterpie",
};

export class Hud {
  constructor(net) {
    this.net = net;
    this.party = { slots: [], out: null, count: 0 };
    this.you = null;
    this.bound = false;
  }

  bindGame() {
    if (this.bound) return;
    this.bound = true;
    document.getElementById("chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const text = e.target.value.trim();
        e.target.value = "";
        if (!text) return;
        if (text.toLowerCase() === "catch") this.net.send({ t: "catch" });
        else this.net.send({ t: "say", text });
      }
    });
  }

  log(text) {
    const log = document.getElementById("chat-log");
    if (!log) return;
    const line = document.createElement("div");
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  handle(msg) {
    if (msg.t === "map") {
      this.you = msg.you;
      this.party = msg.party;
      this.render();
    }
    if (msg.t === "party") {
      this.party = msg.party;
      this.render();
    }
    if (msg.t === "say") this.log(`${msg.name}: ${msg.text}`);
    if (msg.t === "info" || msg.t === "err") this.log(msg.text);
    if (msg.t === "moved" && this.you && msg.id === this.you.id) {
      this.you.x = msg.x;
      this.you.y = msg.y;
      this.you.dir = msg.dir;
    }
    if (msg.t === "fx") this.log(`Hit for ${msg.dmg}.`);
  }

  render() {
    const count = Math.min(6, this.party.count || 0);
    document.getElementById("pokecount").src = `/assets/hud/pokeball${count}.png`;
    const hp = this.you?.hp ?? 150;
    const hpMax = this.you?.hpMax ?? 150;
    document.getElementById("player-hp-text").textContent = `${hp} / ${hpMax}`;
    document.getElementById("player-hp-fill").style.width = `${(hp / hpMax) * 100}%`;

    const out = this.party.out != null ? this.party.slots[this.party.out] : null;
    const icon = document.getElementById("poke-hp-icon");
    const pokeText = document.getElementById("poke-hp-text");
    const pokeFill = document.getElementById("poke-hp-fill");
    if (!out) {
      icon.src = "/assets/hud/pokehealth_bar_off.png";
      pokeText.textContent = "";
      pokeFill.style.width = "0%";
    } else {
      icon.src = "/assets/hud/pokehealth_bar_on.png";
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

    const moves = document.getElementById("moves");
    moves.innerHTML = "";
    const known = out ? moveCount(out.species) : 0;
    for (let i = 1; i <= 10; i++) {
      const on = out && i <= known;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "move" + (on ? "" : " off");
      btn.title = on ? `M${i}` : `M${i}`;
      btn.innerHTML = `<img src="/assets/hud/moves/${i}_${on ? "on" : "off"}.png" alt="M${i}" /><span>M${i}</span>`;
      if (on) btn.onclick = () => this.net.send({ t: "move", n: i });
      moves.appendChild(btn);
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
