/* ============================================================
   PLANETARY ENGINE / PE-07
   Procedural Three.js megastructure, exploded view & ignition
   ============================================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (sel, root = document) => root.querySelector(sel);
const canvas = $('#scene');
const bootBar = $('#bootBar');
const bootPct = $('#bootPct');
const bootLog = $('#bootLog');
const bootEl = $('#boot');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let bootValue = 0;

async function bootStep(value, message, delay = 90) {
  bootValue = Math.max(bootValue, value);
  if (bootBar) bootBar.style.width = bootValue + '%';
  if (bootPct) bootPct.textContent = Math.round(bootValue) + '%';
  if (bootLog && message) bootLog.textContent = message;
  await wait(delay);
}

const TAU = Math.PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ---------------- renderer / scene ---------------- */

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
} catch (err) {
  const error = $('#bootError');
  if (error) {
    error.style.display = 'block';
    error.textContent = '当前浏览器无法创建 WebGL 上下文。请启用硬件加速或更换现代浏览器。';
  }
  throw err;
}

const DPR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02060b);
scene.fog = new THREE.FogExp2(0x02060b, 0.0042);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 900);
const DEFAULT_CAM = V3(51, 34, 84);
const DEFAULT_TARGET = V3(0, 18, 0);
camera.position.copy(DEFAULT_CAM);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(DEFAULT_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.rotateSpeed = 0.52;
controls.zoomSpeed = 0.8;
controls.minDistance = 24;
controls.maxDistance = 125;
controls.minPolarAngle = 0.2;
controls.maxPolarAngle = Math.PI * 0.492;
controls.update();

// A restrained procedural studio environment gives the metal readable reflections.
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.02).texture;
if (typeof room.dispose === 'function') room.dispose();
pmrem.dispose();

/* ---------------- lights ---------------- */

const hemi = new THREE.HemisphereLight(0x4c7e9e, 0x03070b, 0.82);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xd9edff, 2.7);
keyLight.position.set(34, 62, 38);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x4d9fd1, 1.7);
rimLight.position.set(-42, 28, -36);
scene.add(rimLight);

const lowLight = new THREE.DirectionalLight(0x245f86, 0.9);
lowLight.position.set(10, -18, 26);
scene.add(lowLight);

const warmRim = new THREE.DirectionalLight(0xff9a5e, 0.62);
warmRim.position.set(-52, 26, -44);
scene.add(warmRim);

const coreLight = new THREE.PointLight(0x6cdeff, 4.2, 72, 2);
coreLight.position.set(0, 14.4, 0);
scene.add(coreLight);

const beamLight = new THREE.PointLight(0x9ceaff, 0, 130, 2);
beamLight.position.set(0, 34, 0);
scene.add(beamLight);

const emitterLight = new THREE.PointLight(0xb6f4ff, 0, 46, 2);
emitterLight.position.set(0, 31.5, 0);
scene.add(emitterLight);

/* ---------------- procedural textures ---------------- */

