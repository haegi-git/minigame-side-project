import * as THREE from "three";

const FINISH_Z = 418;
const RUN_SPEED = 9.05;
const AIR_SPEED = 7.2;
const SLIDE_SPEED = 14.2;
const ACCEL = 42;
const AIR_ACCEL = 18;
const FRICTION = 9.5;
const GRAVITY = -36;
const JUMP_V = 13.2;
const SLIDE_DUR = 0.48;
const AI_SLIDE_COOLDOWN = 2.5;
const RADIUS = 0.46;
const DIFFICULTIES = {
  easy: { cd: 1, label: "1초", name: "이지" },
  normal: { cd: 1.75, label: "1.75초", name: "노말" },
  hard: { cd: 2.5, label: "2.5초", name: "하드" },
};
const DIFF_KEY = "bean-run-diff";

let slideCooldown = DIFFICULTIES.normal.cd;
let difficultyId = "normal";

const NAMES = ["나", "콩이", "뭉치", "토실", "뽀송", "말랑", "쪼꼬", "하리"];
const COLORS = [0xff7eb3, 0x7ce7c4, 0xffe066, 0x8ec5ff, 0xd4b3ff, 0xffb085, 0x9bf6ff, 0xbaf55b];

const keys = new Set();
const stick = { nx: 0, ny: 0, active: false, jump: false, slide: false };
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmp3 = new THREE.Vector3();

const canvas = document.getElementById("view");
const hud = document.getElementById("hud");
const startEl = document.getElementById("start");
const countEl = document.getElementById("countdown");
const countNum = document.getElementById("count-num");
const resultEl = document.getElementById("result");
const boardEl = document.getElementById("board");
const rankEl = document.getElementById("rank");
const timeEl = document.getElementById("time");
const progressEl = document.getElementById("progress");
const slideFill = document.getElementById("slide-fill");
const slideHint = document.getElementById("slide-hint");
const slideCdEl = document.querySelector(".slide-cd");
const muteBtn = document.getElementById("mute");

let state = "start";
let raceTime = 0;
let resultShown = false;

const sfx = {
  enabled: true,
  ctx: null,
  boot() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  tone(freq, dur = 0.12, type = "sine", vol = 0.07) {
    if (!this.enabled || !this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  },
  jump() {
    this.tone(520, 0.1, "triangle", 0.05);
  },
  slide() {
    this.tone(180, 0.16, "sawtooth", 0.04);
  },
  bump() {
    this.tone(110, 0.14, "square", 0.05);
  },
  count(n) {
    this.tone(n === "GO" ? 660 : 392, 0.18, "sine", 0.08);
  },
  finish() {
    this.tone(523, 0.15);
    setTimeout(() => this.tone(659, 0.15), 90);
    setTimeout(() => this.tone(784, 0.28), 180);
  },
};

const COARSE =
  window.matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 700;
const shadowsOn = !COARSE;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !COARSE, powerPreference: "high-performance" });
renderer.setPixelRatio(COARSE ? 1 : Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = shadowsOn;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ad8ff);
scene.fog = new THREE.Fog(0x9ad8ff, 48, 150);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 6, -8);

const hemi = new THREE.HemisphereLight(0xfff1c9, 0x7ecbff, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.35);
sun.castShadow = shadowsOn;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(sun.target);

const courseRoot = new THREE.Group();
scene.add(courseRoot);
function put(obj) {
  courseRoot.add(obj);
  return obj;
}

const platforms = [];
const walls = [];
const obstacles = [];
const racers = [];
const confetti = [];
const zoneSpawns = [];
const motes = [];
const glints = [];
const flags = [];
const petals = [];
const winds = [];
const MOTE_MAX = COARSE ? 24 : 48;
const CLASSIC_ZONES = [
  { z: 0, fog: 0x9ad8ff, skyTop: "#6eb6ff", skyMid: "#b9e4ff", skyBot: "#fff1d2", hemi: 0xfff4dd, ground: 0x7dce86, sun: 0xfff7ea, exp: 1.06 },
  { z: 84, fog: 0xb7f3c8, skyTop: "#7dcea0", skyMid: "#c8f5b0", skyBot: "#fff6c8", hemi: 0xf4ffe4, ground: 0x63b96f, sun: 0xfff3c4, exp: 1.08 },
  { z: 172, fog: 0xffd2a8, skyTop: "#ff9a62", skyMid: "#ffc48a", skyBot: "#ffe7c2", hemi: 0xffe4c4, ground: 0xe0a86a, sun: 0xffc98a, exp: 1.12 },
  { z: 236, fog: 0xd4c4ff, skyTop: "#6a4dff", skyMid: "#c4b0ff", skyBot: "#ffd0ea", hemi: 0xf0e4ff, ground: 0x8d74c4, sun: 0xffc4e0, exp: 1.04 },
  { z: 330, fog: 0xc5e8ff, skyTop: "#8ec5ff", skyMid: "#d7f0ff", skyBot: "#fff6ea", hemi: 0xfff6ea, ground: 0x7dce86, sun: 0xfff8ee, exp: 1.1 },
];
const CANDY_ZONES = [
  { z: 0, fog: 0xffc4e0, skyTop: "#ff7eb3", skyMid: "#ffd0ea", skyBot: "#fff6c8", hemi: 0xffe4f2, ground: 0xf0a0c4, sun: 0xfff0d4, exp: 1.08 },
  { z: 150, fog: 0xffe0b0, skyTop: "#ff9a4a", skyMid: "#ffd28a", skyBot: "#fff3c8", hemi: 0xfff0d8, ground: 0xd4a06a, sun: 0xffe0a8, exp: 1.12 },
  { z: 300, fog: 0xe4c8ff, skyTop: "#9b74ff", skyMid: "#e4c4ff", skyBot: "#ffe4f4", hemi: 0xf6e6ff, ground: 0xd08ad4, sun: 0xffd0ea, exp: 1.06 },
];
const LAVA_ZONES = [
  { z: 0, fog: 0xffb088, skyTop: "#ff6a3d", skyMid: "#ffb070", skyBot: "#ffe0b0", hemi: 0xffd0a8, ground: 0xc46838, sun: 0xffc080, exp: 1.14 },
  { z: 170, fog: 0xff6840, skyTop: "#c43820", skyMid: "#ff7840", skyBot: "#ffd0a0", hemi: 0xffb088, ground: 0x8a3828, sun: 0xff7840, exp: 1.18 },
  { z: 310, fog: 0xffc898, skyTop: "#ff8a50", skyMid: "#ffc090", skyBot: "#fff0d0", hemi: 0xffe0c0, ground: 0xd07040, sun: 0xffe0b0, exp: 1.1 },
];
const SKY_ZONES = [
  { z: 0, fog: 0xd4f0ff, skyTop: "#8ec8ff", skyMid: "#e8f6ff", skyBot: "#ffffff", hemi: 0xf4fbff, ground: 0xd0e8f8, sun: 0xffffff, exp: 1.1 },
  { z: 180, fog: 0xe8f6ff, skyTop: "#b8dcff", skyMid: "#f4fbff", skyBot: "#ffffff", hemi: 0xffffff, ground: 0xe4f2ff, sun: 0xf8fcff, exp: 1.12 },
  { z: 320, fog: 0xc8e4ff, skyTop: "#6eb0ff", skyMid: "#d0ecff", skyBot: "#fff6e8", hemi: 0xf0f8ff, ground: 0xb8d4ee, sun: 0xfff4e0, exp: 1.08 },
];
let zones = CLASSIC_ZONES;
let hexBand = [298, 334];
let activeMap = null;

function hexToColor(hex) {
  return new THREE.Color(hex);
}

function lerpHex(a, b, t) {
  return hexToColor(a).lerp(hexToColor(b), t).getHex();
}

function stripeTex(a, b, repeatX = 6) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = b;
  for (let i = -64; i < 128; i += 18) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 10, 0);
    ctx.lineTo(i + 74, 64);
    ctx.lineTo(i + 64, 64);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const MAT = {
  spin: new THREE.MeshStandardMaterial({
    map: stripeTex("#ff4d6d", "#fff3b0", 8),
    roughness: 0.32,
  }),
  spinHub: new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.28, metalness: 0.2 }),
  low: new THREE.MeshStandardMaterial({
    map: stripeTex("#6c4dff", "#c4b5ff", 7),
    roughness: 0.34,
  }),
  wood: new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.55 }),
  mallet: new THREE.MeshStandardMaterial({ color: 0xff6b9d, roughness: 0.3, metalness: 0.08 }),
  bumper: new THREE.MeshStandardMaterial({
    map: stripeTex("#2dd4a8", "#ecfeff", 4),
    roughness: 0.35,
  }),
  post: new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.4 }),
  gate: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }),
};

function fling(r, dir, power, up) {
  tmp3.copy(dir);
  tmp3.y = 0;
  if (tmp3.lengthSq() < 0.0001) tmp3.set(0, 0, -1);
  tmp3.normalize();
  r.vel.x = tmp3.x * power;
  r.vel.z = tmp3.z * power * 0.9;
  r.vel.y = Math.max(r.vel.y, up);
}

function addWall(x, y, z, w, h, d) {
  walls.push({ x, y, z, w, h, d });
}

function addPlatform({ x = 0, z, y = 0, w = 14, d, color, rails = true, block = true }) {
  const thick = 0.72;
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.48,
    metalness: 0.04,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, thick, d), mat);
  mesh.position.set(x, y - thick / 2, z);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  put(mesh);
  const plat = { x, y, z, w, d, mesh, thick, fallen: false, shake: 0, hex: false, prevX: x };
  platforms.push(plat);
  if (rails) {
    const railMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const rw = 0.28;
      const rh = 0.5;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, d), railMat);
      rail.position.set(x + side * (w / 2 - rw / 2), y + rh / 2, z);
      rail.castShadow = true;
      put(rail);
      plat.rails = plat.rails || [];
      plat.rails.push(rail);
      if (block) addWall(rail.position.x, y + rh / 2, z, rw, rh, d);
    }
  }
  return plat;
}

function strip(z0, z1, color, opts = {}) {
  return addPlatform({
    x: opts.x || 0,
    z: (z0 + z1) / 2,
    y: opts.y || 0,
    w: opts.w || 14,
    d: z1 - z0,
    color,
    rails: opts.rails !== false,
  });
}

function candy(x, z, color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 2.4, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35 })
  );
  pole.position.y = 1.2;
  pole.castShadow = true;
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
  );
  top.position.y = 2.45;
  g.add(pole, top);
  g.position.set(x, 0, z);
  put(g);
}

function makeSpinBar(z, speed = 1.45, phase = 0, plus = true) {
  const group = new THREE.Group();
  group.position.set(0, 0.95, z);
  const makeArm = () => {
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 12.2, 6, 10), MAT.spin);
    bar.rotation.z = Math.PI / 2;
    bar.castShadow = true;
    const capL = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 10), MAT.spinHub);
    const capR = capL.clone();
    capL.position.x = -6.3;
    capR.position.x = 6.3;
    const arm = new THREE.Group();
    arm.add(bar, capL, capR);
    return arm;
  };
  group.add(makeArm());
  if (plus) {
    const armB = makeArm();
    armB.rotation.y = Math.PI / 2;
    group.add(armB);
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), MAT.spinHub);
  hub.castShadow = true;
  group.add(hub);
  put(group);
  obstacles.push({
    kind: "spin",
    z,
    mesh: group,
    update(t) {
      group.rotation.y = t * speed + phase;
    },
    hits(r) {
      if (r.sliding) return false;
      tmp.copy(r.pos);
      group.updateMatrixWorld();
      group.worldToLocal(tmp);
      const near = Math.abs(tmp.y) < 0.62 && Math.abs(tmp.x) < 6.4 && Math.abs(tmp.z) < 6.4;
      if (!near) return false;
      return Math.abs(tmp.z) < 0.52 || (plus && Math.abs(tmp.x) < 0.52);
    },
    knock(r) {
      const ang = group.rotation.y + Math.PI / 2;
      const dir = Math.sign(speed) || 1;
      fling(r, { x: Math.cos(ang) * dir, y: 0, z: Math.sin(ang) * dir }, 22, 11);
    },
  });
}

function makeLowBar(z, bob = false, x0 = 0, half = 6.5) {
  const gate = new THREE.Group();
  gate.position.set(x0, 0, z);
  const span = half * 2;
  for (const x of [-half, half]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.7, 10), MAT.post);
    post.position.set(x, 0.85, 0);
    post.castShadow = true;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), MAT.spinHub);
    ball.position.set(x, 1.75, 0);
    gate.add(post, ball);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(span + 0.4, 0.22, 0.32), MAT.gate);
  lintel.position.y = 1.72;
  gate.add(lintel);
  const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, Math.max(0.4, span - 0.6), 6, 10), MAT.low);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 0.88;
  bar.castShadow = true;
  gate.add(bar);
  put(gate);
  obstacles.push({
    kind: "low",
    z,
    x: x0,
    half,
    mesh: gate,
    update(t) {
      if (bob) bar.position.y = 0.78 + Math.abs(Math.sin(t * 2.4)) * 0.42;
    },
    hits(r) {
      if (r.sliding) return false;
      return Math.abs(r.pos.z - z) < 0.55 && Math.abs(r.pos.x - x0) < half + 0.1 && r.pos.y < bar.position.y + 0.35;
    },
    knock(r) {
      fling(r, { x: 0, y: 0, z: -1 }, 16, 7);
    },
  });
}

