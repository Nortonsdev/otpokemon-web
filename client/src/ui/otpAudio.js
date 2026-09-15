const MUTE_KEY = "otp.muted";
const ALOOT_KEY = "otp.aloot";

function readFlag(key, fallback = false) {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    return v === "1" || v === "true";
  } catch {
    return fallback;
  }
}

function writeFlag(key, on) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function isMuted() {
  return readFlag(MUTE_KEY, false);
}

export function setMuted(on) {
  writeFlag(MUTE_KEY, !!on);
  document.body.classList.toggle("otp-muted", !!on);
  syncPhaserMute();
}

export function toggleMuted() {
  setMuted(!isMuted());
  return isMuted();
}

export function isAloot() {
  return readFlag(ALOOT_KEY, false);
}

export function setAloot(on) {
  writeFlag(ALOOT_KEY, !!on);
}

export function toggleAloot() {
  setAloot(!isAloot());
  return isAloot();
}

export function syncPhaserMute() {
  const muted = isMuted();
  const g = window.__otpGame;
  if (g?.sound) g.sound.mute = muted;
}

export function applyOtpAudioBoot() {
  document.body.classList.toggle("otp-muted", isMuted());
  syncPhaserMute();
}
