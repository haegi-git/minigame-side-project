import * as THREE from "three";

const BEST_KEY = "kongtrider-best";
const ITEM_INFO = {
  boost: { name: "부스터", icon: "🔥" },
  triple: { name: "삼단부스터", icon: "🚀" },
  banana: { name: "바나나", icon: "🍌" },
  ink: { name: "먹물", icon: "🖤" },
  shield: { name: "방패", icon: "🛡️" },
  missile: { name: "콩탄", icon: "🫘" },
  cannon: { name: "콩대포", icon: "🎯" },
  magnet: { name: "자석", icon: "🧲" },
  lightning: { name: "번개", icon: "⚡" },
};
const BAG = [
  "boost", "boost", "boost",
  "triple", "triple",
  "banana", "banana",
  "ink", "ink",
  "shield", "shield",
  "missile", "missile",
  "cannon",
  "magnet",
  "lightning",
];
const TIER_COLOR = [0xfffdf8, 0xff8fb8, 0xffe066, 0x9bf6ff];
const START_GAP = 38;

const MOBILE =
  window.matchMedia("(pointer: coarse)").matches ||
  Math.min(window.innerWidth, window.innerHeight) < 560;
let pixelRatio = MOBILE ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
let shadowsOn = !MOBILE;
let PUFF_MAX = MOBILE ? 28 : 72;
let liteScene = MOBILE;

const canvas = document.getElementById("view");
const hud = document.getElementById("hud");
const startEl = document.getElementById("start");
const countEl = document.getElementById("countdown");
const countNum = document.getElementById("count-num");
const resultEl = document.getElementById("result");
const boardEl = document.getElementById("board");
const rankEl = document.getElementById("rank");
const timeEl = document.getElementById("time");
const speedEl = document.getElementById("speed");
const progressEl = document.getElementById("progress");
const hudBestEl = document.getElementById("hud-best");
const bestLineEl = document.getElementById("best-line");
const boostMeter = document.getElementById("boost-meter");
const pips = [...document.querySelectorAll("#pips i")];
const itemSlot = document.getElementById("item-slot");
const itemIcon = document.getElementById("item-icon");
const itemName = document.getElementById("item-name");
const itemBtn = document.getElementById("btn-item");
const muteBtn = document.getElementById("mute");
const minimapEl = document.getElementById("minimap");
const toastEl = document.getElementById("toast");
const flashEl = document.getElementById("flash");
const inkEl = document.getElementById("ink");
const mapCtx = minimapEl.getContext("2d");

const keys = new Set();
const stick = { nx: 0, ny: 0, drift: false };

const _pos = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _yaw = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _look = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _v = new THREE.Vector3();
const _col = new THREE.Color();
const _dummy = new THREE.Object3D();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !MOBILE,
    alpha: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
  });
} catch (err) {
  const lead = document.querySelector(".lead");
  if (lead) lead.textContent = "이 브라우저에서 3D를 켤 수 없어요.";
  throw err;
}
try {
  const gl = renderer.getContext();
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "") : "";
  if (/swiftshader|llvmpipe|softpipe|software/i.test(gpu)) {
    liteScene = true;
    shadowsOn = false;
    pixelRatio = 1;
    PUFF_MAX = 28;
    renderer.dispose();
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
  }
} catch {
  /* keep the default quality */
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = shadowsOn;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(pixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb7dcff);
scene.fog = new THREE.Fog(0xc5e7ff, liteScene ? 55 : 70, liteScene ? 190 : 250);

const camera = new THREE.PerspectiveCamera(70, 1, 0.12, 520);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xd7ecff, 0x9dcc7a, 0.92);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3dd, 1.45);
sun.position.set(40, 70, 24);
sun.castShadow = shadowsOn;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 8;
sun.shadow.camera.far = 95;
sun.shadow.camera.left = -24;
sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
sun.shadow.bias = -0.00035;
scene.add(sun);
scene.add(sun.target);
const fill = new THREE.DirectionalLight(0xc5d9ff, 0.28);
fill.position.set(-30, 20, -20);
scene.add(fill);

const clock = new THREE.Clock();
let state = "start";
let raceTime = 0;
let shake = 0;
let toastTimer = 0;
let countToken = 0;
let resultShown = false;
let silentSim = false;
let camSnap = 4;
let qualityDropped = false;
let slowFrames = 0;
let watchedFrames = 0;
let L = 1;
let raceLen = 1;
let startS = 0;
let launchS = -1;
const launches = [];
let CRUISE = 22;
let maxAbsCurv = 0;

const frames = [];
const karts = [];
const boxes = [];
const bananas = [];
const missiles = [];
const slicks = [];
const hazards = [];
let courseMarks = [];
let shortcut = null;
const flags = [];
const clouds = [];
const archLights = [];
let player = null;
const fr = makeScratch();
const lookFr = makeScratch();
const nearFr = makeScratch();

function makeScratch() {
  return {
    pos: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    curvature: 0,
    half: 7,
    launch: false,
  };
}

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MOBILE ? 2 : 8;
  return tex;
}

