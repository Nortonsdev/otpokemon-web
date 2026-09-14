import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOtbm, serializeOtbm, type OtbmMap } from "../shared/editor/otbm.ts";
import { otbmMapToRuntime, runtimeToOtbm, type RuntimeMap } from "../shared/editor/mapRuntime.ts";
import { buildLegacyMap } from "../shared/mapLegacy.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.VERCEL ? "/tmp/otpokemon" : path.join(__dirname, "data");
const MAP_PATH = path.join(DATA_DIR, "world.otbm");
const META_PATH = path.join(DATA_DIR, "world-meta.json");

let activeRuntime: RuntimeMap | null = null;
let activeOtbm: OtbmMap | null = null;

export function mapDataDir() {
  return DATA_DIR;
}

export function mapFilePath() {
  return MAP_PATH;
}

function loadMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveMeta(meta: Record<string, unknown>) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
}

export function loadActiveMap(): RuntimeMap {
  if (activeRuntime) return activeRuntime;
  try {
    const buf = fs.readFileSync(MAP_PATH);
    const otbm = parseOtbm(new Uint8Array(buf));
    activeOtbm = otbm;
    activeRuntime = otbmMapToRuntime(otbm);
    return activeRuntime;
  } catch {
    const legacy = buildLegacyMap();
    activeRuntime = legacy;
    activeOtbm = runtimeToOtbm(legacy);
    return activeRuntime;
  }
}

export function getActiveOtbm(): OtbmMap {
  if (!activeOtbm) loadActiveMap();
  return activeOtbm!;
}

export function reloadMap(): RuntimeMap {
  activeRuntime = null;
  activeOtbm = null;
  return loadActiveMap();
}

export async function saveOtbmBuffer(buffer: Uint8Array, filename = "world.otbm") {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const target = path.join(DATA_DIR, path.basename(filename));
  fs.writeFileSync(target, buffer);
  if (target !== MAP_PATH) fs.copyFileSync(target, MAP_PATH);
  return reloadMap();
}

export async function saveOtbmMap(otbm: OtbmMap) {
  const bytes = await serializeOtbm(otbm);
  return saveOtbmBuffer(bytes);
}

export function exportOtbmBytes(): Promise<Uint8Array> {
  const otbm = getActiveOtbm();
  return serializeOtbm(otbm);
}

export function applyRuntime(runtime: RuntimeMap) {
  activeRuntime = runtime;
  activeOtbm = runtimeToOtbm(runtime);
  return saveOtbmMap(activeOtbm);
}

export function readMapMeta() {
  return loadMeta();
}

export function writeMapMeta(patch: Record<string, unknown>) {
  const meta = { ...loadMeta(), ...patch };
  saveMeta(meta);
  return meta;
}
