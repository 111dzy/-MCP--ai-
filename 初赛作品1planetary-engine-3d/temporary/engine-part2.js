/* ---------------- scene extensions: ground, stars, pads ---------------- */

const groundUniforms = { uTime: { value: 0 } };
const groundMaterial = new THREE.ShaderMaterial({
  uniforms: groundUniforms,
  transparent: true,
  depthWrite: false,
  vertexShader: `
    varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    varying vec3 vWorld;
    uniform float uTime;
    float lineMask(vec2 p, float scale) {
      vec2 q = p / scale;
      vec2 d = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(0.00001));
      return 1.0 - min(min(d.x, d.y), 1.0);
    }
    void main() {
      vec2 p = vWorld.xz;
      float r = length(p);
      float fade = 1.0 - smoothstep(58.0, 152.0, r);
      float fine = lineMask(p, 4.0) * 0.22;
      float major = lineMask(p, 20.0) * 0.7;
      float rf = fract(r / 18.0);
      float ring = 1.0 - smoothstep(0.0, 0.045, min(rf, 1.0 - rf));
      float r90 = fract(r / 90.0);
      float ring2 = 1.0 - smoothstep(0.0, 0.022, min(r90, 1.0 - r90));
      float halo = exp(-pow((r - 19.8) / 2.7, 2.0)) * 0.5;
      float centerGlow = exp(-r * 0.052) * 0.11;
      float sweep = 0.5 + 0.5 * sin(atan(p.y, p.x) * 3.0 + uTime * 0.08);
      float alpha = (fine * 0.09 + major * 0.16 + ring * 0.14 + ring2 * 0.2 + halo * 0.1 + centerGlow) * fade;
      vec3 col = mix(vec3(0.014, 0.042, 0.068), vec3(0.23, 0.71, 0.95), clamp(major * 0.65 + ring * 0.42 + halo * 0.95 + ring2 * 0.8, 0.0, 1.0));
      col *= 0.92 + sweep * 0.08;
      gl_FragColor = vec4(col, alpha);
    }
  `
});

const ground = new THREE.Mesh(new THREE.CircleGeometry(176, 160), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.06;
scene.add(ground);

const shadowTexture = makeRadialTexture([
  [0, 'rgba(0,0,0,0.78)'],
  [0.34, 'rgba(0,0,0,0.52)'],
  [0.68, 'rgba(0,0,0,0.16)'],
  [1, 'rgba(0,0,0,0)']
]);
const fakeShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(62, 62),
  new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false })
);
fakeShadow.rotation.x = -Math.PI / 2;
fakeShadow.position.y = 0.015;
scene.add(fakeShadow);

const pad = new THREE.Mesh(
  new THREE.RingGeometry(17.1, 23.2, 128),
  new THREE.MeshStandardMaterial({ color: 0x0a1119, metalness: 0.86, roughness: 0.62, side: THREE.DoubleSide, envMapIntensity: 0.55 })
);
pad.rotation.x = -Math.PI / 2;
pad.position.y = 0.025;
scene.add(pad);