function makeHammer(z, side, speed, phase) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 7.35, 1.18, z);
  const armLen = 6.55;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.52, 0.38), MAT.wood);
  arm.position.set(-side * (armLen / 2), -0.18, 0);
  arm.castShadow = true;
  const mallet = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), MAT.mallet);
  mallet.position.x = -side * armLen;
  mallet.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.14, 8, 16), MAT.spinHub);
  rim.position.x = mallet.position.x;
  rim.rotation.z = Math.PI / 2;
  pivot.add(arm, mallet, rim);
  put(pivot);
  const hitAt = new THREE.Vector3();
  obstacles.push({
    kind: "hammer",
    z,
    mesh: pivot,
    head: mallet,
    update(t) {
      pivot.rotation.y = Math.sin(t * speed + phase) * 0.95;
    },
    hits(r) {
      mallet.getWorldPosition(tmp);
      if (tmp.distanceTo(r.pos) < 1.5) {
        hitAt.copy(tmp);
        return true;
      }
      pivot.updateMatrixWorld();
      tmp2.set(0, -0.18, 0);
      pivot.localToWorld(tmp2);
      tmp3.set(-side * armLen, -0.18, 0);
      pivot.localToWorld(tmp3);
      tmp3.sub(tmp2);
      const ab2 = tmp3.lengthSq();
      const t = ab2 < 1e-8 ? 0 : Math.max(0, Math.min(1, tmp.copy(r.pos).sub(tmp2).dot(tmp3) / ab2));
      hitAt.copy(tmp2).addScaledVector(tmp3, t);
      return r.pos.distanceTo(hitAt) < (r.sliding ? 0.48 : 0.72);
    },
    knock(r) {
      tmp2.copy(r.pos).sub(hitAt);
      fling(r, tmp2, 26, 12);
    },
  });
}

function makeRoller(z, speed = 2.5, phase = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 2.5, 16), MAT.spin);
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  put(mesh);
  obstacles.push({
    kind: "roller",
    z,
    mesh,
    update(t) {
      mesh.position.set(Math.sin(t * speed + phase) * 5.5, 0.68, z);
      mesh.rotation.z = t * speed * 2.2;
    },
    hits(r) {
      return mesh.position.distanceTo(r.pos) < 1.28;
    },
    knock(r) {
      tmp.copy(r.pos).sub(mesh.position);
      fling(r, tmp, 20, 10);
    },
  });
}

function makeBumper(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.88, 0.9, 18), MAT.bumper);
  body.position.y = 0.48;
  body.castShadow = true;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), MAT.spinHub);
  top.position.y = 1.05;
  group.add(body, top);
  put(group);
  obstacles.push({
    kind: "bumper",
    z,
    mesh: group,
    update(t) {
      const s = 1 + Math.sin(t * 7) * 0.07;
      body.scale.set(s, 1, s);
    },
    hits(r) {
      tmp.set(x, 0.7, z);
      return tmp.distanceTo(r.pos) < 1.28;
    },
    knock(r) {
      tmp.copy(r.pos);
      tmp.x -= x;
      tmp.z -= z;
      fling(r, tmp, 21, 9);
    },
  });
}

function makeMover(z, phase, color, amp = 5.4) {
  const plat = addPlatform({ x: 0, z, y: 0, w: 3.35, d: 3.15, color, rails: true, block: false });
  plat.moving = true;
  plat.moveAmp = amp;
  plat.moveOmega = 1.18;
  plat.movePhase = phase;
  plat.updateMove = (t) => {
    plat.prevX = plat.x;
    plat.x = Math.sin(t * plat.moveOmega + plat.movePhase) * plat.moveAmp;
    plat.mesh.position.x = plat.x;
    if (plat.rails) {
      plat.rails[0].position.x = plat.x - (plat.w / 2 - 0.14);
      plat.rails[1].position.x = plat.x + (plat.w / 2 - 0.14);
    }
  };
  return plat;
}

function makeHexField(z0, rows, cols, pal) {
  const colors = pal || [0xff7eb3, 0x7ce7c4, 0xffe066, 0x8ec5ff, 0xd4b3ff, 0xffb085];
  const span = 1.95;
  for (let iz = 0; iz < rows; iz++) {
    for (let ix = 0; ix < cols; ix++) {
      if (iz > 1 && (ix + iz * 3) % 7 === 0) continue;
      const x = (ix - (cols - 1) / 2) * span;
      const z = z0 + iz * span;
      const thick = 0.42;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.92, 0.92, thick, 6),
        new THREE.MeshStandardMaterial({ color: colors[(ix + iz) % colors.length], roughness: 0.42 })
      );
      mesh.position.set(x, -thick / 2, z);
      mesh.rotation.y = Math.PI / 6;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      put(mesh);
      platforms.push({
        x,
        y: 0,
        z,
        w: 1.55,
        d: 1.55,
        mesh,
        thick,
        fallen: false,
        shake: 0,
        hex: true,
        prevX: x,
      });
    }
  }
}

function makeGate(z) {
  const g = new THREE.Group();
  g.position.set(0, 0, z);
  for (const x of [-6.6, 6.6]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.6, 10), MAT.gate);
    pole.position.set(x, 1.3, 0);
    pole.castShadow = true;
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xff8fb8, side: THREE.DoubleSide })
    );
    flag.position.set(x + (x > 0 ? -0.55 : 0.55), 2.15, 0);
    flag.userData.baseRot = 0;
    flags.push(flag);
    g.add(pole, flag);
  }
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(13.2, 0.08, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffc24b, emissiveIntensity: 0.35 })
  );
  line.position.y = 0.06;
  g.add(line);
  put(g);
}

function addSpawnPad(z0, z1, color) {
  const plat = strip(z0, z1, color);
  plat.spawnPad = true;
  plat.spawnIndex = zoneSpawns.length;
  const z = z0 + 2.4;
  zoneSpawns.push({ x: 0, y: 0.66, z });
  makeGate(z);
  const theme = activeMap ? activeMap.id : "classic";
  if (theme === "lava") addTorchPair(z);
  else if (theme === "sky") addCrystalPair(z);
  else {
    candy(-6.6, z, 0xff8fb8);
    candy(6.6, z, 0x7ce7c4);
  }
  return plat;
}

function addCloud(x, y, z, s = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.15 * s, 10, 8), mat);
    m.position.set(i * 1.1 * s - 1.4 * s, Math.sin(i) * 0.25, (i % 2) * 0.35);
    g.add(m);
  }
  g.position.set(x, y, z);
  put(g);
}

let skyMesh = null;
let skyCanvas = null;
let skyTex = null;
let skirtMat = null;
let hillMat = null;
const parallax = new THREE.Group();

function paintSky(top, mid, bot) {
  if (!skyCanvas) {
    skyCanvas = document.createElement("canvas");
    skyCanvas.width = 8;
    skyCanvas.height = 256;
    skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
  }
  const g = skyCanvas.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, top);
  grd.addColorStop(0.55, mid);
  grd.addColorStop(1, bot);
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 256);
  skyTex.needsUpdate = true;
}

function dressWorld(theme = "classic") {
  paintSky(zones[0].skyTop, zones[0].skyMid, zones[0].skyBot);
  skyMesh = new THREE.Mesh(
    new THREE.SphereGeometry(220, 18, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  put(skyMesh);

  skirtMat = new THREE.MeshLambertMaterial({ color: zones[0].ground });
  for (const side of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(18, 0.55, 490), skirtMat);
    skirt.position.set(side * 18, -0.42, 220);
    skirt.receiveShadow = shadowsOn;
    put(skirt);
  }
  const valleyCol = theme === "lava" ? 0xff5a28 : theme === "candy" ? 0xf0b0d0 : theme === "sky" ? 0xd4ecff : 0x8ec5ff;
  const valley = new THREE.Mesh(
    new THREE.PlaneGeometry(theme === "lava" ? 36 : 22, 500),
    new THREE.MeshLambertMaterial({ color: valleyCol, emissive: theme === "lava" ? 0xff3a10 : 0x000000, emissiveIntensity: theme === "lava" ? 0.45 : 0 })
  );
  valley.rotation.x = -Math.PI / 2;
  valley.position.set(0, theme === "lava" ? -2.6 : -3.4, 220);
  put(valley);

  put(parallax);
  if (theme === "candy") addCandyBackdrop();
  else if (theme === "lava") addLavaBackdrop();
  else if (theme === "sky") addSkyBackdrop();
  else addClassicBackdrop();
}

function addRidge(x, z, scale, colors) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshLambertMaterial({ color: colors[0] }));
  body.scale.set(1.55 * scale, 0.92 * scale, 1.15 * scale);
  body.position.y = 0.15 * scale;
  const mid = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 8), new THREE.MeshLambertMaterial({ color: colors[1] }));
  mid.scale.set(1.25 * scale, 0.95 * scale, 1.05 * scale);
  mid.position.set(0.15 * scale, 0.72 * scale, 0.05 * scale);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6), new THREE.MeshLambertMaterial({ color: colors[2] }));
  cap.position.set(0, 1.22 * scale, 0);
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshLambertMaterial({ color: colors[0] }));
  shoulder.scale.set(1.1, 0.7, 0.9);
  shoulder.position.set(-0.7 * scale, 0.35 * scale, 0.25 * scale);
  g.add(body, mid, cap, shoulder);
  g.position.set(x, 0, z);
  parallax.add(g);
}

function addClassicBackdrop() {
  const pal = [
    [0x8ecf78, 0xb7e38a, 0xfffdf8],
    [0xf0a8c8, 0xf7c1d8, 0xfff6ea],
    [0xf0d48a, 0xffe9a0, 0xfffdf8],
    [0x7eb8e8, 0x9fd9ff, 0xf4fbff],
  ];
  const n = COARSE ? 7 : 12;
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    addRidge(side * (30 + (i % 3) * 7), i * 38 - 16, 11 + (i % 4) * 2.4, pal[i % pal.length]);
  }
  const tuftGeo = new THREE.ConeGeometry(0.22, 0.55, 5);
  const tuftMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const tuftCount = COARSE ? 40 : 90;
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftCount);
  tufts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(tuftCount * 3), 3);
  const dummy = new THREE.Object3D();
  const green = new THREE.Color();
  for (let i = 0; i < tuftCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    dummy.position.set(side * (8.3 + (i % 5) * 0.35), 0.2, (i / tuftCount) * 450 - 6);
    dummy.rotation.set(0, i, 0);
    dummy.scale.setScalar(0.7 + (i % 4) * 0.2);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
    green.setHex(i % 3 === 0 ? 0x7dce86 : i % 3 === 1 ? 0x9be7a0 : 0xff8fb8);
    tufts.setColorAt(i, green);
  }
  tufts.instanceColor.needsUpdate = true;
  put(tufts);

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a5a3a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3cb86a });
  const treeN = COARSE ? 10 : 18;
  for (let i = 0; i < treeN; i++) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.1, 6), trunkMat);
    trunk.position.y = 0.55;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), leafMat);
    crown.position.y = 1.45;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xff8fb8 : 0xffe066 }));
    cap.position.set(0.25, 1.9, 0.2);
    g.add(trunk, crown, cap);
    const side = i % 2 === 0 ? -1 : 1;
    g.position.set(side * 12.5, 0, 12 + i * 24);
    put(g);
  }

  const glintCols = [0xffe066, 0xff8fb8, 0x7ce7c4, 0xfffdf8];
  for (let i = 0; i < (COARSE ? 8 : 16); i++) {
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 0),
      new THREE.MeshBasicMaterial({ color: glintCols[i % glintCols.length], transparent: true, opacity: 0.85 })
    );
    const side = i % 2 === 0 ? -1 : 1;
    m.position.set(side * 6.9, 1.7, 30 + i * 26);
    put(m);
    glints.push(m);
  }

  const petalGeo = new THREE.SphereGeometry(0.08, 6, 4);
  for (let i = 0; i < (COARSE ? 6 : 12); i++) {
    const mesh = new THREE.Mesh(
      petalGeo,
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffb7d0 : 0xfff6c8, transparent: true, opacity: 0.85 })
    );
    mesh.scale.set(1.4, 0.45, 0.7);
    const base = new THREE.Vector3((i % 2 === 0 ? -1 : 1) * 9.5, 2.2 + (i % 3) * 0.4, 20 + i * 34);
    mesh.position.copy(base);
    put(mesh);
    petals.push({ mesh, base, sp: 0.6 + (i % 4) * 0.25, ph: i });
  }
}