function roadTexture() {
  const tex = canvasTex(256, 256, (g) => {
    g.fillStyle = "#6d6584";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.07)";
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    for (let y = 0; y < 256; y += 32) {
      const alt = (y / 32) % 2 === 0;
      g.fillStyle = alt ? "#ff8fb8" : "#fffdf8";
      g.fillRect(0, y, 22, 32);
      g.fillStyle = alt ? "#ffe066" : "#fffdf8";
      g.fillRect(234, y, 22, 32);
    }
    g.fillStyle = "#fffdf8";
    g.fillRect(26, 0, 5, 256);
    g.fillRect(225, 0, 5, 256);
    g.fillStyle = "rgba(255,246,200,0.92)";
    for (let y = 8; y < 256; y += 44) g.fillRect(122, y, 12, 20);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function grassTexture() {
  const tex = canvasTex(128, 128, (g) => {
    g.fillStyle = "#7dce86";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = Math.random() > 0.5 ? "#8fe09a" : "#63b96f";
      g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function labelTex(text, bg = "#fffdf8", fg = "#2b2140") {
  return canvasTex(512, 160, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 160);
    g.strokeStyle = "#2b2140";
    g.lineWidth = 10;
    g.strokeRect(8, 8, 496, 144);
    g.fillStyle = fg;
    g.font = "700 78px Jua, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 256, 86);
  });
}

function softTex() {
  return canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
}

function storageGet() {
  try {
    return localStorage.getItem(BEST_KEY);
  } catch {
    return null;
  }
}
function storageSet(v) {
  try {
    localStorage.setItem(BEST_KEY, v);
  } catch {
    /* ignore */
  }
}

function smooth01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function courseCommands() {
  return [
    ["f", 78, 0, "start"],
    ["t", -26, 18, "chicane"],
    ["t", 54, 16, "chicane"],
    ["t", -28, 18, "chicane"],
    ["f", 58, 0, "toHair"],
    ["t", 170, 17, "hairL"],
    ["f", 30, 0, "hairMid"],
    ["t", -80, 24, "hairExit"],
    ["f", 120, 0, "climb"],
    ["t", 90, 18, "kink"],
    ["f", 46, 0, "preSpur"],
    ["t", -170, 20, "hairpin"],
    ["f", 18, 0, "pinStraight"],
    ["t", 170, 20, "hairpinBack"],
    ["f", 22, 0, "postSpur"],
    ["f", 100, 0, "side"],
    ["t", 22, 24, "esses"],
    ["t", -44, 22, "esses"],
    ["t", 22, 24, "esses"],
    ["t", 100, 58, "bank"],
    ["f", 72, 0, "tunnel"],
    ["t", 30, 20, "wiggle"],
    ["t", -60, 18, "wiggle"],
    ["t", 30, 20, "wiggle"],
    ["f", 93.8, 0, "narrow"],
    ["t", 80, 18, "tight"],
    ["f", 93.25, 0, "bridge"],
  ];
}

function heightAt(s) {
  const m = courseMarks.find((mk) => s >= mk.s0 && s < mk.s1) || courseMarks[courseMarks.length - 1];
  const u = m.s1 > m.s0 ? (s - m.s0) / (m.s1 - m.s0) : 0;
  if (m.tag === "climb") return 0.4 + 7.8 * smooth01(u);
  if (m.tag === "kink") return 8.2 + (2.2 - 8.2) * smooth01(u);
  if (m.tag === "preSpur") return 2.2 + (1.4 - 2.2) * u;
  if (m.tag === "hairpin" || m.tag === "pinStraight" || m.tag === "hairpinBack") return 1.35;
  if (m.tag === "postSpur") return 1.35 + (0.4 - 1.35) * u;
  if (m.tag === "bank") return 0.5 + 0.85 * Math.sin(Math.min(1, u) * Math.PI);
  if (m.tag === "bridge") {
    if (u < 0.32) return 0.4 + 6.8 * smooth01(u / 0.32);
    if (u < 0.58) return 7.2;
    return 7.2 + (0.4 - 7.2) * smooth01((u - 0.58) / 0.42);
  }
  return 0.4;
}

function coursePoints() {
  let x = 0;
  let z = 0;
  let h = 0;
  let len = 0;
  const pts = [{ x, z, s: 0 }];
  courseMarks = [];
  for (const [op, a, b, tag] of courseCommands()) {
    const s0 = len;
    if (op === "f") {
      const steps = Math.max(2, Math.round(Math.abs(a) / 3));
      const step = a / steps;
      for (let i = 0; i < steps; i++) {
        x += Math.cos(h) * step;
        z += Math.sin(h) * step;
        len += Math.abs(step);
        pts.push({ x, z, s: len });
      }
    } else {
      const steps = Math.max(8, Math.round(Math.abs(a) / 2));
      const dH = ((a * Math.PI) / 180) / steps;
      const stepLen = Math.abs(b * dH);
      for (let i = 0; i < steps; i++) {
        const mid = h + dH / 2;
        h += dH;
        x += Math.cos(mid) * stepLen;
        z += Math.sin(mid) * stepLen;
        len += stepLen;
        pts.push({ x, z, s: len });
      }
    }
    courseMarks.push({ tag, s0, s1: len });
  }
  if (pts.length > 2 && Math.hypot(pts[pts.length - 1].x, pts[pts.length - 1].z) < 0.35) pts.pop();
  return pts.map((p) => new THREE.Vector3(p.x, heightAt(p.s), p.z));
}

function markAt(s) {
  let x = s % L;
  if (x < 0) x += L;
  for (const m of courseMarks) {
    if (x >= m.s0 && x < m.s1) return m;
  }
  return courseMarks[courseMarks.length - 1];
}

function buildTrack() {
  const raw = coursePoints();
  const cum = [0];
  let len = 0;
  for (let i = 0; i < raw.length; i++) {
    len += raw[i].distanceTo(raw[(i + 1) % raw.length]);
    cum.push(len);
  }
  L = len;
  const n = Math.max(120, Math.round(L / 2));
  const spacing = L / n;
  frames.length = 0;
  let prevRight = new THREE.Vector3(1, 0, 0);
  const worldUp = new THREE.Vector3(0, 1, 0);
  const pointAt = (s) => {
    let x = s % L;
    if (x < 0) x += L;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    const i1 = Math.max(1, lo);
    const i0 = i1 - 1;
    const span = cum[i1] - cum[i0] || 1;
    const t = Math.max(0, Math.min(1, (x - cum[i0]) / span));
    return raw[i0 % raw.length].clone().lerp(raw[i1 % raw.length], t);
  };
  for (let i = 0; i < n; i++) {
    const s = i * spacing;
    const pos = pointAt(s);
    const ahead = pointAt(s + 0.75);
    const tangent = ahead.sub(pos);
    if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
    tangent.normalize();
    let right = new THREE.Vector3().crossVectors(worldUp, tangent);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    if (right.dot(prevRight) < 0) right.negate();
    prevRight = right;
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    frames.push({
      pos,
      tangent,
      right,
      up,
      s,
      curvature: 0,
      half: 8,
      launch: false,
    });
  }
  const rawCurv = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = frames[i].tangent;
    const b = frames[(i + 1) % n].tangent;
    const h1 = Math.atan2(a.z, a.x);
    const h2 = Math.atan2(b.z, b.x);
    let d = h2 - h1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    rawCurv[i] = d / spacing;
  }
  maxAbsCurv = 0;
  for (let i = 0; i < n; i++) {
    const c =
      rawCurv[(i - 1 + n) % n] * 0.2 + rawCurv[i] * 0.6 + rawCurv[(i + 1) % n] * 0.2;
    frames[i].curvature = c;
    maxAbsCurv = Math.max(maxAbsCurv, Math.abs(c));
    const tag = markAt(frames[i].s).tag;
    const sharp = Math.min(1, Math.abs(c) / 0.045);
    const wide = {
      start: 7.7,
      chicane: 6.15,
      hairL: 6.05,
      hairMid: 6.3,
      hairExit: 6.4,
      hairpin: 5.9,
      pinStraight: 5.7,
      hairpinBack: 5.9,
      narrow: 4.15,
      wiggle: 6.5,
      tunnel: 6.55,
      bank: 8.35,
      tight: 6.1,
      bridge: 7.15,
      climb: 7.4,
    };
    frames[i].half = wide[tag] ?? 7.45 - sharp * 0.35;
    frames[i].tag = tag;
    let bank = THREE.MathUtils.clamp(-c * 3.4, -0.14, 0.14);
    if (tag === "bank") bank = -Math.sign(c || 1) * 0.5;
    frames[i].right.applyAxisAngle(frames[i].tangent, bank);
    frames[i].up.crossVectors(frames[i].tangent, frames[i].right).normalize();
  }
  launches.length = 0;
  const look = 7;
  for (let i = 0; i < n; i++) {
    const ahead = frames[(i + look) % n];
    const drop = frames[i].tangent.y - ahead.tangent.y;
    if (frames[i].tangent.y > 0.07 && ahead.tangent.y < 0.03 && drop > 0.1) {
      const prev = launches[launches.length - 1];
      if (prev == null || Math.abs(frames[i].s - prev) > 40) {
        frames[i].launch = true;
        launches.push(frames[i].s);
      }
    }
  }
  launchS = launches[0] ?? -1;
  startS = L - START_GAP;
  raceLen = L + START_GAP;
  CRUISE = raceLen / 63;
}

function ribbonGeometry(widthPad, yDrop) {
  const n = frames.length;
  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const indices = [];
  for (let i = 0; i < n; i++) {
    const f = frames[i];
    const half = f.half + widthPad;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      const o = (i * 2 + side) * 3;
      positions[o] = f.pos.x + f.right.x * half * sign;
      positions[o + 1] = f.pos.y + f.up.y * 0.02 - yDrop;
      positions[o + 2] = f.pos.z + f.right.z * half * sign;
      const uv = (i * 2 + side) * 2;
      uvs[uv] = side;
      uvs[uv + 1] = f.s / 4;
    }
    const j = (i + 1) % n;
    indices.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildRoad() {
  const shoulder = new THREE.Mesh(
    ribbonGeometry(3.4, 0.14),
    new THREE.MeshLambertMaterial({ map: grassTexture(), side: THREE.DoubleSide })
  );
  shoulder.receiveShadow = shadowsOn;
  scene.add(shoulder);

  const road = new THREE.Mesh(
    ribbonGeometry(0, 0),
    new THREE.MeshStandardMaterial({
      map: roadTexture(),
      roughness: 0.92,
      metalness: 0.02,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  road.receiveShadow = shadowsOn;
  scene.add(road);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(520, liteScene ? 24 : 40),
    new THREE.MeshLambertMaterial({ color: 0x8ed18d })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.55;
  ground.receiveShadow = shadowsOn;
  scene.add(ground);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 18, 12),
    new THREE.MeshBasicMaterial({
      map: canvasTex(8, 256, (g) => {
        const grd = g.createLinearGradient(0, 0, 0, 256);
        grd.addColorStop(0, "#6eb6ff");
        grd.addColorStop(0.45, "#b9e0ff");
        grd.addColorStop(0.78, "#d9f0ff");
        grd.addColorStop(1, "#ffe7c2");
        g.fillStyle = grd;
        g.fillRect(0, 0, 8, 256);
      }),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  if (!liteScene) scene.add(sky);
}

function addInstances(geo, material, count, place) {
  if (count <= 0) return null;
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const color = material.userData.colored;
  for (let i = 0; i < count; i++) place(i, mesh, color);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  if (shadowsOn && material.userData.cast) mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}

function buildBarriers() {
  const step = Math.max(1, Math.round(5 / (L / frames.length)));
  const spots = [];
  for (let i = 0; i < frames.length; i += step) spots.push(i);
  const postGeo = new THREE.BoxGeometry(0.22, 0.95, 0.22);
  const railGeo = new THREE.BoxGeometry(0.14, 0.16, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.userData.colored = true;
  const seg = (L / frames.length) * step;
  addInstances(postGeo, mat, spots.length * 2, (i, mesh) => {
    const f = frames[spots[(i / 2) | 0]];
    const side = i % 2 === 0 ? -1 : 1;
    _dummy.position.set(
      f.pos.x + f.right.x * side * (f.half + 0.42),
      f.pos.y + 0.48,
      f.pos.z + f.right.z * side * (f.half + 0.42)
    );
    _dummy.rotation.set(0, Math.atan2(f.tangent.x, f.tangent.z), 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
    _col.set(i % 4 === 0 ? 0xffe066 : i % 2 === 0 ? 0xff8fb8 : 0xfffdf8);
    mesh.setColorAt(i, _col);
  });
  const railMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  railMat.userData.colored = true;
  addInstances(railGeo, railMat, spots.length * 2, (i, mesh) => {
    const f = frames[spots[(i / 2) | 0]];
    const side = i % 2 === 0 ? -1 : 1;
    _dummy.position.set(
      f.pos.x + f.right.x * side * (f.half + 0.42),
      f.pos.y + 0.78,
      f.pos.z + f.right.z * side * (f.half + 0.42)
    );
    _basis.makeBasis(f.right, f.up, f.tangent);
    _dummy.quaternion.setFromRotationMatrix(_basis);
    _dummy.scale.set(1, 1, seg);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
    _col.set(side < 0 ? 0xff8fb8 : 0xffe066);
    mesh.setColorAt(i, _col);
  });

  const pierIdx = [];
  for (let i = 0; i < frames.length; i += 3) if (frames[i].pos.y > 1.35) pierIdx.push(i);
  if (pierIdx.length) {
    const pierMat = new THREE.MeshLambertMaterial({ color: 0xfff3d4 });
    addInstances(new THREE.CylinderGeometry(0.38, 0.5, 1, 6), pierMat, pierIdx.length, (i, mesh) => {
      const f = frames[pierIdx[i]];
      _dummy.position.set(f.pos.x, f.pos.y * 0.5 - 0.2, f.pos.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, Math.max(0.2, f.pos.y), 1);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    });
  }
}

function trackClear(x, z, nearS, minDist) {
  const min2 = minDist * minDist;
  for (let i = 0; i < frames.length; i += 2) {
    const ds = Math.abs(frames[i].s - nearS);
    const wrap = Math.min(ds, L - ds);
    if (wrap < 16) continue;
    const dx = frames[i].pos.x - x;
    const dz = frames[i].pos.z - z;
    if (dx * dx + dz * dz < min2) return false;
  }
  return true;
}

function buildScenery() {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  trunkMat.userData.colored = true;
  const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  leafMat.userData.colored = true;
  const step = Math.max(1, Math.round((liteScene ? 22 : 16) / (L / frames.length)));
  const treeSpots = [];
  for (let i = 0; i < frames.length; i += step) {
    const f = frames[i];
    for (const side of [-1, 1]) {
      if (Math.random() < 0.18) continue;
      const dist = f.half + 4.5 + Math.random() * (liteScene ? 6 : 10);
      const x = f.pos.x + f.right.x * side * dist;
      const z = f.pos.z + f.right.z * side * dist;
      if (!trackClear(x, z, f.s, 5.5)) continue;
      treeSpots.push({
        x,
        y: f.pos.y,
        z,
        lolli: Math.random() < 0.28,
        s: 0.85 + Math.random() * 0.7,
        hue: Math.random(),
      });
    }
  }
  addInstances(new THREE.CylinderGeometry(0.16, 0.24, 1, 5), trunkMat, treeSpots.length, (i, mesh) => {
    const t = treeSpots[i];
    const h = t.lolli ? 2.4 : 1.35;
    _dummy.position.set(t.x, t.y + h * 0.5, t.z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(t.lolli ? 0.55 : 1, h, t.lolli ? 0.55 : 1);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
    _col.set(t.lolli ? 0xfffdf8 : 0x8a5a3a);
    mesh.setColorAt(i, _col);
  });
  addInstances(new THREE.SphereGeometry(1, 7, 6), leafMat, treeSpots.length, (i, mesh) => {
    const t = treeSpots[i];
    const h = t.lolli ? 2.55 : 1.7;
    _dummy.position.set(t.x, t.y + h, t.z);
    _dummy.rotation.set(0, Math.random() * 3, 0);
    const sc = t.lolli ? 0.55 * t.s : 1.15 * t.s;
    _dummy.scale.set(sc, t.lolli ? sc * 0.85 : sc * 0.8, sc);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
    if (t.lolli) _col.set(t.hue < 0.33 ? 0xff8fb8 : t.hue < 0.66 ? 0xffe066 : 0x7ce7c4);
    else _col.set(t.hue < 0.5 ? 0x3cb86a : 0x7dce55);
    mesh.setColorAt(i, _col);
  });

  const flowerStep = Math.max(1, Math.round((liteScene ? 14 : 9) / (L / frames.length)));
  const flowers = [];
  for (let i = 0; i < frames.length; i += flowerStep) {
    const f = frames[i];
    const side = i % 2 === 0 ? -1 : 1;
    const dist = f.half + 1.6 + (i % 5);
    const x = f.pos.x + f.right.x * side * dist;
    const z = f.pos.z + f.right.z * side * dist;
    if (!trackClear(x, z, f.s, 3)) continue;
    flowers.push({ x, y: f.pos.y + 0.18, z, c: i % 3 });
  }
  const flowerMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  flowerMat.userData.colored = true;
  addInstances(new THREE.SphereGeometry(0.28, 5, 4), flowerMat, flowers.length, (i, mesh) => {
    const t = flowers[i];
    _dummy.position.set(t.x, t.y, t.z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(1, 0.55, 1);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
    _col.set(t.c === 0 ? 0xff8fb8 : t.c === 1 ? 0xffe066 : 0xfffdf8);
    mesh.setColorAt(i, _col);
  });

  const crowdStep = Math.max(1, Math.round((liteScene ? 28 : 20) / (L / frames.length)));
  const crowd = [];
  for (let i = 0; i < frames.length; i += crowdStep) {
    const f = frames[i];
    const side = i % 2 === 0 ? 1 : -1;
    const dist = f.half + 1.55;
    const x = f.pos.x + f.right.x * side * dist;
    const z = f.pos.z + f.right.z * side * dist;
    crowd.push({ x, y: f.pos.y, z, c: i % 4 });
  }
  const beanMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  beanMat.userData.colored = true;
  addInstances(new THREE.SphereGeometry(0.32, 7, 6), beanMat, crowd.length, (i, mesh) => {
    const t = crowd[i];
    _dummy.position.set(t.x, t.y + 0.55, t.z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(0.85, 1.15, 0.8);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
    _col.set([0xffb7d0, 0xb6f3e2, 0xfff0a8, 0xd7c4ff][t.c]);
    mesh.setColorAt(i, _col);
  });
  const sproutMat = new THREE.MeshLambertMaterial({ color: 0x3dce9e });
  addInstances(new THREE.SphereGeometry(0.16, 5, 4), sproutMat, crowd.length, (i, mesh) => {
    const t = crowd[i];
    _dummy.position.set(t.x, t.y + 1.05, t.z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(1.3, 0.45, 0.8);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  });

  const barnMat = new THREE.MeshStandardMaterial({ color: 0xff8fb8, roughness: 0.7, flatShading: true });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.55, flatShading: true });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfffdf8, roughness: 0.6, flatShading: true });
  let cx = 0;
  let cz = 0;
  for (const f of frames) {
    cx += f.pos.x;
    cz += f.pos.z;
  }
  cx /= frames.length;
  cz /= frames.length;
  let minD = Infinity;
  for (const f of frames) minD = Math.min(minD, Math.hypot(f.pos.x - cx, f.pos.z - cz));
  const pondR = THREE.MathUtils.clamp(minD * 0.28, 4, 14);
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(pondR, 20),
    new THREE.MeshStandardMaterial({ color: 0x8ec5ff, roughness: 0.25, metalness: 0.15 })
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(cx, 0.05, cz);
  scene.add(pond);

  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2 + 0.4;
    const rad = Math.max(8, minD * 0.48);
    const x = cx + Math.cos(ang) * rad;
    const z = cz + Math.sin(ang) * rad;
    if (!trackClear(x, z, 0, 8)) continue;
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.6, 3.6), k % 2 ? barnMat : cream);
    wall.position.y = 1.3;
    wall.castShadow = shadowsOn;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.7, 1.7, 4), roofMat);
    roof.position.y = 3.2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = shadowsOn;
    g.add(wall, roof);
    g.position.set(x, 0, z);
    g.rotation.y = ang;
    scene.add(g);
  }

  const silo = new THREE.Group();
  const siloBody = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.4, 8, 10),
    new THREE.MeshStandardMaterial({ color: 0xfffdf8, roughness: 0.6, flatShading: true })
  );
  siloBody.position.y = 4;
  siloBody.castShadow = shadowsOn;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.7, 2.1, 10), roofMat);
  cap.position.y = 9.1;
  silo.add(siloBody, cap);
  silo.position.set(cx + minD * 0.15, 0, cz - minD * 0.1);
  scene.add(silo);

  const hillCols = [0xb7e38a, 0xf7c1d8, 0xffe9a0, 0x9fd9ff];
  for (let i = 0; i < (liteScene ? 5 : 7); i++) {
    const ang = (i / 7) * Math.PI * 2;
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(28 + (i % 3) * 10, 18 + (i % 4) * 4, 6),
      new THREE.MeshLambertMaterial({ color: hillCols[i % hillCols.length], flatShading: true })
    );
    hill.position.set(Math.cos(ang) * 250, 4, Math.sin(ang) * 210);
    scene.add(hill);
  }

  for (let i = 0; i < (liteScene ? 5 : 8); i++) {
    const cloud = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xfffdf8 });
    for (let p = 0; p < 3; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(2.2 + p * 0.4, 7, 5), mat);
      s.position.set(p * 2.2 - 2, Math.sin(p) * 0.4, 0);
      s.scale.y = 0.65;
      cloud.add(s);
    }
    cloud.position.set((i - 3) * 48, 22 + (i % 3) * 4, -30 + (i % 4) * 36);
    cloud.userData.base = cloud.position.clone();
    cloud.userData.phase = i;
    clouds.push(cloud);
    scene.add(cloud);
  }

  const flagStep = Math.max(1, Math.round((liteScene ? 90 : 55) / (L / frames.length)));
  const flagMat = new THREE.MeshLambertMaterial({ color: 0xff8fb8, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xfffdf8 });
  let flagN = 0;
  for (let i = 0; i < frames.length && flagN < (liteScene ? 10 : 16); i += flagStep) {
    const f = frames[i];
    const side = 1;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 5), poleMat);
    pole.position.y = 1.2;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.48), flagMat.clone());
    cloth.material.color.set(flagN % 2 ? 0xffe066 : 0xff8fb8);
    cloth.position.set(0.5, 2.05, 0);
    g.add(pole, cloth);
    g.position.set(
      f.pos.x + f.right.x * side * (f.half + 1.3),
      f.pos.y,
      f.pos.z + f.right.z * side * (f.half + 1.3)
    );
    g.userData.cloth = cloth;
    g.userData.phase = flagN;
    flags.push(g);
    scene.add(g);
    flagN += 1;
  }

  const f0 = frames[0];
  const arch = new THREE.Group();
  const pillarGeo = new THREE.BoxGeometry(0.85, 4.4, 0.85);
  const pink = new THREE.MeshStandardMaterial({ color: 0xff8fb8, roughness: 0.5, flatShading: true });
  const lemon = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.5, flatShading: true });
  const leftP = new THREE.Mesh(pillarGeo, pink);
  leftP.position.set(-f0.half - 0.2, 2.2, 0);
  const rightP = new THREE.Mesh(pillarGeo, lemon);
  rightP.position.set(f0.half + 0.2, 2.2, 0);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(f0.half * 2 + 1.6, 0.6, 0.8), pink);
  beam.position.y = 4.55;
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(8, f0.half * 1.5), 1.15),
    new THREE.MeshBasicMaterial({ map: labelTex("콩트라이더", "#ff8fb8", "#2b2140"), transparent: true })
  );
  banner.position.set(0, 3.45, 0.45);
  leftP.castShadow = rightP.castShadow = beam.castShadow = shadowsOn;
  arch.add(leftP, rightP, beam, banner);
  for (let i = 0; i < 3; i++) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x6a5a78, emissive: 0xffe066, emissiveIntensity: 0.15 })
    );
    lamp.position.set((i - 1) * 0.7, 4.15, 0.45);
    arch.add(lamp);
    archLights.push(lamp);
  }
  arch.position.copy(f0.pos);
  _basis.makeBasis(f0.right, f0.up, f0.tangent);
  arch.quaternion.setFromRotationMatrix(_basis);
  scene.add(arch);

  const checker = new THREE.Mesh(
    new THREE.PlaneGeometry(f0.half * 2, 1.5),
    new THREE.MeshStandardMaterial({
      map: canvasTex(128, 32, (g) => {
        for (let x = 0; x < 8; x++) {
          g.fillStyle = x % 2 ? "#2b2140" : "#fffdf8";
          g.fillRect(x * 16, 0, 16, 32);
        }
      }),
      roughness: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  checker.position.copy(f0.pos).addScaledVector(f0.up, 0.08);
  _basis.makeBasis(f0.right, f0.tangent, f0.up);
  checker.quaternion.setFromRotationMatrix(_basis);
  checker.receiveShadow = shadowsOn;
  scene.add(checker);

  for (const ls of launches) {
    sampleInto(ls, fr);
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(fr.half * 1.7, 0.16, 3.4),
      new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.45, emissive: 0xffb703, emissiveIntensity: 0.18 })
    );
    ramp.position.copy(fr.pos).addScaledVector(fr.up, 0.1);
    _basis.makeBasis(fr.right, fr.up, fr.tangent);
    ramp.quaternion.setFromRotationMatrix(_basis);
    scene.add(ramp);
    placeSign(Math.max(0, ls - 18), "점프!", 1);
  }
  placeSign(22, "출발", -1);

  for (let i = 0; i < 2; i++) {
    const bunch = new THREE.Group();
    const colors = [0xff8fb8, 0xffe066, 0x7ce7c4];
    for (let b = 0; b < 3; b++) {
      const balloon = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 8, 6),
        new THREE.MeshStandardMaterial({ color: colors[b], roughness: 0.4, emissive: colors[b], emissiveIntensity: 0.12 })
      );
      balloon.position.set((b - 1) * 0.5, 3.2 + b * 0.15, 0);
      balloon.scale.y = 1.2;
      bunch.add(balloon);
    }
    const anchor = frames[i === 0 ? 8 : Math.min(frames.length - 1, 24)];
    bunch.position.copy(anchor.pos).addScaledVector(anchor.right, (i === 0 ? -1 : 1) * (anchor.half + 2));
    bunch.userData.baseY = bunch.position.y;
    bunch.userData.phase = i * 1.7;
    clouds.push(bunch);
    scene.add(bunch);
  }
}

