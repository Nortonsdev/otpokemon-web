/**
 * Gera learnsets Kanto (PokéAPI), estágios evolutivos e sprite sheet de ícones de moves.
 * Saída: shared/data/*.json + client/public/assets/hud/wiki-tm-sheet.png
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { KANTO_DEX, KANTO_BY_SLUG } from "../shared/kantoDex.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "shared/data");
const SHEET_PATH = path.join(ROOT, "client/public/assets/hud/wiki-tm-sheet.png");

const COLS = 15;
const TILE = 32;
const TYPE_RGB = {
  normal: [168, 168, 120],
  fire: [240, 128, 48],
  water: [104, 144, 240],
  electric: [248, 208, 48],
  grass: [120, 200, 80],
  ice: [152, 216, 216],
  fighting: [192, 48, 40],
  poison: [160, 64, 160],
  ground: [224, 192, 104],
  flying: [168, 144, 240],
  psychic: [248, 88, 136],
  bug: [168, 184, 32],
  rock: [184, 160, 56],
  ghost: [112, 88, 152],
  dragon: [112, 56, 248],
  dark: [112, 88, 72],
  steel: [184, 184, 208],
  fairy: [238, 153, 172],
};

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "otpokemon-web-build" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function speciesEvolution(slug, number) {
  const sp = await fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${number}/`);
  await sleep(35);
  const chain = await fetchJson(sp.evolution_chain.url);
  await sleep(35);

  function extendKantoPath(node, trail) {
    let path = trail.slice();
    for (const child of node.evolves_to || []) {
      const apiName = child.species.name.replace(/-/g, "_");
      if (!KANTO_BY_SLUG[apiName]) continue;
      path = extendKantoPath(child, [...path, apiName]);
    }
    return path;
  }

  function findPath(node, trail) {
    const apiName = node.species.name.replace(/-/g, "_");
    const nextTrail = KANTO_BY_SLUG[apiName] ? [...trail, apiName] : trail;
    const norm = slug.replace(/-/g, "_");
    if (apiName === norm) return extendKantoPath(node, nextTrail);
    for (const child of node.evolves_to || []) {
      const hit = findPath(child, nextTrail);
      if (hit) return hit;
    }
    return null;
  }
  const norm = slug.replace(/-/g, "_");
  const path = findPath(chain.chain, []) || [norm];
  const chainLength = path.length;
  const stageIndex = Math.max(0, path.indexOf(norm));
  return { stageIndex, chainLength: Math.max(1, chainLength) };
}

async function speciesLearnset(slug, number) {
  const pk = await fetchJson(`https://pokeapi.co/api/v2/pokemon/${number}/`);
  await sleep(35);
  const moves = new Map();
  for (const entry of pk.moves) {
    const name = entry.move.name;
    let bestLevel = 999;
    let ok = false;
    for (const v of entry.version_group_details) {
      if (v.move_learn_method.name !== "level-up") continue;
      if (v.level_learned_at <= bestLevel) {
        bestLevel = v.level_learned_at;
        ok = true;
      }
    }
    if (ok) moves.set(name, bestLevel);
  }
  return Object.fromEntries(moves);
}

function attackSlotCount(stageIndex, chainLength) {
  if (stageIndex === 0) return 4;
  if (chainLength === 2 && stageIndex === 1) return 8;
  if (chainLength >= 3 && stageIndex === 1) return 6;
  if (stageIndex >= chainLength - 1) return 8;
  return 6;
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const evolution = {};
  const learnsets = {};
  const moveMeta = {};

  for (const entry of KANTO_DEX) {
    const slug = entry.slug;
    process.stderr.write(`… ${slug}\n`);
    try {
      const evo = await speciesEvolution(slug, entry.number);
      evolution[slug] = {
        stageIndex: evo.stageIndex,
        chainLength: evo.chainLength,
        slots: attackSlotCount(evo.stageIndex, evo.chainLength),
      };
      learnsets[slug] = await speciesLearnset(slug, entry.number);
    } catch (e) {
      process.stderr.write(`  skip ${slug}: ${e.message}\n`);
      evolution[slug] = { stageIndex: 0, chainLength: 1, slots: 4 };
      learnsets[slug] = { tackle: 1 };
    }
  }

  const moveNames = new Set();
  for (const ls of Object.values(learnsets)) {
    for (const n of Object.keys(ls)) moveNames.add(n);
  }
  const sortedMoves = [...moveNames].sort();
  const ROWS = Math.max(8, Math.ceil(sortedMoves.length / COLS));
  const moveTiles = {};
  sortedMoves.forEach((name, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    moveTiles[name] = { col, row, index: i };
  });

  for (const name of sortedMoves) {
    try {
      const m = await fetchJson(`https://pokeapi.co/api/v2/move/${name}/`);
      await sleep(25);
      const type = m.type?.name || "normal";
      moveMeta[name] = {
        power: m.power != null ? m.power : 0,
        type,
        tile: moveTiles[name],
      };
    } catch {
      moveMeta[name] = { power: 0, type: "normal", tile: moveTiles[name] };
    }
  }

  fs.writeFileSync(path.join(DATA_DIR, "kantoEvolution.json"), JSON.stringify(evolution, null, 0));
  fs.writeFileSync(path.join(DATA_DIR, "kantoLearnsets.json"), JSON.stringify(learnsets, null, 0));
  fs.writeFileSync(path.join(DATA_DIR, "moveMeta.json"), JSON.stringify(moveMeta, null, 0));
  fs.writeFileSync(
    path.join(DATA_DIR, "moveSheet.json"),
    JSON.stringify({ cols: COLS, rows: ROWS, tile: TILE, moves: moveTiles }, null, 0)
  );

  const py = `
import json, struct, zlib, math
from pathlib import Path
meta = json.loads(Path(${JSON.stringify(path.join(DATA_DIR, "moveMeta.json"))}).read_text())
moves = sorted(meta.keys())
cols, rows, tile = ${COLS}, ${ROWS}, ${TILE}
w, h = cols * tile, rows * tile
pixels = bytearray(w * h * 4)
type_rgb = ${JSON.stringify(TYPE_RGB)}

def set_px(x, y, r, g, b, a=255):
    if x < 0 or y < 0 or x >= w or y >= h: return
    i = (y * w + x) * 4
    pixels[i:i+4] = bytes([r, g, b, a])

for name in moves:
    t = meta[name]["type"]
    r, g, b = type_rgb.get(t, type_rgb["normal"])
    col = meta[name]["tile"]["col"]
    row = meta[name]["tile"]["row"]
    ox, oy = col * tile, row * tile
    cx, cy = ox + tile // 2, oy + tile // 2
    rad = tile // 2 - 2
    for dy in range(tile):
        for dx in range(tile):
            px, py = ox + dx, oy + dy
            if (dx - tile//2)**2 + (dy - tile//2)**2 <= rad*rad:
                shade = 0.85 + 0.15 * math.sin((dx + dy) * 0.7)
                set_px(px, py, int(r*shade), int(g*shade), int(b*shade))

def png_chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

raw = zlib.compress(bytes(pixels), 9)
out = b"\\x89PNG\\r\\n\\x1a\\n"
out += png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
out += png_chunk(b"IDAT", raw)
out += png_chunk(b"IEND", b"")
Path(${JSON.stringify(SHEET_PATH)}).write_bytes(out)
print("sheet", w, h, len(moves), "moves")
`;
  const pip = spawnSync("python3", ["-m", "pip", "install", "-q", "pillow"], { stdio: "inherit" });
  if (pip.status !== 0) {
    spawnSync("python3", ["-c", py], { stdio: "inherit" });
  } else {
    spawnSync("python3", ["-c", py], { stdio: "inherit" });
  }

  console.log("Wrote", DATA_DIR, SHEET_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