function addCandyBackdrop() {
  const n = COARSE ? 6 : 10;
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    addRidge(side * (32 + (i % 3) * 5), i * 42 - 10, 10 + (i % 3) * 2, [0xf0a0c0, 0xffc2e0, 0xfff6ea]);
    const donut = new THREE.Mesh(
      new THREE.TorusGeometry(3.2 + (i % 3), 1.15, 8, 14),
      new THREE.MeshLambertMaterial({ color: i % 2 ? 0xff8fb8 : 0xffe066 })
    );
    donut.position.set(side * 26, 6 + (i % 3), i * 44 + 8);
    donut.rotation.x = 0.6;
    parallax.add(donut);
  }
  const caneN = COARSE ? 8 : 14;
  for (let i = 0; i < caneN; i++) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 3.2, 8),
      new THREE.MeshLambertMaterial({ color: i % 2 ? 0xff4d6d : 0xffffff })
    );
    pole.position.y = 1.6;
    const hook = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.22, 6, 10, Math.PI),
      new THREE.MeshLambertMaterial({ color: 0xff4d6d })
    );
    hook.position.y = 3.15;
    hook.rotation.z = Math.PI;
    g.add(pole, hook);
    const side = i % 2 === 0 ? -1 : 1;
    g.position.set(side * 11.5, 0, 18 + i * 30);
    put(g);
    if (i % 2 === 0) {
      const cup = new THREE.Group();
      const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.7, 8), new THREE.MeshLambertMaterial({ color: 0xc4845a }));
      cake.position.y = 0.4;
      const frost = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 6), new THREE.MeshLambertMaterial({ color: i % 4 ? 0xff8fb8 : 0x7ce7c4 }));
      frost.scale.y = 0.55;
      frost.position.y = 0.85;
      const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), new THREE.MeshLambertMaterial({ color: 0xff3355 }));
      cherry.position.y = 1.15;
      cup.add(cake, frost, cherry);
      cup.position.set(side * 9.2, 0, 28 + i * 30);
      put(cup);
    }
  }
}

function addLavaBackdrop() {
  const n = COARSE ? 5 : 9;
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshLambertMaterial({ color: 0x5a3428 }));
    rock.scale.set(8 + (i % 3) * 2, 6 + (i % 4), 7);
    rock.position.y = 1.2;
    const ridge = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshLambertMaterial({ color: 0x7a4030 }));
    ridge.scale.set(4, 3.2, 3);
    ridge.position.set(2.2, 3.4, 1);
    const crater = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.2, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: 0x4a2820 })
    );
    crater.position.y = 6.2;
    const lava = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 10),
      new THREE.MeshBasicMaterial({ color: 0xff5a1a })
    );
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = 6.7;
    g.add(rock, ridge, crater, lava);
    g.position.set(side * (28 + (i % 3) * 6), 0, i * 48 - 12);
    parallax.add(g);
  }
  for (let i = 0; i < (COARSE ? 8 : 16); i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 6, 6),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffe066 : 0xff5a1f })
    );
    const side = i % 2 === 0 ? -1 : 1;
    m.position.set(side * 7.2, 1.4, 24 + i * 26);
    put(m);
    glints.push(m);
    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 })
    );
    const base = new THREE.Vector3(side * 8.5, 1.6, 16 + i * 24);
    ember.position.copy(base);
    put(ember);
    petals.push({ mesh: ember, base, sp: 0.8 + (i % 3) * 0.3, ph: i * 0.7 });
  }
}

function addSkyBackdrop() {
  const n = COARSE ? 6 : 11;
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    addRidge(side * (34 + (i % 2) * 6), i * 40 - 8, 9 + (i % 3) * 2, [0xd0e4f4, 0xeef6ff, 0xffffff]);
    addCloud(side * 22, 7 + (i % 3) * 2, i * 28, 1.6 + (i % 3) * 0.4);
  }
  for (let i = 0; i < (COARSE ? 8 : 14); i++) {
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 0),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xb7e4ff : 0xffffff, roughness: 0.15, metalness: 0.35, emissive: 0x8ec5ff, emissiveIntensity: 0.25 })
    );
    crystal.position.set((i % 2 === 0 ? -1 : 1) * 10.5, 1.3, 20 + i * 28);
    crystal.rotation.y = i;
    put(crystal);
    glints.push(crystal);
  }
}

let skyBucket = -1;
function updateAtmosphere(z) {
  let a = zones[0];
  let b = zones[zones.length - 1];
  let t = 1;
  if (z <= zones[0].z) {
    b = zones[0];
    t = 0;
  } else {
    for (let i = 0; i < zones.length - 1; i++) {
      if (z >= zones[i].z && z <= zones[i + 1].z) {
        a = zones[i];
        b = zones[i + 1];
        t = (z - a.z) / (b.z - a.z);
        break;
      }
    }
    if (z > zones[zones.length - 1].z) {
      a = b = zones[zones.length - 1];
      t = 0;
    }
  }
  scene.fog.color.setHex(lerpHex(a.fog, b.fog, t));
  scene.background.setHex(lerpHex(a.fog, b.fog, t));
  hemi.color.setHex(lerpHex(a.hemi, b.hemi, t));
  sun.color.setHex(lerpHex(a.sun, b.sun, t));
  renderer.toneMappingExposure = a.exp + (b.exp - a.exp) * t;
  if (skirtMat) skirtMat.color.setHex(lerpHex(a.ground, b.ground, t));
  const bucket = Math.round(t * 8) + zones.indexOf(a) * 10;
  if (bucket !== skyBucket && skyCanvas) {
    skyBucket = bucket;
    const top = hexToColor(a.skyTop).lerp(hexToColor(b.skyTop), t);
    const mid = hexToColor(a.skyMid).lerp(hexToColor(b.skyMid), t);
    const bot = hexToColor(a.skyBot).lerp(hexToColor(b.skyBot), t);
    paintSky("#" + top.getHexString(), "#" + mid.getHexString(), "#" + bot.getHexString());
  }
  if (skyMesh) skyMesh.position.copy(camera.position);
  parallax.position.x = camera.position.x * 0.35;
  parallax.position.z = camera.position.z * 0.72;
}

function buildClassic() {
  addSpawnPad(-4, 34, 0x9be7ff);

  strip(34, 74, 0xffc2e8);
  makeSpinBar(46, 1.55, 0, true);
  makeSpinBar(60, -1.75, 0.8, true);

  addSpawnPad(74, 84, 0xc5f8a8);
  strip(84, 118, 0xc5f8a8);
  makeSpinBar(91, 1.85, 0.2, true);
  makeLowBar(102, true);
  makeBumper(-3.4, 108);
  makeBumper(3.6, 112);
  makeRoller(115.5, 2.6, 0.3);

  addSpawnPad(118, 126, 0xffe066);
  strip(130.2, 139.5, 0xd4b3ff, { w: 8.4 });
  makeSpinBar(134.8, 1.7, 0.4, true);
  strip(144.2, 152, 0x9be7ff, { w: 7.2 });
  makeBumper(0, 148);
  makeMover(158.2, 0.4, 0xffe066, 3.15);
  strip(164.8, 172, 0xffc2e8, { w: 7.8 });
  makeRoller(168.4, 2.55, 0.6);

  addSpawnPad(172, 184, 0xffd6a5);
  strip(184, 222, 0xffd6a5);
  makeHammer(191, 1, 2.45, 0);
  makeHammer(198, -1, 2.65, 1.4);
  makeHammer(205, 1, 2.55, 2.6);
  makeHammer(212, -1, 2.8, 0.5);
  makeHammer(218, 1, 2.5, 1.9);

  addSpawnPad(222, 236, 0xff8fb8);
  makeMover(243.1, 0, 0xff8fb8);
  makeMover(251.75, 2.1, 0x7ce7c4);
  makeMover(260.4, 3.8, 0xffe066);
  makeMover(269.05, 1.2, 0x8ec5ff);
  makeMover(277.7, 4.6, 0xd4b3ff);

  addSpawnPad(284.5, 302, 0x9be7ff);
  makeHexField(304, 12, 7);

  addSpawnPad(330, 340, 0xbaf55b);
  strip(340, 378, 0xbaf55b);
  makeSpinBar(348, 1.9, 0.2, true);
  makeRoller(358, 2.7, 0);
  makeHammer(368, 1, 2.6, 0);
  makeHammer(368, -1, 2.6, Math.PI);

  strip(378, 388, 0xffc2e8);
  makeRoller(383, 2.9, 1.2);
  strip(393.2, 455, 0x9be7ff);
  makeSpinBar(400, -2.15, 0.5, true);
  makeHammer(410, 1, 2.75, 0.8);
  candy(-6.6, 430, 0xff8fb8);
  candy(6.6, 430, 0x7ce7c4);

  placeFinish();

  for (let i = 0; i < 22; i++) {
    addCloud((Math.random() - 0.5) * 90, 8 + Math.random() * 12, i * 22 + Math.random() * 10, 1.1 + Math.random());
  }

  const groundFog = new THREE.Mesh(
    new THREE.CircleGeometry(80, 24),
    new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
  );
  groundFog.rotation.x = -Math.PI / 2;
  groundFog.position.y = -18;
  put(groundFog);
  dressWorld("classic");
}

function placeFinish() {
  const arch = new THREE.Group();
  const archMat = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.4 });
  const colL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.2, 0.7), archMat);
  const colR = colL.clone();
  colL.position.set(-5.4, 2.1, FINISH_Z);
  colR.position.set(5.4, 2.1, FINISH_Z);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(12, 0.8, 0.8), archMat);
  beam.position.set(0, 4.3, FINISH_Z);
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(8.8, 1.2),
    new THREE.MeshBasicMaterial({
      map: (() => {
        const c = document.createElement("canvas");
        c.width = 512;
        c.height = 96;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#ff8fb8";
        ctx.fillRect(0, 0, 512, 96);
        ctx.fillStyle = "#2b2140";
        ctx.font = "700 64px Jua, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("골인", 256, 52);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      })(),
      side: THREE.DoubleSide,
    })
  );
  banner.position.set(0, 3.5, FINISH_Z - 0.1);
  arch.add(colL, colR, beam, banner);
  put(arch);

  const finish = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.08, 2.4),
    new THREE.MeshStandardMaterial({
      map: stripeTex("#2b2140", "#fffdf8", 10),
      roughness: 0.55,
    })
  );
  finish.position.set(0, 0.04, FINISH_Z);
  put(finish);
}

function paintBelt(plat, dir) {
  const mat = new THREE.MeshBasicMaterial({ color: dir > 0 ? 0x7ce7c4 : 0xff6b6b });
  const n = Math.max(3, Math.floor(plat.d / 4.5));
  plat.beltArrows = [];
  for (let i = 0; i < n; i++) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.68, 4), mat);
    arrow.rotation.x = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    arrow.position.set(plat.x, plat.y + 0.09, plat.z - plat.d / 2 + ((i + 0.5) * plat.d) / n);
    put(arrow);
    plat.beltArrows.push(arrow);
  }
}

function makeLollipop(z, side, speed, phase) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 7.35, 1.35, z);
  const armLen = 6.35;
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, armLen, 8),
    new THREE.MeshStandardMaterial({ color: 0xfffdf8, roughness: 0.4 })
  );
  stick.rotation.z = Math.PI / 2;
  stick.position.x = -side * (armLen / 2);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.92, 16, 12),
    new THREE.MeshStandardMaterial({ color: side > 0 ? 0xff4d6d : 0x3dce9a, roughness: 0.28 })
  );
  head.position.x = -side * armLen;
  const swirl = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.11, 8, 14),
    new THREE.MeshStandardMaterial({ color: 0xfffdf8, roughness: 0.3 })
  );
  swirl.position.x = head.position.x;
  swirl.rotation.y = Math.PI / 2;
  pivot.add(stick, head, swirl);
  put(pivot);
  const hitAt = new THREE.Vector3();
  obstacles.push({
    kind: "hammer",
    z,
    mesh: pivot,
    head,
    update(t) {
      pivot.rotation.y = Math.sin(t * speed + phase) * 0.95;
    },
    hits(r) {
      head.getWorldPosition(tmp);
      if (tmp.distanceTo(r.pos) < 1.45) {
        hitAt.copy(tmp);
        return true;
      }
      pivot.updateMatrixWorld();
      tmp2.set(0, 0, 0);
      pivot.localToWorld(tmp2);
      tmp3.set(-side * armLen, 0, 0);
      pivot.localToWorld(tmp3);
      tmp3.sub(tmp2);
      const ab2 = tmp3.lengthSq();
      const t = ab2 < 1e-8 ? 0 : Math.max(0, Math.min(1, tmp.copy(r.pos).sub(tmp2).dot(tmp3) / ab2));
      hitAt.copy(tmp2).addScaledVector(tmp3, t);
      return r.pos.distanceTo(hitAt) < (r.sliding ? 0.42 : 0.68);
    },
    knock(r) {
      tmp2.copy(r.pos).sub(hitAt);
      fling(r, tmp2, 24, 11);
    },
  });
}

function makeJelly(x, z, color, power = 16, kick = 0) {
  const plat = addPlatform({ x, z, y: 0.05, w: 2.6, d: 2.6, color, rails: false, block: false });
  plat.bounce = power;
  if (kick) plat.fanZ = kick;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 16, 12),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.16,
      emissive: color,
      emissiveIntensity: 0.22,
      transparent: true,
      opacity: 0.84,
    })
  );
  mesh.scale.set(1.15, 0.42, 1.15);
  mesh.position.set(x, 0.4, z);
  put(mesh);
  plat.jelly = mesh;
  return plat;
}

function makeFanPad(x, z, vy, vz) {
  const plat = addPlatform({ x, z, y: 0, w: 3.4, d: 3.4, color: 0xd7f4ff, rails: false, block: false });
  plat.fanY = vy;
  plat.fanZ = vz;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.5, 0.28, 14),
    new THREE.MeshStandardMaterial({ color: 0x8ec5ff, roughness: 0.32, metalness: 0.25 })
  );
  base.position.set(x, 0.2, z);
  const blades = new THREE.Group();
  blades.position.set(x, 0.42, z);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xfffdf8, roughness: 0.3 });
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI) / 2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.26), bladeMat);
    b.position.x = 0.62;
    arm.add(b);
    blades.add(arm);
  }
  put(base);
  put(blades);
  plat.blades = blades;
  return plat;
}