function buildCourseFeatures() {
  const tunnel = courseMarks.find((m) => m.tag === "tunnel");
  const bank = courseMarks.find((m) => m.tag === "bank");
  const narrow = courseMarks.find((m) => m.tag === "narrow");
  const chicane = courseMarks.find((m) => m.tag === "chicane");
  const hair = courseMarks.find((m) => m.tag === "hairL");
  if (tunnel) {
    const ribs = [];
    const step = liteScene ? 16 : 9;
    for (let s = tunnel.s0 + 4; s < tunnel.s1 - 2; s += step) ribs.push(s);
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a3158 });
    const beam = new THREE.MeshLambertMaterial({ color: 0x6d5a8a });
    addInstances(new THREE.BoxGeometry(1, 1, 1), dark, ribs.length * 2, (i, mesh) => {
      sampleInto(ribs[(i / 2) | 0], fr);
      const side = i % 2 === 0 ? -1 : 1;
      _dummy.position.copy(fr.pos).addScaledVector(fr.right, side * (fr.half + 0.15)).addScaledVector(fr.up, 1.7);
      _basis.makeBasis(fr.right, fr.up, fr.tangent);
      _dummy.quaternion.setFromRotationMatrix(_basis);
      _dummy.scale.set(0.7, 3.5, 0.7);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    });
    addInstances(new THREE.BoxGeometry(1, 1, 1), beam, ribs.length, (i, mesh) => {
      sampleInto(ribs[i], fr);
      _dummy.position.copy(fr.pos).addScaledVector(fr.up, 3.55);
      _basis.makeBasis(fr.right, fr.up, fr.tangent);
      _dummy.quaternion.setFromRotationMatrix(_basis);
      _dummy.scale.set(fr.half * 2 + 1.5, 0.42, 0.85);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    });
    placeSign(tunnel.s0 + 6, "터널", -1);
  }
  if (bank) {
    shortcut = { enter: bank.s0 + 12, exit: bank.s1 - 10, side: -1 };
    sampleInto(shortcut.enter, fr);
    const a = fr.pos.clone().addScaledVector(fr.right, shortcut.side * (fr.half + 2.2));
    sampleInto(shortcut.exit, fr);
    const b = fr.pos.clone().addScaledVector(fr.right, shortcut.side * 2.2);
    const dir = b.clone().sub(a);
    const len = Math.max(1, dir.length());
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(_yAxis, dir).normalize();
    const hw = 3.1;
    const yLift = 0.12;
    const positions = new Float32Array([
      a.x - side.x * hw, a.y + yLift, a.z - side.z * hw,
      a.x + side.x * hw, a.y + yLift, a.z + side.z * hw,
      b.x + side.x * hw, b.y + yLift, b.z + side.z * hw,
      b.x - side.x * hw, b.y + yLift, b.z - side.z * hw,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    geo.computeVertexNormals();
    const strip = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0x7ce7c4, roughness: 0.85, side: THREE.DoubleSide })
    );
    strip.receiveShadow = shadowsOn;
    scene.add(strip);
    shortcut.a = a;
    shortcut.b = b;
    shortcut.len = len;
    shortcut.sideVec = side;
    placeSign(bank.s0 + 4, "지름길", -1);
    const oil = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 14),
      new THREE.MeshBasicMaterial({ color: 0x24182f, transparent: true, opacity: 0.82 })
    );
    oil.rotation.x = -Math.PI / 2;
    oil.position.copy(a).lerp(b, 0.48);
    oil.position.y += 0.16;
    scene.add(oil);
  }
  if (narrow) {
    placeSign(narrow.s0 + 8, "좁은 길", 1);
    addHazard((narrow.s0 + narrow.s1) * 0.5, 0.2, "oil", 2.3);
  }
  if (chicane) {
    addHazard(chicane.s0 + 8, 2.15, "bump", 1.25);
    addHazard(chicane.s1 - 4, -2.05, "bump", 1.25);
  }
  if (hair) placeSign(hair.s0 + 4, "헤어핀", 1);
}

function addHazard(s, u, kind, r) {
  sampleInto(s, fr);
  const mesh = new THREE.Mesh(
    kind === "oil" ? new THREE.CircleGeometry(r, 16) : new THREE.CylinderGeometry(r * 0.55, r * 0.7, 0.55, 7),
    kind === "oil"
      ? new THREE.MeshBasicMaterial({ color: 0x1a1228, transparent: true, opacity: 0.88 })
      : new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.55, flatShading: true })
  );
  if (kind === "oil") mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(fr.pos).addScaledVector(fr.right, u).addScaledVector(fr.up, kind === "oil" ? 0.08 : 0.28);
  scene.add(mesh);
  hazards.push({ s, u, kind, r, mesh });
}

function placeSign(dist, text, side) {
  sampleInto(dist, fr);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.1, 1.15),
    new THREE.MeshBasicMaterial({ map: labelTex(text, "#fffdf8", "#ff4f93"), transparent: true, side: THREE.DoubleSide })
  );
  sign.position.copy(fr.pos).addScaledVector(fr.right, side * (fr.half + 2.4)).addScaledVector(fr.up, 1.8);
  _basis.makeBasis(fr.right, fr.up, fr.tangent.clone().negate());
  sign.quaternion.setFromRotationMatrix(_basis);
  scene.add(sign);
}

function makeBadge(n, hex) {
  const tex = canvasTex(128, 128, (g) => {
    g.fillStyle = "#fffdf8";
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = "#2b2140";
    g.stroke();
    g.fillStyle = hex;
    g.font = "700 74px Jua, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), 64, 70);
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), new THREE.MeshBasicMaterial({ map: tex }));
  mesh.userData.noShadow = true;
  return mesh;
}

