/**
 * Login background: Three.js cinematic Pikachu vs Mewtwo battle loop.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { buildArena, buildMewtwo, buildPikachu } from "./loginBattleModels.js";

const CYCLE = 9.2;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOut(t) {
  return 1 - (1 - t) ** 3;
}

function flashGroup(group, color, intensity, decay = 4) {
  if (!group) return;
  group.traverse((o) => {
    if (!o.isMesh || !o.material?.emissive) return;
    o.material.emissive.set(color);
    o.material.emissiveIntensity = intensity;
    o.userData.flashDecay = decay;
  });
}

function tickFlash(group, dt) {
  group?.traverse((o) => {
    if (!o.isMesh || !o.material?.emissive || !o.userData.flashDecay) return;
    o.material.emissiveIntensity = Math.max(0, o.material.emissiveIntensity - dt * o.userData.flashDecay);
    if (o.material.emissiveIntensity <= 0.01) {
      o.material.emissive.set(0x000000);
      o.userData.flashDecay = 0;
    }
  });
}

export class LoginBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.raf = 0;
    this.active = false;
    this.lastTs = 0;
    this.cycleT = 0;
    this._onResize = () => this.resize();
    this._onVis = () => this.syncLoop();
    this.ready = false;
  }

  init() {
    if (this.ready) return Promise.resolve();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06040c);
    this.scene.fog = new THREE.FogExp2(0x0a0614, 0.028);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.camera.position.set(0, 3.8, 11);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.38, 0.72);
    this.composer.addPass(this.bloom);

    const hemi = new THREE.HemisphereLight(0x8899ff, 0x1a1028, 0.55);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffeedd, 1.35);
    key.position.set(-6, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6688ff, 0.65);
    rim.position.set(8, 6, -6);
    this.scene.add(rim);
    const fill = new THREE.PointLight(0xffaa66, 0.9, 25);
    fill.position.set(0, 4, 6);
    this.scene.add(fill);

    buildArena(this.scene);
    this.pikachu = buildPikachu();
    this.mewtwo = buildMewtwo();
    this.scene.add(this.pikachu, this.mewtwo);

    this.fx = new THREE.Group();
    this.scene.add(this.fx);

    this.thunder = this.makeLightningBolt();
    this.fx.add(this.thunder.group);
    this.shadowBall = this.makeShadowBall();
    this.fx.add(this.shadowBall.mesh);

    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkCount = 220;
    this.sparkPos = new Float32Array(this.sparkCount * 3);
    this.sparkVel = [];
    for (let i = 0; i < this.sparkCount; i++) this.resetSpark(i, true);
    this.sparkGeo.setAttribute("position", new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparks = new THREE.Points(
      this.sparkGeo,
      new THREE.PointsMaterial({
        color: 0xffffaa,
        size: 0.12,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.fx.add(this.sparks);

    this.resize();
    window.addEventListener("resize", this._onResize);
    document.addEventListener("visibilitychange", this._onVis);
    this.ready = true;
    return Promise.resolve();
  }

  makeLightningBolt() {
    const group = new THREE.Group();
    group.visible = false;
    const mats = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.35),
        new THREE.MeshStandardMaterial({
          color: 0xffffcc,
          emissive: 0xffff88,
          emissiveIntensity: 2,
          transparent: true,
          opacity: 0.95,
          flatShading: true,
        })
      );
      mats.push(m);
      group.add(m);
    }
    const core = new THREE.PointLight(0xaaccff, 0, 14);
    group.add(core);
    return { group, segments: mats, light: core, t: 0 };
  }

  makeShadowBall() {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0x2a1848,
        emissive: 0x8844cc,
        emissiveIntensity: 1.4,
        transparent: true,
        opacity: 0.92,
        flatShading: true,
      })
    );
    mesh.visible = false;
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xaa66ff,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mesh.add(aura);
    return { mesh, t: 0 };
  }

  resetSpark(i, randomPlace) {
    const ix = i * 3;
    if (randomPlace) {
      this.sparkPos[ix] = (Math.random() - 0.5) * 20;
      this.sparkPos[ix + 1] = Math.random() * 6;
      this.sparkPos[ix + 2] = (Math.random() - 0.5) * 20;
    }
    this.sparkVel[i] = {
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3,
      vz: (Math.random() - 0.5) * 4,
      life: 0,
      max: 0.4 + Math.random() * 0.5,
      active: false,
    };
  }

  burstSparks(x, y, z, n, hue = 0xffff88) {
    this.sparks.material.color.set(hue);
    let placed = 0;
    for (let i = 0; i < this.sparkCount && placed < n; i++) {
      const s = this.sparkVel[i];
      if (s.active) continue;
      s.active = true;
      s.life = 0;
      s.max = 0.35 + Math.random() * 0.45;
      const ix = i * 3;
      this.sparkPos[ix] = x + (Math.random() - 0.5) * 0.4;
      this.sparkPos[ix + 1] = y + (Math.random() - 0.5) * 0.4;
      this.sparkPos[ix + 2] = z + (Math.random() - 0.5) * 0.4;
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5;
      s.vx = Math.cos(a) * sp;
      s.vy = 1 + Math.random() * 4;
      s.vz = Math.sin(a) * sp;
      placed++;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
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

  pikaMuzzle() {
    const p = new THREE.Vector3();
    this.pikachu.getWorldPosition(p);
    p.y += 1.05;
    p.z += 0.35;
    return p;
  }

  mewtwoMuzzle() {
    const p = new THREE.Vector3();
    this.mewtwo.getWorldPosition(p);
    p.y += 1.75;
    p.z -= 0.35;
    return p;
  }

  mewtwoChest() {
    const p = new THREE.Vector3();
    this.mewtwo.getWorldPosition(p);
    p.y += 1.25;
    return p;
  }

  pikaChest() {
    const p = new THREE.Vector3();
    this.pikachu.getWorldPosition(p);
    p.y += 0.65;
    return p;
  }

  updateThunder(progress) {
    const from = this.pikaMuzzle();
    const to = this.mewtwoChest();
    this.thunder.group.visible = progress > 0 && progress < 1;
    if (!this.thunder.group.visible) {
      this.thunder.light.intensity = 0;
      return;
    }
    const eased = easeOut(clamp(progress, 0, 1));
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    dir.normalize();
    const segs = this.thunder.segments.length;
    for (let i = 0; i < segs; i++) {
      const t = (i + 0.5) / segs;
      if (t > eased) {
        this.thunder.segments[i].visible = false;
        continue;
      }
      this.thunder.segments[i].visible = true;
      const base = from.clone().lerp(to, t);
      const jag = new THREE.Vector3(
        (Math.sin(i * 2.1 + this.cycleT * 40) * 0.12) * (1 - t),
        (Math.cos(i * 1.7 + this.cycleT * 35) * 0.1) * (1 - t),
        (Math.sin(i * 3.2) * 0.08) * (1 - t)
      );
      base.add(jag);
      this.thunder.segments[i].position.copy(base);
      this.thunder.segments[i].lookAt(base.clone().add(dir));
      this.thunder.segments[i].scale.set(1, 1, len / segs + 0.2);
    }
    this.thunder.light.position.copy(from.clone().lerp(to, eased));
    this.thunder.light.intensity = 2.5 * (1 - Math.abs(eased - 0.5) * 0.5);
    if (eased > 0.92 && !this.thunder.hit) {
      this.thunder.hit = true;
      this.burstSparks(to.x, to.y, to.z, 40, 0xffffaa);
      flashGroup(this.mewtwo, 0xffffcc, 2.2, 5);
      this.mewtwo.position.x += 0.15;
    }
  }

  updateShadowBall(progress) {
    const from = this.mewtwoMuzzle();
    const to = this.pikaChest();
    this.shadowBall.mesh.visible = progress > 0 && progress < 1;
    if (!this.shadowBall.mesh.visible) return;
    const eased = easeOut(clamp(progress, 0, 1));
    const pos = from.clone().lerp(to, eased);
    const wobble = Math.sin(eased * Math.PI * 4) * 0.15;
    pos.y += wobble;
    this.shadowBall.mesh.position.copy(pos);
    const scale = 0.85 + Math.sin(eased * Math.PI) * 0.35;
    this.shadowBall.mesh.scale.setScalar(scale);
    if (Math.random() < 0.35) this.burstSparks(pos.x, pos.y, pos.z, 2, 0xcc88ff);
    if (eased > 0.94 && !this.shadowBall.hit) {
      this.shadowBall.hit = true;
      this.burstSparks(to.x, to.y, to.z, 45, 0xaa66ff);
      flashGroup(this.pikachu, 0xcc88ff, 2.4, 5);
      this.pikachu.position.x -= 0.12;
    }
  }

  updateBattlePose() {
    const t = this.cycleT;
    const idle = Math.sin(t * 2.2) * 0.03;
    this.pikachu.position.y = idle;
    this.mewtwo.position.y = Math.sin(t * 1.8 + 1) * 0.025;

    // Pikachu windup & strike 1.0 – 2.5
    if (t > 1.0 && t < 1.45) {
      const u = (t - 1.0) / 0.45;
      this.pikachu.rotation.z = -u * 0.2;
      this.pikachu.position.z = -u * 0.15;
    } else if (t >= 1.45 && t < 2.55) {
      this.updateThunder((t - 1.45) / 0.75);
      this.pikachu.rotation.z = -0.2 + (t - 1.45) * 0.15;
    } else {
      this.thunder.hit = false;
      this.thunder.group.visible = false;
      this.pikachu.rotation.z *= 0.92;
      this.pikachu.position.z *= 0.9;
    }

    // Mewtwo hit recoil 2.4 – 3.2
    if (t > 2.4 && t < 3.2) {
      const u = (t - 2.4) / 0.8;
      this.mewtwo.position.x = 3.2 + Math.sin(u * Math.PI) * 0.35;
      this.mewtwo.rotation.z = Math.sin(u * Math.PI) * 0.12;
    } else if (t < 4.8) {
      this.mewtwo.position.x = lerp(this.mewtwo.position.x, 3.2, 0.08);
      this.mewtwo.rotation.z *= 0.9;
    }

    // Mewtwo windup & shadow ball 4.2 – 6.0
    if (t > 4.2 && t < 4.65) {
      const u = (t - 4.2) / 0.45;
      this.mewtwo.rotation.z = u * 0.15;
      this.mewtwo.position.z = u * 0.12;
    } else if (t >= 4.65 && t < 5.85) {
      this.updateShadowBall((t - 4.65) / 0.85);
      this.mewtwo.rotation.z = 0.15 - (t - 4.65) * 0.08;
    } else {
      this.shadowBall.hit = false;
      this.shadowBall.mesh.visible = false;
      this.mewtwo.rotation.z *= 0.92;
      this.mewtwo.position.z *= 0.9;
    }

    // Pikachu hit 5.7 – 6.5
    if (t > 5.7 && t < 6.5) {
      const u = (t - 5.7) / 0.8;
      this.pikachu.position.x = -3.2 - Math.sin(u * Math.PI) * 0.28;
      this.pikachu.rotation.z = -Math.sin(u * Math.PI) * 0.15;
    } else if (t > 6.5) {
      this.pikachu.position.x = lerp(this.pikachu.position.x, -3.2, 0.06);
      this.pikachu.rotation.z *= 0.9;
    }

    // Reset home positions slowly
    if (t < 1 || t > 7) {
      this.pikachu.position.x = lerp(this.pikachu.position.x, -3.2, 0.05);
      this.mewtwo.position.x = lerp(this.mewtwo.position.x, 3.2, 0.05);
    }
  }

  tickSparks(dt) {
    for (let i = 0; i < this.sparkCount; i++) {
      const s = this.sparkVel[i];
      if (!s.active) continue;
      s.life += dt;
      if (s.life > s.max) {
        s.active = false;
        continue;
      }
      const ix = i * 3;
      this.sparkPos[ix] += s.vx * dt;
      this.sparkPos[ix + 1] += s.vy * dt;
      this.sparkPos[ix + 2] += s.vz * dt;
      s.vy -= 4 * dt;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
  }

  loop(ts) {
    this.raf = 0;
    if (!this.active || document.hidden || !this.ready) return;

    const dt = this.lastTs ? Math.min(0.05, (ts - this.lastTs) / 1000) : 0;
    this.lastTs = ts;
    this.cycleT += dt;
    if (this.cycleT >= CYCLE) {
      this.cycleT -= CYCLE;
      this.thunder.hit = false;
      this.shadowBall.hit = false;
    }

    const camA = ts * 0.00008;
    const camR = 11.5;
    this.camera.position.x = Math.sin(camA) * camR;
    this.camera.position.z = Math.cos(camA) * camR;
    this.camera.position.y = 3.6 + Math.sin(ts * 0.00035) * 0.35;
    this.camera.lookAt(0, 1.35, 0);

    this.updateBattlePose();
    tickFlash(this.pikachu, dt);
    tickFlash(this.mewtwo, dt);
    this.tickSparks(dt);

    this.composer.render();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }
}