for (let i = 0; i < 8; i++) {
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(21.6, 21.72, 72, 1, i * TAU / 8 + 0.05, TAU / 8 - 0.1),
    new THREE.MeshBasicMaterial({ color: 0x72d8ff, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  arc.rotation.x = -Math.PI / 2;
  arc.position.y = 0.035;
  scene.add(arc);
}

const padLampMat = new THREE.MeshBasicMaterial({ color: 0xb8efff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
for (let i = 0; i < 18; i++) {
  const a = i / 18 * TAU;
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.75), padLampMat);
  lamp.position.set(Math.cos(a) * 22.7, 0.07, Math.sin(a) * 22.7);
  lamp.rotation.y = Math.PI / 2 - a;
  scene.add(lamp);
}

// Low, static volumetric cones around the pad.
const shaftMaterial = new THREE.MeshBasicMaterial({
  color: 0x78d7ff,
  transparent: true,
  opacity: 0.011,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  toneMapped: false
});
for (let i = 0; i < 6; i++) {
  const a = i / 6 * TAU + 0.2;
  const geo = new THREE.CylinderGeometry(2.5, 0.24, 17, 14, 1, true);
  geo.translate(0, 8.5, 0);
  const shaft = new THREE.Mesh(geo, shaftMaterial);
  shaft.position.set(Math.cos(a) * 18.8, 0, Math.sin(a) * 18.8);
  shaft.rotation.z = Math.cos(a) * 0.025;
  shaft.rotation.x = Math.sin(a) * 0.025;
  scene.add(shaft);
}

function buildStarfield() {
  const count = 1800;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * TAU;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    const radius = 150 + Math.random() * 330;
    pos[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    pos[i * 3 + 1] = Math.cos(phi) * radius * 0.72 + 42;
    pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    const tint = Math.random();
    color.setHSL(0.55 + tint * 0.04, 0.2 + tint * 0.2, 0.56 + Math.random() * 0.32);
    col[i * 3] = color.r;
    col[i * 3 + 1] = color.g;
    col[i * 3 + 2] = color.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.9,
    map: particleTexture,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    sizeAttenuation: true,
    fog: false
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
}
buildStarfield();

let brightStarMat = null;
function buildBrightStars() {
  const count = 190;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * TAU;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    const radius = 180 + Math.random() * 300;
    pos[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    pos[i * 3 + 1] = Math.cos(phi) * radius * 0.72 + 52;
    pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    const t = Math.random();
    color.setHSL(0.54 + t * 0.05, 0.12 + t * 0.18, 0.78 + Math.random() * 0.2);
    col[i * 3] = color.r;
    col[i * 3 + 1] = color.g;
    col[i * 3 + 2] = color.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  brightStarMat = new THREE.PointsMaterial({
    size: 4.4,
    map: particleTexture,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    sizeAttenuation: true,
    fog: false
  });
  const points = new THREE.Points(geo, brightStarMat);
  points.frustumCulled = false;
  scene.add(points);
}
buildBrightStars();

// faint blue nebula wash behind the engine
const nebula = new THREE.Sprite(new THREE.SpriteMaterial({
  map: softGlowTexture,
  color: 0x1b5a82,
  transparent: true,
  opacity: 0.16,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false
}));
nebula.position.set(-28, 40, -130);
nebula.scale.set(230, 185, 1);
scene.add(nebula);

const nebula2 = new THREE.Sprite(new THREE.SpriteMaterial({
  map: softGlowTexture,
  color: 0x22546f,
  transparent: true,
  opacity: 0.12,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false
}));
nebula2.position.set(58, 22, -150);
nebula2.scale.set(250, 160, 1);
scene.add(nebula2);

/* ---------------- distant gas giant ---------------- */

function makeJupiterTexture() {
  const S = 640;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.486, 0, TAU);
  ctx.clip();

  const base = ctx.createLinearGradient(0, 0, 0, S);
  base.addColorStop(0, '#433223');
  base.addColorStop(0.35, '#6d5138');
  base.addColorStop(0.62, '#7d5c40');
  base.addColorStop(1, '#33251b');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  const bands = ['#55402d', '#8e6b4b', '#60452f', '#a37e58', '#3b2c20', '#b6916a', '#77563b'];
  let y = 4;
  while (y < S + 20) {
    const h = 5 + Math.random() * 15;
    ctx.globalAlpha = 0.3 + Math.random() * 0.34;
    ctx.fillStyle = bands[(Math.random() * bands.length) | 0];
    ctx.beginPath();
    ctx.ellipse(S / 2, y, S * 0.56, h, 0, 0, TAU);
    ctx.fill();
    y += h * 0.72;
  }
  for (let i = 0; i < 80; i++) {
    ctx.globalAlpha = 0.05 + Math.random() * 0.09;
    ctx.fillStyle = Math.random() > 0.5 ? '#20160f' : '#d6b48c';
    const yy = Math.random() * S;
    ctx.fillRect(0, yy, S, 0.7 + Math.random() * 1.8);
  }

  ctx.lineCap = 'round';
  for (let i = 0; i < 30; i++) {
    ctx.globalAlpha = 0.1 + Math.random() * 0.14;
    ctx.strokeStyle = Math.random() > 0.45 ? '#dcbc92' : '#2a1f16';
    ctx.lineWidth = 1.5 + Math.random() * 7;
    const yy = 24 + Math.random() * (S - 48);
    ctx.beginPath();
    ctx.moveTo(-10, yy);
    ctx.bezierCurveTo(S * 0.3, yy + (Math.random() - 0.5) * 24, S * 0.7, yy + (Math.random() - 0.5) * 24, S + 10, yy + (Math.random() - 0.5) * 12);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.36;
  ctx.fillStyle = '#c68a58';
  ctx.beginPath();
  ctx.ellipse(S * 0.6, S * 0.6, 66, 31, -0.16, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#f2cea6';
  ctx.beginPath();
  ctx.ellipse(S * 0.6, S * 0.595, 36, 14, -0.16, 0, TAU);
  ctx.fill();

  ctx.globalAlpha = 1;
  const limb = ctx.createRadialGradient(S / 2, S / 2, S * 0.22, S / 2, S / 2, S * 0.49);
  limb.addColorStop(0, 'rgba(0,0,0,0)');
  limb.addColorStop(0.72, 'rgba(2,6,12,0.3)');
  limb.addColorStop(1, 'rgba(2,6,12,0.98)');
  ctx.fillStyle = limb;
  ctx.fillRect(0, 0, S, S);

  const term = ctx.createLinearGradient(0, S, S, 0);
  term.addColorStop(0, 'rgba(0,0,0,0.78)');
  term.addColorStop(0.52, 'rgba(0,0,0,0.2)');
  term.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = term;
  ctx.fillRect(0, 0, S, S);

  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = '#e2f0f8';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.472, -1.15, 0.55);
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const jupiterGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: softGlowTexture,
  color: 0x9c6a44,
  transparent: true,
  opacity: 0.16,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
  toneMapped: false
}));
jupiterGlow.position.set(-100, 50, -322);
jupiterGlow.scale.set(104, 104, 1);
jupiterGlow.material.opacity = 0.1;
scene.add(jupiterGlow);

const jupiter = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeJupiterTexture(),
  transparent: true,
  opacity: 0.78,
  depthWrite: false,
  fog: false,
  toneMapped: false
}));
jupiter.position.set(-100, 50, -320);
jupiter.scale.set(48, 48, 1);
jupiter.material.rotation = -0.14;
scene.add(jupiter);

/* ---------------- foreground ice / debris ---------------- */

const rockMat = new THREE.MeshStandardMaterial({ color: 0x07111a, metalness: 0.3, roughness: 0.95, flatShading: true, envMapIntensity: 0.4 });
const rockMatLight = new THREE.MeshStandardMaterial({ color: 0x0d1c26, metalness: 0.2, roughness: 0.9, flatShading: true, envMapIntensity: 0.45 });
for (let i = 0; i < 28; i++) {
  const a = Math.random() * TAU;
  const r = 27 + Math.random() * 52;
  const s = 0.4 + Math.pow(Math.random(), 1.6) * 1.5;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), Math.random() > 0.72 ? rockMatLight : rockMat);
  rock.position.set(Math.cos(a) * r, s * 0.22 - 0.35, Math.sin(a) * r);
  rock.scale.set(s, s * (0.45 + Math.random() * 0.6), s * (0.75 + Math.random() * 0.55));
  rock.rotation.set(Math.random() * 0.7, Math.random() * TAU, Math.random() * 0.4);
  scene.add(rock);
}

/* ---------------- drifting snow / frost ---------------- */

const SNOW_COUNT = 900;
const snowPositions = new Float32Array(SNOW_COUNT * 3);
const snowMeta = [];
for (let i = 0; i < SNOW_COUNT; i++) {
  const a = Math.random() * TAU;
  const r = 14 + Math.pow(Math.random(), 0.65) * 86;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const y = Math.random() * 58;
  snowPositions[i * 3] = x;
  snowPositions[i * 3 + 1] = y;
  snowPositions[i * 3 + 2] = z;
  snowMeta.push({
    x, z, y,
    vy: 0.5 + Math.random() * 1.5,
    sway: 0.2 + Math.random() * 1.4,
    phase: Math.random() * TAU,
    speed: 0.25 + Math.random() * 0.65
  });
}
const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
const snowMat = new THREE.PointsMaterial({
  color: 0xd6f1ff,
  size: 0.15,
  map: particleTexture,
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
  fog: true
});
const snow = new THREE.Points(snowGeo, snowMat);
snow.frustumCulled = false;
scene.add(snow);

/* ---------------- ground haze ---------------- */

const haze = new THREE.Mesh(
  new THREE.PlaneGeometry(150, 150),
  new THREE.MeshBasicMaterial({
    map: softGlowTexture,
    color: 0x3f92bd,
    transparent: true,
    opacity: 0.075,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  })
);
haze.rotation.x = -Math.PI / 2;
haze.position.y = 0.32;
scene.add(haze);

const horizonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: softGlowTexture,
  color: 0x2f7ba3,
  transparent: true,
  opacity: 0.1,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
  toneMapped: false
}));
horizonGlow.position.set(0, 14, -190);
horizonGlow.scale.set(320, 84, 1);
scene.add(horizonGlow);

let backdropTime = 0;
function updateBackdrop(dt) {
  backdropTime += dt;
  const arr = snowGeo.attributes.position.array;
  for (let i = 0; i < SNOW_COUNT; i++) {
    const p = snowMeta[i];
    p.y -= p.vy * dt;
    p.phase += p.speed * dt;
    if (p.y < 0.15) {
      p.y = 56 + Math.random() * 10;
      p.x = (Math.random() * 2 - 1) * 92;
      p.z = (Math.random() * 2 - 1) * 92;
    }
    arr[i * 3] = p.x + Math.sin(p.phase) * p.sway;
    arr[i * 3 + 1] = p.y;
    arr[i * 3 + 2] = p.z + Math.cos(p.phase * 0.73) * p.sway * 0.7;
  }
  snowGeo.attributes.position.needsUpdate = true;
  haze.material.opacity = 0.072 + Math.sin(backdropTime * 0.35) * 0.012;
  nebula.position.x = -28 + Math.sin(backdropTime * 0.05) * 7;
  nebula.position.y = 40 + Math.cos(backdropTime * 0.04) * 4;
  nebula2.position.x = 58 + Math.cos(backdropTime * 0.037) * 9;
  jupiterGlow.material.opacity = 0.1 + Math.sin(backdropTime * 0.55) * 0.012;
  if (brightStarMat) brightStarMat.opacity = 0.42 + Math.sin(backdropTime * 0.75) * 0.16;
}

/* ============================================================
   procedural model helpers
   ============================================================ */

const modules = new Map();
const interactiveMeshes = [];
const spinObjects = [];
const beacons = [];
const ignitionGlowMaterials = [];
const beaconMaterial = MAT.glowAmber.clone();
beacons.push(beaconMaterial);

function metaOf(id) {
  return MODULE_META.find((m) => m.id === id);
}

function createModule(id) {
  const meta = metaOf(id);
  const group = new THREE.Group();
  group.name = 'module-' + id;
  scene.add(group);
  const instance = {
    id,
    meta,
    group,
    progress: 0,
    target: 0,
    delay: 0,
    parts: [],
    meshes: [],
    anchor: null
  };
  modules.set(id, instance);
  return instance;
}

function finalizeModule(id) {
  const inst = modules.get(id);
  if (!inst) return;
  inst.group.children.forEach((child) => {
    child.userData.basePos = child.position.clone();
    const radial = V3(child.position.x, 0, child.position.z);
    child.userData.radialDir = radial.lengthSq() > 0.0001 ? radial.normalize() : V3(0, 0, 0);
    inst.parts.push(child);
  });
  inst.group.traverse((obj) => {
    if (obj.isMesh) {
      obj.userData.moduleId = id;
      inst.meshes.push(obj);
      interactiveMeshes.push(obj);
    }
  });
  const anchor = new THREE.Object3D();
  anchor.position.fromArray(inst.meta.anchor);
  inst.group.add(anchor);
  inst.anchor = anchor;
}

function addMesh(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function cyl(parent, rTop, rBottom, height, mat, x = 0, y = 0, z = 0, radialSegments = 24, open = false) {
  return addMesh(parent, new THREE.CylinderGeometry(rTop, rBottom, height, radialSegments, 1, open), mat, x, y, z);
}

function box(parent, w, h, d, mat, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  return addMesh(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz);
}

function torus(parent, radius, tube, mat, x = 0, y = 0, z = 0, rotX = Math.PI / 2, radialSegments = 8, tubularSegments = 96) {
  return addMesh(parent, new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments), mat, x, y, z, rotX);
}

function beam(parent, a, b, radius, mat, radialSegments = 7) {
  const dir = V3().subVectors(b, a);
  const length = dir.length();
  if (length < 0.0001) return null;
  const geo = new THREE.CylinderGeometry(radius, radius, length, radialSegments, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize());
  parent.add(mesh);
  return mesh;
}

function taperedBeam(parent, a, b, r1, r2, mat, radialSegments = 8) {
  const dir = V3().subVectors(b, a);
  const length = dir.length();
  if (length < 0.0001) return null;
  const geo = new THREE.CylinderGeometry(r2, r1, length, radialSegments, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize());
  parent.add(mesh);
  return mesh;
}

function wedgePanel(parent, rTop, rBottom, height, y, thetaStart, thetaLength, mat, segments = 10) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, height, segments, 1, true, thetaStart, thetaLength);
  geo.computeBoundingBox();
  const c = V3();
  geo.boundingBox.getCenter(c);
  geo.translate(-c.x, 0, -c.z);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(c.x, y, c.z);
  parent.add(mesh);
  return mesh;
}