function makeName(text, hex) {
  const tex = canvasTex(256, 64, (g) => {
    g.clearRect(0, 0, 256, 64);
    g.font = "700 36px Jua, sans-serif";
    g.lineWidth = 7;
    g.strokeStyle = "#2b2140";
    g.fillStyle = hex;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.strokeText(text, 128, 34);
    g.fillText(text, 128, 34);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(2.4, 0.6, 1);
  sprite.position.y = 2.05;
  sprite.userData.noShadow = true;
  return sprite;
}

function makeKart(color, number, name, nameHex) {
  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  const paint = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.08,
    flatShading: true,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2140, roughness: 0.72, flatShading: true });
  const paper = new THREE.MeshStandardMaterial({ color: 0xfffdf8, roughness: 0.4, flatShading: true });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1c1630, roughness: 0.92, flatShading: true });
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0xffe066,
    roughness: 0.35,
    metalness: 0.25,
    flatShading: true,
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 8), paint);
  body.scale.set(1.18, 0.46, 1.62);
  body.position.y = 0.32;
  lean.add(body);

  const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.73, 12, 8), paper);
  stripe.scale.set(0.22, 0.48, 1.64);
  stripe.position.y = 0.34;
  lean.add(stripe);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), paint);
  nose.scale.set(1.15, 0.62, 1.35);
  nose.position.set(0, 0.26, 0.98);
  lean.add(nose);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6), dark);
  cockpit.scale.set(1.05, 0.48, 1.15);
  cockpit.position.set(0, 0.5, -0.02);
  lean.add(cockpit);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.32), paint);
  spoiler.position.set(0, 0.78, -0.98);
  const pL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.08), dark);
  pL.position.set(-0.46, 0.6, -0.98);
  const pR = pL.clone();
  pR.position.x = 0.46;
  lean.add(spoiler, pL, pR);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff6c8,
    emissive: 0xffe39a,
    emissiveIntensity: 0.85,
  });
  const lampGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const lampL = new THREE.Mesh(lampGeo, lampMat);
  lampL.position.set(-0.28, 0.3, 1.15);
  const lampR = lampL.clone();
  lampR.position.x = 0.28;
  lean.add(lampL, lampR);

  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x5a2030, emissive: 0xff3355, emissiveIntensity: 0.15 });
  const brakeGeo = new THREE.SphereGeometry(0.07, 6, 5);
  const brakeL = new THREE.Mesh(brakeGeo, brakeMat);
  brakeL.position.set(-0.32, 0.32, -1.12);
  const brakeR = brakeL.clone();
  brakeR.position.x = 0.32;
  brakeR.material = brakeMat.clone();
  brakeL.material = brakeMat;
  lean.add(brakeL, brakeR);

  const exGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.24, 6);
  exGeo.rotateX(Math.PI / 2);
  const exL = new THREE.Mesh(exGeo, dark);
  exL.position.set(-0.22, 0.18, -1.12);
  const exR = exL.clone();
  exR.position.x = 0.22;
  lean.add(exL, exR);

  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.2, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const fronts = [];
  const spots = [
    [0.64, 0.28, 0.62, true],
    [-0.64, 0.28, 0.62, true],
    [0.68, 0.28, -0.64, false],
    [-0.68, 0.28, -0.64, false],
  ];
  for (const [x, y, z, front] of spots) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const tire = new THREE.Mesh(wheelGeo, rubber);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    pivot.add(tire, hub);
    lean.add(pivot);
    wheels.push(tire);
    if (front) fronts.push(pivot);
  }

  const beanMat = new THREE.MeshStandardMaterial({ color: 0xffc4d8, roughness: 0.52, flatShading: true });
  const bean = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), beanMat);
  bean.scale.set(0.92, 1.18, 0.86);
  bean.position.set(0, 0.82, -0.02);
  lean.add(bean);

  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xfffdf8, roughness: 0.35 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x2b2140 });
  function addEye(x) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), eyeWhite);
    eye.position.set(x, 0.9, 0.2);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.036, 6, 5), pupilMat);
    pupil.position.set(x * 1.05, 0.9, 0.26);
    lean.add(eye, pupil);
  }
  addEye(-0.12);
  addEye(0.12);
  const cheekMat = new THREE.MeshStandardMaterial({ color: 0xff8fb8, roughness: 0.55 });
  const cheekL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), cheekMat);
  cheekL.position.set(-0.2, 0.76, 0.16);
  const cheekR = cheekL.clone();
  cheekR.position.x = 0.2;
  lean.add(cheekL, cheekR);
  const sproutMat = new THREE.MeshStandardMaterial({ color: 0x3dce9e, flatShading: true });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.2, 5), sproutMat);
  stem.position.set(0, 1.2, 0);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), sproutMat);
  leaf.scale.set(1.5, 0.42, 0.75);
  leaf.position.set(0.1, 1.3, 0);
  lean.add(stem, leaf);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    paint
  );
  cap.position.set(0, 0.98, 0.02);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.045, 8), paint);
  brim.position.set(0, 0.96, 0.14);
  lean.add(cap, brim);

  const badgeL = makeBadge(number, nameHex);
  badgeL.position.set(0.95, 0.4, 0.05);
  badgeL.rotation.y = Math.PI / 2;
  const badgeR = badgeL.clone();
  badgeR.position.x = -0.95;
  badgeR.rotation.y = -Math.PI / 2;
  lean.add(badgeL, badgeR);

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xfff1a8,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.85, 8), flameMat);
  flame.rotateX(Math.PI / 2);
  flame.position.set(0, 0.22, -1.28);
  flame.visible = false;
  flame.userData.noShadow = true;
  lean.add(flame);

  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.45, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0x8ec5ff, transparent: true, opacity: 0.28, depthWrite: false })
  );
  shield.visible = false;
  shield.userData.noShadow = true;
  root.add(shield);

  const nameTag = makeName(name, nameHex);
  root.add(nameTag);

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 14),
    new THREE.MeshBasicMaterial({ color: 0x2b2140, transparent: true, opacity: 0.28, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.userData.noShadow = true;
  scene.add(blob);

  root.traverse((obj) => {
    if (obj.isMesh && !obj.userData.noShadow) obj.castShadow = shadowsOn;
  });
  root.userData = { lean, wheels, fronts, flame, shield, bean, brakeL, brakeR, nameTag, blob };
  return root;
}

function buildKarts() {
  const specs = [
    { name: "나", me: true, color: 0xff4f93, hex: "#ff4f93", u: 1.15, skill: 1, cruise: 1, num: 1 },
    { name: "콩이", color: 0x2fcea0, hex: "#1aa87a", u: -1.2, skill: 0.97, cruise: 1.02, num: 2 },
    { name: "뭉치", color: 0xffc107, hex: "#e0a100", u: 3.2, skill: 0.84, cruise: 0.97, num: 3 },
    { name: "토실", color: 0xb388ff, hex: "#8d62e8", u: -3.25, skill: 0.93, cruise: 1.0, num: 4 },
  ];
  specs.forEach((spec, gridIndex) => {
    const mesh = makeKart(spec.color, spec.num, spec.name, spec.hex);
    scene.add(mesh);
    const kart = {
      ...spec,
      gridIndex,
      mesh,
      s: startS,
      odo: 0,
      wraps: 0,
      u0: spec.u,
      u: spec.u,
      uVel: 0,
      speed: 0,
      yLift: 0,
      vy: 0,
      air: false,
      steer: 0,
      drifting: false,
      charge: 0,
      boostT: 0,
      boostTier: 0,
      item: null,
      itemAge: 0,
      shield: false,
      spin: 0,
      ink: 0,
      magnet: 0,
      slowT: 0,
      cut: null,
      hazardCd: 0,
      finished: false,
      finishTime: 0,
      launchAt: -10,
      place: gridIndex + 1,
      lastPlace: gridIndex + 1,
      wheelRot: 0,
      slip: 0,
      itemCd: 0.5,
      phase: Math.random() * 6,
      brake: false,
      pos: new THREE.Vector3(),
      tan: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      half: 8,
      curv: 0,
    };
    karts.push(kart);
    if (spec.me) player = kart;
  });
}

function buildItems() {
  const qTex = canvasTex(128, 128, (g) => {
    g.fillStyle = "#ffe066";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#2b2140";
    g.font = "700 86px Jua, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("?", 64, 74);
  });
  const boxMat = new THREE.MeshStandardMaterial({
    map: qTex,
    roughness: 0.35,
    metalness: 0.18,
    emissive: 0xffb703,
    emissiveIntensity: 0.35,
  });
  const offsets = [-2.4, 1.6, 0, 2.6, -1.4, 0.8];
  for (let i = 0; i < 6; i++) {
    const group = new THREE.Group();
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 1.15), boxMat);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.06, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0xfffdf8 })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(cube, ring);
    scene.add(group);
    boxes.push({
      s: L * (0.12 + i * 0.13),
      u: offsets[i],
      alive: true,
      cool: 0,
      mesh: group,
      phase: i,
    });
  }
  if (launchS >= 0) {
    for (const b of boxes) {
      const d = Math.abs(angDist(b.s, launchS));
      if (d < 16) b.s = (b.s + 24) % L;
    }
  }

  const bananaMat = new THREE.MeshStandardMaterial({ color: 0xffe14a, roughness: 0.45, flatShading: true });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x6b4a22, roughness: 0.7 });
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const peel = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), bananaMat);
    peel.scale.set(1.1, 0.72, 0.85);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.18, 5), stemMat);
    stem.position.y = 0.28;
    g.add(peel, stem);
    g.visible = false;
    scene.add(g);
    bananas.push({ alive: false, s: 0, u: 0, owner: null, grace: 0, life: 0, mesh: g });
  }

  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff8fb8,
      emissive: 0xff4f93,
      emissiveIntensity: 0.45,
      roughness: 0.4,
      flatShading: true,
    });
    const bean = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), mat);
    bean.scale.set(0.85, 1.05, 0.85);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.4, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe066 })
    );
    flame.rotateX(-Math.PI / 2);
    flame.position.z = -0.35;
    g.add(bean, flame);
    g.visible = false;
    scene.add(g);
    missiles.push({ alive: false, s: 0, u: 0, owner: null, life: 0, speed: 0, kind: "bean", mesh: g, mat });
  }
  const slickMat = new THREE.MeshBasicMaterial({ color: 0x140e22, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1.7, 16), slickMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    slicks.push({ alive: false, s: 0, u: 0, owner: null, grace: 0, life: 0, mesh });
  }
}

const puffPos = new Float32Array(PUFF_MAX * 3);
const puffColor = new Float32Array(PUFF_MAX * 3);
const puffLife = new Float32Array(PUFF_MAX);
const puffVel = new Float32Array(PUFF_MAX * 3);
let puffCursor = 0;
const puffGeo = new THREE.BufferGeometry();
puffGeo.setAttribute("position", new THREE.BufferAttribute(puffPos, 3));
puffGeo.setAttribute("color", new THREE.BufferAttribute(puffColor, 3));
const puffMat = new THREE.PointsMaterial({
  size: 0.62,
  map: softTex(),
  transparent: true,
  depthWrite: false,
  vertexColors: true,
  sizeAttenuation: true,
  opacity: 0.88,
});
const puffPoints = new THREE.Points(puffGeo, puffMat);
puffPoints.frustumCulled = false;
scene.add(puffPoints);

function spawnPuff(x, y, z, hex, opt = {}) {
  const i = puffCursor % PUFF_MAX;
  puffCursor += 1;
  puffPos[i * 3] = x;
  puffPos[i * 3 + 1] = y;
  puffPos[i * 3 + 2] = z;
  _col.setHex(hex);
  puffColor[i * 3] = _col.r;
  puffColor[i * 3 + 1] = _col.g;
  puffColor[i * 3 + 2] = _col.b;
  puffLife[i] = opt.life ?? 0.45;
  puffVel[i * 3] = opt.vx ?? 0;
  puffVel[i * 3 + 1] = opt.vy ?? 0.8;
  puffVel[i * 3 + 2] = opt.vz ?? 0;
}

function updatePuffs(dt) {
  for (let i = 0; i < PUFF_MAX; i++) {
    if (puffLife[i] <= 0) {
      puffPos[i * 3 + 1] = -80;
      continue;
    }
    puffLife[i] -= dt;
    if (puffLife[i] <= 0) {
      puffPos[i * 3 + 1] = -80;
      continue;
    }
    puffPos[i * 3] += puffVel[i * 3] * dt;
    puffPos[i * 3 + 1] += puffVel[i * 3 + 1] * dt;
    puffPos[i * 3 + 2] += puffVel[i * 3 + 2] * dt;
    puffVel[i * 3 + 1] += dt * 0.35;
  }
  puffGeo.attributes.position.needsUpdate = true;
  puffGeo.attributes.color.needsUpdate = true;
}

const speedLines = [];
for (let i = 0; i < (MOBILE ? 8 : 14); i++) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1.8), mat);
  line.position.set((Math.random() - 0.5) * 6.5, (Math.random() - 0.5) * 3, -3 - Math.random() * 5);
  camera.add(line);
  speedLines.push(line);
}