function makeMill(z, speed = 1.3, phase = 0) {
  const pivot = new THREE.Group();
  pivot.position.set(0, 1.55, z);
  const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 11.2, 5, 8), MAT.low);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = -1.05;
  bar.castShadow = true;
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), MAT.spinHub);
  pivot.add(bar, hub);
  put(pivot);
  const obj = {
    kind: "mill",
    z,
    speed,
    phase,
    mesh: pivot,
    barPos(t) {
      const a = t * speed + phase;
      return { y: 1.55 - Math.cos(a) * 1.05, z: z - Math.sin(a) * 1.05 };
    },
    update(t) {
      pivot.rotation.x = t * speed + phase;
    },
    hits(r) {
      const p = this.barPos(simTime);
      if (Math.abs(r.pos.x) > 5.6) return false;
      if (Math.abs(r.pos.z - p.z) > 0.68) return false;
      if (r.sliding && p.y < 1.15) return false;
      if (p.y > 2.05) return false;
      return Math.abs(r.pos.y - p.y) < 0.95;
    },
    knock(r) {
      fling(r, { x: r.pos.x, y: 0, z: -1 }, 16, 8);
    },
  };
  obstacles.push(obj);
}

function makeJet(z, x, phase = 0, speed = 2.2) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.7, 0.32, 10),
    new THREE.MeshStandardMaterial({ color: 0x4a3028, roughness: 0.7 })
  );
  base.position.y = 0.16;
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 1.55, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.9 })
  );
  flame.position.y = 1.05;
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 1.05, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe066 })
  );
  core.position.y = 0.95;
  g.add(base, flame, core);
  put(g);
  obstacles.push({
    kind: "jet",
    z,
    x,
    phase,
    speed,
    mesh: g,
    lit(t) {
      return Math.sin(t * speed + phase) > 0.08;
    },
    update(t) {
      const on = Math.sin(t * speed + phase) > 0.08;
      const s = on ? 0.4 + Math.abs(Math.sin(t * 18)) * 0.75 : 0.04;
      flame.scale.set(s, s, s);
      core.scale.set(s * 0.75, s, s * 0.75);
      flame.material.opacity = on ? 0.95 : 0.12;
    },
    hits(r) {
      if (Math.sin(simTime * speed + phase) <= 0.08) return false;
      return Math.abs(r.pos.z - z) < 0.7 && Math.abs(r.pos.x - x) < 1.12 && r.pos.y < 1.5;
    },
    knock(r) {
      fling(r, { x: r.pos.x - x, y: 0, z: -1 }, 18, 11);
    },
  });
}

function makeDoorPuzzle(z) {
  const g = new THREE.Group();
  g.position.set(0, 0, z);
  const colors = [0xff4d6d, 0xffe066, 0x3dce9a];
  [-4.6, 0, 4.6].forEach((x, i) => {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 2.9, 0.28),
      new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.4, emissive: colors[i], emissiveIntensity: i === 1 ? 0.35 : 0.05 })
    );
    frame.position.set(x, 1.5, 0);
    g.add(frame);
    if (i !== 1) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(1.75, 2.25, 0.38),
        new THREE.MeshStandardMaterial({ color: 0x5a3a28, roughness: 0.6 })
      );
      door.position.set(x, 1.2, 0);
      g.add(door);
    }
  });
  put(g);
  addWall(-4.6, 1.35, z, 2.45, 2.7, 0.7);
  addWall(4.6, 1.35, z, 2.45, 2.7, 0.7);
  obstacles.push({
    kind: "door",
    z,
    openX: 0,
    mesh: g,
    update() {},
    hits() {
      return false;
    },
    knock() {},
  });
}

function makeTurntable(z, x = 0) {
  const plat = addPlatform({ x, z, y: 0, w: 4.2, d: 4.2, color: 0xc5e8ff, rails: false, block: false });
  plat.spin = 3.1;
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.95, 1.95, 0.22, 18),
    new THREE.MeshStandardMaterial({ color: 0xb7dcff, roughness: 0.2, metalness: 0.4 })
  );
  disc.position.set(x, 0.16, z);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 0.08, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xff8fb8 })
  );
  stripe.position.set(x, 0.3, z);
  put(disc);
  put(stripe);
  plat.stripe = stripe;
  return plat;
}

function iceStrip(z0, z1, opts = {}) {
  const p = strip(z0, z1, opts.color || 0xe9f7ff, opts);
  p.ice = true;
  const sheen = new THREE.Mesh(
    new THREE.PlaneGeometry((opts.w || 14) * 0.9, (z1 - z0) * 0.92),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34 })
  );
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.set(opts.x || 0, (opts.y || 0) + 0.05, (z0 + z1) / 2);
  put(sheen);
  return p;
}

function addTorchPair(z) {
  for (const x of [-6.4, 6.4]) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3028, roughness: 0.7 })
    );
    post.position.y = 0.8;
    const bowl = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xff3a10, emissiveIntensity: 0.8 })
    );
    bowl.position.y = 1.7;
    g.add(post, bowl);
    g.position.set(x, 0, z);
    put(g);
  }
}

function addCrystalPair(z) {
  for (const x of [-6.4, 6.4]) {
    const c = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({ color: 0xe8f6ff, roughness: 0.12, metalness: 0.45, emissive: 0x9fd4ff, emissiveIntensity: 0.35 })
    );
    c.position.set(x, 1.15, z);
    put(c);
  }
}

function haze(color = 0xffffff, y = -18) {
  const fog = new THREE.Mesh(
    new THREE.CircleGeometry(90, 24),
    new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.28 })
  );
  fog.rotation.x = -Math.PI / 2;
  fog.position.y = y;
  put(fog);
}

function buildCandy() {
  zones = CANDY_ZONES;
  hexBand = [268, 312];
  addSpawnPad(-4, 26, 0xffb7d5);

  const rush = strip(26, 62, 0xff9ec8);
  rush.conveyZ = 5.5;
  paintBelt(rush, 1);
  makeLowBar(38, false);
  makeLowBar(52, true);

  addSpawnPad(62, 72, 0xffe7a0);
  const choc = strip(72, 110, 0xc4845a);
  choc.conveyZ = -3.4;
  paintBelt(choc, -1);
  makeLollipop(82, 1, 2.15, 0.3);
  makeLollipop(94, -1, 2.45, 1.6);
  makeLowBar(104, false);

  addSpawnPad(110, 120, 0xffc2e8);
  strip(120, 130, 0xffc2e8);
  makeJelly(0, 136.4, 0xff4d8d, 16, 15.5);
  strip(146, 184, 0xffe066, { y: 1.05, w: 12 });

  addSpawnPad(180, 194, 0x7ce7c4);
  strip(198, 236, 0xffb7d5, { x: -4.2, w: 5.6 });
  makeLowBar(210, false, -4.2, 2.2);
  makeLowBar(224, true, -4.2, 2.2);
  strip(198, 214, 0xc9f6e4, { x: 4.2, w: 5.6 });
  makeBumper(4.2, 206);
  strip(220, 236, 0xc9f6e4, { x: 4.2, w: 5.6 });
  makeBumper(4.2, 228);

  strip(240, 264, 0xffe066);
  makeDoorPuzzle(252);

  addSpawnPad(264, 274, 0xffb7d5);
  makeHexField(278, 10, 7, [0xff8fb8, 0xffe066, 0x7ce7c4, 0xffb7d5, 0xc4845a, 0xfff3b0]);
  addSpawnPad(300, 310, 0xffe066);

  strip(310, 348, 0xffc2e8);
  makeSpinBar(322, 1.65, 0.4, true);
  makeLollipop(334, 1, 2.3, 0.2);
  makeLollipop(334, -1, 2.3, Math.PI);
  makeLowBar(344, false);

  strip(348, 358, 0xffe7a0);
  makeFanPad(0, 364.5, 14.5, 16);
  strip(372, 455, 0xffb7d5);
  makeLowBar(388, true);
  makeSpinBar(404, -1.85, 0.5, true);

  placeFinish();
  haze(0xffd0ea, -16);
  dressWorld("candy");
}

function buildLava() {
  zones = LAVA_ZONES;
  hexBand = [206, 250];
  addSpawnPad(-4, 24, 0xffc09a);

  strip(24, 72, 0xe07840);
  makeJet(34, -3.3, 0.1, 2.05);
  makeJet(34, 3.3, 2.4, 2.05);
  makeLowBar(46, false);
  makeMill(56, 1.2, 0.4);
  makeJet(66, 0, 0.6, 2.5);
  makeJet(66, -4.2, 2.1, 1.7);

  addSpawnPad(72, 82, 0xffd0a0);
  strip(82, 94, 0xd4683c, { w: 10 });
  strip(100.5, 116, 0xffb070, { w: 8 });
  makeMill(108, 1.45, 1.1);

  let z = 120;
  const rise = 0.46;
  const stepLen = 3.05;
  const stepAdv = 2.65;
  for (let i = 0; i < 6; i++) {
    strip(z, z + stepLen, i % 2 ? 0xff8a4a : 0xd4683c, { y: i * rise, w: 8, rails: false });
    z += stepAdv;
  }
  let y = 5 * rise;
  z = 136.2;
  for (let i = 0; i < 5; i++) {
    y = Math.max(0, y - rise);
    strip(z, z + stepLen, i % 2 ? 0xffb070 : 0xe07840, { y, w: 8, rails: false });
    z += stepAdv;
  }

  strip(149, 196, 0xffb080);
  makeHammer(162, 1, 1.85, 0.2);
  makeHammer(174, -1, 2.05, 1.5);
  makeHammer(186, 1, 1.75, 2.4);
  makeLowBar(194, false);

  addSpawnPad(196, 208, 0xffe0b0);
  makeHexField(212, 12, 7, [0xff5a1f, 0xc44820, 0xffe066, 0x8a3828, 0xff8a3a, 0x5a2820]);
  addSpawnPad(236, 248, 0xffc09a);

  makeMover(254.2, 0.3, 0xff5a2a, 3.05);
  makeMover(262.8, 1.7, 0xffe066, 3.05);
  makeMover(271.4, 3.4, 0xff8a3a, 3.05);
  makeMover(280.0, 0.8, 0xffb070, 3.05);
  addSpawnPad(287, 299, 0xffd0a0);

  strip(299, 348, 0xe07040);
  makeDoorPuzzle(322);
  makeMill(336, 1.3, 0.7);

  strip(348, 378, 0xffb070);
  makeJet(358, 2.8, 0.2, 2.2);
  makeJet(358, -2.8, 2.6, 2.2);
  makeLowBar(368, true);
  makeHammer(376, 1, 2.1, 0.5);
  makeHammer(376, -1, 2.1, Math.PI);

  strip(378, 455, 0xffc09a);
  makeMill(390, 1.15, 0.3);
  makeJet(402, 0, 1.1, 2.3);
  makeJet(402, 4.1, 2.8, 1.9);
  makeLowBar(412, false);

  placeFinish();
  haze(0xff6a30, -8);
  dressWorld("lava");
}

function buildSky() {
  zones = SKY_ZONES;
  hexBand = null;
  addSpawnPad(-4, 22, 0xe8f7ff);

  iceStrip(22, 68, { w: 12 });
  makeBumper(-3.1, 34);
  makeBumper(3.3, 46);
  makeLowBar(56, false);
  makeBumper(0, 64);

  addSpawnPad(68, 78, 0xf7fbff);
  strip(78, 116, 0xd7eeff, { w: 6.4, rails: false });
  winds.push({ z0: 82, z1: 112, ax: 15, gust: 1.2, phase: 0.4 });
  makeLowBar(92, true);
  makeLowBar(106, false);

  addSpawnPad(116, 126, 0xfff6ea);
  strip(126, 138, 0xe7f4ff, { w: 9 });
  makeMover(145.2, 0.3, 0xffffff, 2.6);
  makeMover(154.2, 2.1, 0xd7f0ff, 2.6);
  makeMover(163.2, 3.8, 0xffffff, 2.6);
  strip(169.5, 177.5, 0xe7f4ff, { w: 8 });
  makeTurntable(181.6);
  strip(186, 206, 0xe7f4ff, { w: 9 });
  makeLowBar(196, false);

  addSpawnPad(206, 216, 0xe8f7ff);
  strip(216, 226, 0xf4fbff);
  makeFanPad(0, 232, 15, 16.5);
  iceStrip(240, 286, { w: 13 });
  makeSpinBar(256, 1.55, 0.35, true);
  makeLowBar(270, false);
  winds.push({ z0: 246, z1: 282, ax: -10, gust: 0.85, phase: 1.2 });

  addSpawnPad(286, 296, 0xfffdf8);
  strip(300, 348, 0xd5ecff, { x: -2.4, w: 7.4 });
  makeLowBar(314, false, -2.4, 3.2);
  makeLowBar(332, true, -2.4, 3.2);
  makeFanPad(5.5, 308, 13, 14);
  strip(312, 348, 0xffffff, { x: 5.5, y: 1.35, w: 4.4, rails: false });
  makeBumper(5.5, 334);

  strip(352, 374, 0xe8f6ff);
  makeMill(362, 1.25, 0.5);
  strip(374, 390, 0xf4fbff, { w: 8 });
  makeSpinBar(382, -1.7, 0.4, true);
  strip(395.6, 455, 0xe7f4ff);
  makeLowBar(406, false);

  placeFinish();
  haze(0xffffff, -16);
  dressWorld("sky");
}