function radialPoint(angle, radius, y) {
  return V3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

function radialRotation(angle) {
  return Math.PI / 2 - angle;
}

function edgeRib(parent, angle, rBottom, rTop, y0, y1, radius = 0.1, mat = MAT.steel) {
  const a = radialPoint(angle, rBottom * 1.008, y0);
  const b = radialPoint(angle, rTop * 1.008, y1);
  return beam(parent, a, b, radius, mat, 6);
}

function boltRing(parent, radius, y, count, mat = MAT.steel, size = 0.13, height = 0.16) {
  for (let i = 0; i < count; i++) {
    const a = i / count * TAU;
    cyl(parent, size, size, height, mat, Math.cos(a) * radius, y, Math.sin(a) * radius, 6);
  }
}

/* ============================================================
   PE-00 / anchor ring
   ============================================================ */

function buildFoundation() {
  const inst = createModule('foundation');
  const g = inst.group;

  cyl(g, 16.0, 16.5, 1.25, MAT.hullDark, 0, 0.65, 0, 96);
  cyl(g, 15.15, 15.75, 0.55, MAT.hullMid, 0, 1.46, 0, 96);
  cyl(g, 13.85, 14.45, 1.02, MAT.hullDark, 0, 2.18, 0, 96);
  cyl(g, 12.1, 12.55, 0.5, MAT.hullMid, 0, 2.72, 0, 96);

  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU;
    box(g, 1.95, 1.16, 1.15, MAT.hull, Math.cos(a) * 15.95, 1.42, Math.sin(a) * 15.95, radialRotation(a));
    box(g, 0.32, 0.72, 0.16, i % 3 === 0 ? MAT.glowSoft : MAT.hullMid, Math.cos(a) * 16.63, 1.32, Math.sin(a) * 16.63, radialRotation(a));
  }

  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU + 0.06;
    const x = Math.cos(a) * 13.65;
    const z = Math.sin(a) * 13.65;
    box(g, 2.35, 1.3, 4.55, MAT.hull, x, 1.42, z, radialRotation(a));
    box(g, 2.85, 0.34, 4.95, MAT.hullLight, x, 2.16, z, radialRotation(a));
    box(g, 1.95, 0.34, 1.1, MAT.dark, x, 2.42, z, radialRotation(a));
    for (let j = 0; j < 4; j++) {
      const t = (j / 3 - 0.5) * 2.6;
      const bx = Math.cos(a + Math.PI / 2) * t + x;
      const bz = Math.sin(a + Math.PI / 2) * t + z;
      cyl(g, 0.19, 0.22, 0.4, MAT.steel, bx, 2.57, bz, 8);
      cyl(g, 0.09, 0.09, 0.05, MAT.glowAmber, bx, 2.8, bz, 6);
    }
  }

  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU + 0.19;
    box(g, 5.8, 0.26, 0.86, MAT.hullDark, Math.cos(a) * 12.3, 2.96, Math.sin(a) * 12.3, radialRotation(a));
    beam(g, radialPoint(a, 9.4, 2.9), radialPoint(a, 15.1, 2.9), 0.07, MAT.steel, 6);
  }

  torus(g, 15.2, 0.075, MAT.glowSoft, 0, 2.95, 0);
  torus(g, 12.8, 0.045, MAT.glow, 0, 3.09, 0);
  torus(g, 16.15, 0.05, MAT.glowSoft, 0, 2.12, 0);

  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + 0.18;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 0.52),
      MAT.hazard
    );
    plate.position.set(Math.cos(a) * 16.7, 1.18, Math.sin(a) * 16.7);
    plate.rotation.y = radialRotation(a);
    g.add(plate);
  }

  for (let i = 0; i < 18; i++) {
    const a = i / 18 * TAU;
    box(g, 0.17, 0.17, 0.17, beaconMaterial, Math.cos(a) * 15.62, 2.87, Math.sin(a) * 15.62, radialRotation(a));
  }

  boltRing(g, 12.7, 3.06, 24, MAT.steel, 0.11, 0.12);
  boltRing(g, 14.3, 2.58, 18, MAT.hullLight, 0.1, 0.1);

  // deep foundation vents
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU + 0.31;
    box(g, 0.55, 0.22, 2.7, MAT.black, Math.cos(a) * 13.1, 0.2, Math.sin(a) * 13.1, radialRotation(a));
  }

  finalizeModule('foundation');
}

/* ============================================================
   PE-01 / load truss + service masts
   ============================================================ */

function buildMast(parent, angle, index) {
  const g = new THREE.Group();
  g.position.set(Math.cos(angle) * 12.55, 0, Math.sin(angle) * 12.55);
  g.rotation.y = radialRotation(angle);
  parent.add(g);

  const levels = [5.6, 8.8, 12.0, 15.2, 18.0];
  for (const x of [-0.68, 0.68]) {
    beam(g, V3(x, 3.1, 0), V3(x * 0.72, 19.6, 0), 0.085, MAT.steel, 6);
  }
  levels.forEach((y, i) => {
    beam(g, V3(-0.68, y, 0), V3(0.66, y + 1.05, 0), 0.04, MAT.hullDark, 5);
    beam(g, V3(0.68, y, 0), V3(-0.66, y + 1.05, 0), 0.04, MAT.hullDark, 5);
    if (i < levels.length - 1) {
      beam(g, V3(-0.58, y + 0.2, 0), V3(-0.55, levels[i + 1], 0), 0.03, MAT.hullMid, 5);
    }
  });

  box(g, 2.15, 0.16, 1.24, MAT.hullMid, 0, 11.85, 0);
  box(g, 1.25, 0.7, 1.02, MAT.hull, 0, 16.2, 0);
  box(g, 0.5, 0.28, 0.5, MAT.hullLight, 0.42, 16.76, 0);
  beam(g, V3(0, 18.95, 0), V3(0, 22.7, 0), 0.035, MAT.steel, 6);
  beam(g, V3(0.5, 17.9, 0), V3(0.85, 20.8, 0), 0.025, MAT.hullMid, 5);
  box(g, 0.16, 0.16, 0.16, beaconMaterial, 0, 22.82, 0);
  box(g, 0.1, 0.1, 0.1, MAT.glowSoft, 0.85, 20.86, 0);

  if (index % 2 === 0) {
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 8.4, 5), MAT.glowSoft);
    glow.position.set(0.73, 11.9, 0);
    g.add(glow);
  }
}

function buildTruss() {
  const inst = createModule('truss');
  const g = inst.group;

  torus(g, 10.95, 0.2, MAT.dark, 0, 3.15, 0);
  torus(g, 10.25, 0.14, MAT.hullMid, 0, 5.9, 0);
  torus(g, 9.72, 0.13, MAT.steel, 0, 9.15, 0);
  torus(g, 9.05, 0.19, MAT.hullDark, 0, 12.7, 0);
  torus(g, 9.2, 0.04, MAT.glowSoft, 0, 9.16, 0);

  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + TAU / 16;
    const tangent = V3(-Math.sin(a), 0, Math.cos(a));
    const baseR = 11.0;
    const topR = 8.55;
    const baseY = 3.05;
    const topY = 12.65;
    const p1 = radialPoint(a, baseR, baseY);
    const p2 = radialPoint(a, topR, topY);

    for (const side of [-1, 1]) {
      const offBase = tangent.clone().multiplyScalar(side * 0.43);
      const offTop = tangent.clone().multiplyScalar(side * 0.25);
      beam(g, p1.clone().add(offBase), p2.clone().add(offTop), 0.15, MAT.steel, 7);
      beam(g, p1.clone().add(offBase).add(V3(0, 0.2, 0)), p2.clone().add(offTop).add(V3(0, -0.1, 0)), 0.055, MAT.hullLight, 5);
    }

    for (const t of [0.29, 0.61]) {
      const a1 = p1.clone().lerp(p2, t).add(tangent.clone().multiplyScalar(0.42));
      const a2 = p1.clone().lerp(p2, t).add(tangent.clone().multiplyScalar(-0.42));
      const b1 = p1.clone().lerp(p2, t + 0.12).add(tangent.clone().multiplyScalar(0.26));
      const b2 = p1.clone().lerp(p2, t + 0.12).add(tangent.clone().multiplyScalar(-0.26));
      beam(g, a1, b2, 0.045, MAT.hullDark, 5);
      beam(g, a2, b1, 0.045, MAT.hullDark, 5);
    }

    const footA = p1.clone().add(tangent.clone().multiplyScalar(0.45));
    const footB = p1.clone().add(tangent.clone().multiplyScalar(-0.45));
    beam(g, footA.clone().add(V3(0, -0.6, 0)), footB.clone().add(V3(0, -0.6, 0)), 0.1, MAT.hullMid, 5);
    box(g, 1.55, 0.4, 1.6, MAT.hull, p1.x, 2.82, p1.z, radialRotation(a));

    if (i % 2 === 0) {
      const glowA = p1.clone().lerp(p2, 0.18);
      const glowB = p1.clone().lerp(p2, 0.82);
      beam(g, glowA, glowB, 0.024, MAT.glowSoft, 5);
    }
  }

  for (let i = 0; i < 4; i++) {
    buildMast(g, i / 4 * TAU + TAU / 8, i);
  }

  finalizeModule('truss');
}