const sfx = {
  enabled: true,
  ctx: null,
  master: null,
  engine: null,
  engineGain: null,
  noiseGain: null,
  boot() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.engine = this.ctx.createOscillator();
      this.engine.type = "sawtooth";
      this.engine.frequency.value = 70;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 520;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engine.connect(filter).connect(this.engineGain).connect(this.master);
      this.engine.start();
      const len = this.ctx.sampleRate * 0.4;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const band = this.ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 900;
      this.noiseGain = this.ctx.createGain();
      this.noiseGain.gain.value = 0;
      noise.connect(band).connect(this.noiseGain).connect(this.master);
      noise.start();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  tone(freq, dur = 0.12, type = "sine", vol = 0.06) {
    if (!this.enabled || !this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  },
  count(label) {
    this.tone(label === "GO" ? 680 : 460, 0.14, "square", 0.05);
  },
  boost() {
    this.tone(210, 0.18, "sawtooth", 0.045);
    this.tone(520, 0.22, "triangle", 0.04);
  },
  item() {
    this.tone(660, 0.08, "triangle", 0.05);
    this.tone(880, 0.12, "sine", 0.04);
  },
  hit() {
    this.tone(90, 0.2, "square", 0.06);
  },
  wall() {
    this.tone(140, 0.08, "square", 0.04);
  },
  finish() {
    this.tone(523, 0.12, "triangle", 0.05);
    setTimeout(() => this.tone(659, 0.12, "triangle", 0.05), 110);
    setTimeout(() => this.tone(784, 0.22, "triangle", 0.05), 220);
  },
  setDrive(speed, drift, boost) {
    if (!this.ctx || !this.engineGain) return;
    const now = this.ctx.currentTime;
    const freq = 62 + speed * 3.4 + (boost ? 36 : 0);
    this.engine.frequency.setTargetAtTime(freq, now, 0.08);
    const vol = state === "racing" || state === "countdown" ? 0.03 + Math.min(0.02, speed * 0.0008) : 0;
    this.engineGain.gain.setTargetAtTime(this.enabled ? vol : 0, now, 0.1);
    this.noiseGain.gain.setTargetAtTime(this.enabled && drift ? 0.045 : 0, now, 0.06);
    this.master.gain.setTargetAtTime(this.enabled ? 0.9 : 0, now, 0.05);
  },
};

function sampleInto(dist, out) {
  const n = frames.length;
  let x = dist % L;
  if (x < 0) x += L;
  const spacing = L / n;
  const f = x / spacing;
  const i = Math.floor(f) % n;
  const t = f - Math.floor(f);
  const A = frames[i];
  const B = frames[(i + 1) % n];
  out.pos.lerpVectors(A.pos, B.pos, t);
  out.tangent.lerpVectors(A.tangent, B.tangent, t).normalize();
  out.right.lerpVectors(A.right, B.right, t).normalize();
  out.up.lerpVectors(A.up, B.up, t).normalize();
  out.curvature = A.curvature * (1 - t) + B.curvature * t;
  out.half = A.half * (1 - t) + B.half * t;
  out.launch = !!A.launch;
  return out;
}

function angDist(a, b) {
  let d = a - b;
  d %= L;
  if (d > L / 2) d -= L;
  if (d < -L / 2) d += L;
  return d;
}

function passedLaunch(s0, s1) {
  for (const s of launches) {
    if (s1 >= s0) {
      if (s >= s0 && s < s1) return true;
    } else if (s >= s0 || s < s1) return true;
  }
  return false;
}

function copyFrame(src, kart) {
  kart.pos.copy(src.pos);
  kart.tan.copy(src.tangent);
  kart.right.copy(src.right);
  kart.up.copy(src.up);
  kart.half = src.half;
  kart.curv = src.curvature;
}

function tierFromCharge(c) {
  if (c >= 2.65) return 3;
  if (c >= 1.6) return 2;
  if (c >= 0.72) return 1;
  return 0;
}

function pipFills(c) {
  const gates = [0.72, 1.6, 2.65];
  return gates.map((g, i) => {
    const prev = i === 0 ? 0 : gates[i - 1];
    return Math.max(0, Math.min(1, (c - prev) / (g - prev)));
  });
}

function readInput() {
  if (state !== "racing") return { steer: 0, brake: false, drift: false };
  let steer = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) steer -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) steer += 1;
  if (Math.abs(stick.nx) > 0.12) steer = stick.nx;
  const brake = keys.has("ArrowDown") || keys.has("KeyS") || stick.ny > 0.55;
  const drift = stick.drift || keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("Space");
  return { steer: Math.max(-1, Math.min(1, steer)), brake, drift };
}

function aiInput(kart) {
  const look = 11 + kart.speed * 0.48;
  sampleInto(kart.s + look, lookFr);
  sampleInto(kart.s + Math.min(9, look * 0.38), nearFr);
  const farC = lookFr.curvature;
  const nearC = nearFr.curvature;
  const half = Math.max(2.4, lookFr.half);
  const apex = THREE.MathUtils.clamp(-farC * 78, -half + 1.15, half - 1.15);
  let target = apex;
  if (Math.abs(farC) > 0.02 && Math.abs(nearC) < 0.011) target = -apex * 0.62;
  let steer = (target - kart.u) * 1.05 - kart.uVel * 0.2;
  steer += (1 - kart.skill) * Math.sin(kart.s * 0.04 + kart.phase) * 0.16;
  if (Math.abs(kart.u) > kart.half - 1.35) steer += -Math.sign(kart.u) * 1.2;
  if (shortcut && !kart.cut) {
    const ahead = angDist(shortcut.enter, kart.s);
    const behindPlayer = player && player.odo > kart.odo + 10;
    const wants = kart.skill > 0.96 || (kart.skill > 0.9 && behindPlayer);
    if (wants && ahead > -6 && ahead < 42) steer = shortcut.side;
  }
  steer = THREE.MathUtils.clamp(steer, -1, 1);
  const corner = Math.abs(farC) > 0.016 || Math.abs(nearC) > 0.02;
  let drift = corner && kart.speed > CRUISE * 0.48 && Math.abs(steer) > 0.14;
  if (kart.drifting && kart.charge < 2.55 && Math.abs(nearC) > 0.01) drift = true;
  if (kart.drifting && kart.charge >= 1.5 && Math.abs(farC) < 0.011 && Math.abs(nearC) < 0.012) drift = false;
  return { steer, brake: false, drift };
}

function releaseDrift(kart) {
  const tier = tierFromCharge(kart.charge);
  if (tier > 0) {
    const dur = [0, 0.46, 0.84, 1.18][tier];
    kart.boostT = Math.min(1.65, kart.boostT + dur);
    kart.boostTier = Math.max(kart.boostTier, tier);
    if (kart.me && !silentSim) {
      sfx.boost();
      shake = Math.max(shake, 0.16 + tier * 0.08);
    }
  } else if (kart.charge > 0.12 && kart.me && !silentSim) {
    kart.speed *= 0.93;
  }
  kart.charge = 0;
}

function integrate(kart, dt, input) {
  if (kart.finished) return;
  if (kart.spin > 0) {
    kart.spin -= dt;
    input = { steer: input.steer * 0.12, drift: false, brake: false };
  }
  const holding = input.drift && kart.spin <= 0;
  if (kart.drifting && !holding) releaseDrift(kart);
  kart.drifting = holding;
  kart.steer = input.steer;
  kart.brake = input.brake;
  if (
    holding &&
    !kart.air &&
    kart.speed > CRUISE * 0.4 &&
    (Math.abs(input.steer) > 0.16 || Math.abs(kart.slip) > 0.34)
  ) {
    kart.charge = Math.min(3.4, kart.charge + dt * (0.84 + Math.abs(input.steer) * 0.8));
  }

  let cruiseMul = kart.me ? 1 : kart.cruise;
  if (!kart.me && player && !player.finished) {
    const gap = player.odo - kart.odo;
    if (gap > 10) cruiseMul *= 1 + Math.min(0.13, (gap - 10) * 0.0028);
    else if (gap < -32) cruiseMul *= 0.94;
  }
  if (kart.slowT > 0) {
    kart.slowT = Math.max(0, kart.slowT - dt);
    cruiseMul *= 0.56;
  }
  if (kart.ink > 0) kart.ink = Math.max(0, kart.ink - dt);
  if (kart.magnet > 0) {
    kart.magnet = Math.max(0, kart.magnet - dt);
    cruiseMul *= 1.08;
  }
  let target = CRUISE * cruiseMul;
  if (input.brake) target = CRUISE * 0.36;
  if (kart.spin > 0) target *= 0.4;
  if (kart.boostT > 0) {
    kart.boostT -= dt;
    target = CRUISE * (1.2 + 0.12 * Math.max(1, kart.boostTier));
    if (kart.boostT <= 0) {
      kart.boostT = 0;
      kart.boostTier = 0;
    }
  }
  const accel = kart.boostT > 0 ? 34 : 24;
  if (kart.speed < target) kart.speed = Math.min(target, kart.speed + accel * dt);
  else kart.speed = Math.max(target, kart.speed - 28 * dt);

  if (kart.cut) {
    driveCut(kart, dt);
    return;
  }

  const prevS = kart.s;
  const ds = kart.speed * dt;
  kart.s += ds;
  kart.odo += ds;
  while (kart.s >= L) {
    kart.s -= L;
    kart.wraps += 1;
    if (kart.wraps >= 2) {
      finishKart(kart);
      break;
    }
  }

  sampleInto(kart.s, fr);
  if (
    !kart.air &&
    passedLaunch(prevS, kart.s) &&
    raceTime - kart.launchAt > 2 &&
    kart.speed > CRUISE * 0.52
  ) {
    kart.air = true;
    kart.vy = kart.speed * 0.16 + 6.4;
    kart.launchAt = raceTime;
    if (kart.me && !silentSim) sfx.tone(520, 0.1, "triangle", 0.04);
  }
  if (kart.air) {
    kart.vy -= 27 * dt;
    kart.yLift += kart.vy * dt;
    if (kart.yLift <= 0) {
      kart.yLift = 0;
      kart.air = false;
      kart.vy = 0;
      if (kart.me && !silentSim) {
        shake = Math.max(shake, 0.36);
        sfx.tone(160, 0.09, "square", 0.04);
        spawnPuff(kart.pos.x, kart.pos.y + 0.2, kart.pos.z, 0xfffdf8, { life: 0.3, vy: 1.2, vx: 0, vz: 0 });
      }
    }
  }

  let steerCmd = input.steer;
  if (kart.magnet > 0) {
    const ahead = kartAhead(kart);
    if (ahead) steerCmd = THREE.MathUtils.clamp(steerCmd * 0.25 + THREE.MathUtils.clamp((ahead.u - kart.u) * 0.55, -1, 1), -1, 1);
  }
  if (kart.ink > 0) steerCmd *= 0.55;
  const grip = kart.ink > 0 ? 0.7 : 1;
  const steerRate =
    (kart.drifting ? 14.5 : 26) *
    (kart.air ? 0.5 : 1) *
    grip *
    (0.8 + 0.2 * Math.min(1, kart.speed / Math.max(1, CRUISE)));
  kart.uVel += steerCmd * steerRate * dt;
  const cent = kart.speed * fr.curvature * 18.5 * (kart.drifting ? 0.3 : 1) * (kart.ink > 0 ? 1.35 : 1);
  kart.uVel += cent * dt;
  kart.uVel *= Math.exp(-(kart.drifting ? 1.2 : 2.85) * dt);
  kart.u += kart.uVel * dt;
  kart.slip = THREE.MathUtils.clamp(kart.uVel / (kart.speed * 0.22 + 5), -1, 1);
  if (kart.magnet > 0) {
    const ahead = kartAhead(kart);
    if (ahead) {
      const gap = angDist(ahead.s, kart.s);
      if (gap > 3 && gap < 50) kart.speed = Math.min(CRUISE * 1.28, kart.speed + 18 * dt);
    }
  }

  copyFrame(fr, kart);
  const mouth = shortcut && angDist(kart.s, shortcut.enter) > -18 && angDist(kart.s, shortcut.enter) < 22;
  if (!mouth && Math.abs(kart.u) > kart.half - 1.65) kart.speed = Math.min(kart.speed, CRUISE * (kart.boostT > 0 ? 1.05 : 0.84));
  clampWall(kart);
}

function wallLimits(kart) {
  let lo = -(kart.half - 0.78);
  let hi = kart.half - 0.78;
  if (shortcut && !kart.cut) {
    const ds = angDist(kart.s, shortcut.enter);
    if (ds > -18 && ds < 22) {
      if (shortcut.side < 0) lo = -(kart.half + 9);
      else hi = kart.half + 9;
    }
  }
  return [lo, hi];
}

function maybeShortcut(kart) {
  if (!shortcut || kart.cut || kart.finished || kart.air) return;
  const ds = angDist(kart.s, shortcut.enter);
  if (ds < -6 || ds > 14) return;
  const inside = shortcut.side < 0 ? kart.u < -(kart.half + 0.35) : kart.u > kart.half + 0.35;
  if (inside) beginCut(kart);
}

function beginCut(kart) {
  if (!shortcut?.a || !shortcut?.b) return;
  let arc = shortcut.exit - kart.s;
  if (arc < 0) arc += L;
  if (arc < 10 || arc > 220) return;
  kart.cut = {
    t: 0,
    len: Math.max(14, shortcut.len),
    arc,
    oiled: false,
  };
  kart.u = 0;
  kart.uVel = 0;
  if (kart.me && !silentSim) showToast("지름길!");
}