function windAccel(z) {
  let ax = 0;
  for (const w of winds) {
    if (z > w.z0 && z < w.z1) {
      const g = w.gust ? Math.sin(simTime * w.gust + (w.phase || 0)) : 1;
      ax += w.ax * g;
    }
  }
  return ax;
}

function clearCourse() {
  if (parallax.parent) parallax.parent.remove(parallax);
  parallax.clear();
  const seen = new Set();
  courseRoot.traverse((obj) => {
    if (obj.geometry && !seen.has(obj.geometry)) {
      seen.add(obj.geometry);
      obj.geometry.dispose();
    }
  });
  courseRoot.clear();
  platforms.length = 0;
  walls.length = 0;
  obstacles.length = 0;
  zoneSpawns.length = 0;
  flags.length = 0;
  glints.length = 0;
  petals.length = 0;
  winds.length = 0;
  skyMesh = null;
  skirtMat = null;
  skyBucket = -1;
  for (let i = confetti.length - 1; i >= 0; i--) scene.remove(confetti[i].mesh);
  confetti.length = 0;
}

function buildWorld() {
  clearCourse();
  const id = activeMap ? activeMap.id : "classic";
  if (id === "candy") buildCandy();
  else if (id === "lava") buildLava();
  else if (id === "sky") buildSky();
  else {
    zones = CLASSIC_ZONES;
    hexBand = [298, 334];
    buildClassic();
  }
  updateAtmosphere(racers[0] ? racers[0].pos.z : 0);
}

function makeLabel(text, me) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = me ? "#ff8fb8" : "#fffdf8";
  ctx.strokeStyle = "#2b2140";
  ctx.lineWidth = 6;
  roundRect(ctx, 18, 10, 220, 44, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2b2140";
  ctx.font = "700 28px Jua, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(1.7, 0.42, 1);
  spr.position.y = 1.42;
  spr.renderOrder = 2;
  return spr;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function freshAnim() {
  return {
    phase: Math.random() * 6,
    land: 0,
    hit: 0,
    fail: 0,
    takeoff: 0,
    blink: 1.4 + Math.random() * 2.4,
    slide: 0,
    air: 0,
    run: 0,
    armL: 0,
    armR: 0,
    legL: 0,
    legR: 0,
    lean: 0,
    bob: 0,
    squash: 1,
    stretch: 1,
    roll: 0,
    step: Math.random(),
  };
}

function createBean(color, name, me) {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.06 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2140, roughness: 0.55 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfffdf8, roughness: 0.28 });
  const blushMat = new THREE.MeshStandardMaterial({ color: 0xff8aa8, transparent: true, opacity: 0.62 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3dce9e, roughness: 0.45 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, COARSE ? 14 : 22, COARSE ? 12 : 16), bodyMat);
  body.scale.set(1.02, 1.16, 0.9);
  body.position.y = 0.12;
  body.castShadow = shadowsOn;
  rig.add(body);

  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.34 })
  );
  belly.position.set(0, -0.06, 0.3);
  belly.scale.set(1.05, 0.82, 0.42);
  rig.add(belly);

  const shine = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
  );
  shine.position.set(-0.16, 0.28, 0.32);
  rig.add(shine);

  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.36, 0.2, 0);
    pivot.rotation.z = side * 0.7;
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.28, 3, 8), bodyMat);
    upper.position.y = -0.2;
    upper.castShadow = shadowsOn;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bodyMat);
    hand.position.y = -0.4;
    pivot.add(upper, hand);
    rig.add(pivot);
    return pivot;
  }

  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.15, -0.32, 0.02);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.22, 3, 8), bodyMat);
    thigh.position.y = -0.18;
    thigh.castShadow = shadowsOn;
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), dark);
    foot.scale.set(1.25, 0.55, 1.55);
    foot.position.set(0, -0.38, 0.08);
    pivot.add(thigh, foot);
    rig.add(pivot);
    return pivot;
  }

  function makeEye(side) {
    const g = new THREE.Group();
    g.position.set(side * 0.15, 0.2, 0.36);
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), dark);
    pupil.position.set(0, -0.012, 0.075);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), white);
    glint.position.set(side * 0.02, 0.028, 0.09);
    g.add(sclera, pupil, glint);
    rig.add(g);
    return { g, pupil, sclera };
  }

  const armL = makeArm(-1);
  const armR = makeArm(1);
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  const eyeL = makeEye(-1);
  const eyeR = makeEye(1);

  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), blushMat);
    b.position.set(s * 0.3, 0.04, 0.38);
    b.scale.set(1.25, 0.7, 0.45);
    rig.add(b);
  }

  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.016, 6, 12, Math.PI),
    dark
  );
  smile.position.set(0, 0.02, 0.46);
  smile.rotation.set(0.1, 0, Math.PI);
  rig.add(smile);

  const sprout = new THREE.Group();
  sprout.position.set(0, 0.62, -0.02);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.18, 6), leafMat);
  stem.position.y = 0.08;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), leafMat);
  leaf.scale.set(1.5, 0.38, 0.7);
  leaf.position.set(0.08, 0.18, 0);
  leaf.rotation.z = -0.4;
  sprout.add(stem, leaf);
  rig.add(sprout);

  const lines = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const ln = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.035, 0.55 + i * 0.16),
      new THREE.MeshBasicMaterial({ color: 0xfffdf8, transparent: true, opacity: 0.0 })
    );
    ln.position.set((i - 1.5) * 0.16, -0.22, -0.55 - i * 0.12);
    lines.add(ln);
  }
  rig.add(lines);

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 14),
    new THREE.MeshBasicMaterial({ color: 0x2b2140, transparent: true, opacity: 0.22, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = -0.62;
  root.add(blob);

  const label = makeLabel(name, me);
  root.add(label);
  root.userData = { rig, body, armL, armR, legL, legR, eyeL, eyeR, smile, sprout, lines, blob, inner: rig };
  return root;
}

function feetOf(r) {
  return r.sliding ? 0.3 : 0.66;
}

function findSupport(x, z, feetY) {
  let best = null;
  let bestY = -999;
  for (const p of platforms) {
    if (p.fallen) continue;
    if (p.hex && (p.mesh.position.y < -0.5 || p.shake > 0.28)) continue;
    if (Math.abs(x - p.x) <= p.w / 2 + 0.08 && Math.abs(z - p.z) <= p.d / 2 + 0.08) {
      if (p.y <= feetY + 0.85 && p.y > bestY) {
        bestY = p.y;
        best = p;
      }
    }
  }
  return best;
}

function collideWalls(r) {
  for (const w of walls) {
    const dx = r.pos.x - w.x;
    const dz = r.pos.z - w.z;
    const hx = w.w / 2 + RADIUS;
    const hz = w.d / 2 + RADIUS;
    if (Math.abs(dx) > hx || Math.abs(dz) > hz) continue;
    const feet = r.pos.y - feetOf(r);
    const head = r.pos.y + 0.5;
    if (head < w.y - w.h / 2 || feet > w.y + w.h / 2) continue;
    const ox = hx - Math.abs(dx);
    const oz = hz - Math.abs(dz);
    if (ox < oz) {
      r.pos.x += Math.sign(dx || 1) * ox;
      r.vel.x = 0;
    } else {
      r.pos.z += Math.sign(dz || 1) * oz;
      r.vel.z *= 0.2;
    }
  }
}

function spawnRacers() {
  const xs = [-5.25, -3.75, -2.25, -0.75, 0.75, 2.25, 3.75, 5.25];
  for (let i = 0; i < 8; i++) {
    const me = i === 0;
    const r = {
      id: i,
      name: NAMES[i],
      me,
      color: COLORS[i],
      pos: new THREE.Vector3(me ? 0 : xs[i], 0.66, me ? 4 : 2 + (i % 3) * 0.4),
      vel: new THREE.Vector3(),
      yaw: 0,
      onGround: true,
      sliding: false,
      slideT: 0,
      slideCd: 0,
      jumpCd: 0,
      coyote: 0,
      invuln: 0,
      finished: false,
      finishTime: 0,
      checkpoint: new THREE.Vector3(me ? 0 : xs[i], 0.66, 4),
      spawnIndex: 0,
      skill: me ? 1 : 1.04 + i * 0.012,
      lane: me ? 0 : xs[i] * 0.28,
      clumsy: 0,
      failX: null,
      failZ: 0,
      safePos: new THREE.Vector3(me ? 0 : xs[i], 0.66, 4),
      groundPlat: null,
      padT: 0,
      mesh: createBean(COLORS[i], NAMES[i], me),
      anim: freshAnim(),
    };
    if (me) r.pos.x = 0;
    r.mesh.position.copy(r.pos);
    scene.add(r.mesh);
    racers.push(r);
  }
}

function wishDir(r) {
  if (r.me) {
    let x = 0;
    let z = 0;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) x += 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) x -= 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) z += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) z -= 1;
    if (stick.active) {
      x += -stick.nx;
      z += -stick.ny;
    }
    tmp.set(x, 0, z);
    if (tmp.lengthSq() > 1) tmp.normalize();
    return tmp;
  }

  tmp.set(0, 0, 1);
  tmp.x = 0;

  const cur = findSupport(r.pos.x, r.pos.z, r.pos.y);
  const nxt = nextPlatform(r);
  const onHex = !!(cur && cur.hex);
  const inHexBand = !!(hexBand && r.pos.z > hexBand[0] && r.pos.z < hexBand[1]);
  const hexZone = onHex || (nxt && nxt.hex) || inHexBand;
  const landX = hexZone ? bestSafeX(r) : nxt ? predictedX(nxt, r.onGround ? 0.72 : 0.45) : r.lane;
  const edgeDist = cur ? cur.z + cur.d / 2 - r.pos.z : 99;
  const gapSize = nxt && cur ? nxt.z - nxt.d / 2 - (cur.z + cur.d / 2) : 0;
  const slideTravel = SLIDE_DUR * SLIDE_SPEED;

  tmp.x = THREE.MathUtils.clamp(landX - r.pos.x, -1, 1);
  if (cur && cur.hex && cur.shake > 0.06) {
    tmp.x = THREE.MathUtils.clamp(bestSafeX(r) - r.pos.x, -1, 1);
    tmp.z = 1;
  } else if (cur && r.onGround && edgeDist > 1.9 && !hexZone) {
    tmp.x = THREE.MathUtils.clamp(cur.x - r.pos.x, -1, 1);
  } else if (cur && !cur.moving && r.onGround && !hexZone) {
    const half = Math.max(0.35, cur.w / 2 - 0.55);
    const clamped = THREE.MathUtils.clamp(r.pos.x + tmp.x, cur.x - half, cur.x + half);
    tmp.x = THREE.MathUtils.clamp(clamped - r.pos.x, -1, 1);
  }

  if (r.onGround && cur && gapSize > 0.35 && !onHex) {
    const aligned = Math.abs(landX - r.pos.x) < (nxt && nxt.moving ? 1.35 : 2.4);
    if (edgeDist < 1.7 && aligned) tryJump(r, false);
    else if (edgeDist < 1.15 && !aligned) {
      tmp.z = r.vel.z > 1.2 ? -0.85 : 0;
      tmp.x = THREE.MathUtils.clamp(landX - r.pos.x, -1, 1);
    }
  } else if (r.onGround && onHex) {
    const holeZ = r.pos.z + Math.max(0.85, edgeDist + 0.4);
    if (!isStandable(r.pos.x, holeZ, r.pos.y) && edgeDist < 0.72) tryJump(r, false);
  } else if (r.onGround && !cur && nxt) {
    tryJump(r, false);
  }

  let wantSlide = false;
  for (const o of obstacles) {
    const dz = o.z - r.pos.z;
    if (dz < -0.5 || dz > 5.8) continue;
    if (o.kind === "low" && dz > 0.65 && dz < 4.4 && Math.abs(r.pos.x - (o.x || 0)) < (o.half || 6.5) + 0.8) wantSlide = true;
    if (o.kind === "mill" && dz > -0.4 && dz < 4.4) {
      const p = o.barPos(simTime + Math.max(0, dz) / 9);
      if (p.y < 1.05) wantSlide = true;
      else if (p.y < 1.85 && r.onGround && Math.abs(r.pos.z - p.z) < 2.6) {
        if (dz > 1.7) tmp.z = -0.7;
        else tryJump(r, false);
      }
    }
    if (o.kind === "spin" && dz > 0.35 && dz < 4.4) {
      if (r.onGround || r.pos.y < 1.2) wantSlide = true;
      if (r.slideCd > 0 && !r.sliding && r.onGround && edgeDist > 5) tryJump(r, false);
    }
    if (o.kind === "roller" && dz > 0.35 && dz < 3.4 && r.onGround) {
      const dx = r.pos.x - o.mesh.position.x;
      if (Math.abs(dx) < 2.4) tmp.x += Math.sign(dx || 1) * 0.9;
      if (Math.abs(dx) < 1.45 && dz < 2.4) wantSlide = true;
    }
    if (o.kind === "hammer" && o.head) {
      o.head.getWorldPosition(tmp2);
      const hd = tmp2.distanceTo(r.pos);
      if (hd < 3.4) tmp.x += Math.sign(r.pos.x - tmp2.x || 1) * 0.95;
      if (hd < 2.35 && r.onGround && dz > -0.2 && dz < 2.2) wantSlide = true;
    }
    if (o.kind === "bumper" && dz > 0.5 && dz < 2.8 && edgeDist > 3) {
      tmp.x += Math.sign(r.pos.x - o.mesh.position.x || 1) * 0.8;
    }
  }

  if (r.onGround && r.slideCd <= 0 && !r.sliding && !(cur && cur.moving)) {
    const gapSoon = gapSize > 0.35 && edgeDist < slideTravel + 1.8;
    if (!gapSoon && !onHex && edgeDist > 7 && gapSize < 0.35 && Math.abs(tmp.x) < 0.42) {
      wantSlide = true;
    }
    if (onHex && cur.shake < 0.1) wantSlide = true;
    if (cur && !onHex && cur.d < 11 && edgeDist > 3.2 && !gapSoon) wantSlide = true;
  }

  if (wantSlide) trySlide(r, false);

  if (!r.onGround && nxt) {
    tmp.x = THREE.MathUtils.clamp(predictedX(nxt, 0.35) - r.pos.x, -1, 1);
    tmp.z = 1;
  }

  for (const o of racers) {
    if (o === r) continue;
    const dx = r.pos.x - o.pos.x;
    const dz = r.pos.z - o.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 1.4 && d2 > 0.0001) {
      tmp.x += (dx / Math.sqrt(d2)) * 0.35;
    }
  }

  for (const w of winds) {
    if (r.pos.z > w.z0 - 1.2 && r.pos.z < w.z1) {
      const g = w.gust ? Math.sin(simTime * w.gust + (w.phase || 0)) : 1;
      if (Math.abs(g) > 0.25) tmp.x -= Math.sign(w.ax * g) * 0.9;
    }
  }
  for (const o of obstacles) {
    const dz = o.z - r.pos.z;
    if (o.kind === "door" && dz > -0.3 && dz < 8) {
      tmp.x = THREE.MathUtils.clamp(o.openX - r.pos.x, -1, 1);
    }
    if (o.kind === "jet" && dz > 0.15 && dz < 5.2 && o.lit(simTime)) {
      const dx = r.pos.x - o.x;
      if (Math.abs(dx) < 2.35) {
        tmp.x += Math.sign(dx || (r.id % 2 ? 1 : -1)) * 1;
        if (Math.abs(dx) < 1.15 && dz < 1.7) tmp.z = -0.6;
      }
    }
  }

  if (tmp.lengthSq() > 1) tmp.normalize();
  return tmp;
}

