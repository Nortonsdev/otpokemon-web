import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const SAVE_PATH = path.join(DATA_DIR, "save.json");

function empty() {
  return {
    accounts: {
      demo: { password: "demo", chars: [] },
    },
    characters: {},
  };
}

export function loadSave() {
  try {
    const raw = fs.readFileSync(SAVE_PATH, "utf8");
    const data = JSON.parse(raw);
    if (!data.accounts) data.accounts = {};
    if (!data.characters) data.characters = {};
    if (!data.accounts.demo) data.accounts.demo = { password: "demo", chars: [] };
    return data;
  } catch {
    const data = empty();
    saveNow(data);
    return data;
  }
}

export function saveNow(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${SAVE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, SAVE_PATH);
}
