/**
 * Cinematic login background: abstract monsters battling with procedural VFX.
 * No game sprites — silhouettes and particles only.
 */

const TAU = Math.PI * 2;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

const ELEMENTS = ["fire", "water", "electric"];

export class LoginBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.raf = 0;
    this.active = false;
    this.lastTs = 0;
    this.time = 0;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeDecay = 0;
    this.flash = 0;
    this.beams = [];
    this.sparks = [];
    this.smoke = [];
    this.arcs = [];
    this.pokeballs = [];
    this.cycle = 0;
    this.cycleT = 0;
    this.nextCycle = 2.8;
    this.attackElement = "fire";
    this.attackerSide = "left";
    this.pendingBeam = null;
    this.pendingBall = null;
    this._onResize = () => this.resize();
    this._onVis = () => this.syncLoop();
  }

  init() {
    this.seedAmbient();
    this.resize();
    this.startBattleBeat();
    window.addEventListener("resize", this._onResize);
    document.addEventListener("visibilitychange", this._onVis);
    return Promise.resolve();
  }

  destroy() {
    this.setActive(false);
    window.removeEventListener("resize", this._onResize);
    document.removeEventListener("visibilitychange", this._onVis);
  }

  seedAmbient() {
    this.sparks = [];
    for (let i = 0; i < 40; i++) {
      this.sparks.push({
        x: rand(0.2, 0.8),
        y: rand(0.35, 0.75),
        vx: rand(-20, 20),
        vy: rand(-40, -8),
        life: rand(0.4, 1.2),
        max: rand(0.4, 1.2),
        r: rand(1, 3),
        hue: rand(30, 55),
      });
    }
  }

  arenaCenter() {
    return { x: this.w * 0.5, y: this.h * 0.62 };
  }

  fighterPos(side) {
    const c = this.arenaCenter();
    const spread = Math.min(this.w * 0.22, 280);
    const bob = Math.sin(this.time * 2.4 + (side === "left" ? 0 : 1.2)) * 6;
    const lunge =
      this.cycleT > 0.35 && this.cycleT < 0.55 && this.attackerSide === side
        ? (side === "left" ? 18 : -18) * easeOutCubic((this.cycleT - 0.35) / 0.2)
        : 0;
    return {
      x: c.x + (side === "left" ? -spread : spread) + lunge,
      y: c.y + bob,
      side,
    };
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  setActive(on) {
    this.active = on;
    this.canvas.classList.toggle("hidden", !on);
    this.syncLoop();
  }

  syncLoop() {
    if (!this.active || document.hidden) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      return;
    }
    if (!this.raf) {
      this.lastTs = 0;
      this.raf = requestAnimationFrame((ts) => this.loop(ts));
    }
  }

  loop(ts) {
    this.raf = 0;
    if (!this.active || document.hidden) return;
    const dt = this.lastTs ? Math.min(0.05, (ts - this.lastTs) / 1000) : 0;
    this.lastTs = ts;
    this.time += dt;
    this.tick(dt);
    this.draw();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  triggerImpact(intensity = 1) {
    this.shakeDecay = Math.max(this.shakeDecay, 0.35 * intensity);
    this.flash = Math.max(this.flash, 0.55 * intensity);
    const c = this.arenaCenter();
    const n = Math.floor(24 * intensity);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(80, 320) * intensity;
      this.sparks.push({
        x: c.x / this.w + rand(-0.08, 0.08),
        y: c.y / this.h + rand(-0.06, 0.06),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.25, 0.7),
        max: rand(0.25, 0.7),
        r: rand(1.5, 4),
        hue: this.attackElement === "electric" ? 52 : this.attackElement === "water" ? 200 : 28,
      });
    }
    for (let i = 0; i < 8 * intensity; i++) {
      this.smoke.push({
        x: c.x + rand(-40, 40),
        y: c.y + rand(-20, 30),
        vx: rand(-25, 25),
        vy: rand(-50, -15),
        life: rand(0.8, 1.6),
        max: rand(0.8, 1.6),
        r: rand(18, 42),
      });
    }
  }

  fireBeam(from, to, element) {
    const jags = [];
    if (element === "electric") {
      for (let i = 1; i < 10; i++) jags.push(rand(-22, 22));
    }
    this.beams.push({
      from,
      to,
      element,
      t: 0,
      dur: 0.42,
      width: element === "electric" ? 14 : element === "water" ? 22 : 18,
      jags,
      hit: false,
    });
  }

  spawnPokeballBurst() {
    const left = this.fighterPos("left");
    const right = this.fighterPos("right");
    const sx = (left.x + right.x) / 2;
    const sy = Math.min(left.y, right.y) - 100;
    this.pokeballs.push({
      sx,
      sy,
      tx: right.x,
      ty: right.y - 24,
      x: sx,
      y: sy,
      t: 0,
      phase: "throw",
      rot: 0,
    });
  }

  startBattleBeat() {
    this.cycle += 1;
    this.cycleT = 0;
    this.attackElement = ELEMENTS[this.cycle % ELEMENTS.length];
    this.attackerSide = this.cycle % 2 === 0 ? "left" : "right";
    this.nextCycle = rand(3.2, 5.2);
    this.pendingBeam = { at: 0.52, fired: false };
    this.pendingBall = this.cycle % 3 === 0 ? { at: 0.38, fired: false } : null;

    if (this.attackElement === "electric") {
      this.arcs.push({
        t: 0,
        dur: 0.35,
        side: this.attackerSide,
        bend: rand(-40, 40),
      });
    }
  }

  tick(dt) {
    this.cycleT += dt;
    if (this.cycleT >= this.nextCycle) this.startBattleBeat();

    if (this.pendingBall && !this.pendingBall.fired && this.cycleT >= this.pendingBall.at) {
      this.pendingBall.fired = true;
      this.spawnPokeballBurst();
    }
    if (this.pendingBeam && !this.pendingBeam.fired && this.cycleT >= this.pendingBeam.at) {
      this.pendingBeam.fired = true;
      const from = this.fighterPos(this.attackerSide);
      const to = this.fighterPos(this.attackerSide === "left" ? "right" : "left");
      this.fireBeam(
        { x: from.x, y: from.y - 30 },
        { x: to.x, y: to.y - 30 },
        this.attackElement
      );
    }

    if (this.shakeDecay > 0) {
      const s = this.shakeDecay * 12;
      this.shakeX = rand(-s, s);
      this.shakeY = rand(-s, s);
      this.shakeDecay = Math.max(0, this.shakeDecay - dt * 2.8);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
    this.flash = Math.max(0, this.flash - dt * 2.2);

    for (const b of this.beams) {
      b.t += dt;
      if (b.t >= b.dur * 0.85 && !b.hit) {
        b.hit = true;
        this.triggerImpact(this.attackElement === "electric" ? 1.2 : 1);
      }
    }
    this.beams = this.beams.filter((b) => b.t < b.dur + 0.15);

    for (const a of this.arcs) a.t += dt;
    this.arcs = this.arcs.filter((a) => a.t < a.dur);

    const upd = (arr) => {
      for (const p of arr) {
        p.life -= dt;
        p.x += (p.vx * dt) / this.w;
        p.y += (p.vy * dt) / this.h;
        p.vy += 120 * dt;
      }
    };
    upd(this.sparks);
    this.sparks = this.sparks.filter((p) => p.life > 0);
    for (const s of this.smoke) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.r += 18 * dt;
    }
    this.smoke = this.smoke.filter((s) => s.life > 0);

    for (const pb of this.pokeballs) {
      pb.t += dt;
      pb.rot += dt * 9;
      if (pb.phase === "throw") {
        const u = clamp(pb.t / 0.55, 0, 1);
        const e = easeInOutQuad(u);
        pb.x = lerp(pb.sx, pb.tx, e);
        pb.y = lerp(pb.sy, pb.ty, e) + Math.sin(u * Math.PI) * -110;
        if (u >= 1) {
          pb.phase = "burst";
          pb.t = 0;
          pb.x = pb.tx;
          pb.y = pb.ty;
          this.triggerImpact(1.4);
          this.flash = 0.85;
        }
      } else if (pb.phase === "burst") {
        if (pb.t > 0.5) pb.phase = "done";
      }
    }
    this.pokeballs = this.pokeballs.filter((p) => p.phase !== "done");

    if (this.sparks.length < 25 && Math.random() < dt * 2) {
      this.sparks.push({
        x: rand(0.35, 0.65),
        y: rand(0.5, 0.68),
        vx: rand(-15, 15),
        vy: rand(-30, -5),
        life: rand(0.3, 0.8),
        max: rand(0.3, 0.8),
        r: rand(0.8, 2),
        hue: 45,
      });
    }
  }

  drawArena(ctx) {
    const c = this.arenaCenter();
    const r = Math.min(this.w, this.h) * 0.42;

    const sky = ctx.createLinearGradient(0, 0, 0, this.h);
    sky.addColorStop(0, "#0a0618");
    sky.addColorStop(0.35, "#1a1035");
    sky.addColorStop(0.7, "#2a1848");
    sky.addColorStop(1, "#120a1a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, this.h);

    for (let i = 0; i < 60; i++) {
      const bx = ((i * 97) % 1000) / 1000;
      const by = ((i * 53) % 400) / 1000;
      const flick = 0.15 + 0.2 * Math.sin(this.time * 3 + i);
      ctx.fillStyle = `rgba(255, 200, 120, ${flick * 0.35})`;
      ctx.fillRect(bx * this.w, by * this.h * 0.45, 2, 2);
    }

    const floor = ctx.createRadialGradient(c.x, c.y, r * 0.1, c.x, c.y, r);
    floor.addColorStop(0, "rgba(60, 45, 90, 0.95)");
    floor.addColorStop(0.55, "rgba(35, 28, 55, 0.9)");
    floor.addColorStop(1, "rgba(8, 6, 14, 0)");
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r, r * 0.38, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(140, 120, 200, 0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r * 0.92, r * 0.35, 0, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 220, 140, 0.12)";
    for (let ring = 0; ring < 4; ring++) {
      const rr = r * (0.35 + ring * 0.14);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rr, rr * 0.35, 0, 0, TAU);
      ctx.stroke();
    }

    const scan = (Math.sin(this.time * 1.2) + 1) * 0.5;
    ctx.fillStyle = `rgba(100, 180, 255, ${0.03 + scan * 0.04})`;
    ctx.fillRect(0, c.y - 4, this.w, 8);
  }

  drawAbstractFighter(ctx, pos, side, charging) {
    const scale = Math.min(this.w, this.h) * 0.00085;
    const flip = side === "right" ? -1 : 1;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.scale(flip * scale, scale);

    const pulse = charging ? 1 + Math.sin(this.time * 18) * 0.06 : 1;
    const glowColor =
      side === "left" ? "rgba(80, 200, 255, 0.45)" : "rgba(255, 120, 60, 0.5)";

    ctx.shadowColor = glowColor;
    ctx.shadowBlur = charging ? 28 : 14;

    ctx.fillStyle = "#0a0a12";
    ctx.strokeStyle = side === "left" ? "#5ec8ff" : "#ff7840";
    ctx.lineWidth = 3;

    if (side === "left") {
      ctx.beginPath();
      ctx.moveTo(-50, 20);
      ctx.bezierCurveTo(-70, -30, -40, -80, 0, -95);
      ctx.bezierCurveTo(35, -75, 55, -20, 40, 25);
      ctx.bezierCurveTo(20, 55, -25, 50, -50, 20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-18, -50, 12, 16, -0.3, 0, TAU);
      ctx.fillStyle = "#1ae8ff";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(30, -40);
      ctx.lineTo(75, -70);
      ctx.lineTo(55, -35);
      ctx.closePath();
      ctx.fillStyle = "#0a0a12";
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-45, 30);
      ctx.lineTo(-60, -10);
      ctx.lineTo(-35, -85);
      ctx.lineTo(10, -100);
      ctx.lineTo(50, -60);
      ctx.lineTo(65, 10);
      ctx.lineTo(35, 45);
      ctx.lineTo(-20, 40);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(15, -95);
      ctx.lineTo(45, -130);
      ctx.lineTo(25, -85);
      ctx.moveTo(-5, -98);
      ctx.lineTo(-15, -140);
      ctx.lineTo(-30, -88);
      ctx.strokeStyle = "#ff5030";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = "#ff3020";
      ctx.beginPath();
      ctx.arc(5, -55, 10, 0, TAU);
      ctx.fill();
    }

    if (charging) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(0, -30, 55 * pulse, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    ctx.restore();
  }

  drawBeam(ctx, beam) {
    const u = clamp(beam.t / beam.dur, 0, 1);
    const head = easeOutCubic(u);
    const x = lerp(beam.from.x, beam.to.x, head);
    const y = lerp(beam.from.y, beam.to.y, head);
    const el = beam.element;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const colors =
      el === "fire"
        ? ["#ff9040", "#ff4020", "#fff0a0"]
        : el === "water"
          ? ["#40c8ff", "#2080ff", "#a0f0ff"]
          : ["#ffff80", "#c0e0ff", "#ffffff"];

    if (el === "electric") {
      const pts = [];
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = lerp(beam.from.x, x, t);
        const py = lerp(beam.from.y, y, t);
        const jag = i === 0 || i === steps ? 0 : (beam.jags[i - 1] || 0) * (1 - t * 0.3);
        pts.push({ x: px + jag, y: py + jag * 0.5 });
      }
      ctx.strokeStyle = colors[0];
      ctx.lineWidth = beam.width;
      ctx.shadowColor = colors[2];
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    } else {
      const g = ctx.createLinearGradient(beam.from.x, beam.from.y, x, y);
      g.addColorStop(0, colors[0]);
      g.addColorStop(0.6, colors[1]);
      g.addColorStop(1, colors[2]);
      ctx.strokeStyle = g;
      ctx.lineWidth = beam.width * (0.6 + 0.4 * Math.sin(u * Math.PI));
      ctx.shadowColor = colors[0];
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.moveTo(beam.from.x, beam.from.y);
      ctx.lineTo(x, y);
      ctx.stroke();

      if (el === "fire") {
        for (let f = 0; f < 5; f++) {
          const ft = rand(0.2, head);
          const fx = lerp(beam.from.x, beam.to.x, ft);
          const fy = lerp(beam.from.y, beam.to.y, ft);
          ctx.fillStyle = `rgba(255, ${120 + rand(0, 80)}, 40, ${0.4 * (1 - u)})`;
          ctx.beginPath();
          ctx.ellipse(fx, fy, 8 + rand(0, 12), 14 + rand(0, 10), rand(0, TAU), 0, TAU);
          ctx.fill();
        }
      }
      if (el === "water") {
        ctx.fillStyle = `rgba(160, 220, 255, ${0.35 * (1 - u)})`;
        ctx.beginPath();
        ctx.arc(x, y, 16 + u * 20, 0, TAU);
        ctx.fill();
      }
    }

    if (u > 0.75) {
      const burst = (u - 0.75) / 0.25;
      const rg = ctx.createRadialGradient(beam.to.x, beam.to.y, 0, beam.to.x, beam.to.y, 50 * burst);
      rg.addColorStop(0, `rgba(255,255,255,${0.7 * (1 - burst)})`);
      rg.addColorStop(0.4, `${colors[0]}88`);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(beam.to.x, beam.to.y, 55 * burst, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawArc(ctx, arc) {
    const from = this.fighterPos(arc.side);
    const to = this.fighterPos(arc.side === "left" ? "right" : "left");
    const u = clamp(arc.t / arc.dur, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(255, 255, 200, ${1 - u})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y - 40);
    const midX = (from.x + to.x) / 2 + arc.bend;
    const midY = (from.y + to.y) / 2 - 80;
    ctx.quadraticCurveTo(midX, midY, to.x, to.y - 40);
    ctx.stroke();
    ctx.restore();
  }

  drawPokeball(ctx, pb) {
    ctx.save();
    ctx.translate(pb.x, pb.y);
    ctx.rotate(pb.rot);
    const s = 14;
    if (pb.phase === "burst") {
      const u = clamp(pb.t / 0.5, 0, 1);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 80 * u);
      rg.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - u)})`);
      rg.addColorStop(0.3, `rgba(255, 80, 80, ${0.5 * (1 - u)})`);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, 90 * u, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + pb.t * 4;
        ctx.fillStyle = `rgba(255, 220, 180, ${0.6 * (1 - u)})`;
        ctx.fillRect(Math.cos(a) * 40 * u - 2, Math.sin(a) * 40 * u - 2, 4, 4);
      }
    } else {
      ctx.fillStyle = "#e8e8e8";
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#c02828";
      ctx.beginPath();
      ctx.arc(0, -s * 0.1, s, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.lineTo(s, 0);
      ctx.stroke();
      ctx.fillStyle = "#f0f0f0";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.32, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#333";
      ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles(ctx) {
    for (const s of this.smoke) {
      const a = clamp(s.life / s.max, 0, 1);
      ctx.fillStyle = `rgba(40, 35, 50, ${0.35 * a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.sparks) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${a})`;
      ctx.fillRect(p.x * this.w - p.r, p.y * this.h - p.r, p.r * 2, p.r * 2);
    }
    ctx.restore();
  }

  drawVignette(ctx) {
    const g = ctx.createRadialGradient(
      this.w / 2,
      this.h / 2,
      Math.min(this.w, this.h) * 0.15,
      this.w / 2,
      this.h / 2,
      Math.max(this.w, this.h) * 0.75
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, "rgba(0,0,0,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  drawFlash(ctx) {
    if (this.flash <= 0) return;
    ctx.fillStyle = `rgba(255, 248, 230, ${this.flash * 0.45})`;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);
    ctx.clearRect(-20, -20, this.w + 40, this.h + 40);

    this.drawArena(ctx);

    const charging = this.cycleT > 0.1 && this.cycleT < 0.5;
    const left = this.fighterPos("left");
    const right = this.fighterPos("right");
    this.drawAbstractFighter(ctx, left, "left", charging && this.attackerSide === "left");
    this.drawAbstractFighter(ctx, right, "right", charging && this.attackerSide === "right");

    for (const b of this.beams) this.drawBeam(ctx, b);
    for (const a of this.arcs) this.drawArc(ctx, a);
    for (const pb of this.pokeballs) this.drawPokeball(ctx, pb);
    this.drawParticles(ctx);

    ctx.restore();
    this.drawFlash(ctx);
    this.drawVignette(ctx);
  }
}
