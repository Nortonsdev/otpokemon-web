export const CHAT_HIDDEN_KEY = "otp.chatHidden";

function dockEl() {
  return document.getElementById("chat-dock");
}

export function isChatHidden() {
  try {
    return localStorage.getItem(CHAT_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setChatHidden(hidden) {
  try {
    localStorage.setItem(CHAT_HIDDEN_KEY, hidden ? "1" : "0");
  } catch {
    /* ignore */
  }
  applyChatHidden();
}

export function applyChatHidden() {
  const el = dockEl();
  if (!el) return;
  const hidden = isChatHidden();
  el.classList.toggle("chat-hidden", hidden);
  el.setAttribute("aria-hidden", hidden ? "true" : "false");
  const btn = document.getElementById("chat-hide-toggle");
  if (btn) {
    btn.classList.toggle("on", hidden);
    btn.setAttribute("aria-pressed", hidden ? "true" : "false");
    btn.title = hidden ? "Mostrar chat — Hide ON (Ctrl+Shift+C)" : "Ocultar chat (Ctrl+Shift+C)";
    btn.setAttribute("aria-label", hidden ? "Mostrar chat" : "Ocultar chat");
  }
  el.classList.toggle("chat-strip", hidden);
  if (hidden) document.getElementById("chat-input")?.blur();
}

export function showChatPanel() {
  if (!isChatHidden()) return;
  setChatHidden(false);
}

export function toggleChatHidden() {
  setChatHidden(!isChatHidden());
}

export function bindChatDock() {
  applyChatHidden();
  document.getElementById("chat-tabs")?.addEventListener("click", (e) => {
    if (!isChatHidden()) return;
    if (e.target.closest("#chat-hide-toggle")) return;
    e.preventDefault();
    setChatHidden(false);
  });
  document.getElementById("chat-hide-toggle")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleChatHidden();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "c" && e.key !== "C") return;
    if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    toggleChatHidden();
  });
}