function driveCut(kart, dt) {
  const step = kart.speed * dt;
  kart.cut.t += step;
  kart.odo += step;
  const u = Math.min(1, kart.cut.t / kart.cut.len);
  if (!kart.cut.oiled && u > 0.4 && u < 0.66) {
    kart.cut.oiled = true;
    kart.speed *= 0.8;
    if (kart.me) kart.ink = Math.max(kart.ink, 0.85);
    if (kart.me && !silentSim) showToast("미끄러!");
  }
  placeCut(kart, u);
  if (kart.cut.t < kart.cut.len) return;
  const bonus = Math.max(0, kart.cut.arc - kart.cut.len);
  kart.odo += bonus;
  kart.s = shortcut.exit;
  while (kart.s >= L) {
    kart.s -= L;
    kart.wraps += 1;
  }
  kart.u = shortcut.side * 1.4;
  kart.uVel = 0;
  kart.cut = null;
  sampleInto(kart.s, fr);
  copyFrame(fr, kart);
  if (kart.wraps >= 2) finishKart(kart);
}

function placeCut(kart, u) {
  kart.pos.lerpVectors(shortcut.a, shortcut.b, u);
  kart.tan.copy(shortcut.b).sub(shortcut.a);
  if (kart.tan.lengthSq() < 1e-8) kart.tan.set(1, 0, 0);
  kart.tan.normalize();
  kart.right.crossVectors(_yAxis, kart.tan);
  if (kart.right.lengthSq() < 1e-8) kart.right.set(1, 0, 0);
  kart.right.normalize();
  kart.up.crossVectors(kart.tan, kart.right).normalize();
  kart.half = 3.3;
  kart.curv = 0;
  kart.pos.y += 0.05;
}

function kartAhead(kart) {
  let best = null;
  let bestD = 1e9;
  for (const o of karts) {
    if (o === kart || o.finished) continue;
    const d = angDist(o.s, kart.s);
    if (d > 1.5 && d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function clampWall(kart) {
  maybeShortcut(kart);
  if (kart.cut) return;
  const [lo, hi] = wallLimits(kart);
  const limit = hi;
  if (kart.u > limit) {
    const hit = kart.uVel > 0.45;
    kart.u = limit;
    if (hit) {
      kart.uVel *= -0.22;
      kart.speed *= 0.9;
      if (kart.me && !silentSim) wallBump();
    } else if (kart.uVel > 0) kart.uVel = 0;
  } else if (kart.u < lo) {
    const hit = kart.uVel < -0.45;
    kart.u = lo;
    if (hit) {
      kart.uVel *= -0.22;
      kart.speed *= 0.9;
      if (kart.me && !silentSim) wallBump();
    } else if (kart.uVel < 0) kart.uVel = 0;
  }
}

let wallSnd = 0;
function wallBump() {
  shake = Math.max(shake, 0.24);
  if (wallSnd <= 0) {
    sfx.wall();
    wallSnd = 0.18;
  }
}

function finishKart(kart) {
  if (kart.finished) return;
  kart.finished = true;
  kart.finishTime = raceTime;
  kart.boostT = 0;
  kart.drifting = false;
  if (kart.me) onPlayerFinish();
}

function onPlayerFinish() {
  if (resultShown) return;
  resultShown = true;
  project();
  showResults();
}

function project() {
  silentSim = true;
  const saved = raceTime;
  let t = 0;
  while (t < 40 && karts.some((k) => !k.me && !k.finished)) {
    const dt = 1 / 30;
    raceTime = saved + t;
    for (const k of karts) {
      if (k.me || k.finished) continue;
      integrate(k, dt, aiInput(k));
      maybeAiItem(k, dt);
    }
    stepItems(dt);
    stepBumps(dt);
    stepHazards(dt);
    t += dt;
  }
  raceTime = saved;
  silentSim = false;
}

function stepItems(dt) {
  for (const box of boxes) {
    if (!box.alive) {
      box.cool -= dt;
      if (box.cool <= 0) box.alive = true;
      continue;
    }
    for (const k of karts) {
      if (k.finished || k.item) continue;
      if (Math.abs(angDist(k.s, box.s)) < 2.5 && Math.abs(k.u - box.u) < 1.75) {
        k.item = BAG[(Math.random() * BAG.length) | 0];
        k.itemAge = 0;
        k.itemCd = 0.35;
        box.alive = false;
        box.cool = 8;
        if (k.me && !silentSim) {
          sfx.item();
          showToast(ITEM_INFO[k.item].name);
        }
        break;
      }
    }
  }
  for (const b of bananas) {
    if (!b.alive) continue;
    b.grace -= dt;
    b.life -= dt;
    if (b.life <= 0) {
      b.alive = false;
      continue;
    }
    if (b.grace > 0) continue;
    for (const k of karts) {
      if (k === b.owner || k.finished || k.spin > 0) continue;
      if (Math.abs(angDist(k.s, b.s)) < 2.15 && Math.abs(k.u - b.u) < 1.25) {
        b.alive = false;
        hitKart(k);
        break;
      }
    }
  }
  for (const slick of slicks) {
    if (!slick.alive) continue;
    slick.grace -= dt;
    slick.life -= dt;
    if (slick.life <= 0) {
      slick.alive = false;
      continue;
    }
    if (slick.grace > 0) continue;
    for (const k of karts) {
      if (k === slick.owner || k.finished || k.cut) continue;
      if (Math.abs(angDist(k.s, slick.s)) < 2.4 && Math.abs(k.u - slick.u) < 1.7) {
        slick.alive = false;
        inkKart(k);
        break;
      }
    }
  }
  for (const m of missiles) {
    if (!m.alive) continue;
    let target = null;
    let best = 1e9;
    if (m.kind === "cannon") {
      for (const k of karts) {
        if (k === m.owner || k.finished) continue;
        if (!target || k.odo > target.odo) target = k;
      }
      if (target && angDist(target.s, m.s) < 0) target = null;
    } else {
      for (const k of karts) {
        if (k === m.owner || k.finished) continue;
        const d = angDist(k.s, m.s);
        if (d > 0.4 && d < best && d < 95) {
          best = d;
          target = k;
        }
      }
    }
    const home = m.kind === "cannon" ? 6.5 : 3.4;
    if (target) m.u += (target.u - m.u) * Math.min(1, dt * home);
    m.s += m.speed * dt;
    if (m.s >= L) m.s -= L;
    m.life -= dt;
    for (const k of karts) {
      if (!m.alive || k === m.owner || k.finished) continue;
      if (Math.abs(angDist(k.s, m.s)) < 2 && Math.abs(k.u - m.u) < 1.25) {
        m.alive = false;
        hitKart(k);
        break;
      }
    }
    if (m.life <= 0) m.alive = false;
  }
}

function stepHazards(dt) {
  for (const k of karts) {
    if (k.hazardCd > 0) k.hazardCd = Math.max(0, k.hazardCd - dt);
  }
  for (const h of hazards) {
    for (const k of karts) {
      if (k.finished || k.cut || k.hazardCd > 0) continue;
      if (Math.abs(angDist(k.s, h.s)) < h.r + 0.4 && Math.abs(k.u - h.u) < h.r) {
        k.hazardCd = 0.7;
        if (h.kind === "oil") {
          k.speed *= 0.8;
          k.uVel += (Math.random() - 0.5) * 8;
          if (k.me) k.ink = Math.max(k.ink, 0.7);
        } else {
          k.speed *= 0.86;
          k.uVel *= 0.45;
        }
      }
    }
  }
}

function stepBumps(dt) {
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i];
      const b = karts[j];
      if (a.finished && b.finished) continue;
      const ds = angDist(a.s, b.s);
      const du = a.u - b.u;
      if (Math.abs(ds) < 2.35 && Math.abs(du) < 1.38) {
        const push = (1.38 - Math.abs(du)) * 8 * dt;
        const su = Math.sign(du || (a.gridIndex < b.gridIndex ? 1 : -1));
        a.u += su * push;
        b.u -= su * push;
        if (a.speed >= b.speed) b.speed *= 0.985;
        else a.speed *= 0.985;
      }
    }
  }
  for (const k of karts) clampWall(k);
}

function hitKart(kart) {
  if (kart.finished) return;
  if (kart.shield) {
    kart.shield = false;
    if (kart.me && !silentSim) {
      sfx.tone(740, 0.1, "sine", 0.05);
      showToast("막았다!");
    }
    return;
  }
  kart.spin = 0.85;
  kart.speed *= 0.42;
  kart.drifting = false;
  kart.charge = 0;
  kart.boostT = 0;
  if (!silentSim && kart.me) {
    shake = Math.max(shake, 0.55);
    flashEl.classList.add("on");
    setTimeout(() => flashEl.classList.remove("on"), 90);
    sfx.hit();
    showToast("피격!");
    burst(kart, 0xff8fb8);
  } else if (!silentSim) {
    burst(kart, 0xffe066);
  }
}

function burst(kart, hex) {
  const n = MOBILE ? 6 : 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    spawnPuff(kart.pos.x, kart.pos.y + 0.6, kart.pos.z, hex, {
      life: 0.4,
      vx: Math.cos(a) * 3,
      vy: 1.5,
      vz: Math.sin(a) * 3,
    });
  }
}

function maybeAiItem(kart, dt) {
  if (kart.me || kart.finished || !kart.item) return;
  kart.itemAge += dt;
  kart.itemCd -= dt;
  if (kart.itemCd > 0) return;
  const it = kart.item;
  const ahead = (min, max) =>
    karts.some((o) => {
      if (o === kart || o.finished) return false;
      const d = angDist(o.s, kart.s);
      return d > min && d < max;
    });
  const behind = karts.some((o) => {
    if (o === kart || o.finished) return false;
    const d = angDist(kart.s, o.s);
    return d > 2 && d < 34;
  });
  const leading = !karts.some((o) => o !== kart && !o.finished && o.odo > kart.odo + 1);
  let use = false;
  if (it === "shield") use = true;
  else if (it === "missile") use = ahead(3, 80);
  else if (it === "cannon") use = !leading;
  else if (it === "banana" || it === "ink") use = behind;
  else if (it === "magnet") use = ahead(5, 42);
  else if (it === "lightning") use = !leading && ahead(6, 160);
  else if (it === "boost" || it === "triple") use = kart.speed < CRUISE * 0.97 || Math.abs(kart.curv) < 0.009 || (player && player.odo > kart.odo + 8);
  if (!use && kart.itemAge > 4.2) use = true;
  if (use) {
    useItem(kart);
    kart.itemCd = 0.7;
  }
}

function useItem(kart) {
  if (!kart?.item || kart.finished || (state !== "racing" && !silentSim)) return;
  const it = kart.item;
  kart.item = null;
  kart.itemAge = 0;
  if (it === "boost") {
    kart.boostTier = Math.max(kart.boostTier, 2);
    kart.boostT = Math.min(1.65, kart.boostT + 0.9);
    if (kart.me && !silentSim) sfx.boost();
  } else if (it === "triple") {
    kart.boostTier = 3;
    kart.boostT = Math.min(2.2, kart.boostT + 1.45);
    if (kart.me && !silentSim) sfx.boost();
  } else if (it === "shield") {
    kart.shield = true;
    if (kart.me && !silentSim) sfx.tone(520, 0.12, "sine", 0.05);
  } else if (it === "banana") dropBanana(kart);
  else if (it === "ink") dropSlick(kart);
  else if (it === "missile") fireMissile(kart, "bean");
  else if (it === "cannon") fireMissile(kart, "cannon");
  else if (it === "magnet") {
    kart.magnet = Math.max(kart.magnet, 2.35);
    if (kart.me && !silentSim) sfx.tone(440, 0.12, "sine", 0.05);
  } else if (it === "lightning") zapAhead(kart);
  if (kart.me && !silentSim) showToast(ITEM_INFO[it].name);
}

function dropBanana(kart) {
  const b = bananas.find((x) => !x.alive);
  if (!b) return;
  b.alive = true;
  b.s = kart.s - 6;
  if (b.s < 0) b.s += L;
  b.u = kart.u;
  b.owner = kart;
  b.grace = 0.7;
  b.life = 13;
}

function dropSlick(kart) {
  const b = slicks.find((x) => !x.alive);
  if (!b) return;
  b.alive = true;
  b.s = kart.s - 5.5;
  if (b.s < 0) b.s += L;
  b.u = kart.u;
  b.owner = kart;
  b.grace = 0.45;
  b.life = 12;
}

function fireMissile(kart, kind) {
  const m = missiles.find((x) => !x.alive);
  if (!m) return;
  m.alive = true;
  m.kind = kind;
  m.s = kart.s + 2.4;
  if (m.s >= L) m.s -= L;
  m.u = kart.u;
  m.owner = kart;
  m.life = kind === "cannon" ? 2.5 : 3.3;
  m.speed = CRUISE * (kind === "cannon" ? 2.25 : 1.78);
  if (m.mat) {
    if (kind === "cannon") {
      m.mat.color.setHex(0xffe066);
      m.mat.emissive.setHex(0xff7a1a);
    } else {
      m.mat.color.setHex(0xff8fb8);
      m.mat.emissive.setHex(0xff4f93);
    }
  }
  if (kart.me && !silentSim) sfx.tone(kind === "cannon" ? 180 : 300, 0.12, "sawtooth", 0.04);
}