/* ============================================================
   PE-02 / armor shroud
   ============================================================ */

function buildShell() {
  const inst = createModule('shell');
  const g = inst.group;
  const count = 12;
  const bottomR = 10.8;
  const topR = 7.7;
  const y0 = 3.6;
  const y1 = 13.6;
  const h = y1 - y0;

  for (let i = 0; i < count; i++) {
    const a0 = i / count * TAU + 0.055;
    const len = TAU / count - 0.11;
    const aMid = a0 + len / 2;
    wedgePanel(g, topR, bottomR, h, y0 + h / 2, a0, len, MAT.panel, 10);
    edgeRib(g, a0, bottomR, topR, y0, y1, 0.105, MAT.steel);
    edgeRib(g, a0 + len, bottomR, topR, y0, y1, 0.105, MAT.steel);

    const yPlate = 8.95;
    const rPlate = bottomR + (topR - bottomR) * ((yPlate - y0) / h);
    box(g, 1.62, 1.32, 0.17, MAT.hullLight, Math.cos(aMid) * (rPlate + 0.18), yPlate, Math.sin(aMid) * (rPlate + 0.18), radialRotation(aMid));
    box(g, 0.72, 0.06, 0.07, MAT.glowSoft, Math.cos(aMid) * (rPlate + 0.29), yPlate + 0.45, Math.sin(aMid) * (rPlate + 0.29), radialRotation(aMid));

    const yFoot = 4.7;
    const rFoot = bottomR + (topR - bottomR) * ((yFoot - y0) / h);
    box(g, 1.9, 0.42, 0.22, MAT.dark, Math.cos(aMid) * (rFoot + 0.1), yFoot, Math.sin(aMid) * (rFoot + 0.1), radialRotation(aMid));
  }

  torus(g, 9.93, 0.2, MAT.hullDark, 0, 6.55, 0);
  torus(g, 8.57, 0.17, MAT.hullMid, 0, 11.2, 0);
  torus(g, 9.9, 0.035, MAT.glowSoft, 0, 6.56, 0);
  torus(g, 8.54, 0.03, MAT.glowSoft, 0, 11.21, 0);

  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + 0.18;
    box(g, 0.045, 7.4, 0.045, MAT.glowSoft, Math.cos(a) * 9.3, 8.6, Math.sin(a) * 9.3);
  }

  const decal = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 1.18), MAT.decal);
  decal.position.set(0, 8.8, 9.52);
  g.add(decal);

  const decal2 = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.72), MAT.decal);
  decal2.position.set(Math.cos(-2.18) * 8.82, 7.5, Math.sin(-2.18) * 8.82);
  decal2.rotation.y = radialRotation(-2.18);
  g.add(decal2);

  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + 0.37;
    const y = 5.2 + (i % 3) * 1.8;
    box(g, 0.86, 0.32, 0.14, MAT.glowSoft, Math.cos(a) * 9.75, y, Math.sin(a) * 9.75, radialRotation(a));
  }

  finalizeModule('shell');
}

/* ============================================================
   PE-03 / coolant loops
   ============================================================ */

function buildCooling() {
  const inst = createModule('cooling');
  const g = inst.group;
  const count = 10;

  for (let i = 0; i < count; i++) {
    const a = i / count * TAU + 0.2;
    const pts = [
      radialPoint(a, 10.05, 2.85),
      radialPoint(a, 9.98, 5.7),
      radialPoint(a, 9.4, 10.2),
      radialPoint(a, 8.7, 14.2),
      radialPoint(a, 7.48, 18.35)
    ];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    const grp = new THREE.Group();
    grp.position.set(cx, 0, cz);
    g.add(grp);

    const local = pts.map((p) => V3(p.x - cx, p.y, p.z - cz));
    const curve = new THREE.CatmullRomCurve3(local, false, 'catmullrom', 0.4);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.27, 7, false), MAT.pipe);
    grp.add(tube);

    for (const t of [0.18, 0.48, 0.79]) {
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.52, 10), MAT.hullLight);
      collar.position.copy(p);
      collar.quaternion.setFromUnitVectors(V3(0, 1, 0), tangent);
      grp.add(collar);
    }

    const glowP = curve.getPointAt(0.6);
    const glowT = curve.getTangentAt(0.6).normalize();
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.032, 6, 18), MAT.glow);
    glowRing.position.copy(glowP);
    glowRing.quaternion.setFromUnitVectors(V3(0, 0, 1), glowT);
    grp.add(glowRing);

    const end = curve.getPointAt(1);
    const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.7, 10), MAT.hullMid);
    joint.position.copy(end);
    grp.add(joint);

    const base = curve.getPointAt(0);
    const baseJoint = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.38, 0.68), MAT.hullDark);
    baseJoint.position.copy(base);
    baseJoint.position.y += 0.2;
    grp.add(baseJoint);
  }

  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + 0.5;
    beam(g, radialPoint(a, 10.55, 3.0), radialPoint(a, 10.42, 8.3), 0.055, MAT.pipe, 5);
    box(g, 0.18, 0.18, 0.18, MAT.glowSoft, Math.cos(a) * 10.46, 8.45, Math.sin(a) * 10.46, radialRotation(a));
  }

  torus(g, 10.1, 0.2, MAT.hullDark, 0, 3.0, 0);
  torus(g, 7.5, 0.19, MAT.hullMid, 0, 18.4, 0);
  torus(g, 10.08, 0.035, MAT.glowSoft, 0, 5.7, 0);

  for (let i = 0; i < count; i++) {
    const a = i / count * TAU + 0.2;
    box(g, 0.55, 0.36, 0.48, MAT.hullLight, Math.cos(a) * 7.49, 18.7, Math.sin(a) * 7.49, radialRotation(a));
    if (i % 2 === 0) {
      box(g, 0.13, 0.13, 0.13, beaconMaterial, Math.cos(a) * 7.82, 18.76, Math.sin(a) * 7.82);
    }
  }

  finalizeModule('cooling');
}

