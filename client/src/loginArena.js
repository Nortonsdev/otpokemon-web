/**
 * Cenário da batalha de login: arena lendária ao crepúsculo.
 * Céu em gradiente, piso de pedra com círculo rúnico, pilares com cristais,
 * cones de luz volumétrica e partículas de poeira/brasas.
 */
import * as THREE from "three";

function canvasTexture(size, draw, opts = {}) {
  const c = document.createElement("canvas");
  c.width = opts.width ?? size;
  c.height = opts.height ?? size;
  draw(c.getContext("2d"), c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture() {
  return canvasTexture(0, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.0, "#05030f");
    g.addColorStop(0.38, "#120a2e");
    g.addColorStop(0.62, "#3b1650");
    g.addColorStop(0.78, "#7a2a5e");
    g.addColorStop(0.88, "#c65f52");
    g.addColorStop(1.0, "#1a0d24");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { width: 64, height: 512 });
}

function stoneTexture() {
  return canvasTexture(512, (ctx, w, h) => {
    ctx.fillStyle = "#242033";
    ctx.fillRect(0, 0, w, h);
    // manchas de pedra
    for (let i = 0; i < 900; i++) {
      const v = 26 + Math.random() * 26;
      ctx.fillStyle = `rgba(${v + 8},${v},${v + 22},${0.16 + Math.random() * 0.2})`;
      const r = 2 + Math.random() * 14;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // rachaduras
    ctx.strokeStyle = "rgba(10,8,18,0.55)";
    for (let i = 0; i < 26; i++) {
      ctx.lineWidth = 0.8 + Math.random() * 1.4;
      ctx.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * h;
      ctx.moveTo(x, y);
      const steps = 4 + (Math.random() * 5) | 0;
      for (let s = 0; s < steps; s++) {
        x += (Math.random() - 0.5) * 90;
        y += (Math.random() - 0.5) * 90;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // vinheta radial escura
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.55);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(4,3,10,0.85)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function runeTexture() {
  return canvasTexture(512, (ctx, w) => {
    const cx = w / 2;
    ctx.clearRect(0, 0, w, w);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    const ring = (r, lw, dash) => {
      ctx.lineWidth = lw;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      ctx.arc(cx, cx, r, 0, Math.PI * 2);
      ctx.stroke();
    };
    ring(238, 5);
    ring(224, 2, [26, 14]);
    ring(160, 3, [4, 22]);
    ring(96, 2);
    ctx.setLineDash([]);
    // "glifos": traços radiais
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const r0 = 170 + (i % 3) * 10;
      const r1 = r0 + 18 + (i % 2) * 14;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1);
      ctx.stroke();
    }
    // losangos cardeais
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = cx + Math.cos(a) * 128;
      const y = cx + Math.sin(a) * 128;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI / 4);
      ctx.strokeRect(-9, -9, 18, 18);
      ctx.restore();
    }
  });
}

export function glowTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
  return canvasTexture(128, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
}

function coneTexture() {
  return canvasTexture(0, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { width: 32, height: 128 });
}

function buildPillar(h, crystalColor) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x2c2740, roughness: 0.9, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d1930, roughness: 0.95, flatShading: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.75, 0.42, 8), dark);
  base.position.y = 0.21;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, h, 8), stone);
  shaft.position.y = 0.42 + h / 2;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.3, 8), dark);
  cap.position.y = 0.42 + h + 0.15;
  g.add(base, shaft, cap);
  if (crystalColor) {
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.26),
      new THREE.MeshBasicMaterial({ color: crystalColor, toneMapped: false })
    );
    crystal.position.y = 0.42 + h + 0.62;
    crystal.userData.baseY = crystal.position.y;
    g.add(crystal);
    g.userData.crystal = crystal;
  }
  return g;
}

