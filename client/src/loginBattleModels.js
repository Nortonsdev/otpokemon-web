import * as THREE from "three";

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.08,
    emissive: opts.emissive ?? new THREE.Color(0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    flatShading: true,
  });
}

function addMesh(group, geo, material, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (s !== 1) m.scale.setScalar(s);
  group.add(m);
  return m;
}

/** Low-poly stylized Pikachu — procedural, not game sprites. */
export function buildPikachu() {
  const root = new THREE.Group();
  root.name = "pikachu";
  const yellow = mat(0xf5d020);
  const yellowDark = mat(0xc9a018);
  const red = mat(0xe83828);

  const body = addMesh(root, new THREE.SphereGeometry(0.52, 8, 6), yellow, 0, 0.55, 0, 0, 0, 0, 1);
  body.scale.set(1, 0.92, 0.88);
  addMesh(root, new THREE.SphereGeometry(0.38, 8, 6), yellow, 0, 1.05, 0.08);
  addMesh(root, new THREE.ConeGeometry(0.12, 0.55, 4), yellowDark, -0.22, 1.35, 0, 0.35, 0, -0.25);
  addMesh(root, new THREE.ConeGeometry(0.12, 0.55, 4), yellowDark, 0.22, 1.35, 0, 0.35, 0, 0.25);
  addMesh(root, new THREE.SphereGeometry(0.09, 6, 4), red, -0.2, 0.98, 0.32);
  addMesh(root, new THREE.SphereGeometry(0.09, 6, 4), red, 0.2, 0.98, 0.32);
  addMesh(root, new THREE.BoxGeometry(0.18, 0.12, 0.1), yellowDark, -0.42, 0.62, 0.1, 0, 0, 0.4);
  addMesh(root, new THREE.BoxGeometry(0.18, 0.12, 0.1), yellowDark, 0.42, 0.62, 0.1, 0, 0, -0.4);
  addMesh(root, new THREE.BoxGeometry(0.14, 0.22, 0.16), yellowDark, -0.22, 0.12, 0.12);
  addMesh(root, new THREE.BoxGeometry(0.14, 0.22, 0.16), yellowDark, 0.22, 0.12, 0.12);

  const tail = new THREE.Group();
  tail.position.set(-0.05, 0.72, -0.42);
  addMesh(tail, new THREE.BoxGeometry(0.08, 0.35, 0.08), yellow, 0, 0.15, 0, 0.5, 0, 0);
  addMesh(tail, new THREE.BoxGeometry(0.1, 0.28, 0.08), yellow, -0.12, 0.42, 0, 0.9, 0, 0.4);
  addMesh(tail, new THREE.BoxGeometry(0.12, 0.22, 0.08), yellowDark, -0.28, 0.58, 0, 1.1, 0, 0.9);
  root.add(tail);

  const nose = addMesh(root, new THREE.SphereGeometry(0.04, 4, 4), mat(0x1a1a1a), 0, 1.02, 0.36);
  const eyeL = addMesh(root, new THREE.SphereGeometry(0.05, 4, 4), mat(0x111111), -0.12, 1.08, 0.28);
  const eyeR = addMesh(root, new THREE.SphereGeometry(0.05, 4, 4), mat(0x111111), 0.12, 1.08, 0.28);

  root.userData.hitMeshes = [body, nose, eyeL, eyeR];
  root.position.set(-3.2, 0, 0);
  root.rotation.y = Math.PI / 2;
  return root;
}

