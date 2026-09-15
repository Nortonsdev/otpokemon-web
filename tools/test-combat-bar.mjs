import { barMoveAt, ensureBarMoves } from "../shared/attackBar.js";

const mon = { species: "charmander", level: 5 };
ensureBarMoves(mon);
if (!barMoveAt(mon, 1)) {
  console.error("party mon should have move 1 after ensureBarMoves");
  process.exit(1);
}

const pokeWithout = { id: 1, species: "charmander", masterId: 9 };
if (barMoveAt(pokeWithout, 1)) {
  console.error("out creature without barMoves must not resolve a move");
  process.exit(1);
}

const poke = {
  id: 2,
  species: "charmander",
  masterId: 9,
  barMoves: (mon.barMoves || []).map((m) => ({ ...m })),
};
if (!barMoveAt(poke, 1)) {
  console.error("out creature with copied barMoves must resolve move 1");
  process.exit(1);
}

console.log("ok combat barMoves copy");