export function buildArena(scene) {
  const handle = { crystals: [], runes: null, embers: null, cones: [] };

  // céu + estrelas
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(70, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, toneMapped: false })
  );
  scene.add(sky);

  const starGeo = new THREE.BufferGeometry();
  const starCount = 420;
  const sp = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = 0.12 + Math.random() * (Math.PI / 2 - 0.14);
    const r = 62;
    sp[i * 3] = Math.cos(th) * Math.cos(ph) * r;
    sp[i * 3 + 1] = Math.sin(ph) * r;
    sp[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * r;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcdd8ff, size: 0.42, transparent: true, opacity: 0.85, fog: false, sizeAttenuation: true,
  })));

  // piso de pedra
  const stoneTex = stoneTexture();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(15, 56),
    new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.62, metalness: 0.24 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(15.2, 15.6, 0.5, 56, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x171226, roughness: 0.95 })
  );
  rim.position.y = -0.26;
  scene.add(rim);

  // círculo rúnico brilhante
  const runes = new THREE.Mesh(
    new THREE.PlaneGeometry(11.6, 11.6),
    new THREE.MeshBasicMaterial({
      map: runeTexture(), color: 0x8f7bff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })
  );
  runes.rotation.x = -Math.PI / 2;
  runes.position.y = 0.02;
  scene.add(runes);
  handle.runes = runes;

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(5.55, 5.72, 72),
    new THREE.MeshBasicMaterial({
      color: 0xb9a5ff, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.03;
  scene.add(innerRing);

  // pilares em arco atrás da arena (deixa o fundo rico sem tampar o card)
  const pillarConf = [
    [-9.6, -4.4, 3.4, 0xffc76a], [-6.4, -8.2, 4.6, 0x9a7bff],
    [-2.2, -10.4, 3.0, 0xffc76a], [2.2, -10.4, 4.9, 0x9a7bff],
    [6.4, -8.2, 3.2, 0xffc76a], [9.6, -4.4, 4.4, 0x9a7bff],
    [-11.2, 0.6, 2.6, 0x9a7bff], [11.2, 0.6, 2.8, 0xffc76a],
  ];
  for (const [x, z, h, col] of pillarConf) {
    const p = buildPillar(h, col);
    p.position.set(x, 0, z);
    p.rotation.y = Math.random() * Math.PI;
    scene.add(p);
    if (p.userData.crystal) handle.crystals.push(p.userData.crystal);
  }

  // cones de luz volumétrica sobre cada lutador
  const coneTex = coneTexture();
  const mkCone = (color, x, z, r) => {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(r, 7.5, 24, 1, true),
      new THREE.MeshBasicMaterial({
        map: coneTex, color, transparent: true, opacity: 0.28,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      })
    );
    cone.position.set(x, 3.75, z);
    scene.add(cone);
    handle.cones.push(cone);
    return cone;
  };
  mkCone(0xffd977, -2.7, 1.6, 2.5);
  mkCone(0x9d6bff, 2.8, -1.4, 3.2);

  // poeira/brasas flutuantes
  const emberCount = 130;
  const eg = new THREE.BufferGeometry();
  const ep = new Float32Array(emberCount * 3);
  const ec = new Float32Array(emberCount * 3);
  const evel = [];
  const gold = new THREE.Color(0xffca6e);
  const violet = new THREE.Color(0xa678ff);
  for (let i = 0; i < emberCount; i++) {
    ep[i * 3] = (Math.random() - 0.5) * 22;
    ep[i * 3 + 1] = Math.random() * 6;
    ep[i * 3 + 2] = (Math.random() - 0.5) * 18;
    const c = Math.random() < 0.5 ? gold : violet;
    ec[i * 3] = c.r; ec[i * 3 + 1] = c.g; ec[i * 3 + 2] = c.b;
    evel.push(0.15 + Math.random() * 0.35);
  }
  eg.setAttribute("position", new THREE.BufferAttribute(ep, 3));
  eg.setAttribute("color", new THREE.BufferAttribute(ec, 3));
  const embers = new THREE.Points(eg, new THREE.PointsMaterial({
    map: glowTexture(), size: 0.16, vertexColors: true, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(embers);
  handle.embers = { points: embers, pos: ep, vel: evel, count: emberCount, geo: eg };

  handle.tick = (t, dt) => {
    runes.rotation.z = t * 0.05;
    runes.material.opacity = 0.48 + Math.sin(t * 1.4) * 0.1;
    innerRing.material.opacity = 0.65 + Math.sin(t * 1.9 + 1) * 0.18;
    for (let i = 0; i < handle.crystals.length; i++) {
      const c = handle.crystals[i];
      c.rotation.y = t * 0.7 + i;
      c.position.y = c.userData.baseY + Math.sin(t * 1.3 + i * 1.7) * 0.08;
    }
    const e = handle.embers;
    for (let i = 0; i < e.count; i++) {
      e.pos[i * 3 + 1] += e.vel[i] * dt;
      e.pos[i * 3] += Math.sin(t * 0.6 + i) * 0.0035;
      if (e.pos[i * 3 + 1] > 7) e.pos[i * 3 + 1] = 0;
    }
    e.geo.attributes.position.needsUpdate = true;
  };

  return handle;
}
