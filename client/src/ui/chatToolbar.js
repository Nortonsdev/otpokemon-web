import { isChatHidden, showChatPanel, toggleChatHidden } from "./chatDock.js";

export const CHAT_WASD_MODE_KEY = "otp.chatWasdMode";
export const CHAT_LOG_MODE_KEY = "otp.chatLogMode";
export const CHAT_FILTER_KEY = "otp.chatTypeFilter";

const CHANNELS = [
  { id: "global", label: "Servidor" },
  { id: "local", label: "Padrão" },
  { id: "sistema", label: "Sistema" },
  { id: "combate", label: "Combate" },
];

const WASD_KEYS = new Set(["w", "a", "s", "d"]);

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** true = WASD digita no chat (modo chat); false = WASD move no mapa */
export function isChatWasdMode() {
  try {
    return localStorage.getItem(CHAT_WASD_MODE_KEY) === "chat";
  } catch {
    return false;
  }
}

export function setChatWasdMode(chatMode) {
  try {
    localStorage.setItem(CHAT_WASD_MODE_KEY, chatMode ? "chat" : "game");
  } catch {
    /* ignore */
  }
  syncWasdButton();
  const input = document.getElementById("chat-input");
  if (chatMode && !isChatHidden()) input?.focus();
  else if (!chatMode) input?.blur();
}

export function isChatLogMode() {
  try {
    return localStorage.getItem(CHAT_LOG_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setChatLogMode(on) {
  try {
    localStorage.setItem(CHAT_LOG_MODE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  document.getElementById("chat-log-mode")?.classList.toggle("on", on);
  document.getElementById("chat-log-mode")?.setAttribute("aria-pressed", on ? "true" : "false");
}

export function getChatTypeFilter() {
  const def = { player: true, sistema: true, combate: true };
  const v = readJson(CHAT_FILTER_KEY, def);
  return { ...def, ...v };
}

export function setChatTypeFilter(patch) {
  const next = { ...getChatTypeFilter(), ...patch };
  writeJson(CHAT_FILTER_KEY, next);
  syncFilterPanel();
}

function syncWasdButton() {
  const btn = document.getElementById("chat-wasd-toggle");
  if (!btn) return;
  const chat = isChatWasdMode();
  btn.classList.toggle("on", chat);
  btn.classList.toggle("chat-ico-wasd", !chat);
  btn.classList.toggle("chat-ico-keyboard", chat);
  btn.title = chat
    ? "Disable chat mode, allow to walk using ASDW"
    : "Enable chat mode — WASD types in chat input";
  btn.setAttribute("aria-pressed", chat ? "true" : "false");
  btn.setAttribute("aria-label", chat ? "Chat mode on" : "Chat mode off (WASD walks)");
}

function syncFilterPanel() {
  const f = getChatTypeFilter();
  for (const key of ["player", "sistema", "combate"]) {
    const el = document.querySelector(`#chat-filter-panel input[data-filter="${key}"]`);
    if (el) el.checked = !!f[key];
  }
}

function closePopovers(except) {
  for (const id of ["chat-channel-drop", "chat-filter-panel"]) {
    if (id === except) continue;
    document.getElementById(id)?.classList.add("hidden");
  }
}

function selectChannel(hud, ch) {
  hud.channel = ch;
  for (const b of document.querySelectorAll("#chat-tabs button[data-ch]")) {
    b.classList.toggle("active", b.dataset.ch === ch);
  }
  hud.flushLog();
  const label = CHANNELS.find((c) => c.id === ch)?.label || ch;
  const cap = document.getElementById("chat-channel-label");
  if (cap) cap.textContent = label;
}

function insertAtCursor(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const v = input.value;
  input.value = v.slice(0, start) + text + v.slice(end);
  const pos = start + text.length;
  input.setSelectionRange(pos, pos);
}

function onWasdKeydown(e) {
  if (!isChatWasdMode() || isChatHidden()) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key?.length === 1 ? e.key.toLowerCase() : "";
  if (!WASD_KEYS.has(key)) return;
  const input = document.getElementById("chat-input");
  if (!input) return;
  e.preventDefault();
  e.stopPropagation();
  showChatPanel();
  input.focus();
  insertAtCursor(input, key);
}

export function bindChatToolbar(hud) {
  syncWasdButton();
  setChatLogMode(isChatLogMode());
  syncFilterPanel();

  document.getElementById("chat-hide-toggle")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleChatHidden();
  });

  document.getElementById("chat-channel-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const drop = document.getElementById("chat-channel-drop");
    if (!drop) return;
    const open = drop.classList.toggle("hidden");
    if (!open) closePopovers("chat-channel-drop");
  });

  for (const btn of document.querySelectorAll("#chat-channel-drop button[data-ch-pick]")) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectChannel(hud, btn.dataset.chPick);
      document.getElementById("chat-channel-drop")?.classList.add("hidden");
    });
  }

  document.getElementById("chat-filter-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const panel = document.getElementById("chat-filter-panel");
    if (!panel) return;
    const open = panel.classList.toggle("hidden");
    if (!open) closePopovers("chat-filter-panel");
  });

  document.getElementById("chat-log-mode")?.addEventListener("click", (e) => {
    e.preventDefault();
    setChatLogMode(!isChatLogMode());
    hud.flushLog();
  });

  document.getElementById("chat-filter-panel")?.addEventListener("change", (e) => {
    const input = e.target.closest("input[data-filter]");
    if (!input) return;
    setChatTypeFilter({ [input.dataset.filter]: input.checked });
    hud.flushLog();
  });

  document.getElementById("chat-wasd-toggle")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setChatWasdMode(!isChatWasdMode());
  });

  document.getElementById("chat-clear-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    hud.clearChatLocal();
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("#chat-channel-btn, #chat-channel-drop")) return;
    if (e.target.closest("#chat-filter-btn, #chat-filter-panel")) return;
    closePopovers(null);
  });

  document.addEventListener("keydown", onWasdKeydown, true);

  const active = CHANNELS.find((c) => c.id === hud.channel);
  const cap = document.getElementById("chat-channel-label");
  if (cap && active) cap.textContent = active.label;
}
