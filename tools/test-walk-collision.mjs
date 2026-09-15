import { World } from "../server/game.js";
import { walkable } from "../server/map.js";

const world = new World();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(world.isSolidCreature({ kind: "npc", dead: false }), "NPC deve ser sólido");
assert(!world.isSolidCreature({ kind: "wild", dead: false }), "wild não bloqueia");
assert(!world.isSolidCreature({ kind: "player", dead: false }), "player não bloqueia");
assert(!world.isSolidCreature({ kind: "pokemon", dead: false }), "pokémon fora não bloqueia");
assert(!world.isSolidCreature({ kind: "npc", dead: true }), "NPC morto não bloqueia");

const npc = [...world.creatures.values()].find((c) => c.kind === "npc");
assert(npc, "precisa de NPC no mundo demo");
assert(world.blockingOccupant(npc.x, npc.y)?.id === npc.id, "tile do NPC bloqueia");

const wilds = [...world.creatures.values()].filter((c) => c.wild && !c.dead);
assert(wilds.length >= 2, "precisa de 2 wilds para empilhar");
const [a, b] = wilds;
world.vacate(b);
b.x = a.x;
b.y = a.y;
world.occupy(b);
assert(!world.blockingOccupant(a.x, a.y), "dois wilds no mesmo sqm não bloqueiam");

const fakePlayer = {
  id: 999999,
  kind: "player",
  x: a.x,
  y: a.y,
  dir: 0,
  dead: false,
  wild: false,
  busyUntil: 0,
  mount: null,
};
world.creatures.set(fakePlayer.id, fakePlayer);
world.occupy(fakePlayer);
const beforeX = fakePlayer.x;
const beforeY = fakePlayer.y;
world.walk(fakePlayer, 2, false);
assert(
  fakePlayer.x !== beforeX || fakePlayer.y !== beforeY,
  "player deve atravessar sqm com wilds empilhados",
);
world.vacate(fakePlayer);
world.creatures.delete(fakePlayer.id);

let adj = null;
let dirIntoNpc = null;
for (let dir = 0; dir < 8; dir++) {
  const d = [
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
  ][dir];
  const tx = npc.x + d.x;
  const ty = npc.y + d.y;
  if (walkable(tx, ty) && !world.blockingOccupant(tx, ty)) {
    adj = { x: tx, y: ty };
    dirIntoNpc = (dir + 4) % 8;
    break;
  }
}
assert(adj, "tile walkable ao lado do NPC");
const blocker = {
  id: 999998,
  kind: "player",
  x: adj.x,
  y: adj.y,
  dir: 0,
  dead: false,
  wild: false,
  busyUntil: 0,
  mount: null,
};
world.creatures.set(blocker.id, blocker);
world.occupy(blocker);
world.walk(blocker, dirIntoNpc, false);
assert(blocker.x === adj.x && blocker.y === adj.y, "passo no NPC deve ser bloqueado");
world.vacate(blocker);
world.creatures.delete(blocker.id);

console.log("test-walk-collision: ok");