/* ============================================================
   PE-04 / reactor vessel
   ============================================================ */

function buildReactor() {
  const inst = createModule('reactor');
  const g = inst.group;
  const count = 8;
  const radius = 5.78;
  const y0 = 12.75;
  const y1 = 22.25;
  const h = y1 - y0;

  for (let i = 0; i < count; i++) {
    const a0 = i / count * TAU + 0.06;
    const len = TAU / count - 0.12;
    wedgePanel(g, radius, radius, h, y0 + h / 2, a0, len, MAT.panel, 10);
    edgeRib(g, a0, radius, radius, y0, y1, 0.095, MAT.hullLight);
    edgeRib(g, a0 + len, radius, radius, y0, y1, 0.095, MAT.hullLight);

    const aMid = a0 + len / 2;
    box(g, 1.15, 1.28, 0.14, MAT.hullMid, Math.cos(aMid) * (radius + 0.1), 18.0, Math.sin(aMid) * (radius + 0.1), radialRotation(aMid));
    box(g, 0.38, 0.12, 0.08, MAT.glowSoft, Math.cos(aMid) * (radius + 0.19), 18.54, Math.sin(aMid) * (radius + 0.19), radialRotation(aMid));
  }

  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * TAU + 0.06;
    const glowMat = MAT.glow.clone();
    const win = box(g, 0.13, 6.5, 0.09, glowMat, Math.cos(a) * (radius + 0.03), 17.4, Math.sin(a) * (radius + 0.03), radialRotation(a));
    ignitionGlowMaterials.push(glowMat);
  }

  torus(g, 6.16, 0.35, MAT.hullDark, 0, y0 - 0.18, 0);
  torus(g, 6.22, 0.31, MAT.hullDark, 0, 17.35, 0);
  torus(g, 6.16, 0.37, MAT.hullDark, 0, y1 + 0.18, 0);
  torus(g, 6.24, 0.045, MAT.glowSoft, 0, y0 + 0.2, 0);
  torus(g, 6.27, 0.04, MAT.glowSoft, 0, 17.35, 0);
  torus(g, 6.24, 0.05, MAT.glowSoft, 0, y1 - 0.18, 0);

  boltRing(g, 6.33, y0 + 0.08, 24, MAT.steel, 0.095, 0.18);
  boltRing(g, 6.35, 17.27, 24, MAT.steel, 0.09, 0.16);
  boltRing(g, 6.33, y1 + 0.04, 24, MAT.steel, 0.095, 0.18);

  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU + 0.12;
    beam(g, radialPoint(a, radius + 0.3, y0 + 0.5), radialPoint(a, radius + 0.3, y1 - 0.5), 0.055, MAT.steel, 5);
  }

  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + 0.38;
    taperedBeam(g, radialPoint(a, 7.45, 19.3), radialPoint(a, 6.0, 19.3), 0.42, 0.27, MAT.hullLight, 10);
    cyl(g, 0.34, 0.34, 0.22, MAT.dark, Math.cos(a) * 7.56, 19.3, Math.sin(a) * 7.56, 12);
    cyl(g, 0.12, 0.12, 0.05, MAT.glowSoft, Math.cos(a) * 7.7, 19.3, Math.sin(a) * 7.7, 8);
  }

  cyl(g, 6.55, 6.7, 0.42, MAT.hullDark, 0, 12.35, 0, 48);
  torus(g, 6.55, 0.055, MAT.glowSoft, 0, 12.58, 0);

  finalizeModule('reactor');
}

/* ============================================================
   PE-05 / magnetic containment rings
   ============================================================ */

function buildContainment() {
  const inst = createModule('containment');
  const g = inst.group;
  const levels = [
    { y: 14.2, r: 7.52, speed: 0.11 },
    { y: 17.8, r: 7.64, speed: -0.075 },
    { y: 21.2, r: 7.76, speed: 0.055 }
  ];

  levels.forEach((level, idx) => {
    const spin = new THREE.Group();
    spin.position.set(0, level.y, 0);
    g.add(spin);
    spinObjects.push({ obj: spin, speed: level.speed, axis: 'y' });

    torus(spin, level.r, 0.43, MAT.hullDark, 0, 0, 0);
    torus(spin, level.r - 0.24, 0.055, MAT.glow, 0, 0, 0);
    torus(spin, level.r + 0.29, 0.032, MAT.glowSoft, 0, 0, 0);

    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      const pod = box(spin, 0.9, 1.02, 0.74, MAT.hullLight, Math.cos(a) * (level.r + 0.52), 0, Math.sin(a) * (level.r + 0.52), radialRotation(a));
      box(spin, 0.38, 0.5, 0.08, MAT.glowSoft, Math.cos(a) * (level.r + 0.91), 0, Math.sin(a) * (level.r + 0.91), radialRotation(a));
      box(spin, 0.16, 0.16, 0.16, beaconMaterial, Math.cos(a + 0.04) * (level.r + 0.96), 0.48, Math.sin(a + 0.04) * (level.r + 0.96));
    }

    if (idx === 1) {
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + 0.2;
        const clampBox = box(spin, 1.4, 0.45, 0.36, MAT.hullMid, Math.cos(a) * (level.r - 0.42), 0, Math.sin(a) * (level.r - 0.42), radialRotation(a));
      }
    }
  });

  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + 0.15;
    beam(g, radialPoint(a, 8.42, 13.3), radialPoint(a, 8.42, 22.1), 0.075, MAT.steel, 6);
    for (const y of [13.7, 17.8, 21.7]) {
      box(g, 0.28, 0.2, 0.5, MAT.hullMid, Math.cos(a) * 8.42, y, Math.sin(a) * 8.42, radialRotation(a));
    }
  }

  for (const y of [13.35, 22.05]) {
    torus(g, 8.45, 0.16, MAT.hullDark, 0, y, 0);
  }

  finalizeModule('containment');
}

/* ============================================================
   PE-06 / fusion core
   ============================================================ */

