import WebSocket from "ws";
import { getMaxHealth } from "../server/species.js";

if (getMaxHealth({ hp: 39 }, 5) !== 18) throw new Error("Charmander lv5 max HP");
if (getMaxHealth({ hp: 45 }, 2) !== 13) throw new Error("Caterpie lv2 max HP");

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
const starterHp = map1.party.slots[0].hpMax;
if (starterHp !== 18) {
  throw new Error(`starter hpMax ${starterHp} (Charmander lv5 without IVs should be 18)`);
}

let outId = map1.creatures.find((c) => c.kind === "pokemon" && c.masterId === map1.you.id)?.id || null;
if (map1.party.out !== 0) {
  a.send({ t: "pokebar", slot: 0 });
  const appear = await a.wait((m) => m.t === "appear" && m.creature?.kind === "pokemon");
  if (appear.creature.look !== 4) throw new Error("released poke look is not Charmander");
  if (appear.creature.masterId !== map1.you.id) throw new Error("master not set");
  outId = appear.creature.id;
} else if (!outId) {
  throw new Error("out slot set but poke missing from map");
} else {
  const existing = map1.creatures.find((c) => c.id === outId);
  if (existing?.plate && !String(existing.plate).startsWith("Charmander [5]")) {
    throw new Error(`out plate ${existing.plate}`);
  }
  if (existing && existing.hpMax !== 18) {
    throw new Error(`out Charmander hpMax ${existing.hpMax}`);
  }
}

const wild = map1.creatures.find((c) => c.wild && (c.species === "caterpie" || c.look === 10));
if (!wild) throw new Error("no wild Caterpie on map");
if (wild.hpMax !== 13) {
  throw new Error(`wild hpMax ${wild.hpMax} (Caterpie lv2 without IVs should be 13)`);
}
if (!String(wild.plate || "").startsWith("Caterpie [2]")) throw new Error(`wild plate ${wild.plate}`);
const wildZard = map1.creatures.find((c) => c.wild && (c.species === "charizard" || c.look === 6));
const wildDash = map1.creatures.find((c) => c.wild && (c.species === "rapidash" || c.look === 78));
if (!wildZard) throw new Error("no wild Charizard on map");
if (!wildDash) throw new Error("no wild Rapidash on map");
if (wildZard.hpMax !== wild.hpMax) throw new Error(`wild Charizard hpMax ${wildZard.hpMax} != Caterpie`);
if (wildDash.hpMax !== wild.hpMax) throw new Error(`wild Rapidash hpMax ${wildDash.hpMax} != Caterpie`);

a.send({ t: "pokebar", slot: 0 });
await a.wait((m) => m.t === "disappear" && m.id === outId);
a.send({ t: "attack", id: wild.id });
const noOut = await a.wait((m) => m.t === "info" && /Pokémon fora/.test(m.text || ""), 800);
if (!noOut) throw new Error("expected precisa ter um Pokémon fora");
const punch = await a.wait((m) => m.t === "fx" || (m.t === "info" && /causou |used /.test(m.text || "")), 400).then(
  (m) => m,
  () => null
);
if (punch) throw new Error("attacked without an out Pokémon");
a.send({ t: "pokebar", slot: 0 });
const reout = await a.wait((m) => m.t === "appear" && m.creature?.kind === "pokemon");
outId = reout.creature.id;
if (!String(reout.creature.plate || "").startsWith("Charmander [5]")) {
  throw new Error(`out plate ${reout.creature.plate}`);
}
if (reout.creature.hpMax !== 18) {
  throw new Error(`out Charmander hpMax ${reout.creature.hpMax}`);
}

a.send({ t: "attack", id: wild.id });
let hit = null;
for (let i = 0; i < 10 && !hit; i++) {
  if (i) a.send({ t: "attack", id: wild.id });
  hit = await a
    .wait((m) => (m.t === "fx" && m.to === wild.id) || (m.t === "info" && /causou /.test(m.text || "")), 500)
    .then((m) => m, () => null);
  if (!hit) await new Promise((r) => setTimeout(r, 220));
}
if (!hit) throw new Error("right-click attack did not fire M1");
if (hit.t === "fx" && hit.from === map1.you.id) throw new Error("damage must come from the out Pokémon");
if (hit.t === "fx" && hit.from !== outId) throw new Error("M1 fromId is not the out Pokémon");
if (hit.t === "fx" && hit.hp === 0) throw new Error("first M1 one-shot the Caterpie");
if (hit.t === "down") throw new Error("first M1 one-shot the Caterpie");

let prey = wild;
a.send({ t: "use", item: "pokeball", id: prey.id });
const liveReject = await a.wait((m) => m.t === "info" && /vivo/.test(m.text || ""), 2500);
if (!liveReject) throw new Error("expected live Pokémon to reject the ball");

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

async function knockDown(id) {
  for (let i = 0; i < 16; i++) {
    a.send({ t: "attack", id });
    const m = await a
      .wait(
        (x) =>
          (x.t === "fx" && x.to === id) ||
          (x.t === "down" && x.id === id) ||
          (x.t === "info" && /já foi derrotado/.test(x.text || "")),
        1200
      )
      .then((x) => x, () => null);
    if (!m) {
      await new Promise((r) => setTimeout(r, 1100));
      continue;
    }
    if (m.t === "down") return;
    if (m.t === "info" && /já foi derrotado/.test(m.text || "")) return;
    if (m.t === "fx" && m.hp === 0) {
      await a.wait((x) => x.t === "down" && x.id === id, 1200);
      return;
    }
    await new Promise((r) => setTimeout(r, 1050));
  }
  throw new Error("could not KO Caterpie (expected 4–6 M1s, not a one-shot)");
}

await knockDown(prey.id);

