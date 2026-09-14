/**
 * Fundo do login: batalha cinematográfica Pikachu vs Mewtwo em loop.
 * Usa os sprites reais de pixel-art (client/public/login-battle/) como
 * billboards animados dentro de uma arena 3D estilizada — nada procedural.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { buildArena, glowTexture } from "./loginArena.js";

const CYCLE = 10;
const ASSET_BASE = "/login-battle";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (t) => 1 - (1 - t) ** 3;

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      resolve(tex);
    }, undefined, reject);
  });
}

/** Billboard animado de pixel-art (grade de frames com durações do GIF). */
class BattleSprite {
  constructor(texture, meta, { height, mirror = false }) {
    this.meta = meta;
    this.frame = 0;
    this.acc = 0;
    this.speed = 1;
    this.height = height;
    const width = height * (meta.w / meta.h);
    this.width = width;

    texture.repeat.set((mirror ? -1 : 1) / meta.cols, 1 / meta.rows);
    this.texture = texture;
    this.mirror = mirror;

    this.material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    this.mesh.position.y = height / 2;

    this.root = new THREE.Group();
    this.root.add(this.mesh);
    this.flashColor = new THREE.Color(1, 1, 1);
    this.flashAmt = 0;
    this.home = new THREE.Vector3();
    this.shake = 0;
    this.applyFrame();
  }

  applyFrame() {
    const { cols, rows } = this.meta;
    const col = this.frame % cols;
    const row = (this.frame / cols) | 0;
    const u = this.mirror ? (col + 1) / cols : col / cols;
    this.texture.offset.set(u, 1 - (row + 1) / rows);
  }

  flash(color, amount = 1) {
    this.flashColor.set(color);
    this.flashAmt = amount;
  }

  update(dt, t, camera) {
    this.acc += dt * 1000 * this.speed;
    let dur = this.meta.durations[this.frame] || 120;
    while (this.acc >= dur) {
      this.acc -= dur;
      this.frame = (this.frame + 1) % this.meta.frames;
      dur = this.meta.durations[this.frame] || 120;
    }
    this.applyFrame();

    // billboard cilíndrico (só gira no eixo Y, continua "em pé")
    this.root.rotation.y = Math.atan2(
      camera.position.x - this.root.position.x,
      camera.position.z - this.root.position.z
    );

    // flutuação sutil + tremor de impacto
    const bob = Math.sin(t * 2 + this.home.x) * 0.05;
    this.mesh.position.y = this.height / 2 + bob;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      this.mesh.position.x = Math.sin(t * 70) * 0.14 * this.shake;
    } else {
      this.mesh.position.x = 0;
    }

    // flash de dano com decaimento
    if (this.flashAmt > 0.01) {
      this.flashAmt *= Math.exp(-dt * 6);
      const f = this.flashAmt;
      this.material.color.setRGB(
        1 + this.flashColor.r * 2.4 * f,
        1 + this.flashColor.g * 2.4 * f,
        1 + this.flashColor.b * 2.4 * f
      );
    } else if (this.material.color.r !== 1) {
      this.material.color.setRGB(1, 1, 1);
    }
  }
}

