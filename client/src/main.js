import Phaser from "phaser";
import { Net } from "./net.js";
import { Hud } from "./hud.js";
import { GameScene } from "./gameScene.js";

const net = new Net();
const hud = new Hud(net);

const STARTERS = [
  { id: "bulbasaur", name: "Bulbasaur" },
  { id: "charmander", name: "Charmander" },
  { id: "squirtle", name: "Squirtle" },
];

let selectedStarter = "charmander";
let game = null;

function show(id) {
  for (const el of document.querySelectorAll("#ui > section")) el.classList.add("hidden");
  document.getElementById(id).classList.remove("hidden");
  document.body.classList.toggle("in-game", id === "screen-game");
  document.getElementById("world-scrim").classList.toggle("hidden", id === "screen-game");
}

function msg(el, text) {
  document.getElementById(el).textContent = text || "";
}

function renderChars(chars) {
  const list = document.getElementById("char-list");
  list.innerHTML = "";
  for (const name of chars) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.textContent = `Enter ${name}`;
    btn.onclick = () => net.send({ t: "enter", name });
    li.appendChild(btn);
    list.appendChild(li);
  }
  const box = document.getElementById("starters");
  box.innerHTML = "";
  for (const s of STARTERS) {
    const div = document.createElement("div");
    div.className = "starter" + (s.id === selectedStarter ? " selected" : "");
    div.innerHTML = `<img src="/assets/pokemon/${s.id}/portrait.png" alt="${s.name}" /><div>${s.name}</div>`;
    div.onclick = () => {
      selectedStarter = s.id;
      renderChars(chars);
    };
    box.appendChild(div);
  }
}

function ensureGame() {
  if (game) return game;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: "#111111",
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scene: [new GameScene(net, hud)],
    scale: { mode: Phaser.Scale.RESIZE },
    render: { pixelArt: true, roundPixels: true, antialias: false },
  });
  return game;
}

net.on("hello", () => {});
net.on("err", (m) => {
  msg("login-msg", m.text);
  msg("char-msg", m.text);
  hud.log(m.text);
});
net.on("info", (m) => hud.log(m.text));
net.on("welcome", (m) => {
  show("screen-chars");
  renderChars(m.chars || []);
});
net.on("map", (m) => {
  show("screen-game");
  hud.bindGame();
  const g = ensureGame();
  const scene = g.scene.getScene("game");
  if (scene && scene.enterWorld) scene.enterWorld(m);
});
net.on("loggedOut", () => {
  show("screen-login");
  const scene = game?.scene.getScene("game");
  scene?.enterPreview();
});
net.on("*", (m) => {
  if (game) {
    const scene = game.scene.getScene("game");
    if (scene && scene.handleNet) scene.handleNet(m);
  }
  hud.handle(m);
});

document.getElementById("btn-login").onclick = () => {
  net.send({
    t: "login",
    user: document.getElementById("user").value,
    pass: document.getElementById("pass").value,
  });
};
document.getElementById("btn-register").onclick = () => {
  net.send({
    t: "register",
    user: document.getElementById("user").value,
    pass: document.getElementById("pass").value,
  });
};
document.getElementById("btn-create").onclick = () => {
  net.send({
    t: "create",
    name: document.getElementById("char-name").value,
    starter: selectedStarter,
  });
};

ensureGame();
net.connect().catch((err) => msg("login-msg", err.message));
