import WebSocket from "ws";

const url = process.env.WS_URL || "ws://127.0.0.1:3001/ws";

function connect() {
  const ws = new WebSocket(url);
  const queued = [];
  const waiters = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    const idx = waiters.findIndex((w) => w.pred(msg));
    if (idx >= 0) {
      const [w] = waiters.splice(idx, 1);
      w.resolve(msg);
    } else queued.push(msg);
  });
  const wait = (pred, timeout = 5000) =>
    new Promise((resolve, reject) => {
      const fn = typeof pred === "function" ? pred : (m) => m.t === pred;
      const hit = queued.findIndex(fn);
      if (hit >= 0) return resolve(queued.splice(hit, 1)[0]);
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${pred}`)), timeout);
      waiters.push({
        pred: fn,
        resolve: (msg) => {
          clearTimeout(t);
          resolve(msg);
        },
      });
    });
  const send = (m) => ws.send(JSON.stringify(m));
  const open = new Promise((res, rej) => {
    ws.on("open", res);
    ws.on("error", rej);
  });
  return { ws, send, wait, open };
}

const user = "smoketest";
const pass = "smoketest";
const char = "SmokeHero";

const a = connect();
await a.open;
await a.wait("hello");
a.send({ t: "login", user, pass });
let welcome = await a.wait((m) => m.t === "welcome" || m.t === "err");
if (welcome.t === "err") {
  a.send({ t: "register", user, pass });
  welcome = await a.wait("welcome");
}
if (!welcome.chars?.includes(char)) {
  a.send({ t: "create", name: char, starter: "charmander" });
  welcome = await a.wait((m) => m.t === "welcome" || m.t === "err");
  if (welcome.t === "err") throw new Error(welcome.text);
}
a.send({ t: "enter", name: char });
const map1 = await a.wait("map");
const start = { x: map1.you.x, y: map1.you.y };
if (map1.you.kind !== "player") throw new Error("player must be human, not pokemon");
if (map1.party.slots[0]?.species !== "charmander") throw new Error("starter missing");

let outId = map1.creatures.find((c) => c.kind === "pokemon" && c.masterId === map1.you.id)?.id || null;
if (map1.party.out !== 0) {
  a.send({ t: "pokebar", slot: 0 });
  const appear = await a.wait((m) => m.t === "appear" && m.creature?.kind === "pokemon");
  if (appear.creature.look !== 4) throw new Error("released poke look is not Charmander");
  if (appear.creature.masterId !== map1.you.id) throw new Error("master not set");
  outId = appear.creature.id;
} else if (!outId) {
  throw new Error("out slot set but poke missing from map");
}

const wild = map1.creatures.find((c) => c.wild);
if (!wild) throw new Error("no wild Caterpie on map");

a.send({ t: "pokebar", slot: 0 });
await a.wait((m) => m.t === "disappear" && m.id === outId);
a.send({ t: "attack", id: wild.id });
const punch = await a.wait((m) => m.t === "fx" || (m.t === "info" && /used /.test(m.text || "")), 400).then(
  (m) => m,
  () => null
);
if (punch) throw new Error("attacked without an out Pokémon");
a.send({ t: "pokebar", slot: 0 });
const reout = await a.wait((m) => m.t === "appear" && m.creature?.kind === "pokemon");
outId = reout.creature.id;

a.send({ t: "attack", id: wild.id });
const hit = await a.wait((m) => m.t === "fx" || (m.t === "info" && /used /.test(m.text || "")));
if (!hit) throw new Error("right-click attack did not fire M1");

let moved = null;
for (const dir of [2, 4, 6, 0, 3, 1, 5, 7]) {
  a.send({ t: "walk", dir });
  const msg = await a.wait((m) => (m.t === "moved" || m.t === "turn") && m.id === map1.you.id);
  if (msg.t === "moved" && (msg.x !== start.x || msg.y !== start.y)) {
    moved = msg;
    break;
  }
}
if (!moved) throw new Error("player did not change sqm");

a.send({ t: "attack", id: wild.id });
let caught = false;
for (let i = 0; i < 12; i++) {
  a.send({ t: "catch" });
  const msg = await a.wait((m) => m.t === "info" || m.t === "party" || m.t === "disappear");
  if (msg.t === "disappear" && msg.id === wild.id) {
    caught = true;
    break;
  }
  if (msg.t === "party" && msg.party.slots.some((s) => s?.species === "caterpie")) {
    caught = true;
    break;
  }
  if (msg.t === "info" && /Gotcha/.test(msg.text)) {
    caught = true;
    break;
  }
}
if (!caught) throw new Error("failed to catch Caterpie");

a.ws.close();
await new Promise((r) => setTimeout(r, 400));

const b = connect();
await b.open;
await b.wait("hello");
b.send({ t: "login", user, pass });
await b.wait("welcome");
b.send({ t: "enter", name: char });
const map2 = await b.wait("map");
if (map2.you.x !== moved.x || map2.you.y !== moved.y) {
  throw new Error(`persist failed pos ${map2.you.x},${map2.you.y} expected ${moved.x},${moved.y}`);
}
if (map2.party.slots[0]?.species !== "charmander") throw new Error("party lost");
if (!map2.party.slots.some((s) => s?.species === "caterpie")) throw new Error("caught Caterpie not persisted");
const out = map2.creatures.find((c) => c.kind === "pokemon" && c.masterId === map2.you.id);
if (!out) throw new Error("out pokemon was not restored");
console.log("SMOKE OK", {
  start,
  walked: { x: moved.x, y: moved.y },
  restored: { x: map2.you.x, y: map2.you.y },
  out: out.plate,
});
b.ws.close();
process.exit(0);