const catCount = (slots) => (slots || []).filter((s) => s?.species === "caterpie").length;
const catsBefore = catCount(map1.party.slots);
let caught = false;
let partyState = map1.party;
for (let i = 0; i < 10 && !caught; i++) {
  a.send({ t: "use", item: "pokeball", id: prey.id });
  const msg = await a.wait(
    (m) => m.t === "info" && /Catch successful|escapou|vivo|cheia|Pokébolas|alvo/.test(m.text || ""),
    3000
  );
  if (/vivo/.test(msg.text || "")) throw new Error("ball accepted a living Pokémon");
  if (/Catch successful/.test(msg.text || "")) {
    caught = true;
    const extra = await a.wait((m) => m.t === "party" && catCount(m.party.slots) > catsBefore, 2000);
    partyState = extra.party;
    const got = extra.party.slots.find((s) => s?.species === "caterpie");
    if (got && got.hp !== got.hpMax) throw new Error(`caught Caterpie HP ${got.hp}/${got.hpMax}, expected full`);
    break;
  }
  if (/escapou/.test(msg.text || "")) {
    await a.wait((m) => m.t === "disappear" && m.id === prey.id, 2000);
    const spawn = await a.wait((m) => m.t === "appear" && m.creature?.wild && !m.creature.dead, 12000);
    prey = spawn.creature;
    await knockDown(prey.id);
    continue;
  }
  throw new Error(`unexpected catch result: ${msg.text}`);
}
if (!caught) throw new Error("failed to catch Caterpie with use-with on corpse");

const catSlot = (partyState.slots || []).findIndex((s) => s?.species === "caterpie");
if (catSlot < 0) throw new Error("caught Caterpie missing from party slots");
a.send({ t: "pokebar", slot: catSlot });
const swapped = await a.wait((m) => m.t === "appear" && m.creature?.kind === "pokemon");
if (swapped.creature.look !== 10) throw new Error(`swap out look ${swapped.creature.look}, expected Caterpie`);
if (swapped.creature.masterId !== map1.you.id) throw new Error("swap out master not player");
if (catSlot !== 0) {
  a.send({ t: "partyOrder", from: catSlot, to: 0 });
  const ordered = await a.wait((m) => m.t === "party" && m.party?.slots?.[0]?.species === "caterpie");
  if (ordered.party.out !== 0) throw new Error("out slot did not follow partyOrder");
} else if (partyState.out !== 0) {
  throw new Error("out slot did not follow pokebar swap");
}

const hudLayout = {
  pokebar: { x: 44, y: 88, open: true, locked: false, min: false },
};
a.send({ t: "hud", layout: hudLayout });
await new Promise((r) => setTimeout(r, 250));

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
if (!map2.party.slots.some((s) => s?.species === "charmander")) throw new Error("party lost");
if (!map2.party.slots.some((s) => s?.species === "caterpie")) throw new Error("caught Caterpie not persisted");
if (map2.party.slots[0]?.species !== "caterpie") throw new Error("partyOrder not persisted");
if (map2.hud?.pokebar?.x !== 44 || map2.hud?.pokebar?.locked !== false) {
  throw new Error("hud layout not persisted");
}
const out = map2.creatures.find((c) => c.kind === "pokemon" && c.masterId === map2.you.id);
if (!out) throw new Error("out pokemon was not restored");
b.ws.close();

const d = connect();
await d.open;
await d.wait("hello");
d.send({ t: "login", user: "demo", pass: "demo" });
const demoWelcome = await d.wait("welcome");
const demoChar = demoWelcome.chars?.[0];
if (!demoChar) throw new Error("demo account has no character");
d.send({ t: "enter", name: demoChar });
const demoMap = await d.wait("map");
if (!demoMap.party.slots.some((s) => s?.species === "charizard")) throw new Error("demo missing Charizard");
if (!demoMap.party.slots.some((s) => s?.species === "rapidash")) throw new Error("demo missing Rapidash");
const flySlot = demoMap.party.slots.findIndex((s) => s?.species === "charizard");
if (demoMap.party.out !== flySlot) {
  d.send({ t: "pokebar", slot: flySlot });
  await d.wait((m) => m.t === "appear" && m.creature?.species === "charizard");
}
d.send({ t: "order", ability: "fly" });
const flew = await d.wait((m) => m.t === "outfit" && m.creature?.mount?.ability === "fly");
if (flew.creature.kind !== "player") throw new Error("fly must outfit the player");
if (flew.creature.mount.species !== "charizard") throw new Error("fly mount is not Charizard");
d.send({ t: "order", ability: "fly" });
await d.wait((m) => m.t === "outfit" && !m.creature?.mount);
await d.wait((m) => m.t === "appear" && m.creature?.species === "charizard");
const rideSlot = demoMap.party.slots.findIndex((s) => s?.species === "rapidash");
d.send({ t: "pokebar", slot: rideSlot });
await d.wait((m) => m.t === "appear" && m.creature?.species === "rapidash");
d.send({ t: "order", ability: "ride" });
const rode = await d.wait((m) => m.t === "outfit" && m.creature?.mount?.ability === "ride");
if (rode.creature.mount.species !== "rapidash") throw new Error("ride mount is not Rapidash");
d.send({ t: "order", ability: "hide" });
const noHide = await d.wait((m) => m.t === "info", 800).then((m) => m, () => null);
if (noHide && /Hide!/.test(noHide.text || "")) throw new Error("Rapidash must not Hide");
console.log("SMOKE OK", {
  start,
  walked: { x: moved.x, y: moved.y },
  restored: { x: map2.you.x, y: map2.you.y },
  out: out.plate,
  demo: demoChar,
  fly: flew.creature.mount,
  ride: rode.creature.mount,
});
d.ws.close();
process.exit(0);
