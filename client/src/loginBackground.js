/**
 * Full-bleed animated login / pre-game background (Pokétibia twilight meadow).
 */

const MON_SPECS = [
  { id: "caterpie", frame: 32, sheetCol: 2, sheetRow: 1, scale: 2.2, layer: 0.72, speed: 28, yOff: 0.08, walk: true },
  { id: "rapidash", frame: 64, sheetCol: 2, sheetRow: 1, scale: 1.35, layer: 0.55, speed: 42, yOff: 0.14, walk: true },
  { id: "charizard", frame: 64, sheetCol: 2, sheetRow: 0, scale: 1.1, layer: 0.22, speed: 18, yOff: -0.06, walk: false, float: true },
];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

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
    this.sprites = new Map();
    this.loadPromise = null;
    this.particles = [];
    this.clouds = [];
    this.stars = [];
    this.mons = [];
    this.trees = [];
    this._onResize = () => this.resize();
    this._onVis = () => this.syncLoop();
  }

  init() {
    if (!this.loadPromise) {
      this.loadPromise = this.loadSprites().then(() => {
        this.seedScene();
        this.resize();
      });
    }
    window.addEventListener("resize", this._onResize);
    document.addEventListener("visibilitychange", this._onVis);
    return this.loadPromise;
  }

  destroy() {
    this.setActive(false);
    window.removeEventListener("resize", this._onResize);
    document.removeEventListener("visibilitychange", this._onVis);
  }

  async loadSprites() {
    const loads = MON_SPECS.map(
      (s) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            this.sprites.set(s.id, img);
            resolve();
          };
          img.onerror = reject;
          img.src = `/assets/pokemon/${s.id}/sheet.png`;
        })
    );
    await Promise.all(loads);
  }

  seedScene() {
    this.particles = [];
    for (let i = 0; i < 90; i++) {
      this.particles.push({
        x: Math.random(),
        y: Math.random(),
        r: rand(0.6, 2.4),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.15, 0.55),
        drift: rand(-0.02, 0.02),
        kind: Math.random() < 0.35 ? "pollen" : "firefly",
      });
    }
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
      this.clouds.push({
        x: Math.random(),
        y: rand(0.05, 0.38),
        w: rand(0.18, 0.42),
        h: rand(0.04, 0.09),
        speed: rand(0.008, 0.022),
        alpha: rand(0.12, 0.28),
      });
    }
    this.stars = [];
    for (let i = 0; i < 120; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random() * 0.55,
        r: rand(0.4, 1.6),
        tw: rand(0.5, 2.5),
        phase: rand(0, Math.PI * 2),
      });
    }
    this.trees = [];
    for (let i = 0; i < 24; i++) {
      this.trees.push({
        x: Math.random(),
        h: rand(0.12, 0.28),
        w: rand(0.02, 0.045),
        layer: Math.random() < 0.5 ? 0.35 : 0.5,
      });
    }
    this.mons = MON_SPECS.map((spec, i) => ({
      ...spec,
      x: rand(0.1, 0.9),
      dir: i % 2 === 0 ? 1 : -1,
      phase: rand(0, Math.PI * 2),
      bob: rand(0, Math.PI * 2),
    }));
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

    const dt = this.lastTs ? Math.min(48, ts - this.lastTs) / 1000 : 0;
    this.lastTs = ts;
    this.time += dt;
    this.tick(dt);
    this.draw();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  tick(dt) {
    for (const p of this.particles) {
      p.phase += dt * p.speed;
      p.x += p.drift * dt;
      if (p.x < -0.05) p.x = 1.05;
      if (p.x > 1.05) p.x = -0.05;
    }
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > 1.25) c.x = -0.25;
    }
    for (const m of this.mons) {
      m.x += (m.speed * m.dir * dt) / Math.max(this.w, 800);
      if (m.x < -0.12) {
        m.x = 1.12;
        m.dir = 1;
      }
      if (m.x > 1.12) {
        m.x = -0.12;
        m.dir = -1;
      }
      m.phase += dt * (m.walk ? 8 : 1.2);
      m.bob += dt * (m.float ? 1.4 : 0);
    }
  }

  horizonY() {
    return this.h * 0.58;
  }

  drawSky(ctx) {
    const hy = this.horizonY();
    const pulse = Math.sin(this.time * 0.15) * 0.03;
    const g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, `rgb(${18 + pulse * 40}, ${22 + pulse * 20}, ${48 + pulse * 30})`);
    g.addColorStop(0.45, `rgb(${45 + pulse * 30}, ${38 + pulse * 20}, ${82 + pulse * 25})`);
    g.addColorStop(0.78, `rgb(${72 + pulse * 20}, ${58 + pulse * 15}, ${98 + pulse * 10})`);
    g.addColorStop(1, `rgb(${28 + pulse * 10}, ${52 + pulse * 8}, ${42 + pulse * 5})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, hy + 2);

    const moonX = this.w * 0.78;
    const moonY = this.h * 0.14;
    const moonR = Math.min(this.w, this.h) * 0.055;
    const glow = ctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 4.5);
    glow.addColorStop(0, "rgba(255, 248, 220, 0.35)");
    glow.addColorStop(0.35, "rgba(200, 210, 255, 0.12)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.w, hy);
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(245, 240, 210, 0.92)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(moonX - moonR * 0.25, moonY - moonR * 0.15, moonR * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(200, 195, 170, 0.35)";
    ctx.fill();
  }

  drawStars(ctx) {
    for (const s of this.stars) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(this.time * s.tw + s.phase));
      ctx.fillStyle = `rgba(230, 240, 255, ${a})`;
      ctx.fillRect(s.x * this.w, s.y * this.h * 0.55, s.r, s.r);
    }
  }

  drawHills(ctx) {
    const hy = this.horizonY();
    const layers = [
      { color: "#1a2838", y: 0.92, amp: 0.06 },
      { color: "#1e3340", y: 0.88, amp: 0.08 },
      { color: "#243a32", y: 0.84, amp: 0.1 },
    ];
    for (const layer of layers) {
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, hy);
      for (let x = 0; x <= this.w; x += 8) {
        const nx = x / this.w;
        const wave =
          Math.sin(nx * 6 + this.time * 0.08) * layer.amp +
          Math.sin(nx * 13 - this.time * 0.05) * layer.amp * 0.45;
        const y = hy - this.h * layer.y * 0.35 + wave * this.h * 0.04;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(this.w, this.h);
      ctx.lineTo(0, this.h);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawGround(ctx) {
    const hy = this.horizonY();
    const g = ctx.createLinearGradient(0, hy, 0, this.h);
    g.addColorStop(0, "#2d5a38");
    g.addColorStop(0.35, "#234a2e");
    g.addColorStop(1, "#142818");
    ctx.fillStyle = g;
    ctx.fillRect(0, hy, this.w, this.h - hy);

    ctx.strokeStyle = "rgba(40, 90, 50, 0.25)";
    ctx.lineWidth = 1;
    for (let row = 0; row < 14; row++) {
      const y = hy + row * ((this.h - hy) / 14);
      ctx.beginPath();
      for (let x = 0; x <= this.w; x += 16) {
        const bump = Math.sin(x * 0.04 + row * 0.7 + this.time * 0.3) * 2;
        ctx.lineTo(x, y + bump);
      }
      ctx.stroke();
    }

    const pathY = hy + (this.h - hy) * 0.55;
    ctx.fillStyle = "#3d2e22";
    ctx.beginPath();
    ctx.moveTo(0, pathY + 18);
    for (let x = 0; x <= this.w; x += 12) {
      const wobble = Math.sin(x * 0.02 + this.time * 0.2) * 4;
      ctx.lineTo(x, pathY + wobble);
    }
    ctx.lineTo(this.w, this.h);
    ctx.lineTo(0, this.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(90, 70, 45, 0.35)";
    ctx.fillRect(0, pathY - 6, this.w, 14);
  }

  drawTrees(ctx) {
    const hy = this.horizonY();
    for (const t of this.trees) {
      const parallax = 1 - t.layer;
      const x = (t.x + this.time * 0.004 * parallax) % 1;
      const px = x * this.w;
      const baseY = hy + (this.h - hy) * (0.15 + t.layer * 0.35);
      const th = t.h * this.h;
      const tw = t.w * this.w;
      ctx.fillStyle = `rgba(${12 + t.layer * 20}, ${28 + t.layer * 30}, ${22 + t.layer * 18}, 0.85)`;
      ctx.fillRect(px - tw / 2, baseY - th, tw, th);
      ctx.beginPath();
      ctx.ellipse(px, baseY - th - tw * 0.8, tw * 2.2, th * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawClouds(ctx) {
    for (const c of this.clouds) {
      const x = c.x * this.w;
      const y = c.y * this.h;
      const w = c.w * this.w;
      const h = c.h * this.h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, w);
      g.addColorStop(0, `rgba(180, 190, 220, ${c.alpha})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
      ctx.ellipse(x - w * 0.35, y + h * 0.2, w * 0.65, h * 0.85, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 0.4, y + h * 0.15, w * 0.7, h * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const flicker = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(p.phase));
      const px = p.x * this.w;
      const py = p.y * this.h;
      if (p.kind === "firefly") {
        const g = ctx.createRadialGradient(px, py, 0, px, py, p.r * 6);
        g.addColorStop(0, `rgba(255, 230, 120, ${0.55 * flicker})`);
        g.addColorStop(1, "rgba(255, 200, 80, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(px - p.r * 6, py - p.r * 6, p.r * 12, p.r * 12);
      } else {
        ctx.fillStyle = `rgba(255, 180, 220, ${0.35 * flicker})`;
        ctx.fillRect(px, py, p.r, p.r);
      }
    }
  }

  drawMon(ctx, m) {
    const img = this.sprites.get(m.id);
    if (!img) return;
    const hy = this.horizonY();
    const groundY = hy + (this.h - hy) * (0.52 + m.yOff);
    const floatY = m.float ? Math.sin(m.bob) * 22 : 0;
    const y = groundY + floatY;
    const x = m.x * this.w;
    const walkFrame = m.walk ? (Math.floor(m.phase) % 2) + 1 : 0;
    const row = walkFrame;
    const col = m.sheetCol;
    const fw = m.frame;
    const sx = col * fw;
    const sy = row * fw;
    const scale = m.scale * (this.h < 600 ? 0.85 : 1);
    const dw = fw * scale;
    const dh = fw * scale;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (m.dir < 0) {
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, fw, fw, -dw / 2, -dh + 8, dw, dh);
    } else {
      ctx.drawImage(img, sx, sy, fw, fw, x - dw / 2, y - dh + 8, dw, dh);
    }
    if (m.float) {
      const glow = ctx.createRadialGradient(x, y - dh * 0.4, 0, x, y - dh * 0.4, dw * 0.9);
      glow.addColorStop(0, "rgba(255, 140, 60, 0.18)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = glow;
      ctx.fillRect(x - dw, y - dh, dw * 2, dh * 2);
    }
    ctx.restore();
  }

  drawVignette(ctx) {
    const g = ctx.createRadialGradient(
      this.w / 2,
      this.h / 2,
      Math.min(this.w, this.h) * 0.2,
      this.w / 2,
      this.h / 2,
      Math.max(this.w, this.h) * 0.72
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.55, "rgba(0,0,0,0.15)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawSky(ctx);
    this.drawStars(ctx);
    this.drawClouds(ctx);
    const sortedMons = [...this.mons].sort((a, b) => a.layer - b.layer);
    for (const m of sortedMons) {
      if (m.layer < 0.4) this.drawMon(ctx, m);
    }
    this.drawHills(ctx);
    this.drawTrees(ctx);
    this.drawGround(ctx);
    for (const m of sortedMons) {
      if (m.layer >= 0.4) this.drawMon(ctx, m);
    }
    this.drawParticles(ctx);
    this.drawVignette(ctx);
  }
}