function isStandable(x, z, y) {
  const s = findSupport(x, z, y);
  return !!(s && !s.fallen && !(s.hex && s.shake > 0.12));
}

function bestSafeX(r) {
  let bestX = r.pos.x;
  let best = -1e9;
  for (let i = -6; i <= 6; i++) {
    const x = i * 0.95;
    if (r.failX != null && Math.abs(x - r.failX) < 1.2 && r.pos.z < r.failZ + 10) continue;
    let score = 0;
    let holeRun = 0;
    for (let d = 0.25; d <= 6; d += 0.5) {
      if (isStandable(x, r.pos.z + d, r.pos.y)) {
        score += 2;
        holeRun = 0;
      } else {
        holeRun += 1;
        score -= 3;
        if (holeRun >= 2) {
          score -= 14;
          break;
        }
      }
    }
    score -= Math.abs(x - r.pos.x) * 0.12;
    if (score > best) {
      best = score;
      bestX = x;
    }
  }
  return bestX;
}

function nearestSafe(r) {
  let best = null;
  let bestD = 40;
  for (const p of platforms) {
    if (p.fallen) continue;
    if (p.hex && (p.shake > 0.05 || p.mesh.position.y < -0.45)) continue;
    const dz = p.z - r.pos.z;
    if (dz < -1.4 || dz > 4.2) continue;
    const dx = p.x - r.pos.x;
    const d = dx * dx + dz * dz * 0.45 + (p.hex ? 1.5 : 0);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function recoverAI(r) {
  r.sliding = false;
  r.slideT = 0;
  const p = nearestSafe(r);
  if (p && !(p.hex && (p.shake > 0.05 || p.mesh.position.y < -0.45))) {
    r.pos.x = p.x;
    r.pos.z = THREE.MathUtils.clamp(r.pos.z, p.z - p.d / 2 + 0.25, p.z + p.d / 2 - 0.2);
    r.pos.y = p.y + 0.66;
    r.vel.x = 0;
    r.vel.y = 0;
    r.vel.z = Math.max(r.vel.z, 6);
    r.onGround = true;
    r.coyote = 0.14;
    r.groundPlat = p;
    r.safePos.set(r.pos.x, r.pos.y, r.pos.z);
    return;
  }
  const spawn = zoneSpawns[r.spawnIndex] || zoneSpawns[0];
  r.pos.set(THREE.MathUtils.clamp(r.lane, -4, 4), 0.66, spawn.z);
  r.vel.set(0, 0, 6);
  r.onGround = true;
  r.groundPlat = null;
  r.coyote = 0.14;
}

function predictedX(p, ahead) {
  if (!p.moving) return p.x;
  return Math.sin((simTime + ahead) * p.moveOmega + p.movePhase) * p.moveAmp;
}

function nextPlatform(r) {
  const zCut = r.pos.z + 0.45;
  let best = null;
  let bestKey = Infinity;
  for (const p of platforms) {
    if (p.fallen) continue;
    if (p.hex && (p.shake > 0.05 || p.mesh.position.y < -0.45)) continue;
    const minZ = p.z - p.d / 2;
    if (minZ <= zCut) continue;
    const dx = predictedX(p, 0.7) - r.pos.x;
    const key = minZ * 8 + Math.abs(dx) * 0.2;
    if (key < bestKey) {
      bestKey = key;
      best = p;
    }
  }
  return best;
}

function nearestMover(r) {
  let best = null;
  let bestD = 12;
  for (const p of platforms) {
    if (!p.moving) continue;
    const d = p.z - r.pos.z;
    if (d > -1.2 && d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function bestHexX(r) {
  let bestX = r.pos.x;
  let best = -1;
  for (let i = -3; i <= 3; i++) {
    const x = i * 1.95;
    let score = 0;
    for (let d = 0.4; d <= 6.2; d += 0.8) {
      const s = findSupport(x, r.pos.z + d, r.pos.y);
      if (s && !s.fallen && s.shake < 0.1) score += 1 + (s.hex ? 0.2 : 0);
    }
    if (score > best) {
      best = score;
      bestX = x;
    }
  }
  return bestX;
}

function gapAhead(r, dist = 5.1) {
  for (let d = 0.8; d <= dist; d += 0.65) {
    if (!findSupport(r.pos.x, r.pos.z + d, r.pos.y)) return true;
  }
  return false;
}

function tryJump(r, play) {
  if (r.sliding || r.jumpCd > 0 || r.finished || state !== "racing") return;
  if (!r.onGround && r.coyote <= 0) return;
  r.vel.y = JUMP_V;
  r.onGround = false;
  r.coyote = 0;
  r.jumpCd = 0.18;
  if (r.anim) r.anim.takeoff = 0.16;
  if (!r.me) r.vel.z = Math.max(r.vel.z, RUN_SPEED * r.skill);
  if (play) sfx.jump();
}

function trySlide(r, play) {
  if (r.slideCd > 0 || r.finished || state !== "racing") return;
  r.sliding = true;
  r.slideT = SLIDE_DUR;
  r.slideCd = r.me ? slideCooldown : AI_SLIDE_COOLDOWN;
  const fwd = r.vel.z >= 0 ? 1 : -1;
  r.vel.z += 5.8 * fwd * (r.me ? 1 : r.skill);
  if (play) sfx.slide();
}

function updateRacer(r, dt) {
  if (r.finished) {
    r.vel.set(0, 0, 0);
    r.mesh.position.copy(r.pos);
    animateBean(r, dt);
    return;
  }

  r.jumpCd = Math.max(0, r.jumpCd - dt);
  r.slideCd = Math.max(0, r.slideCd - dt);
  r.invuln = Math.max(0, r.invuln - dt);
  r.padT = Math.max(0, (r.padT || 0) - dt);
  if (!r.onGround) r.coyote = Math.max(0, r.coyote - dt);

  if (r.sliding) {
    r.slideT -= dt;
    if (r.slideT <= 0) r.sliding = false;
  }

  const moving = state === "racing";
  const wasGrounded = r.onGround;
  const wish = moving ? wishDir(r) : tmp.set(0, 0, 0);
  const wishX = wish.x;
  const wishZ = wish.z;
  const wishLen = wishX * wishX + wishZ * wishZ;

  if (r.me && moving) {
    if (keys.has("Space") || stick.jump) tryJump(r, true);
    if (keys.has("ShiftLeft") || keys.has("ShiftRight") || stick.slide) trySlide(r, true);
  }

  const maxSpd = r.sliding ? SLIDE_SPEED : r.onGround ? RUN_SPEED * r.skill : r.me ? AIR_SPEED * r.skill : RUN_SPEED * r.skill;
  const acc = r.onGround ? ACCEL : r.me ? AIR_ACCEL : 36;
  r.vel.x += wishX * acc * dt;
  r.vel.z += wishZ * acc * dt;

  const hz = Math.hypot(r.vel.x, r.vel.z);
  if (hz > maxSpd) {
    r.vel.x = (r.vel.x / hz) * maxSpd;
    r.vel.z = (r.vel.z / hz) * maxSpd;
  }

  const icy = r.onGround && r.groundPlat && r.groundPlat.ice;
  if (r.onGround && !r.sliding) {
    const damp = Math.exp(-(icy ? 2.05 : FRICTION) * dt);
    if (wishLen < 0.01) {
      r.vel.x *= damp;
      r.vel.z *= damp;
    } else if (!icy) {
      r.vel.x *= 0.92;
      r.vel.z *= 0.92;
    }
  }
  if (r.onGround && r.groundPlat && r.groundPlat.spin) {
    const gnd = r.groundPlat;
    r.vel.x += -(r.pos.z - gnd.z) * gnd.spin * dt * 5;
    r.vel.z += (r.pos.x - gnd.x) * gnd.spin * dt * 5;
  }
  const gust = windAccel(r.pos.z);
  if (gust) r.vel.x += gust * dt;

  r.vel.y += GRAVITY * dt;
  r.pos.x += r.vel.x * dt;
  r.pos.y += r.vel.y * dt;
  r.pos.z += r.vel.z * dt;
  if (r.onGround && r.groundPlat) {
    if (r.groundPlat.conveyZ) r.pos.z += r.groundPlat.conveyZ * dt;
    if (r.groundPlat.conveyX) r.pos.x += r.groundPlat.conveyX * dt;
  }

  const feetY = r.pos.y - feetOf(r);
  let support = findSupport(r.pos.x, r.pos.z, feetY);
  r.onGround = false;
  let launched = false;
  if (support && (r.padT || 0) <= 0 && (support.bounce || support.fanY) && r.vel.y <= 4) {
    const top = support.y;
    if (feetY <= top + 0.4 && feetY >= top - 0.9) {
      r.vel.y = support.fanY || support.bounce;
      if (support.fanZ) r.vel.z = Math.max(r.vel.z, support.fanZ);
      r.pos.y = top + feetOf(r) + 0.08;
      r.onGround = false;
      r.coyote = 0;
      r.padT = 0.55;
      r.groundPlat = null;
      launched = true;
    }
  }
  if (!launched && support && r.vel.y <= 3) {
    const top = support.y;
    if (feetY <= top + 0.14 && feetY >= top - 0.7) {
      r.pos.y = top + feetOf(r);
      r.vel.y = 0;
      r.onGround = true;
      r.coyote = 0.14;
      if (support.moving) r.pos.x += support.x - support.prevX;
      if (support.rails) {
        const maxX = support.x + support.w / 2 - RADIUS - 0.18;
        const minX = support.x - support.w / 2 + RADIUS + 0.18;
        r.pos.x = THREE.MathUtils.clamp(r.pos.x, minX, maxX);
      }
      if (typeof support.spawnIndex === "number") {
        r.spawnIndex = Math.max(r.spawnIndex, support.spawnIndex);
      }
      if (support.hex) support.shake += dt;
      if (!wasGrounded && r.anim) {
        r.anim.land = 1;
        if (r.me) dustBurst(r.pos, COARSE ? 4 : 7, 0xfff1d0);
      }
      if (!r.me && !(support.hex && support.shake > 0.08)) {
        r.safePos.set(r.pos.x, r.pos.y, r.pos.z);
      }
      r.groundPlat = support;
    }
  }
  if (!r.onGround) r.groundPlat = null;

  if (!r.me && moving && r.jumpCd <= 0 && r.vel.y <= 0.4) {
    if (wasGrounded && !isStandable(r.pos.x, r.pos.z, r.pos.y) && r.pos.y < 1.05) {
      recoverAI(r);
    }
  }

  collideWalls(r);

  if (r.invuln <= 0) {
    for (const o of obstacles) {
      if (o.hits(r)) {
        o.knock(r);
        r.invuln = 0.55;
        r.sliding = false;
        if (r.anim) r.anim.hit = 1;
        if (r.me) {
          sfx.bump();
          dustBurst(r.pos, 5, 0xffd0e0);
        }
        break;
      }
    }
  }

  for (const o of racers) {
    if (o === r || o.finished) continue;
    tmp.copy(r.pos).sub(o.pos);
    tmp.y = 0;
    const d = tmp.length();
    if (d < 0.95 && d > 0.0001) {
      tmp.multiplyScalar((0.95 - d) * (r.me || o.me ? 0.5 : 0.18));
      r.pos.add(tmp);
      o.pos.sub(tmp);
      r.vel.addScaledVector(tmp, 8);
    }
  }

  if (!r.me && moving && r.jumpCd <= 0 && r.vel.y <= 0.4 && r.pos.y < 0.2 && !isStandable(r.pos.x, r.pos.z, r.pos.y)) {
    recoverAI(r);
  }

  if (r.pos.y < -8) {
    if (!r.me) {
      r.failX = r.pos.x;
      r.failZ = r.pos.z;
    }
    const spawn = zoneSpawns[r.spawnIndex] || zoneSpawns[0];
    let x = r.me ? 0 : THREE.MathUtils.clamp(r.lane, -4, 4);
    if (!r.me && r.failX != null && Math.abs(x - r.failX) < 1.6) x += x >= 0 ? -2.4 : 2.4;
    r.pos.set(x, 0.66, spawn.z);
    r.vel.set(0, 0, 6);
    r.onGround = true;
    r.sliding = false;
    r.invuln = 0.9;
    r.safePos.set(r.pos.x, r.pos.y, r.pos.z);
  }

  if (moving && r.pos.z >= FINISH_Z && r.pos.y > 0) {
    r.finished = true;
    r.finishTime = raceTime;
    r.pos.z = FINISH_Z + Math.min(2, r.id * 0.15);
    if (r.me) {
      sfx.finish();
      burst(r.pos);
    }
  }

  const look = new THREE.Vector3(r.vel.x, 0, r.vel.z);
  if (look.length() > 0.35) r.yaw = Math.atan2(look.x, look.z);
  r.mesh.position.copy(r.pos);
  r.mesh.rotation.y = r.yaw;
  animateBean(r, dt);
}

function animateBean(r, dt) {
  const u = r.mesh.userData;
  const rig = u.rig;
  if (!rig || !r.anim) return;
  const a = r.anim;
  const spd = Math.hypot(r.vel.x, r.vel.z);
  const moving = spd > 0.7 && r.onGround && !r.sliding && !r.finished;
  a.run = THREE.MathUtils.damp(a.run, moving ? 1 : 0, 8, dt);
  a.slide = THREE.MathUtils.damp(a.slide, r.sliding ? 1 : 0, 14, dt);
  a.air = THREE.MathUtils.damp(a.air, !r.onGround && !r.sliding ? 1 : 0, 10, dt);
  a.land = Math.max(0, a.land - dt * 3.4);
  a.hit = Math.max(0, a.hit - dt * 1.7);
  a.takeoff = Math.max(0, a.takeoff - dt);
  a.fail = THREE.MathUtils.damp(a.fail, r.pos.y < -0.2 && r.vel.y < -3 ? 1 : 0, 6, dt);
  a.blink -= dt;
  if (a.blink < -0.12) a.blink = 2.2 + Math.random() * 2.8;

  const cycle = moving ? 11 + spd * 0.35 : 2.2;
  a.phase += dt * cycle;
  const swing = Math.sin(a.phase);
  const bobWave = Math.sin(a.phase * 2);

  let armL = moving ? -swing * 0.95 : Math.sin(simTime * 1.6 + r.id) * 0.18;
  let armR = moving ? swing * 0.95 : -Math.sin(simTime * 1.6 + r.id) * 0.18;
  let legL = moving ? swing * 0.95 : 0;
  let legR = moving ? -swing * 0.95 : 0;
  let lean = moving ? 0.18 : 0;
  let bob = moving ? Math.abs(bobWave) * 0.07 : Math.sin(simTime * 2.2 + r.id) * 0.035;
  let squash = 1;
  let stretch = 1;

  if (a.air > 0.2) {
    const rising = r.vel.y > 1.2;
    const tuck = rising ? -1.15 : -0.35;
    armL = tuck;
    armR = tuck;
    legL = rising ? -0.9 : 0.35;
    legR = rising ? -0.55 : 0.15;
    lean = rising ? -0.28 : 0.22;
    bob = 0;
    stretch = rising ? 1.16 : 1.08;
    squash = rising ? 0.9 : 0.94;
  }
  if (a.takeoff > 0.08) {
    squash = 1.16;
    stretch = 0.82;
    lean = 0.2;
  } else if (a.takeoff > 0) {
    stretch = 1.22;
    squash = 0.86;
    lean = -0.35;
  }
  if (a.slide > 0.15) {
    const s = a.slide;
    armL = armL * (1 - s) + -1.35 * s;
    armR = armR * (1 - s) + -1.35 * s;
    legL = legL * (1 - s) + 0.7 * s;
    legR = legR * (1 - s) + 0.85 * s;
    lean = lean * (1 - s) + 1.15 * s;
    bob = bob * (1 - s) - 0.16 * s;
    squash = squash * (1 - s) + 1.38 * s;
    stretch = stretch * (1 - s) + 0.48 * s;
  }
  if (a.land > 0.02 && a.slide < 0.2) {
    const k = Math.min(1, a.land);
    squash = 1 + k * 0.28;
    stretch = 1 - k * 0.28;
    bob -= k * 0.06;
  }
  if (a.hit > 0.05) {
    const k = Math.min(1, a.hit);
    squash = 1 + k * 0.22;
    stretch = 1 - k * 0.18;
    armL = 0.8;
    armR = -0.4;
    legL = 0.4;
    legR = -0.2;
  }
  if (a.fail > 0.2) {
    armL = Math.sin(simTime * 14) * 1.2;
    armR = Math.cos(simTime * 14) * 1.2;
    legL = Math.sin(simTime * 11) * 0.8;
    legR = Math.cos(simTime * 11) * 0.8;
    lean = 0.4;
  }
  if (r.finished) {
    armL = -2.2;
    armR = -2.2;
    legL = Math.sin(simTime * 8) * 0.35;
    legR = -Math.sin(simTime * 8) * 0.35;
    bob = Math.abs(Math.sin(simTime * 8)) * 0.08;
    lean = -0.1;
    squash = 1;
    stretch = 1.05;
  }

  const lam = 16;
  a.armL = THREE.MathUtils.damp(a.armL, armL, lam, dt);
  a.armR = THREE.MathUtils.damp(a.armR, armR, lam, dt);
  a.legL = THREE.MathUtils.damp(a.legL, legL, lam, dt);
  a.legR = THREE.MathUtils.damp(a.legR, legR, lam, dt);
  a.lean = THREE.MathUtils.damp(a.lean, lean, 12, dt);
  a.bob = THREE.MathUtils.damp(a.bob, bob, 12, dt);
  a.squash = THREE.MathUtils.damp(a.squash, squash, 14, dt);
  a.stretch = THREE.MathUtils.damp(a.stretch, stretch, 14, dt);
  a.roll = THREE.MathUtils.damp(a.roll, a.hit > 0.05 ? Math.sin(simTime * 18) * 0.35 * a.hit : 0, 10, dt);

  u.armL.rotation.x = a.armL;
  u.armR.rotation.x = a.armR;
  u.armL.rotation.z = -0.85;
  u.armR.rotation.z = 0.85;
  u.legL.rotation.x = a.legL;
  u.legR.rotation.x = a.legR;
  rig.rotation.x = a.lean;
  rig.rotation.z = a.roll;
  rig.position.y = a.bob;
  u.body.scale.set(1.02 * a.squash, 1.16 * a.stretch, 0.9 * a.squash);

  const blink = a.blink < 0.1 ? 0.12 : 1;
  u.eyeL.sclera.scale.y = THREE.MathUtils.damp(u.eyeL.sclera.scale.y, blink, 28, dt);
  u.eyeR.sclera.scale.y = u.eyeL.sclera.scale.y;
  const dizzy = a.hit > 0.05 || a.fail > 0.3 ? Math.sin(simTime * 22) * 0.04 : 0;
  u.eyeL.pupil.position.x = dizzy;
  u.eyeR.pupil.position.x = -dizzy;
  const oMouth = a.air > 0.45 || a.hit > 0.4 ? 1.35 : 1;
  u.smile.scale.y = THREE.MathUtils.damp(u.smile.scale.y, oMouth, 10, dt);
  u.smile.scale.x = THREE.MathUtils.damp(u.smile.scale.x, a.air > 0.45 ? 0.72 : 1, 10, dt);
  u.sprout.rotation.z = Math.sin(simTime * 3 + r.id) * 0.18 + a.lean * 0.2;

  const lineOp = a.slide * 0.72;
  u.lines.visible = lineOp > 0.08;
  u.lines.children.forEach((ln, i) => {
    ln.material.opacity = lineOp * (0.45 + 0.15 * Math.sin(simTime * 28 + i));
    ln.position.z = -0.5 - i * 0.12 - (simTime * 3) % 0.25;
  });

  const lift = Math.max(0, r.pos.y - 0.66);
  u.blob.position.y = -0.62 - lift;
  u.blob.material.opacity = 0.24 * Math.max(0.15, 1 - lift / 3.2);
  const sc = 1 + lift * 0.18 + a.slide * 0.35;
  u.blob.scale.set(sc, sc, sc);

  if (r.me && r.onGround && moving) {
    a.step += dt * spd;
    if (a.step > 1.15) {
      a.step = 0;
      dustBurst(r.pos, 2, 0xfff6e0);
    }
  }
  if (r.me && r.sliding && a.step > -1) {
    a.step -= dt;
    if (a.step < -0.06) {
      a.step = 0.2;
      dustBurst(r.pos, 3, 0xfffdf8);
    }
  }
}

function dustBurst(pos, n, color) {
  for (let i = 0; i < n; i++) {
    let m = motes.find((p) => !p.alive);
    if (!m) {
      if (motes.length >= MOTE_MAX) continue;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 6, 4),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false })
      );
      scene.add(mesh);
      m = { mesh, vel: new THREE.Vector3(), life: 0, max: 0.4, alive: false };
      motes.push(m);
    }
    m.alive = true;
    m.max = 0.28 + Math.random() * 0.22;
    m.life = m.max;
    m.mesh.position.set(pos.x + (Math.random() - 0.5) * 0.45, Math.max(0.05, pos.y - 0.5), pos.z + (Math.random() - 0.5) * 0.3);
    m.vel.set((Math.random() - 0.5) * 1.8, 0.5 + Math.random() * 1.2, -0.6 - Math.random() * 0.8);
    m.mesh.material.color.setHex(color);
    m.mesh.material.opacity = 0.8;
    m.mesh.visible = true;
    m.mesh.scale.setScalar(0.7 + Math.random() * 0.6);
  }
}

function updateMotes(dt) {
  for (const m of motes) {
    if (!m.alive) continue;
    m.life -= dt;
    m.vel.y -= 3.2 * dt;
    m.mesh.position.addScaledVector(m.vel, dt);
    m.mesh.material.opacity = Math.max(0, (m.life / m.max) * 0.75);
    if (m.life <= 0) {
      m.alive = false;
      m.mesh.visible = false;
    }
  }
  for (const g of glints) {
    g.rotation.y += dt * 1.8;
    g.rotation.z += dt * 0.6;
    const p = 0.55 + Math.sin(simTime * 4 + g.position.x) * 0.35;
    g.material.opacity = p;
    g.scale.setScalar(0.85 + p * 0.35);
  }
  for (const p of petals) {
    p.mesh.position.x = p.base.x + Math.sin(simTime * p.sp + p.ph) * 0.8;
    p.mesh.position.y = p.base.y + Math.sin(simTime * p.sp * 0.7 + p.ph) * 0.35;
    p.mesh.rotation.z += dt * p.sp;
  }
}

function burst(origin) {
  const geo = new THREE.SphereGeometry(0.12, 6, 6);
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: COLORS[i % COLORS.length],
        roughness: 0.4,
      })
    );
    m.position.copy(origin);
    m.position.y += 1;
    scene.add(m);
    confetti.push({
      mesh: m,
      vel: new THREE.Vector3((Math.random() - 0.5) * 8, 6 + Math.random() * 6, (Math.random() - 0.5) * 8),
    });
  }
}

