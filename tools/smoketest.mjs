import WebSocket from "ws";

const url = process.env.WS_URL || "ws://127.0.0.1:3001/ws";

function wait(ws, pred, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${pred}`)), timeout);
    const onMsg = (raw) => {
      const msg = JSON.parse(String(raw));
      const ok = typeof pred === "function" ? pred(msg) : msg.t === pred;
      if (ok) {
        clearTimeout(t);
        ws.off("message", onMsg);
        resolve(msg);
      }
    };
    ws.on("message", onMsg);
  });
}

async function session(label) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => {
    ws.on("open", res);
    ws.on("error", rej);
  });
  await wait(ws, "hello");
  const send = (m) => ws.send(JSON.stringify(m));
  return { ws, send, wait: (t) => wait(ws, t), label };
}

const user = "smoketest";
const pass = "smoketest";
const char = "SmokeHero";

const a = await session("first");
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

if (map1.party.out !== 0) {
  a.send({ t: "pokebar", slot: 0 });
  const appear = await a.wait((m) => m.t === "appear" && m.creature?.kind === "pokemon");
  if (appear.creature.look !== 4) throw new Error("released poke look is not Charmander");
  if (appear.creature.masterId !== map1.you.id) throw new Error("master not set");
} else if (!map1.creatures.some((c) => c.kind === "pokemon" && c.masterId === map1.you.id)) {
  throw new Error("out slot set but poke missing from map");
}

let moved = null;
for (const dir of [2, 4, 6, 0, 3, 1, 5, 7]) {
  a.send({ t: "walk", dir });
  const msg = await a.wait(
    (m) => (m.t === "moved" || m.t === "turn") && m.id === map1.you.id
  );
  if (msg.t === "moved" && (msg.x !== start.x || msg.y !== start.y)) {
    moved = msg;
    break;
  }
}
if (!moved) throw new Error("player did not change sqm");

a.ws.close();
await new Promise((r) => setTimeout(r, 400));

const b = await session("reopen");
b.send({ t: "login", user, pass });
await b.wait("welcome");
b.send({ t: "enter", name: char });
const map2 = await b.wait("map");
if (map2.you.x !== moved.x || map2.you.y !== moved.y) {
  throw new Error(`persist failed pos ${map2.you.x},${map2.you.y} expected ${moved.x},${moved.y}`);
}
if (map2.party.slots[0]?.species !== "charmander") throw new Error("party lost");
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