function buildCore() {
  const inst = createModule('core');
  const g = inst.group;

  const outerShell = new THREE.Mesh(new THREE.CylinderGeometry(1.58, 1.58, 15.3, 32, 1, false), coreMaterial);
  outerShell.position.y = 14.6;
  g.add(outerShell);

  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.62, 14.2, 20, 1, false),
    new THREE.MeshBasicMaterial({ color: 0xd9fbff, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  inner.position.y = 14.6;
  g.add(inner);

  const glass = new THREE.Mesh(new THREE.CylinderGeometry(3.02, 3.02, 16.2, 32, 1, true), MAT.glass);
  glass.position.y = 14.6;
  g.add(glass);

  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    beam(g, radialPoint(a, 3.2, 7.2), radialPoint(a, 3.2, 22.0), 0.055, MAT.steel, 5);
    box(g, 0.13, 0.3, 0.13, MAT.hullLight, Math.cos(a) * 3.2, 8.6, Math.sin(a) * 3.2, radialRotation(a));
    box(g, 0.13, 0.3, 0.13, MAT.hullLight, Math.cos(a) * 3.2, 20.1, Math.sin(a) * 3.2, radialRotation(a));
  }

  for (const y of [8.1, 11.1, 14.1, 17.1, 20.0]) {
    const gm = MAT.glow.clone();
    torus(g, 3.24, 0.075, gm, 0, y, 0);
    ignitionGlowMaterials.push(gm);
    const soft = MAT.glowSoft.clone();
    torus(g, 3.34, 0.03, soft, 0, y, 0);
    ignitionGlowMaterials.push(soft);
  }

  cyl(g, 3.42, 3.42, 0.68, MAT.hullDark, 0, 6.5, 0, 32);
  cyl(g, 3.42, 3.42, 0.68, MAT.hullDark, 0, 22.7, 0, 32);
  torus(g, 3.34, 0.12, MAT.hullLight, 0, 6.9, 0);
  torus(g, 3.34, 0.12, MAT.hullLight, 0, 22.34, 0);
  cyl(g, 2.78, 2.78, 0.18, MAT.glowSoft, 0, 7.02, 0, 32);
  cyl(g, 2.78, 2.78, 0.18, MAT.glowSoft, 0, 22.22, 0, 32);

  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU;
    box(g, 0.45, 0.28, 0.26, MAT.hullMid, Math.cos(a) * 3.15, 6.99, Math.sin(a) * 3.15, radialRotation(a));
    box(g, 0.45, 0.28, 0.26, MAT.hullMid, Math.cos(a) * 3.15, 22.25, Math.sin(a) * 3.15, radialRotation(a));
  }

  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xa7ecff,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  }));
  glowSprite.position.set(0, 14.6, 0);
  glowSprite.scale.set(8.5, 13.5, 1);
  g.add(glowSprite);
  inst.coreGlowSprite = glowSprite;

  // orbiting sparks inside the magnetic cage
  const particleGroup = new THREE.Group();
  const pCount = 90;
  const pos = new Float32Array(pCount * 3);
  const meta = [];
  for (let i = 0; i < pCount; i++) {
    const a = Math.random() * TAU;
    const r = 1.2 + Math.random() * 1.9;
    const y = 7.5 + Math.random() * 14;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(a) * r;
    meta.push({ a, r, y, speed: 0.15 + Math.random() * 0.4 });
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xbdf6ff,
    size: 0.12,
    map: particleTexture,
    transparent: true,
    opacity: 0.58,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false
  });
  const points = new THREE.Points(pGeo, pMat);
  particleGroup.add(points);
  g.add(particleGroup);
  spinObjects.push({ obj: particleGroup, speed: 0.045, axis: 'y' });
  inst.coreParticles = { points, positions: pos, meta, group: particleGroup };

  g.add(coreLight);
  coreLight.position.set(0, 14.6, 0);

  finalizeModule('core');
}

/* ============================================================
   PE-07 / magnetic nozzle
   ============================================================ */

function buildNozzle() {
  const inst = createModule('nozzle');
  const g = inst.group;
  const count = 12;
  const y0 = 22.45;
  const y1 = 29.0;
  const bottomR = 5.65;
  const topR = 9.9;
  const h = y1 - y0;

  const innerBell = new THREE.Mesh(
    new THREE.CylinderGeometry(9.45, 5.18, 6.65, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x0a0f16, metalness: 0.84, roughness: 0.52, side: THREE.DoubleSide, envMapIntensity: 0.62 })
  );
  innerBell.position.y = y0 + 3.32;
  g.add(innerBell);

  for (let i = 0; i < count; i++) {
    const a0 = i / count * TAU + 0.045;
    const len = TAU / count - 0.09;
    const aMid = a0 + len / 2;
    wedgePanel(g, topR, bottomR, h, y0 + h / 2, a0, len, MAT.panel, 10);
    edgeRib(g, a0, bottomR, topR, y0, y1, 0.105, MAT.hullLight);
    edgeRib(g, a0 + len, bottomR, topR, y0, y1, 0.105, MAT.hullLight);

    const rMid = bottomR + (topR - bottomR) * 0.5;
    box(g, 0.3, 2.2, 0.14, MAT.hullMid, Math.cos(aMid) * (rMid + 0.06), 25.65, Math.sin(aMid) * (rMid + 0.06), radialRotation(aMid));
    box(g, 0.12, 1.4, 0.05, MAT.glowSoft, Math.cos(aMid) * (rMid + 0.16), 25.85, Math.sin(aMid) * (rMid + 0.16), radialRotation(aMid));
  }

  torus(g, 5.78, 0.39, MAT.hullDark, 0, y0, 0);
  torus(g, 10.02, 0.52, MAT.hullDark, 0, y1, 0);
  torus(g, 10.08, 0.085, MAT.glow, 0, y1 + 0.06, 0);
  torus(g, 5.84, 0.045, MAT.glowSoft, 0, y0 + 0.03, 0);
  torus(g, 8.35, 0.08, MAT.hullMid, 0, 26.48, 0);

  const glowMat = MAT.glow.clone();
  torus(g, 8.55, 0.032, glowMat, 0, 25.55, 0);
  ignitionGlowMaterials.push(glowMat);

  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + 0.2;
    beam(g, radialPoint(a, 2.35, 27.8), radialPoint(a, 4.85, 23.05), 0.09, MAT.steel, 6);
    box(g, 0.55, 0.18, 0.3, MAT.hullMid, Math.cos(a) * 4.7, 23.45, Math.sin(a) * 4.7, radialRotation(a));
  }

  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU + 0.1;
    box(g, 0.62, 0.48, 0.78, MAT.hullMid, Math.cos(a) * 9.45, 27.9, Math.sin(a) * 9.45, radialRotation(a));
    box(g, 0.12, 0.2, 0.12, beaconMaterial, Math.cos(a) * 9.88, 28.18, Math.sin(a) * 9.88);
  }

  boltRing(g, 10.02, y1 + 0.28, 36, MAT.steel, 0.1, 0.16);
  boltRing(g, 5.92, y0 - 0.2, 24, MAT.hullLight, 0.09, 0.14);

  finalizeModule('nozzle');
}

