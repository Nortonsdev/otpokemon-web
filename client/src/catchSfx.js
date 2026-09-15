let ctx;

function audioCtx() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      ctx = null;
    }
  }
  return ctx;
}

function tone(freq, dur, type = "sine", gain = 0.08) {
  const ac = audioCtx();
  if (!ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(ac.destination);
  const t = ac.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function playCatchSfx(phase) {
  if (typeof document !== "undefined" && document.body.classList.contains("otp-muted")) return;
  const ac = audioCtx();
  if (ac?.state === "suspended") ac.resume().catch(() => {});
  if (phase === "throw") tone(880, 0.12, "triangle", 0.06);
  if (phase === "success") {
    tone(988, 0.1, "sine", 0.09);
    setTimeout(() => tone(1318, 0.18, "sine", 0.07), 90);
  }
  if (phase === "fail") tone(220, 0.28, "sawtooth", 0.05);
}

export function playCatchAudio(scene, phase) {
  if (typeof document !== "undefined" && document.body.classList.contains("otp-muted")) return;
  const key =
    phase === "throw" ? "catching" : phase === "success" ? "catch_sucess" : phase === "fail" ? "catch_fail" : null;
  if (key && scene?.cache?.audio?.exists(key)) {
    try {
      scene.sound.play(key, { volume: 0.45 });
      return;
    } catch {
      /* fallback */
    }
  }
  playCatchSfx(phase);
}
