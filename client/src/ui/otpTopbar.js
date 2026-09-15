import { isAloot, isMuted, setAloot, setMuted, toggleAloot, toggleMuted } from "./otpAudio.js";

const ICON = (name) => `/assets/ui/topbar/${name}`;

export const TOPBAR_BUTTONS = [
  { id: "aloot", title: "Auto loot", icon: ICON("aloot.svg"), kind: "toggle" },
  { id: "audio", title: "Áudio", icon: ICON("audio.svg"), muteIcon: ICON("audio_mute.svg"), kind: "audio" },
  { id: "battle", title: "Batalha", icon: ICON("battle.svg"), onIcon: ICON("battle_on.png"), win: "battle" },
  { id: "healthinfo", title: "Player Info", icon: ICON("healthinfo.svg"), win: "status" },
  { id: "hotkeys", title: "Hotkeys", icon: ICON("hotkeys.svg"), win: "hotkeys" },
  { id: "inventory", title: "Inventário", icon: ICON("inventory.svg"), win: "inv" },
  { id: "logout", title: "Sair", icon: ICON("logout.svg"), kind: "logout" },
  { id: "minimap", title: "Minimapa", icon: ICON("minimap.svg"), win: "minimap" },
  { id: "options", title: "Opções", icon: ICON("options.svg"), win: "options" },
  { id: "pokeinfo", title: "Lista de Pokemon", icon: ICON("pokeinfo.svg"), win: "pokebar" },
  { id: "viplist", title: "Lista VIP", icon: ICON("viplist.svg"), win: "vip" },
  { id: "zoomin", title: "Zoom +", icon: "/assets/ui/topbar/zoomin.png", kind: "zoom-in" },
  { id: "zoomout", title: "Zoom −", icon: "/assets/ui/topbar/zoomout.png", kind: "zoom-out" },
];

function btnEl(spec) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "otp-top-btn";
  btn.dataset.otpTop = spec.id;
  btn.title = spec.title;
  btn.setAttribute("aria-label", spec.title);
  const img = document.createElement("img");
  img.alt = "";
  img.width = 16;
  img.height = 16;
  img.src = spec.icon;
  btn.appendChild(img);
  return btn;
}

function setOn(btn, on) {
  btn.classList.toggle("on", !!on);
  btn.classList.toggle("off", !on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
}

export function bindOtpTopbar(hud) {
  const host = document.getElementById("hud-top-icons");
  if (!host || host.dataset.otpReady) return;
  host.dataset.otpReady = "1";
  host.innerHTML = "";
  for (const spec of TOPBAR_BUTTONS) {
    const btn = btnEl(spec);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      onTopClick(hud, spec);
    });
    host.appendChild(btn);
  }
  syncOtpTopbar(hud);
}

function onTopClick(hud, spec) {
  if (spec.kind === "audio") {
    toggleMuted();
    syncOtpTopbar(hud);
    return;
  }
  if (spec.kind === "toggle" && spec.id === "aloot") {
    const on = toggleAloot();
    if (on) hud.windows?.open("bag");
    syncOtpTopbar(hud);
    return;
  }
  if (spec.kind === "logout") {
    hud.net?.send({ t: "logout" });
    return;
  }
  if (spec.kind === "zoom-in") {
    hud.changeWorldZoom?.(1);
    return;
  }
  if (spec.kind === "zoom-out") {
    hud.changeWorldZoom?.(-1);
    return;
  }
  if (spec.win) {
    hud.windows?.toggle(spec.win);
    syncOtpTopbar(hud);
  }
}

export function syncOtpTopbar(hud) {
  const host = document.getElementById("hud-top-icons");
  if (!host) return;
  for (const spec of TOPBAR_BUTTONS) {
    const btn = host.querySelector(`[data-otp-top="${spec.id}"]`);
    if (!btn) continue;
    const img = btn.querySelector("img");
    if (spec.kind === "audio") {
      const muted = isMuted();
      setOn(btn, !muted);
      if (img) img.src = muted ? spec.muteIcon : spec.icon;
      btn.title = muted ? "Áudio (mudo)" : "Áudio";
      continue;
    }
    if (spec.id === "aloot") {
      setOn(btn, isAloot());
      continue;
    }
    if (spec.win) {
      const w = hud.windows?.layout?.[spec.win];
      const open = !!w?.open && !w?.min;
      setOn(btn, open);
      if (spec.onIcon && img) img.src = open ? spec.onIcon : spec.icon;
    }
  }
}

export { isAloot, setAloot, isMuted, setMuted };