export class LoginBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.raf = 0;
    this.active = false;
    this.lastTs = 0;
    this.cycleT = 0;
    this.time = 0;
    this.camShake = 0;
    this._onResize = () => this.resize();
    this._onVis = () => this.syncLoop();
    this.ready = false;
  }

  async init() {
    if (this.ready) return;

    const [meta, pikaTex, mewTex] = await Promise.all([
      fetch(`${ASSET_BASE}/meta.json`).then((r) => r.json()),
      loadTexture(`${ASSET_BASE}/pikachu_back.png`),
      loadTexture(`${ASSET_BASE}/mewtwo_front.png`),
    ]);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x140a24, 0.02);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 160);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.62);
    this.composer.addPass(this.bloom);

    // iluminação: key amarela (lado Pikachu), rim roxa (lado Mewtwo), fill suave
    this.scene.add(new THREE.HemisphereLight(0x7a6bb0, 0x181026, 0.75));
    const key = new THREE.DirectionalLight(0xffd98a, 1.15);
    key.position.set(-7, 9, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8d5cff, 1.0);
    rim.position.set(8, 7, -5);
    this.scene.add(rim);

    this.arena = buildArena(this.scene);

    // lutadores: sprites reais (pixel art OTP nítida em billboards)
    this.pikachu = new BattleSprite(pikaTex, meta.pikachu.back, { height: 2.1 });
    this.pikachu.root.position.set(-2.7, 0, 1.6);
    this.pikachu.home.copy(this.pikachu.root.position);
    this.scene.add(this.pikachu.root);

    this.mewtwo = new BattleSprite(mewTex, meta.mewtwo.front, { height: 3.3 });
    this.mewtwo.root.position.set(2.8, 0, -1.4);
    this.mewtwo.home.copy(this.mewtwo.root.position);
    this.scene.add(this.mewtwo.root);

    this.addGroundFx();
    this.buildVfx();

    this.resize();
    window.addEventListener("resize", this._onResize);
    document.addEventListener("visibilitychange", this._onVis);
    this.ready = true;
    this.syncLoop();
  }

  addGroundFx() {
    const mkDisc = (tex, color, size, opacity, additive, x, z) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({
          map: tex, color, transparent: true, opacity, depthWrite: false, toneMapped: false,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.04 + Math.random() * 0.01, z);
      this.scene.add(m);
      return m;
    };
    const shadowTex = glowTexture("rgba(0,0,0,0.85)", "rgba(0,0,0,0)");
    const glow = glowTexture();
    const p = this.pikachu.root.position;
    const m = this.mewtwo.root.position;
    mkDisc(shadowTex, 0xffffff, 2.2, 0.75, false, p.x, p.z);
    mkDisc(shadowTex, 0xffffff, 3.4, 0.75, false, m.x, m.z);
    this.pikaGlow = mkDisc(glow, 0xffc94d, 4.2, 0.3, true, p.x, p.z);
    this.mewGlow = mkDisc(glow, 0x9455ff, 5.6, 0.3, true, m.x, m.z);
  }

  buildVfx() {
    this.fx = new THREE.Group();
    this.scene.add(this.fx);
    const glow = glowTexture();

    // raio (Thunderbolt) descendo do céu sobre o Mewtwo
    this.boltMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.6, 2.4, 1.2),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.boltSegs = [];
    for (let i = 0; i < 26; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 1), this.boltMat);
      seg.visible = false;
      this.fx.add(seg);
      this.boltSegs.push(seg);
    }
    this.boltLight = new THREE.PointLight(0xfff2aa, 0, 20, 1.6);
    this.fx.add(this.boltLight);

    // esfera sombria (Shadow Ball)
    this.ball = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x1b0a30, toneMapped: false })
    );
    const mkHalo = (size, color, opacity) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      s.scale.setScalar(size);
      return s;
    };
    this.ballHaloA = mkHalo(1.6, 0xa14dff, 0.85);
    this.ballHaloB = mkHalo(2.6, 0x5a1bb0, 0.4);
    this.ball.add(core, this.ballHaloA, this.ballHaloB);
    this.ball.visible = false;
    this.fx.add(this.ball);
    this.ballLight = new THREE.PointLight(0xa14dff, 0, 12, 1.8);
    this.fx.add(this.ballLight);

    // clarões de impacto
    this.impact = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.impact.scale.setScalar(6);
    this.fx.add(this.impact);

    // ondas de choque no chão
    this.shockwaves = [];
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.86, 1, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.fx.add(ring);
      this.shockwaves.push({ mesh: ring, t: 1 });
    }

    // faíscas
    this.sparkCount = 240;
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(this.sparkCount * 3);
    this.sparkCol = new Float32Array(this.sparkCount * 3);
    this.sparkVel = [];
    for (let i = 0; i < this.sparkCount; i++) {
      this.sparkPos[i * 3 + 1] = -10;
      this.sparkVel.push({ vx: 0, vy: 0, vz: 0, life: 0, max: 0, active: false });
    }
    this.sparkGeo.setAttribute("position", new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkGeo.setAttribute("color", new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparks = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({
      map: glow, size: 0.17, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.fx.add(this.sparks);

    this.thunderHit = false;
    this.ballHit = false;
  }

  burstSparks(pos, n, color, spread = 1) {
    const c = new THREE.Color(color);
    let placed = 0;
    for (let i = 0; i < this.sparkCount && placed < n; i++) {
      const s = this.sparkVel[i];
      if (s.active) continue;
      s.active = true;
      s.life = 0;
      s.max = 0.35 + Math.random() * 0.5;
      const ix = i * 3;
      this.sparkPos[ix] = pos.x + (Math.random() - 0.5) * 0.4;
      this.sparkPos[ix + 1] = pos.y + (Math.random() - 0.5) * 0.4;
      this.sparkPos[ix + 2] = pos.z + (Math.random() - 0.5) * 0.4;
      const a = Math.random() * Math.PI * 2;
      const sp = (1.5 + Math.random() * 4.5) * spread;
      s.vx = Math.cos(a) * sp;
      s.vy = 1 + Math.random() * 4;
      s.vz = Math.sin(a) * sp;
      this.sparkCol[ix] = c.r;
      this.sparkCol[ix + 1] = c.g;
      this.sparkCol[ix + 2] = c.b;
      placed++;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;
  }

  tickSparks(dt) {
    for (let i = 0; i < this.sparkCount; i++) {
      const s = this.sparkVel[i];
      if (!s.active) continue;
      s.life += dt;
      const ix = i * 3;
      if (s.life > s.max) {
        s.active = false;
        this.sparkPos[ix + 1] = -10;
        continue;
      }
      this.sparkPos[ix] += s.vx * dt;
      this.sparkPos[ix + 1] += s.vy * dt;
      this.sparkPos[ix + 2] += s.vz * dt;
      s.vy -= 7 * dt;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
  }

  spawnShockwave(pos, color) {
    const sw = this.shockwaves.find((s) => s.t >= 1) || this.shockwaves[0];
    sw.t = 0;
    sw.mesh.visible = true;
    sw.mesh.material.color.set(color);
    sw.mesh.position.set(pos.x, 0.06, pos.z);
  }

  tickShockwaves(dt) {
    for (const sw of this.shockwaves) {
      if (sw.t >= 1) { sw.mesh.visible = false; continue; }
      sw.t = Math.min(1, sw.t + dt * 1.6);
      const e = easeOut(sw.t);
      sw.mesh.scale.setScalar(0.4 + e * 4.6);
      sw.mesh.material.opacity = 0.85 * (1 - e);
    }
  }

  flashImpact(pos, color, strength) {
    this.impact.position.copy(pos);
    this.impact.material.color.set(color);
    this.impact.material.opacity = strength;
  }

  /** Raio em zigue-zague do céu até o alvo, com flicker por frame. */
  updateBolt(progress, target) {
    const active = progress > 0 && progress < 1;
    for (const s of this.boltSegs) s.visible = false;
    if (!active) { this.boltLight.intensity *= 0.8; return; }

    const top = new THREE.Vector3(target.x + 0.4, 9.5, target.z - 0.3);
    const bottom = new THREE.Vector3(target.x, target.y, target.z);
    const reach = easeOut(clamp(progress * 2.4, 0, 1)); // desce rápido, morre devagar
    const fade = progress > 0.6 ? 1 - (progress - 0.6) / 0.4 : 1;
    this.boltMat.opacity = 0.95 * fade;

    const main = 16;
    const jitter = () => (Math.random() - 0.5);
    let prev = top.clone();
    for (let i = 0; i < main; i++) {
      const t = (i + 1) / main;
      if (t > reach) break;
      const p = top.clone().lerp(bottom, t);
      p.x += jitter() * 0.7 * Math.sin(t * Math.PI);
      p.z += jitter() * 0.5 * Math.sin(t * Math.PI);
      const seg = this.boltSegs[i];
      seg.visible = true;
      const mid = prev.clone().lerp(p, 0.5);
      seg.position.copy(mid);
      seg.lookAt(p);
      seg.scale.set(1 + fade, 1 + fade, prev.distanceTo(p));
      prev = p;
    }
    // dois galhos curtos
    for (let b = 0; b < 2; b++) {
      const start = top.clone().lerp(bottom, 0.35 + b * 0.25);
      let bp = start.clone();
      for (let i = 0; i < 5; i++) {
        const seg = this.boltSegs[main + b * 5 + i];
        if (!seg || (0.35 + b * 0.25) > reach) break;
        const np = bp.clone().add(new THREE.Vector3(jitter() * 0.8 - 0.5, -0.55, jitter() * 0.6));
        seg.visible = true;
        seg.position.copy(bp.clone().lerp(np, 0.5));
        seg.lookAt(np);
        seg.scale.set(0.6, 0.6, bp.distanceTo(np));
        bp = np;
      }
    }
    this.boltLight.position.set(target.x, target.y + 2.5, target.z + 0.5);
    this.boltLight.intensity = 14 * fade * reach;
  }

  updateBattle(dt) {
    const t = this.cycleT;
    const pika = this.pikachu;
    const mew = this.mewtwo;
    const pikaCenter = pika.root.position.clone().setY(pika.height * 0.55);
    const mewCenter = mew.root.position.clone().setY(mew.height * 0.5);

    // ---- Pikachu carrega (1.0–1.9): faíscas elétricas ao redor ----
    if (t > 1.0 && t < 1.9) {
      pika.speed = 2.2;
      if (Math.random() < 0.55) {
        this.burstSparks(pikaCenter, 3, 0xffe66a, 0.5);
      }
      this.pikaGlow.material.opacity = 0.3 + (t - 1.0) * 0.5;
    } else {
      pika.speed = 1;
      this.pikaGlow.material.opacity = Math.max(0.3, this.pikaGlow.material.opacity - dt * 1.2);
    }

    // ---- Thunderbolt cai sobre o Mewtwo (1.9–2.9) ----
    if (t >= 1.9 && t < 2.9) {
      this.updateBolt((t - 1.9) / 1.0, mewCenter);
      if (t > 2.15 && !this.thunderHit) {
        this.thunderHit = true;
        mew.flash(0xfff2aa, 1);
        mew.shake = 1;
        this.camShake = 0.5;
        this.burstSparks(mewCenter, 60, 0xffee88, 1.4);
        this.spawnShockwave(mew.root.position, 0xffdd66);
        this.flashImpact(mewCenter, 0xfff6c0, 0.9);
      }
    } else {
      this.updateBolt(0, mewCenter);
    }

    // ---- Mewtwo carrega a Shadow Ball (4.6–5.6) ----
    const mewHand = mew.root.position.clone().add(new THREE.Vector3(-0.9, mew.height * 0.5, 0.6));
    if (t > 4.6 && t < 5.6) {
      const u = (t - 4.6) / 1.0;
      this.ball.visible = true;
      this.ball.position.copy(mewHand);
      this.ball.scale.setScalar(0.25 + u * 0.85);
      this.ballLight.position.copy(mewHand);
      this.ballLight.intensity = 6 * u;
      this.mewGlow.material.opacity = 0.3 + u * 0.5;
      if (Math.random() < 0.4) this.burstSparks(mewHand, 2, 0xb066ff, 0.4);
    } else {
      this.mewGlow.material.opacity = Math.max(0.3, this.mewGlow.material.opacity - dt * 1.2);
    }

    // ---- Shadow Ball voa até o Pikachu (5.6–6.45) ----
    if (t >= 5.6 && t < 6.45) {
      const u = easeOut((t - 5.6) / 0.85);
      this.ball.visible = true;
      const p = mewHand.clone().lerp(pikaCenter, u);
      p.y += Math.sin(u * Math.PI) * 0.9 + Math.sin(u * Math.PI * 5) * 0.08;
      this.ball.position.copy(p);
      this.ball.scale.setScalar(1.1);
      this.ballHaloA.material.rotation += dt * 7;
      this.ballLight.position.copy(p);
      this.ballLight.intensity = 8;
      if (Math.random() < 0.7) this.burstSparks(p, 2, 0x9b4dff, 0.3);
      if (u > 0.96 && !this.ballHit) {
        this.ballHit = true;
        pika.flash(0xc27aff, 1);
        pika.shake = 1;
        this.camShake = 0.45;
        this.burstSparks(pikaCenter, 55, 0xb47aff, 1.3);
        this.spawnShockwave(pika.root.position, 0xa666ff);
        this.flashImpact(pikaCenter, 0xd2a0ff, 0.85);
      }
    } else if (t >= 6.45 || t < 4.6) {
      this.ball.visible = false;
      this.ballLight.intensity *= 0.8;
    }
  }

  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
  }

  setActive(on) {
    this.active = on;
    this.canvas.classList.toggle("hidden", !on);
    this.syncLoop();
  }

  syncLoop() {
    if (!this.active || document.hidden || !this.ready) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      return;
    }
    if (!this.raf) {
      this.lastTs = 0;
      this.raf = requestAnimationFrame((ts) => this.loop(ts));
    }
  }

  destroy() {
    this.setActive(false);
    window.removeEventListener("resize", this._onResize);
    document.removeEventListener("visibilitychange", this._onVis);
    this.renderer?.dispose();
  }

  loop(ts) {
    this.raf = 0;
    if (!this.active || document.hidden || !this.ready) return;

    const dt = this.lastTs ? Math.min(0.05, (ts - this.lastTs) / 1000) : 0;
    this.lastTs = ts;
    this.time += dt;
    this.cycleT += dt;
    if (this.cycleT >= CYCLE) {
      this.cycleT -= CYCLE;
      this.thunderHit = false;
      this.ballHit = false;
    }

    // câmera: dolly/orbit suave em arco frontal + tremor decrescente nos impactos
    const t = this.time;
    const swing = Math.sin(t * 0.11);
    const camX = -1.6 + swing * 2.2;
    const camZ = 9.6 - Math.abs(swing) * 0.7;
    const camY = 2.9 + Math.sin(t * 0.07) * 0.3;
    this.camShake = Math.max(0, this.camShake - dt * 1.1);
    const shake = this.camShake ** 2;
    this.camera.position.set(
      camX + Math.sin(t * 47) * 0.12 * shake,
      camY + Math.sin(t * 61) * 0.1 * shake,
      camZ
    );
    this.camera.lookAt(0.2, 1.8, 0);

    this.arena.tick(t, dt);
    this.updateBattle(dt);
    this.pikachu.update(dt, t, this.camera);
    this.mewtwo.update(dt, t, this.camera);
    this.tickSparks(dt);
    this.tickShockwaves(dt);
    if (this.impact.material.opacity > 0.01) {
      this.impact.material.opacity *= Math.exp(-dt * 7);
    } else {
      this.impact.material.opacity = 0;
    }

    this.composer.render();
    this.raf = requestAnimationFrame((ti) => this.loop(ti));
  }
}