/* ============================================================
   PE-08 / ignition array + energy beam
   ============================================================ */

let beamFX = null;

function buildIgnition() {
  const inst = createModule('ignition');
  const g = inst.group;

  cyl(g, 4.65, 4.9, 0.72, MAT.hullDark, 0, 28.5, 0, 40);
  torus(g, 4.82, 0.28, MAT.hullMid, 0, 28.72, 0);
  torus(g, 4.55, 0.04, MAT.glowSoft, 0, 28.92, 0);
  boltRing(g, 4.58, 28.9, 20, MAT.steel, 0.075, 0.12);

  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU + 0.08;
    const outer = radialPoint(a, 3.76, 29.15);
    const inner = radialPoint(a, 0.92, 30.6);
    beam(g, outer, inner, 0.095, MAT.hullLight, 6);
    const tipMat = MAT.glowWhite.clone();
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), tipMat);
    tip.position.copy(inner);
    g.add(tip);
    ignitionGlowMaterials.push(tipMat);
    const baseBox = box(g, 0.52, 0.28, 0.46, MAT.hullDark, Math.cos(a) * 4.0, 29.25, Math.sin(a) * 4.0, radialRotation(a));
  }

  cyl(g, 0.84, 1.28, 2.55, MAT.hullDark, 0, 30.25, 0, 20);
  torus(g, 1.18, 0.08, MAT.glowSoft, 0, 29.25, 0);
  torus(g, 0.9, 0.065, MAT.glow, 0, 31.2, 0);
  torus(g, 1.2, 0.04, MAT.glowWhite, 0, 29.52, 0);

  const crystalMat = MAT.crystal.clone();
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.84, 0), crystalMat);
  crystal.position.y = 31.85;
  crystal.rotation.y = Math.PI / 4;
  g.add(crystal);
  ignitionGlowMaterials.push(crystalMat);
  inst.crystal = crystal;
  spinObjects.push({ obj: crystal, speed: 0.5, axis: 'y' });

  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + 0.45;
    const p0 = radialPoint(a, 3.5, 29.1);
    const p1 = radialPoint(a, 4.55, 31.65);
    beam(g, p0, p1, 0.045, MAT.steel, 5);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), MAT.glowSoft);
    tip.position.copy(p1);
    g.add(tip);
  }

  g.add(emitterLight);
  emitterLight.position.set(0, 31.3, 0);

  finalizeModule('ignition');
  buildBeamFX(g);
}

function buildBeamFX(parent) {
  const group = new THREE.Group();
  group.position.y = 32.35;
  group.visible = false;
  parent.add(group);

  const outerGeo = new THREE.CylinderGeometry(2.35, 1.22, 39, 36, 1, true);
  outerGeo.translate(0, 19.5, 0);
  const outer = new THREE.Mesh(outerGeo, beamMaterial);
  group.add(outer);

  const innerMaterial = new THREE.MeshBasicMaterial({
    color: 0xf0fdff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const innerGeo = new THREE.CylinderGeometry(0.78, 0.42, 39, 24, 1, true);
  innerGeo.translate(0, 19.5, 0);
  const inner = new THREE.Mesh(innerGeo, innerMaterial);
  group.add(inner);

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x5fc9ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const haloGeo = new THREE.CylinderGeometry(3.8, 2.1, 39, 32, 1, true);
  haloGeo.translate(0, 19.5, 0);
  const halo = new THREE.Mesh(haloGeo, haloMaterial);
  group.add(halo);

  const baseGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xbaf4ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  }));
  baseGlow.position.y = 0.35;
  baseGlow.scale.set(13, 13, 1);
  group.add(baseGlow);

  const rings = [];
  for (let i = 0; i < 7; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xcdf8ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.045, 6, 48), mat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    rings.push({ mesh: ring, mat, offset: i / 7 });
  }

  const count = 1100;
  const positions = new Float32Array(count * 3);
  const particleMeta = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU;
    const radius = 0.25 + Math.pow(Math.random(), 0.55) * 2.1;
    const y = Math.random() * 39;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    particleMeta.push({
      angle,
      radius,
      y,
      speed: 5 + Math.random() * 13,
      spin: (Math.random() - 0.5) * 0.9,
      scale: 0.5 + Math.random() * 1.4
    });
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xd9fbff,
    size: 0.46,
    map: particleTexture,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false
  });
  const particles = new THREE.Points(pGeo, pMat);
  particles.frustumCulled = false;
  group.add(particles);

  beamLight.intensity = 0;
  group.add(beamLight);
  beamLight.position.set(0, 10, 0);

  beamFX = {
    group,
    outer,
    inner,
    innerMaterial,
    halo,
    haloMaterial,
    baseGlow,
    rings,
    particles,
    particleMaterial: pMat,
    particleMeta,
    particlePositions: positions,
    particleGeometry: pGeo
  };
}

/* ---------------- ambient dust ---------------- */

const dustCount = 280;
const dustPositions = new Float32Array(dustCount * 3);
const dustMeta = [];
for (let i = 0; i < dustCount; i++) {
  const a = Math.random() * TAU;
  const r = 4 + Math.random() * 26;
  const y = Math.random() * 36;
  dustPositions[i * 3] = Math.cos(a) * r;
  dustPositions[i * 3 + 1] = y;
  dustPositions[i * 3 + 2] = Math.sin(a) * r;
  dustMeta.push({ a, r, y, speed: 0.18 + Math.random() * 0.8, drift: (Math.random() - 0.5) * 0.2 });
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
const dustMaterial = new THREE.PointsMaterial({
  color: 0x7bb9d4,
  size: 0.1,
  map: particleTexture,
  transparent: true,
  opacity: 0.22,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
  toneMapped: false
});
const dust = new THREE.Points(dustGeo, dustMaterial);
dust.frustumCulled = false;
scene.add(dust);

/* ---------------- build model ---------------- */

buildFoundation();
buildTruss();
buildShell();
buildCooling();
buildReactor();
buildContainment();
buildCore();
buildNozzle();
buildIgnition();

/* __PART3__ */