/** Low-poly stylized Mewtwo — procedural silhouette. */
export function buildMewtwo() {
  const root = new THREE.Group();
  root.name = "mewtwo";
  const purple = mat(0x9a7ab8);
  const purpleDark = mat(0x5a4878);
  const belly = mat(0xd8d0e8);

  const torso = addMesh(root, new THREE.CylinderGeometry(0.32, 0.38, 1.1, 6), purple, 0, 1.15, 0);
  addMesh(root, new THREE.SphereGeometry(0.36, 8, 6), purple, 0, 1.85, 0.02);
  addMesh(root, new THREE.BoxGeometry(0.22, 0.18, 0.28), purpleDark, 0, 1.78, 0.28);
  addMesh(root, new THREE.SphereGeometry(0.14, 6, 4), belly, 0, 1.05, 0.32);
  addMesh(root, new THREE.CylinderGeometry(0.1, 0.14, 0.35, 5), purpleDark, 0, 2.05, 0.22, 0.25, 0, 0);

  addMesh(root, new THREE.SphereGeometry(0.2, 6, 5), purple, -0.55, 1.55, 0, 0, 0, 0.5);
  addMesh(root, new THREE.SphereGeometry(0.2, 6, 5), purple, 0.55, 1.55, 0, 0, 0, -0.5);
  addMesh(root, new THREE.CylinderGeometry(0.08, 0.1, 0.75, 5), purple, -0.72, 1.05, 0.08, 0, 0, 0.35);
  addMesh(root, new THREE.CylinderGeometry(0.08, 0.1, 0.75, 5), purple, 0.72, 1.05, 0.08, 0, 0, -0.35);

  const tail = new THREE.Group();
  tail.position.set(0, 0.85, -0.35);
  addMesh(tail, new THREE.CylinderGeometry(0.12, 0.18, 0.9, 5), purpleDark, 0, 0.35, -0.25, 0.6, 0, 0);
  addMesh(tail, new THREE.SphereGeometry(0.22, 6, 5), mat(0x6b48a0), 0, 0.75, -0.55);
  root.add(tail);

  const eyeL = addMesh(root, new THREE.SphereGeometry(0.055, 4, 4), mat(0x88e0ff, { emissive: 0x4488cc, emissiveIntensity: 0.35 }), -0.12, 1.92, 0.26);
  const eyeR = addMesh(root, new THREE.SphereGeometry(0.055, 4, 4), mat(0x88e0ff, { emissive: 0x4488cc, emissiveIntensity: 0.35 }), 0.12, 1.92, 0.26);

  root.userData.hitMeshes = [torso, eyeL, eyeR];
  root.position.set(3.2, 0, 0);
  root.rotation.y = -Math.PI / 2;
  return root;
}

export function buildArena(scene) {
  const g = new THREE.Group();
  const floorMat = mat(0x1a1528, { roughness: 0.85, metalness: 0.2 });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.8, 0.35, 48), floorMat);
  ring.position.y = -0.05;
  g.add(ring);

  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 6.2, 0.08, 48),
    mat(0x2a2240, { emissive: 0x302050, emissiveIntensity: 0.15 })
  );
  inner.position.y = 0.02;
  g.add(inner);

  const glowRing = new THREE.Mesh(
    new THREE.TorusGeometry(6.4, 0.06, 8, 64),
    mat(0x88aaff, { emissive: 0x6688ff, emissiveIntensity: 0.8, metalness: 0.4 })
  );
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = 0.08;
  g.add(glowRing);

  const pillars = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.2, 0.35), mat(0x12101c));
    p.position.set(Math.cos(a) * 8.5, 1.1, Math.sin(a) * 8.5);
    pillars.add(p);
    const lightCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 6, 4),
      mat(0xffcc88, { emissive: 0xffaa44, emissiveIntensity: 1.2 })
    );
    lightCap.position.set(Math.cos(a) * 8.5, 2.35, Math.sin(a) * 8.5);
    pillars.add(lightCap);
  }
  g.add(pillars);

  const starsGeo = new THREE.BufferGeometry();
  const count = 800;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 40 + Math.random() * 30;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.random() * Math.PI * 0.45;
    pos[i * 3] = Math.cos(th) * Math.cos(ph) * r;
    pos[i * 3 + 1] = Math.sin(ph) * r + 8;
    pos[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * r;
  }
  starsGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xaaccff, size: 0.15, transparent: true, opacity: 0.7 }));
  g.add(stars);

  scene.add(g);
  return g;
}
