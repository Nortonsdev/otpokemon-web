import evolution from "./data/kantoEvolution.json" with { type: "json" };
import learnsets from "./data/kantoLearnsets.json" with { type: "json" };
import moveMeta from "./data/moveMeta.json" with { type: "json" };
import moveSheet from "./data/moveSheet.json" with { type: "json" };

const DEFAULT_MOVE = {
  name: "tackle",
  power: 40,
  type: "normal",
  tile: moveSheet.moves.tackle || { col: 0, row: 0, index: 0 },
};

/** Slots OTP: básica=4, 2ª evo=6, penúltima/última=8. */
export function attackSlotCount(species) {
  const key = String(species || "").toLowerCase();
  const row = evolution[key];
  if (row?.slots) return row.slots;
  return 4;
}

export function moveSheetCss() {
  const { cols, rows, tile } = moveSheet;
  return {
    cols,
    rows,
    tile,
    width: cols * tile,
    height: rows * tile,
    url: "/assets/hud/wiki-tm-sheet.png",
  };
}

export function moveTileStyle(moveName) {
  const meta = moveMeta[moveName] || moveMeta[DEFAULT_MOVE.name] || DEFAULT_MOVE;
  const tile = meta.tile || DEFAULT_MOVE.tile;
  const sheet = moveSheetCss();
  const x = tile.col * sheet.tile;
  const y = tile.row * sheet.tile;
  return {
    backgroundImage: `url(${sheet.url})`,
    backgroundSize: `${sheet.width}px ${sheet.height}px`,
    backgroundPosition: `-${x}px -${y}px`,
  };
}

/** Moves de level-up já aprendidos na espécie/nível (PokéAPI). */
export function learnsetPool(species, level) {
  const key = String(species || "").toLowerCase();
  const ls = learnsets[key] || {};
  const lv = Math.max(1, Number(level) || 1);
  const pool = [];
  for (const [name, minLevel] of Object.entries(ls)) {
    if (minLevel <= lv) pool.push(name);
  }
  if (!pool.length) pool.push(DEFAULT_MOVE.name);
  return pool;
}

function pickRandom(pool, count, rng = Math.random) {
  const copy = pool.slice();
  const out = [];
  while (out.length < count && copy.length) {
    const i = Math.floor(rng() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  while (out.length < count) out.push(pool[out.length % pool.length]);
  return out;
}

export function buildBarMoves(species, level, rng = Math.random) {
  const slots = attackSlotCount(species);
  const names = pickRandom(learnsetPool(species, level), slots, rng);
  return names.map((name) => {
    const meta = moveMeta[name] || moveMeta[DEFAULT_MOVE.name];
    const power = meta?.power > 0 ? meta.power : 10;
    return {
      name,
      power,
      type: meta?.type || "normal",
      tile: meta?.tile || DEFAULT_MOVE.tile,
    };
  });
}

export function ensureBarMoves(mon, rng = Math.random) {
  if (!mon) return mon;
  const want = attackSlotCount(mon.species);
  if (!Array.isArray(mon.barMoves) || mon.barMoves.length !== want) {
    mon.barMoves = buildBarMoves(mon.species, mon.level, rng);
  }
  return mon;
}

export function barMoveAt(mon, n) {
  if (!mon?.barMoves || n < 1) return null;
  return mon.barMoves[n - 1] || null;
}

export { moveMeta, moveSheet, learnsets, evolution };