function liveRank(player) {
  const better = racers.filter((r) => {
    if (r === player) return false;
    if (r.finished && !player.finished) return true;
    if (!r.finished && player.finished) return false;
    if (r.finished && player.finished) return r.finishTime < player.finishTime;
    return r.pos.z > player.pos.z;
  }).length;
  return better + 1;
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

function showResults() {
  if (resultShown) return;
  resultShown = true;
  const me = racers[0];
  const ranked = [...racers].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished) return a.finishTime - b.finishTime;
    return b.pos.z - a.pos.z;
  });
  const place = ranked.findIndex((r) => r.me) + 1;
  document.getElementById("result-title").textContent = place === 1 ? "1등이에요!" : `${place}등으로 골인!`;
  document.getElementById("result-sub").textContent = `기록 ${formatTime(me.finishTime)} · 다시 달리면 더 빨라질지도?`;
  boardEl.innerHTML = ranked
    .map((r, i) => {
      const rec = r.finished ? formatTime(r.finishTime) : "완주 중";
      return `<li class="${r.me ? "me" : ""}"><span class="place">${i + 1}</span><span>${r.name}${r.me ? " (나)" : ""}</span><span>${rec}</span></li>`;
    })
    .join("");
  resultEl.classList.remove("hidden");
}

function updateHud() {
  const me = racers[0];
  rankEl.textContent = String(liveRank(me));
  timeEl.textContent = formatTime(raceTime);
  progressEl.style.width = `${THREE.MathUtils.clamp((me.pos.z / FINISH_Z) * 100, 0, 100)}%`;
  const ready = me.slideCd <= 0;
  slideFill.style.width = ready ? "100%" : `${((slideCooldown - me.slideCd) / slideCooldown) * 100}%`;
  slideHint.textContent = ready ? "준비됨" : `${me.slideCd.toFixed(1)}초`;
  slideCdEl.classList.toggle("ready", ready);
}