function inkKart(kart) {
  if (kart.finished) return;
  if (kart.shield) {
    kart.shield = false;
    if (kart.me && !silentSim) showToast("막았다!");
    return;
  }
  kart.ink = Math.max(kart.ink, kart.me ? 2.7 : 2.1);
  kart.speed *= 0.78;
  kart.uVel += (Math.random() - 0.5) * 7;
  if (!silentSim && kart.me) {
    shake = Math.max(shake, 0.2);
    showToast("먹물!");
    sfx.tone(90, 0.16, "square", 0.04);
  }
}

function zapAhead(kart) {
  let hit = 0;
  for (const o of karts) {
    if (o === kart || o.finished) continue;
    if (o.odo <= kart.odo + 0.5) continue;
    hit += 1;
    if (o.shield) {
      o.shield = false;
      if (o.me && !silentSim) showToast("막았다!");
      continue;
    }
    o.slowT = Math.max(o.slowT, 2.15);
    o.speed = Math.min(o.speed, CRUISE * 0.62);
    o.boostT = 0;
    if (!silentSim) {
      burst(o, 0xffe066);
      if (o.me) {
        shake = Math.max(shake, 0.45);
        showToast("번개!");
        sfx.tone(880, 0.08, "square", 0.05);
        flashEl.classList.add("zap");
        setTimeout(() => flashEl.classList.remove("zap"), 160);
      }
    }
  }
  if (hit === 0 && kart.me && !silentSim) showToast("앞에 없어!");
}

function standings() {
  return [...karts].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.odo - a.odo || a.gridIndex - b.gridIndex;
  });
}

function stepRace(dt) {
  if (state !== "racing") return;
  wallSnd = Math.max(0, wallSnd - dt);
  for (const k of karts) {
    if (state !== "racing") break;
    const input = k.me ? readInput() : aiInput(k);
    integrate(k, dt, input);
    maybeAiItem(k, dt);
  }
  if (state !== "racing") return;
  stepItems(dt);
  stepBumps(dt);
  stepHazards(dt);
}

function poseKart(kart, dt, time) {
  const idle = kart.speed < 2 && !kart.air ? Math.sin(time * 2.4 + kart.phase) * 0.035 : 0;
  _pos.copy(kart.pos).addScaledVector(kart.right, kart.u).addScaledVector(kart.up, kart.yLift + 0.04 + idle);
  kart.mesh.position.copy(_pos);
  _right.copy(kart.right);
  _up.copy(kart.up);
  _tan.copy(kart.tan);
  if (_tan.lengthSq() < 1e-6) _tan.set(0, 0, 1);
  _right.crossVectors(_up, _tan).normalize();
  _up.crossVectors(_tan, _right).normalize();
  _basis.makeBasis(_right, _up, _tan);
  _quat.setFromRotationMatrix(_basis);
  const spinYaw = kart.spin > 0 ? (0.85 - Math.max(0, kart.spin)) * 12 : 0;
  const nose = kart.steer * (kart.drifting ? 0.78 : 0.46);
  _yaw.setFromAxisAngle(_yAxis, nose + spinYaw);
  kart.mesh.quaternion.copy(_quat).multiply(_yaw);

  const ud = kart.mesh.userData;
  const leanZ = -kart.steer * 0.34 - kart.slip * 0.38;
  ud.lean.rotation.z = THREE.MathUtils.damp(ud.lean.rotation.z, leanZ, 14, dt || 0.016);
  ud.lean.rotation.x = THREE.MathUtils.damp(ud.lean.rotation.x, kart.air ? -0.22 : kart.brake ? 0.06 : 0.02, 6, dt || 0.016);
  kart.wheelRot += kart.speed * (dt || 0) / 0.28;
  for (const w of ud.wheels) w.rotation.x = kart.wheelRot;
  for (const f of ud.fronts) f.rotation.y = kart.steer * 0.72;
  ud.bean.position.y = 0.82 + Math.sin(time * 9 + kart.phase) * 0.025 * Math.min(1, kart.speed / 8);
  ud.flame.visible = kart.boostT > 0;
  if (kart.boostT > 0) {
    const flick = 0.75 + Math.random() * 0.55;
    ud.flame.scale.set(flick, flick, 0.8 + Math.random() * 0.7);
  }
  ud.shield.visible = kart.shield;
  const brakeI = kart.brake ? 1.3 : 0.12;
  ud.brakeL.material.emissiveIntensity = brakeI;
  ud.brakeR.material.emissiveIntensity = brakeI;

  ud.blob.position.copy(kart.pos).addScaledVector(kart.right, kart.u);
  ud.blob.position.y = kart.pos.y + 0.08;
  ud.blob.material.opacity = 0.3 * Math.max(0, 1 - kart.yLift / 3.5);
  const sc = 1 + kart.yLift * 0.12;
  ud.blob.scale.set(sc, sc, sc);

  if (!silentSim && kart.drifting && kart.speed > 6 && state === "racing") {
    const every = kart.me ? 1 : MOBILE ? 4 : 2;
    if ((kart.gridIndex + Math.floor(time * 20)) % every === 0) {
      const tier = tierFromCharge(kart.charge);
      kart.mesh.updateMatrixWorld(true);
      ud.wheels[2].getWorldPosition(_v);
      spawnPuff(_v.x, _v.y, _v.z, TIER_COLOR[tier], {
        life: 0.38,
        vx: -kart.tan.x * 2 + (Math.random() - 0.5),
        vy: 0.7,
        vz: -kart.tan.z * 2 + (Math.random() - 0.5),
      });
    }
  }
  if (!silentSim && kart.me && kart.boostT > 0 && Math.random() < 0.55) {
    kart.mesh.updateMatrixWorld(true);
    ud.flame.getWorldPosition(_v);
    spawnPuff(_v.x, _v.y, _v.z, Math.random() > 0.4 ? 0xfff1a8 : 0xff8a3d, {
      life: 0.22,
      vx: -kart.tan.x * 6,
      vy: 0.4,
      vz: -kart.tan.z * 6,
    });
  }
}

function updateCamera(dt) {
  const kart = player;
  const fwd = kart.tan;
  const up = kart.up;
  _desired
    .copy(kart.mesh.position)
    .addScaledVector(fwd, -6.85)
    .addScaledVector(up, 2.72 + kart.yLift * 0.18)
    .addScaledVector(kart.right, 0.72 - kart.steer * 0.55);
  if (shake > 0) {
    _desired.x += (Math.random() - 0.5) * shake;
    _desired.y += (Math.random() - 0.5) * shake * 0.65;
    shake *= Math.exp(-3.2 * dt);
    if (shake < 0.012) shake = 0;
  }
  if (camSnap > 0) {
    camera.position.copy(_desired);
    camSnap -= 1;
  } else {
    camera.position.lerp(_desired, 1 - Math.exp(-3.6 * dt));
  }
  _look.copy(kart.mesh.position).addScaledVector(fwd, 8.4).addScaledVector(up, 1.2);
  const roll = -kart.steer * 0.05 - THREE.MathUtils.clamp(kart.uVel, -8, 8) * 0.0045;
  _camUp.copy(up).applyAxisAngle(fwd, roll);
  camera.up.lerp(_camUp, 1 - Math.exp(-7 * dt)).normalize();
  camera.lookAt(_look);
  const fov = 70 + Math.min(6, kart.speed * 0.16) + (kart.boostT > 0 ? 12 : 0);
  if (Math.abs(camera.fov - fov) > 0.15) {
    camera.fov += (fov - camera.fov) * 0.35;
    camera.updateProjectionMatrix();
  }
  const showLines = state === "racing" && (kart.boostT > 0 || kart.speed > CRUISE * 1.22);
  for (const line of speedLines) {
    if (showLines) line.position.z += dt * (10 + kart.speed * 0.55);
    if (line.position.z > -1.1) {
      line.position.z = -7 - Math.random() * 3;
      line.position.x = (Math.random() - 0.5) * 7;
      line.position.y = (Math.random() - 0.5) * 3.1;
    }
    line.material.opacity = showLines ? (kart.boostT > 0 ? 0.45 : 0.18) : 0;
  }
  if (shadowsOn) {
    sun.position.set(kart.mesh.position.x + 26, kart.mesh.position.y + 42, kart.mesh.position.z + 16);
    sun.target.position.copy(kart.mesh.position);
    sun.target.updateMatrixWorld();
  }
}

function updateWorld(dt, time) {
  for (const box of boxes) {
    box.mesh.visible = box.alive;
    if (!box.alive) continue;
    sampleInto(box.s, fr);
    box.mesh.position.copy(fr.pos).addScaledVector(fr.right, box.u).addScaledVector(fr.up, 1.15 + Math.sin(time * 2.2 + box.phase) * 0.18);
    box.mesh.rotation.y += dt * 1.6;
    box.mesh.rotation.x = Math.sin(time * 1.4 + box.phase) * 0.15;
  }
  for (const b of bananas) {
    b.mesh.visible = b.alive;
    if (!b.alive) continue;
    sampleInto(b.s, fr);
    b.mesh.position.copy(fr.pos).addScaledVector(fr.right, b.u).addScaledVector(fr.up, 0.32);
    b.mesh.rotation.y += dt * 2;
  }
  for (const slick of slicks) {
    slick.mesh.visible = slick.alive;
    if (!slick.alive) continue;
    sampleInto(slick.s, fr);
    slick.mesh.position.copy(fr.pos).addScaledVector(fr.right, slick.u).addScaledVector(fr.up, 0.1);
  }
  for (const m of missiles) {
    m.mesh.visible = m.alive;
    if (!m.alive) continue;
    sampleInto(m.s, fr);
    m.mesh.position.copy(fr.pos).addScaledVector(fr.right, m.u).addScaledVector(fr.up, m.kind === "cannon" ? 0.95 : 0.7);
    m.mesh.scale.setScalar(m.kind === "cannon" ? 1.35 : 1);
    _basis.makeBasis(fr.right, fr.up, fr.tangent);
    m.mesh.quaternion.setFromRotationMatrix(_basis);
  }
  if (state === "racing") {
    for (const k of karts) {
      if (k.magnet <= 0 || k.finished) continue;
      const ahead = kartAhead(k);
      if (!ahead || (k.gridIndex + Math.floor(time * 12)) % (k.me ? 1 : 3) !== 0) continue;
      spawnPuff(
        (k.pos.x + ahead.pos.x) * 0.5,
        (k.pos.y + ahead.pos.y) * 0.5 + 0.8,
        (k.pos.z + ahead.pos.z) * 0.5,
        0x8ec5ff,
        { life: 0.25, vx: 0, vy: 0.4, vz: 0 }
      );
    }
  }
  for (const flag of flags) {
    flag.userData.cloth.rotation.y = Math.sin(time * 3.2 + flag.userData.phase) * 0.45;
  }
  for (const cloud of clouds) {
    if (!cloud.userData.base) continue;
    cloud.position.x = cloud.userData.base.x + Math.sin(time * 0.15 + cloud.userData.phase) * 6;
  }
  for (const bunch of clouds) {
    if (bunch.userData.baseY == null) continue;
    bunch.position.y = bunch.userData.baseY + Math.sin(time * 1.4 + bunch.userData.phase) * 0.25;
  }
  if (state === "countdown") {
    const label = countNum.textContent;
    const n = label === "GO" ? 3 : label === "1" ? 3 : label === "2" ? 2 : label === "3" ? 1 : 0;
    archLights.forEach((lamp, i) => {
      const on = i < n;
      lamp.material.emissiveIntensity = on ? 1.5 : 0.12;
      lamp.material.color.setHex(on ? 0xffe066 : 0x6a5a78);
    });
  }
}