function makeRadialTexture(stops = [[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(194,245,255,.82)'], [0.52, 'rgba(86,196,255,.22)'], [1, 'rgba(20,80,120,0)']]) {
  const size = 192;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([p, color]) => g.addColorStop(p, color));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const glowTexture = makeRadialTexture();
const particleTexture = makeRadialTexture([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(215,250,255,.9)'], [0.62, 'rgba(100,205,255,.25)'], [1, 'rgba(0,40,80,0)']]);
const softGlowTexture = makeRadialTexture([[0, 'rgba(236,253,255,.9)'], [0.18, 'rgba(150,230,255,.5)'], [0.5, 'rgba(50,150,220,.12)'], [1, 'rgba(0,0,0,0)']]);

function makeHazardTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0d10';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, c.width, c.height);
  ctx.clip();
  ctx.strokeStyle = '#c89a48';
  ctx.lineWidth = 18;
  for (let x = -80; x < 360; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 80);
    ctx.lineTo(x + 70, -16);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.24)';
  ctx.fillRect(0, 0, c.width, 2);
  ctx.fillRect(0, c.height - 2, c.width, 2);
  ctx.fillStyle = '#070a0d';
  ctx.fillRect(0, 0, 5, c.height);
  ctx.fillRect(c.width - 5, 0, 5, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

function makeDecalTexture(main, sub) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.strokeStyle = 'rgba(166,227,250,.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(8, 13);
  ctx.lineTo(62, 13);
  ctx.moveTo(8, 13);
  ctx.lineTo(8, 42);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(504, 115);
  ctx.lineTo(450, 115);
  ctx.moveTo(504, 115);
  ctx.lineTo(504, 86);
  ctx.stroke();
  ctx.fillStyle = 'rgba(215,246,255,.92)';
  ctx.font = '600 42px Bahnschrift, Segoe UI, sans-serif';
  ctx.letterSpacing = '8px';
  ctx.fillText(main, 28, 70);
  ctx.fillStyle = 'rgba(130,200,226,.72)';
  ctx.font = '400 16px Consolas, monospace';
  ctx.letterSpacing = '5px';
  ctx.fillText(sub, 30, 98);
  ctx.fillStyle = 'rgba(255,180,100,.9)';
  ctx.fillRect(29, 109, 64, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

const hazardTexture = makeHazardTexture();
const decalTexture = makeDecalTexture('UEG · PE-07', 'PLANETARY ENGINE / EARTH');

/* ---------------- materials ---------------- */

const MAT = {
  hull: new THREE.MeshStandardMaterial({ color: 0x596473, metalness: 0.94, roughness: 0.43, envMapIntensity: 0.9 }),
  hullLight: new THREE.MeshStandardMaterial({ color: 0x8995a4, metalness: 0.9, roughness: 0.34, envMapIntensity: 1.0 }),
  hullMid: new THREE.MeshStandardMaterial({ color: 0x414a56, metalness: 0.92, roughness: 0.46, envMapIntensity: 0.82 }),
  hullDark: new THREE.MeshStandardMaterial({ color: 0x252d37, metalness: 0.9, roughness: 0.54, envMapIntensity: 0.72 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0e141c, metalness: 0.82, roughness: 0.62, envMapIntensity: 0.58 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x737f8e, metalness: 1.0, roughness: 0.28, envMapIntensity: 1.05 }),
  pipe: new THREE.MeshStandardMaterial({ color: 0x46515f, metalness: 0.98, roughness: 0.25, envMapIntensity: 0.95 }),
  black: new THREE.MeshStandardMaterial({ color: 0x06090d, metalness: 0.7, roughness: 0.7 }),
  copper: new THREE.MeshStandardMaterial({ color: 0x8a5e3e, metalness: 1.0, roughness: 0.34, envMapIntensity: 0.9 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x505b69, metalness: 0.92, roughness: 0.45, side: THREE.DoubleSide, envMapIntensity: 0.84 }),
  panelDark: new THREE.MeshStandardMaterial({ color: 0x323b47, metalness: 0.9, roughness: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.72 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x021019, emissive: 0x63d9ff, emissiveIntensity: 1.8, metalness: 0.45, roughness: 0.22 }),
  glowSoft: new THREE.MeshStandardMaterial({ color: 0x03131b, emissive: 0x3db7e8, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.32 }),
  glowWhite: new THREE.MeshStandardMaterial({ color: 0x1b3139, emissive: 0xd7fbff, emissiveIntensity: 2.4, metalness: 0.2, roughness: 0.16 }),
  glowAmber: new THREE.MeshStandardMaterial({ color: 0x241207, emissive: 0xff9a3d, emissiveIntensity: 2.1, metalness: 0.3, roughness: 0.3 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x8bdcff, metalness: 0.2, roughness: 0.08, transparent: true, opacity: 0.105, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.2 }),
  crystal: new THREE.MeshStandardMaterial({ color: 0x0a2834, emissive: 0x8feaff, emissiveIntensity: 2.5, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.88 }),
  hazard: new THREE.MeshBasicMaterial({ map: hazardTexture, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  decal: new THREE.MeshBasicMaterial({ map: decalTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
};

/* ---------------- core / beam shaders ---------------- */

const coreUniforms = {
  uTime: { value: 0 },
  uPower: { value: 0 }
};

const coreMaterial = new THREE.ShaderMaterial({
  uniforms: coreUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vViewW;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormalW = normalize(normalMatrix * normal);
      vViewW = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uPower;
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vViewW;
    void main() {
      float fres = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewW))), 2.2);
      float band = 0.5 + 0.5 * sin(vUv.y * 96.0 - uTime * 6.0 + sin(vUv.y * 24.0) * 2.2);
      float flow = 0.55 + 0.45 * sin(vUv.y * 35.0 + uTime * 2.1 + vUv.x * 6.283);
      vec3 col = mix(vec3(0.035, 0.42, 0.86), vec3(0.88, 0.99, 1.0), clamp(band * 0.68 + fres * 0.38, 0.0, 1.0));
      float alpha = (0.22 + fres * 0.36) * (0.62 + 0.44 * uPower) + band * 0.1 * uPower;
      gl_FragColor = vec4(col * (0.72 + uPower * 1.0) * (0.82 + flow * 0.3), alpha);
    }
  `
});

const beamUniforms = {
  uTime: { value: 0 },
  uOpacity: { value: 0 }
};

const beamMaterial = new THREE.ShaderMaterial({
  uniforms: beamUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uOpacity;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    void main() {
      float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
      float lengthFade = smoothstep(0.0, 0.035, vUv.y) * (1.0 - smoothstep(0.58, 1.0, vUv.y) * 0.72);
      float flow = noise(vec2(vUv.x * 13.0, vUv.y * 30.0 - uTime * 7.5));
      float streak = smoothstep(0.38, 0.8, flow) * 0.68 + smoothstep(0.82, 1.0, flow) * 0.32;
      float core = edge * (0.26 + streak * 0.9);
      vec3 col = mix(vec3(0.12, 0.52, 1.0), vec3(1.0, 1.0, 1.0), core * 0.68);
      gl_FragColor = vec4(col * (0.62 + streak * 1.05), uOpacity * (0.05 + core * lengthFade * 0.62));
    }
  `
});

/* ============================================================
   component manifest
   ============================================================ */

const MODULE_META = [
  {
    id: 'foundation', code: 'PE-00', name: '基座锚固环', en: 'ANCHOR RING', role: '承载 / 隔振',
    desc: '十二组重力锚栓将发动机载荷导入地壳稳定层。环形阻尼层可吸收点火瞬间产生的低频谐振，避免结构共振向地下扩散。',
    specs: [['承载质量', '1.8 × 10⁹ t'], ['锚固深度', '3.6 km'], ['阻尼单元', '144 组'], ['主体材料', 'Ti-W 梯度合金']],
    stats: [{ label: '结构应力', value: '62 %', pct: 62 }, { label: '阻尼效率', value: '91 %', pct: 91 }, { label: '地壳耦合', value: '88 %', pct: 88 }],
    explode: { radial: 0.35, lift: -6.4, spread: 1.0 },
    anchor: [13.6, 1.7, 0]
  },
  {
    id: 'truss', code: 'PE-01', name: '主承力桁架', en: 'LOAD TRUSS', role: '结构骨架',
    desc: '八向交叉桁架构成主载荷路径，连接基座与反应堆压力壳。节点内置热位移补偿机构，允许点火热循环中的微米级形变。',
    specs: [['主桁架', '8 组'], ['结构节点', '1,024 个'], ['热位移补偿', '± 0.8 m'], ['屈服强度', '4.2 GPa']],
    stats: [{ label: '载荷分布', value: '均匀', pct: 84 }, { label: '疲劳余量', value: '73 %', pct: 73 }, { label: '热通量', value: '41 %', pct: 41 }],
    explode: { radial: 3.1, lift: -0.9, spread: 1.015 },
    anchor: [10.2, 10.8, 0]
  },
  {
    id: 'shell', code: 'PE-02', name: '外层装甲壳', en: 'ARMOR SHROUD', role: '防护 / 导流',
    desc: '分段式钨钢装甲覆盖推力段外侧，抵御岩浆风暴与喷流回压。装甲内侧的导流槽把冷却剂蒸汽送回基座换热阵列。',
    specs: [['装甲板', '12 片'], ['单板厚度', '1.4 m'], ['耐温上限', '3,200 K'], ['抗压强度', '180 MPa']],
    stats: [{ label: '热防护', value: '87 %', pct: 87 }, { label: '结构完整', value: '94 %', pct: 94 }, { label: '表面磨损', value: '12 %', pct: 12 }],
    explode: { radial: 4.1, lift: 0.7, spread: 1.035 },
    anchor: [8.5, 8.7, -4.2]
  },
  {
    id: 'cooling', code: 'PE-03', name: '冷却回路', en: 'COOLANT LOOP', role: '热管理',
    desc: '液态锂铅冷却剂沿十二根主回路循环，在反应堆外壁与地下换热井之间搬运热量。回路在点火前进入预冷状态。',
    specs: [['主回路', '12 条'], ['额定流量', '8.6 × 10⁵ m³/s'], ['工作压力', '42 MPa'], ['冷却介质', '液态锂铅']],
    stats: [{ label: '回路压差', value: '稳定', pct: 78 }, { label: '冷却余量', value: '69 %', pct: 69 }, { label: '泵组负载', value: '54 %', pct: 54 }],
    explode: { radial: 4.8, lift: 1.3, spread: 1.035 },
    anchor: [-9.4, 10.6, 4.6]
  },
  {
    id: 'reactor', code: 'PE-04', name: '反应堆压力壳', en: 'REACTOR VESSEL', role: '能量约束',
    desc: '重元素聚变在磁约束腔内进行。多层压力壳、中子屏蔽层与主动冷却夹套共同维持稳定燃烧，并将高能粒子导向喷口。',
    specs: [['输出功率', '2.4 × 10¹³ W'], ['约束磁场', '18.7 T'], ['屏蔽层', '5 层'], ['点火温度', '1.2 × 10⁸ K']],
    stats: [{ label: '壳壁温度', value: '2,410 K', pct: 64 }, { label: '中子屏蔽', value: '96 %', pct: 96 }, { label: '压力稳定', value: '82 %', pct: 82 }],
    explode: { radial: 2.5, lift: 1.5, spread: 1.12 },
    anchor: [6.5, 17.2, 2.2]
  },
  {
    id: 'containment', code: 'PE-05', name: '磁约束环', en: 'MAGNETIC RINGS', role: '等离子约束',
    desc: '三组超导线圈生成环向与极向复合磁场，将上亿摄氏度的等离子体悬停在腔体中央，并抑制磁流体湍流。',
    specs: [['超导线圈', '3 组'], ['环向场强', '22.4 T'], ['超导温度', '4.2 K'], ['储能规模', '9.8 TJ']],
    stats: [{ label: '磁场稳定', value: '97 %', pct: 97 }, { label: '线圈温升', value: '6 %', pct: 6 }, { label: '约束效率', value: '93 %', pct: 93 }],
    explode: { radial: 1.2, lift: 3.6, spread: 1.48 },
    anchor: [9.0, 18.2, 0]
  },
  {
    id: 'core', code: 'PE-06', name: '能量核心', en: 'FUSION CORE', role: '能量源',
    desc: '重元素聚变核心持续输出高密度等离子体射流，是整台行星发动机的心脏。核心被多层磁笼与透明约束壳包裹。',
    specs: [['核心温度', '1.5 × 10⁸ K'], ['等离子密度', '4.7 × 10²¹ m⁻³'], ['净输出', '2.3 × 10¹³ W'], ['当前状态', '待机']],
    stats: [{ label: '核心温度', value: '待机', pct: 8 }, { label: '聚变反应率', value: '0 %', pct: 0 }, { label: '磁笼强度', value: '88 %', pct: 88 }],
    explode: { radial: 0.0, lift: 5.2, spread: 1.04 },
    anchor: [3.8, 19.4, 0]
  },
  {
    id: 'nozzle', code: 'PE-07', name: '磁约束喷口', en: 'MAGNETIC NOZZLE', role: '推力矢量',
    desc: '超导喷口将等离子体加速至逃逸速度。环形磁偏转线圈实时修正喷流方向，把推力矢量稳定在毫弧度量级。',
    specs: [['喷口直径', '1.2 km'], ['出口速度', '1.1 × 10⁵ m/s'], ['比冲', '1.4 × 10⁴ s'], ['偏转精度', '0.003°']],
    stats: [{ label: '喷口温度', value: '待机', pct: 24 }, { label: '矢量偏转', value: '0.000°', pct: 3 }, { label: '磁偏转环', value: '在线', pct: 90 }],
    explode: { radial: 0.0, lift: 9.2, spread: 1.05 },
    anchor: [7.8, 25.7, 0]
  },
  {
    id: 'ignition', code: 'PE-08', name: '点火聚焦阵列', en: 'IGNITION ARRAY', role: '点火 / 聚焦',
    desc: '十二组激光点火器与磁聚焦棱镜协同工作，在 0.6 秒内建立自持聚变反应。点火窗口必须与磁约束相位严格同步。',
    specs: [['点火单元', '12 组'], ['同步误差', '< 0.4 ns'], ['激光能量', '6.8 MJ'], ['建立时间', '0.6 s']],
    stats: [{ label: '点火电容', value: '充电完成', pct: 100 }, { label: '光路校准', value: '99 %', pct: 99 }, { label: '同步精度', value: '0.2 ns', pct: 96 }],
    explode: { radial: 0.0, lift: 14.0, spread: 1.18 },
    anchor: [4.7, 30.1, 0]
  }
];

{ /* __PART2__ */ }