function updateCamera(dt) {
  const me = racers[0];
  tmp.set(me.pos.x * 0.4 + 1.45, Math.max(me.pos.y, 0.2) + 3.8, me.pos.z - 7.1);
  camera.position.lerp(tmp, 1 - Math.exp(-dt * 4.5));
  tmp2.set(me.pos.x * 0.4, Math.max(me.pos.y, 0.2) + 1.1, me.pos.z + 6);
  camera.lookAt(tmp2);
  sun.position.set(me.pos.x + 10, 22, me.pos.z - 8);
  sun.target.position.set(me.pos.x, 0, me.pos.z + 6);
  sun.target.updateMatrixWorld();
}

let simTime = 0;
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  simTime = now / 1000;

  if (state === "racing") raceTime += dt;

  for (const o of obstacles) o.update(now / 1000);
  for (const p of platforms) {
    if (p.updateMove) p.updateMove(now / 1000);
    if (p.hex && p.shake > 0.32 && !p.fallen) {
      p.fallen = true;
      p.fallV = 0;
    }
    if (p.hex && p.shake > 0 && !p.fallen) {
      p.mesh.position.y = -p.thick / 2 + Math.sin(now * 0.04) * 0.06;
    }
    if (p.fallen) {
      p.fallV = (p.fallV || 0) + 28 * dt;
      p.mesh.position.y -= p.fallV * dt;
    }
    if (p.blades) p.blades.rotation.y = now * 0.006;
    if (p.stripe) p.stripe.rotation.y = now * 0.003;
    if (p.jelly) p.jelly.scale.y = 0.38 + Math.sin(now * 0.006) * 0.07;
    if (p.beltArrows && p.conveyZ) {
      const min = p.z - p.d / 2 + 0.6;
      const max = p.z + p.d / 2 - 0.6;
      for (const a of p.beltArrows) {
        a.position.z += p.conveyZ * dt * 0.45;
        if (a.position.z > max) a.position.z = min;
        if (a.position.z < min) a.position.z = max;
      }
    }
  }

  for (const r of racers) updateRacer(r, dt);

  for (const c of confetti) {
    c.vel.y -= 18 * dt;
    c.mesh.position.addScaledVector(c.vel, dt);
    c.mesh.rotation.x += dt * 4;
  }
  for (const flag of flags) {
    flag.rotation.y = Math.sin(simTime * 3 + flag.position.x) * 0.35;
  }
  updateMotes(dt);
  if (racers[0]) updateAtmosphere(racers[0].pos.z);

  if (state === "racing" || state === "start" || state === "countdown") updateCamera(dt);
  if (state === "racing") {
    updateHud();
    if (racers[0].finished) {
      state = "done";
      hud.classList.add("hidden");
      document.getElementById("touch-ui")?.classList.add("hidden");
      setTimeout(showResults, 650);
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

window.addEventListener("keydown", (e) => {
  if (state === "start" && !e.repeat) {
    if (e.code === "ArrowLeft" || e.code === "KeyA") {
      selectMap(mapIndex - 1);
      e.preventDefault();
      return;
    }
    if (e.code === "ArrowRight" || e.code === "KeyD") {
      selectMap(mapIndex + 1);
      e.preventDefault();
      return;
    }
    if (e.code === "Enter" || e.code === "Space") {
      e.preventDefault();
      beginRace();
      return;
    }
  }
  keys.add(e.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  stick.jump = false;
  stick.slide = false;
});
window.addEventListener("resize", onResize);

function bindStick(root) {
  if (!root) return;
  const knob = root.querySelector(".stick-knob");
  const max = 42;
  let pid = null;
  const end = () => {
    pid = null;
    stick.nx = 0;
    stick.ny = 0;
    stick.active = false;
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
    stick.active = k > 0.14;
    if (knob) knob.style.transform = `translate(calc(-50% + ${stick.nx * max}px), calc(-50% + ${stick.ny * max}px))`;
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

function bindHold(el, prop) {
  if (!el) return;
  const down = (e) => {
    e.preventDefault();
    stick[prop] = true;
  };
  const up = () => {
    stick[prop] = false;
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("lostpointercapture", up);
}

bindStick(document.getElementById("stick"));
bindHold(document.getElementById("btn-jump"), "jump");
bindHold(document.getElementById("btn-slide"), "slide");
canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

function applyDifficulty(id) {
  const diff = DIFFICULTIES[id] || DIFFICULTIES.normal;
  difficultyId = DIFFICULTIES[id] ? id : "normal";
  slideCooldown = diff.cd;
  sessionStorage.setItem(DIFF_KEY, difficultyId);
  const label = document.getElementById("slide-cd-label");
  const keysLine = document.getElementById("hud-keys");
  if (label) label.textContent = diff.label;
  if (keysLine) {
    keysLine.textContent = `방향키 / WASD 이동 · 스페이스 점프 · Shift 슬라이딩 (${diff.label} 쿨타임)`;
  }
  document.querySelectorAll(".diff-btn").forEach((btn) => {
    const on = btn.dataset.diff === difficultyId;
    btn.classList.toggle("selected", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

document.querySelectorAll(".diff-btn").forEach((btn) => {
  btn.addEventListener("click", () => applyDifficulty(btn.dataset.diff));
});
applyDifficulty(sessionStorage.getItem(DIFF_KEY) || "normal");

function beginRace() {
  if (state === "countdown" || state === "racing") return;
  sfx.boot();
  startEl.classList.add("hidden");
  resultEl.classList.add("hidden");
  hud.classList.remove("hidden");
  document.getElementById("touch-ui")?.classList.remove("hidden");
  state = "countdown";
  countEl.classList.remove("hidden");
  const seq = ["3", "2", "1", "GO"];
  let i = 0;
  const step = () => {
    countNum.textContent = seq[i];
    sfx.count(seq[i]);
    i += 1;
    if (i < seq.length) setTimeout(step, 700);
    else {
      setTimeout(() => {
        countEl.classList.add("hidden");
        state = "racing";
        raceTime = 0;
      }, 520);
    }
  };
  step();
}

document.getElementById("btn-start").addEventListener("click", beginRace);

document.getElementById("btn-retry").addEventListener("click", () => {
  selectMap(mapIndex, true);
  beginRace();
});
document.getElementById("btn-maps").addEventListener("click", () => {
  selectMap(mapIndex, true);
  state = "start";
  resultEl.classList.add("hidden");
  countEl.classList.add("hidden");
  hud.classList.add("hidden");
  document.getElementById("touch-ui")?.classList.add("hidden");
  startEl.classList.remove("hidden");
});
muteBtn.addEventListener("click", () => {
  sfx.enabled = !sfx.enabled;
  muteBtn.textContent = sfx.enabled ? "🔊" : "🔇";
  if (sfx.enabled) sfx.boot();
});

const MAP_KEY = "bean-run-map";
const MAPS = [
  {
    id: "classic",
    name: "콩밭 서킷",
    difficulty: "보통",
    blurb: "회전봉, 해머, 무빙 발판, 무너지는 타일. 처음 그 코스.",
    sky: ["#7eb6ff", "#fff1d0"],
    road: "#ff9ec8",
    mark: "#ff4d8d",
    path: [[0.5, 0.08], [0.5, 0.92]],
    marks: [[0.5, 0.28], [0.5, 0.55], [0.42, 0.72], [0.58, 0.72]],
  },
  {
    id: "candy",
    name: "사탕 공장",
    difficulty: "어려움",
    blurb: "컨베이어, 막대사탕 해머, 젤리 점프, 가짜 문.",
    sky: ["#ff8fb8", "#fff3c4"],
    road: "#ff6b9d",
    mark: "#ffe066",
    path: [[0.5, 0.08], [0.5, 0.42], [0.28, 0.62], [0.5, 0.78], [0.5, 0.94]],
    marks: [[0.5, 0.24], [0.5, 0.4], [0.72, 0.62], [0.5, 0.86]],
  },
  {
    id: "lava",
    name: "용암 협곡",
    difficulty: "어려움",
    blurb: "불기둥, 회전 빔, 무너지는 발판, 용암 위 무빙.",
    sky: ["#ff6a3d", "#ffd0a0"],
    road: "#ffb070",
    mark: "#ffe066",
    path: [[0.5, 0.08], [0.5, 0.34], [0.34, 0.5], [0.66, 0.66], [0.5, 0.94]],
    marks: [[0.32, 0.22], [0.68, 0.22], [0.5, 0.48], [0.5, 0.78]],
  },
  {
    id: "sky",
    name: "하늘 빙판",
    difficulty: "어려움",
    blurb: "미끄러운 얼음, 돌풍, 구름 발판, 팬 발사.",
    sky: ["#8ec8ff", "#ffffff"],
    road: "#d7f0ff",
    mark: "#ff8fb8",
    path: [[0.5, 0.08], [0.42, 0.36], [0.58, 0.58], [0.36, 0.74], [0.62, 0.74], [0.5, 0.94]],
    marks: [[0.5, 0.22], [0.5, 0.46], [0.62, 0.74], [0.5, 0.88]],
  },
];
let mapIndex = 0;

function drawPreview(canvas, map) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, map.sky[0]);
  g.addColorStop(1, map.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(43,33,64,0.25)";
  ctx.lineWidth = 22;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  map.path.forEach((p, i) => {
    const x = p[0] * w;
    const y = p[1] * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.strokeStyle = map.road;
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.fillStyle = map.mark;
  for (const p of map.marks) {
    ctx.beginPath();
    ctx.arc(p[0] * w, p[1] * h, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2b2140";
    ctx.stroke();
  }
}

function renderMapCards() {
  const list = document.getElementById("map-list");
  if (!list) return;
  list.innerHTML = "";
  MAPS.forEach((map, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `map-card${i === mapIndex ? " on" : ""}`;
    btn.setAttribute("aria-pressed", i === mapIndex ? "true" : "false");
    const canvas = document.createElement("canvas");
    canvas.width = 264;
    canvas.height = 144;
    canvas.className = "map-preview";
    drawPreview(canvas, map);
    const body = document.createElement("span");
    body.className = "map-copy";
    body.innerHTML = `<b>${map.name}</b><em>${map.difficulty}</em><small>${map.blurb}</small>`;
    btn.append(canvas, body);
    btn.addEventListener("click", () => selectMap(i));
    list.appendChild(btn);
  });
}

function snapCamera() {
  const me = racers[0];
  if (!me) return;
  camera.position.set(me.pos.x * 0.4 + 1.45, Math.max(me.pos.y, 0.2) + 3.8, me.pos.z - 7.1);
  camera.lookAt(me.pos.x * 0.4, me.pos.y + 1.1, me.pos.z + 6);
}

function resetRacers() {
  const xs = [-5.25, -3.75, -2.25, -0.75, 0.75, 2.25, 3.75, 5.25];
  for (const r of racers) {
    const i = r.id;
    const me = r.me;
    r.pos.set(me ? 0 : xs[i], 0.66, me ? 4 : 2 + (i % 3) * 0.4);
    r.vel.set(0, 0, 0);
    r.yaw = 0;
    r.onGround = true;
    r.sliding = false;
    r.slideT = 0;
    r.slideCd = 0;
    r.jumpCd = 0;
    r.coyote = 0.14;
    r.invuln = 0;
    r.padT = 0;
    r.finished = false;
    r.finishTime = 0;
    r.spawnIndex = 0;
    r.failX = null;
    r.groundPlat = null;
    r.checkpoint.set(r.pos.x, 0.66, r.pos.z);
    r.safePos.copy(r.pos);
    r.anim = freshAnim();
    r.mesh.position.copy(r.pos);
  }
  raceTime = 0;
  resultShown = false;
}

function selectMap(i, force = false) {
  const next = (i + MAPS.length) % MAPS.length;
  const changed = force || next !== mapIndex || platforms.length === 0;
  mapIndex = next;
  activeMap = MAPS[mapIndex];
  try {
    sessionStorage.setItem(MAP_KEY, activeMap.id);
  } catch (err) {
    /* private mode */
  }
  if (changed) {
    buildWorld();
    if (racers.length) resetRacers();
    snapCamera();
  }
  renderMapCards();
  const hudMap = document.getElementById("hud-map");
  if (hudMap) hudMap.textContent = activeMap.name;
}

spawnRacers();
{
  const saved = sessionStorage.getItem(MAP_KEY);
  const found = MAPS.findIndex((m) => m.id === saved);
  selectMap(found >= 0 ? found : 0, true);
}
window.__beanRun = {
  get state() {
    return state;
  },
  get time() {
    return raceTime;
  },
  get difficulty() {
    return difficultyId;
  },
  get map() {
    return activeMap ? activeMap.id : "classic";
  },
  get slideCooldown() {
    return slideCooldown;
  },
  snapshot() {
    return racers.map((r) => ({
      name: r.name,
      me: r.me,
      z: r.pos.z,
      x: r.pos.x,
      y: r.pos.y,
      finished: r.finished,
    }));
  },
};
requestAnimationFrame(tick);