function formatTime(t) {
  const cs = Math.floor(Math.max(0, t) * 100) % 100;
  const s = Math.floor(Math.max(0, t)) % 60;
  const m = Math.floor(Math.max(0, t) / 60);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function paintBest() {
  const n = Number(storageGet());
  if (Number.isFinite(n) && n > 0) {
    bestLineEl.textContent = `최고 기록 ${formatTime(n)}`;
    hudBestEl.textContent = `최고 ${formatTime(n)}`;
  } else {
    bestLineEl.textContent = "아직 최고 기록이 없어요";
    hudBestEl.textContent = "최고 --";
  }
}

function saveBest(t) {
  const prev = Number(storageGet());
  const rounded = Math.round(t * 100) / 100;
  if (!Number.isFinite(prev) || rounded < prev) {
    storageSet(rounded.toFixed(2));
    paintBest();
    return true;
  }
  return false;
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove("hidden");
  toastEl.style.animation = "none";
  void toastEl.offsetWidth;
  toastEl.style.animation = "";
  toastTimer = 1.15;
}

function updateHud(dt) {
  const rows = standings();
  const place = Math.max(1, rows.findIndex((k) => k.me) + 1);
  rankEl.textContent = String(place);
  timeEl.textContent = formatTime(raceTime);
  const pct = player.finished ? 1 : Math.max(0, Math.min(1, player.odo / raceLen));
  progressEl.style.width = `${(pct * 100).toFixed(1)}%`;
  speedEl.textContent = String(Math.max(0, Math.round(player.speed * 3.6)));
  const fills = pipFills(player.charge);
  pips.forEach((el, i) => {
    el.style.setProperty("--fill", player.boostT > 0 ? "1" : String(fills[i]));
  });
  boostMeter.classList.toggle("firing", player.boostT > 0);
  if (player.item) {
    itemSlot.classList.add("ready");
    itemSlot.classList.remove("empty");
    itemIcon.textContent = ITEM_INFO[player.item].icon;
    itemName.textContent = ITEM_INFO[player.item].name;
    itemBtn?.classList.add("ready");
  } else {
    itemSlot.classList.add("empty");
    itemSlot.classList.remove("ready");
    itemIcon.textContent = "·";
    itemName.textContent = "없음";
    itemBtn?.classList.remove("ready");
  }
  if (state === "racing" && raceTime > 1.15 && place < player.lastPlace) {
    showToast(place === 1 ? "1위!" : "추월!");
  }
  player.lastPlace = place;
  player.place = place;
  inkEl?.classList.toggle("on", player.ink > 0.08);
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) toastEl.classList.add("hidden");
  }
  drawMinimap();
}

let mapReady = false;
let mapMinX = 0;
let mapMaxX = 1;
let mapMinZ = 0;
let mapMaxZ = 1;
const mapLine = [];
function buildMinimap() {
  mapMinX = Infinity;
  mapMaxX = -Infinity;
  mapMinZ = Infinity;
  mapMaxZ = -Infinity;
  for (const f of frames) {
    mapMinX = Math.min(mapMinX, f.pos.x);
    mapMaxX = Math.max(mapMaxX, f.pos.x);
    mapMinZ = Math.min(mapMinZ, f.pos.z);
    mapMaxZ = Math.max(mapMaxZ, f.pos.z);
  }
  const padX = (mapMaxX - mapMinX) * 0.08;
  const padZ = (mapMaxZ - mapMinZ) * 0.08;
  mapMinX -= padX;
  mapMaxX += padX;
  mapMinZ -= padZ;
  mapMaxZ += padZ;
  mapLine.length = 0;
  for (let i = 0; i < frames.length; i += 2) mapLine.push(frames[i].pos);
  mapReady = true;
}

function mapPoint(x, z, w, h) {
  const u = (x - mapMinX) / (mapMaxX - mapMinX);
  const v = (z - mapMinZ) / (mapMaxZ - mapMinZ);
  return [u * w, (1 - v) * h];
}

function drawMinimap() {
  if (!mapReady) return;
  const w = minimapEl.width;
  const h = minimapEl.height;
  mapCtx.clearRect(0, 0, w, h);
  mapCtx.beginPath();
  mapLine.forEach((p, i) => {
    const [x, y] = mapPoint(p.x, p.z, w, h);
    if (i === 0) mapCtx.moveTo(x, y);
    else mapCtx.lineTo(x, y);
  });
  mapCtx.closePath();
  mapCtx.strokeStyle = "#2b2140";
  mapCtx.lineWidth = 6;
  mapCtx.stroke();
  mapCtx.strokeStyle = "#ff8fb8";
  mapCtx.lineWidth = 2;
  mapCtx.stroke();
  for (const k of karts) {
    const [x, y] = mapPoint(k.pos.x + k.right.x * k.u, k.pos.z + k.right.z * k.u, w, h);
    mapCtx.beginPath();
    mapCtx.fillStyle = k.hex;
    mapCtx.arc(x, y, k.me ? 5.5 : 3.6, 0, Math.PI * 2);
    mapCtx.fill();
    if (k.me) {
      mapCtx.strokeStyle = "#fffdf8";
      mapCtx.lineWidth = 2;
      mapCtx.stroke();
    }
  }
}

function showResults() {
  state = "result";
  const rows = standings();
  const place = Math.max(1, rows.findIndex((k) => k.me) + 1);
  const titles = ["", "1등 골인!", "2등 골인!", "3등 골인!", "아쉽지만 골인"];
  document.getElementById("result-title").textContent = titles[place] || "골인!";
  const t = player.finishTime;
  const record = saveBest(t);
  document.getElementById("result-sub").textContent = record
    ? `기록 ${formatTime(t)} · 신기록!`
    : `기록 ${formatTime(t)}`;
  boardEl.innerHTML = rows
    .map(
      (k, i) =>
        `<li class="${k.me ? "me" : ""}"><span class="place">${i + 1}</span><span>${k.name}</span><span>${
          k.finished ? formatTime(k.finishTime) : "주행 중"
        }</span></li>`
    )
    .join("");
  resultEl.classList.remove("hidden");
  sfx.finish();
  updateHud(0.016);
}

function placeAll() {
  for (const k of karts) {
    sampleInto(k.s, fr);
    copyFrame(fr, k);
    poseKart(k, 0.016, 0);
  }
  updateCamera(0.016);
}

function resetRace() {
  raceTime = 0;
  resultShown = false;
  silentSim = false;
  shake = 0;
  toastTimer = 0;
  toastEl.classList.add("hidden");
  flashEl.classList.remove("on");
  for (const k of karts) {
    k.s = startS;
    k.odo = 0;
    k.wraps = 0;
    k.u = k.u0;
    k.uVel = 0;
    k.speed = 0;
    k.yLift = 0;
    k.vy = 0;
    k.air = false;
    k.steer = 0;
    k.drifting = false;
    k.charge = 0;
    k.boostT = 0;
    k.boostTier = 0;
    k.item = null;
    k.itemAge = 0;
    k.shield = false;
    k.spin = 0;
    k.ink = 0;
    k.magnet = 0;
    k.slowT = 0;
    k.cut = null;
    k.hazardCd = 0;
    k.finished = false;
    k.finishTime = 0;
    k.launchAt = -10;
    k.place = k.gridIndex + 1;
    k.lastPlace = k.gridIndex + 1;
    k.wheelRot = 0;
    k.slip = 0;
    k.itemCd = 0.45 + k.gridIndex * 0.1;
    k.brake = false;
  }
  for (const b of boxes) {
    b.alive = true;
    b.cool = 0;
  }
  for (const b of bananas) b.alive = false;
  for (const m of missiles) m.alive = false;
  for (const s of slicks) s.alive = false;
  inkEl?.classList.remove("on");
  flashEl.classList.remove("zap");
  camSnap = 3;
  placeAll();
}

function beginCountdown() {
  const token = ++countToken;
  resetRace();
  startEl.classList.add("hidden");
  resultEl.classList.add("hidden");
  hud.classList.remove("hidden");
  minimapEl.classList.remove("hidden");
  const touch = document.getElementById("touch-ui");
  touch?.classList.remove("hidden");
  touch?.setAttribute("aria-hidden", "false");
  state = "countdown";
  countEl.classList.remove("hidden");
  const seq = ["3", "2", "1", "GO"];
  let i = 0;
  const step = () => {
    if (token !== countToken) return;
    countNum.textContent = seq[i];
    sfx.count(seq[i]);
    i += 1;
    if (i < seq.length) setTimeout(step, 680);
    else {
      setTimeout(() => {
        if (token !== countToken) return;
        countEl.classList.add("hidden");
        if (state === "countdown") {
          state = "racing";
          raceTime = 0;
          const rows = standings();
          for (const k of karts) k.lastPlace = rows.indexOf(k) + 1;
        }
      }, 460);
    }
  };
  step();
}

function resize() {
  const w = window.innerWidth;
  const h = Math.max(1, window.innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
}

function maybeDropQuality(rawDt) {
  if (qualityDropped || liteScene || state !== "racing") return;
  watchedFrames += 1;
  if (rawDt > 0.042) slowFrames += 1;
  if (watchedFrames >= 40 && slowFrames > 16) {
    qualityDropped = true;
    pixelRatio = 1;
    shadowsOn = false;
    renderer.shadowMap.enabled = false;
    sun.castShadow = false;
    renderer.setPixelRatio(1);
    resize();
  }
}

function frame() {
  const rawDt = clock.getDelta() || 0.016;
  const dt = Math.min(0.05, rawDt);
  const time = clock.elapsedTime;
  if (state === "racing") {
    raceTime += dt;
    stepRace(dt);
    maybeDropQuality(rawDt);
  }
  for (const k of karts) poseKart(k, dt, time);
  updateWorld(dt, time);
  updatePuffs(dt);
  updateCamera(dt);
  if (state === "racing" || state === "countdown") updateHud(dt);
  sfx.setDrive(player.speed, player.drifting, player.boostT > 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function bindStick(root) {
  if (!root) return;
  const knob = root.querySelector(".stick-knob");
  const max = 42;
  let pid = null;
  const end = () => {
    pid = null;
    stick.nx = 0;
    stick.ny = 0;
    if (knob) knob.style.transform = "translate(-50%, -50%)";
  };
  const setFrom = (cx, cy) => {
    const r = root.getBoundingClientRect();
    const dx = cx - (r.left + r.width / 2);
    const dy = cy - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, len / max);
    stick.nx = (dx / len) * k;
    stick.ny = (dy / len) * k;
    if (knob) {
      knob.style.transform = `translate(calc(-50% + ${stick.nx * max}px), calc(-50% + ${stick.ny * max}px))`;
    }
  };
  root.addEventListener("pointerdown", (e) => {
    pid = e.pointerId;
    root.setPointerCapture(e.pointerId);
    setFrom(e.clientX, e.clientY);
    e.preventDefault();
  });
  root.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pid) return;
    setFrom(e.clientX, e.clientY);
  });
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", end);
}

function bindHold(el, onDown, onUp) {
  if (!el) return;
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onDown();
  });
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("lostpointercapture", onUp);
}

window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if ((e.code === "KeyF" || e.code === "KeyE") && state === "racing") useItem(player);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  stick.drift = false;
  stick.nx = 0;
  stick.ny = 0;
});
window.addEventListener("resize", resize);

bindStick(document.getElementById("stick"));
bindHold(
  document.getElementById("btn-drift"),
  () => {
    stick.drift = true;
  },
  () => {
    stick.drift = false;
  }
);
itemBtn?.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (state === "racing") useItem(player);
});

document.getElementById("game-root").addEventListener(
  "touchmove",
  (e) => {
    if (state === "racing" || state === "countdown") e.preventDefault();
  },
  { passive: false }
);

document.getElementById("btn-start").addEventListener("click", () => {
  sfx.boot();
  beginCountdown();
});
document.getElementById("btn-retry").addEventListener("click", () => {
  sfx.boot();
  beginCountdown();
});
muteBtn.addEventListener("click", () => {
  sfx.enabled = !sfx.enabled;
  muteBtn.textContent = sfx.enabled ? "🔊" : "🔇";
  muteBtn.setAttribute("aria-label", sfx.enabled ? "소리 끄기" : "소리 켜기");
  if (sfx.enabled) sfx.boot();
});

buildTrack();
buildRoad();
buildBarriers();
buildScenery();
buildCourseFeatures();
buildKarts();
buildItems();
buildMinimap();
paintBest();
resize();
placeAll();

window.__kongTrider = {
  get state() {
    return state;
  },
  get time() {
    return raceTime;
  },
  get trackLength() {
    return L;
  },
  get raceLength() {
    return raceLen;
  },
  get cruise() {
    return CRUISE;
  },
  get maxCurvature() {
    return maxAbsCurv;
  },
  get jumps() {
    return launches.length;
  },
  snapshot() {
    return karts.map((k) => ({
      name: k.name,
      me: k.me,
      s: k.s,
      u: k.u,
      odo: k.odo,
      speed: k.speed,
      finished: k.finished,
      finishTime: k.finishTime,
      item: k.item,
      boost: k.boostT,
      air: k.air,
      ink: k.ink,
      magnet: k.magnet,
      slow: k.slowT,
      shield: k.shield,
      charge: k.charge,
      steer: k.steer,
      drifting: k.drifting,
      half: k.half,
      uVel: k.uVel,
      place: k.place,
      wraps: k.wraps,
      curv: k.curv,
    }));
  },
};

document.fonts?.ready?.then(() => {
  for (const k of karts) {
    const tag = k.mesh.userData.nameTag;
    const fresh = makeName(k.name, k.hex);
    tag.material.map = fresh.material.map;
    tag.material.needsUpdate = true;
  }
});

requestAnimationFrame(frame);
