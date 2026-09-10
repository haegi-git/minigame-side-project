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
const SLIDE_COOLDOWN = 2.5;
const RADIUS = 0.46;

const NAMES = ["나", "콩이", "뭉치", "토실", "뽀송", "말랑", "쪼꼬", "하리"];
const COLORS = [0xff7eb3, 0x7ce7c4, 0xffe066, 0x8ec5ff, 0xd4b3ff, 0xffb085, 0x9bf6ff, 0xbaf55b];

const keys = new Set();
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

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ad8ff);
scene.fog = new THREE.Fog(0x9ad8ff, 48, 150);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 6, -8);

const hemi = new THREE.HemisphereLight(0xfff1c9, 0x7ecbff, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(sun.target);

const platforms = [];
const walls = [];
const obstacles = [];
const racers = [];
const confetti = [];
const zoneSpawns = [];

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
  scene.add(mesh);
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
      scene.add(rail);
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
  scene.add(g);
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
  scene.add(group);
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

function makeLowBar(z, bob = false) {
  const gate = new THREE.Group();
  gate.position.set(0, 0, z);
  for (const x of [-6.5, 6.5]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.7, 10), MAT.post);
    post.position.set(x, 0.85, 0);
    post.castShadow = true;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), MAT.spinHub);
    ball.position.set(x, 1.75, 0);
    gate.add(post, ball);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.22, 0.32), MAT.gate);
  lintel.position.y = 1.72;
  gate.add(lintel);
  const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 12.4, 6, 10), MAT.low);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 0.88;
  bar.castShadow = true;
  gate.add(bar);
  scene.add(gate);
  obstacles.push({
    kind: "low",
    z,
    mesh: gate,
    update(t) {
      if (bob) bar.position.y = 0.78 + Math.abs(Math.sin(t * 2.4)) * 0.42;
    },
    hits(r) {
      if (r.sliding) return false;
      return Math.abs(r.pos.z - z) < 0.55 && Math.abs(r.pos.x) < 6.6 && r.pos.y < bar.position.y + 0.35;
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
  scene.add(pivot);
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
  scene.add(mesh);
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
  scene.add(group);
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

function makeHexField(z0, rows, cols) {
  const pal = [0xff7eb3, 0x7ce7c4, 0xffe066, 0x8ec5ff, 0xd4b3ff, 0xffb085];
  const span = 1.95;
  for (let iz = 0; iz < rows; iz++) {
    for (let ix = 0; ix < cols; ix++) {
      if (iz > 1 && (ix + iz * 3) % 7 === 0) continue;
      const x = (ix - (cols - 1) / 2) * span;
      const z = z0 + iz * span;
      const thick = 0.42;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.92, 0.92, thick, 6),
        new THREE.MeshStandardMaterial({ color: pal[(ix + iz) % pal.length], roughness: 0.42 })
      );
      mesh.position.set(x, -thick / 2, z);
      mesh.rotation.y = Math.PI / 6;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      scene.add(mesh);
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
    g.add(pole, flag);
  }
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(13.2, 0.08, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffc24b, emissiveIntensity: 0.35 })
  );
  line.position.y = 0.06;
  g.add(line);
  scene.add(g);
}

function addSpawnPad(z0, z1, color) {
  const plat = strip(z0, z1, color);
  plat.spawnPad = true;
  plat.spawnIndex = zoneSpawns.length;
  const z = z0 + 2.4;
  zoneSpawns.push({ x: 0, y: 0.66, z });
  makeGate(z);
  candy(-6.6, z, 0xff8fb8);
  candy(6.6, z, 0x7ce7c4);
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
  scene.add(g);
}

function buildWorld() {
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
    new THREE.MeshStandardMaterial({ color: 0xff8fb8, side: THREE.DoubleSide })
  );
  banner.position.set(0, 3.5, FINISH_Z - 0.1);
  arch.add(colL, colR, beam, banner);
  scene.add(arch);

  const finish = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.08, 2.4),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  finish.position.set(0, 0.04, FINISH_Z);
  scene.add(finish);

  for (let i = 0; i < 22; i++) {
    addCloud((Math.random() - 0.5) * 90, 8 + Math.random() * 12, i * 22 + Math.random() * 10, 1.1 + Math.random());
  }

  const groundFog = new THREE.Mesh(
    new THREE.CircleGeometry(80, 24),
    new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
  );
  groundFog.rotation.x = -Math.PI / 2;
  groundFog.position.y = -18;
  scene.add(groundFog);
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

function createBean(color, name, me) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.36,
    metalness: 0.05,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.52, 22, 16), bodyMat);
  body.scale.set(1.08, 1.28, 0.96);
  body.castShadow = true;
  inner.add(body);

  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 })
  );
  belly.position.set(0, -0.1, 0.32);
  belly.scale.set(1.05, 0.85, 0.45);
  inner.add(belly);

  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x2b2140 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), eyeWhite);
    eye.position.set(s * 0.16, 0.18, 0.42);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), pupilMat);
    pupil.position.set(s * 0.16, 0.16, 0.52);
    inner.add(eye, pupil);
  }

  const blushMat = new THREE.MeshStandardMaterial({ color: 0xff8aa8, transparent: true, opacity: 0.55 });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), blushMat);
    b.position.set(s * 0.32, 0.02, 0.4);
    b.scale.set(1.2, 0.7, 0.5);
    inner.add(b);
  }

  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.018, 8, 12, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x2b2140 })
  );
  smile.position.set(0, 0.02, 0.5);
  smile.rotation.set(0, 0, Math.PI);
  inner.add(smile);

  const armMat = bodyMat;
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), armMat);
    arm.position.set(s * 0.52, -0.02, 0.05);
    arm.castShadow = true;
    inner.add(arm);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), bodyMat);
    foot.position.set(s * 0.18, -0.58, 0.08);
    inner.add(foot);
  }

  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), bodyMat);
  tuft.position.set(0, 0.7, -0.04);
  inner.add(tuft);
  const spot = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })
  );
  spot.position.set(0.12, 0.08, -0.46);
  inner.add(spot);

  const label = makeLabel(name, me);
  root.add(label);
  root.userData.inner = inner;
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
      mesh: createBean(COLORS[i], NAMES[i], me),
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
    tmp.set(x, 0, z);
    if (tmp.lengthSq() > 1) tmp.normalize();
    return tmp;
  }

  tmp.set(0, 0, 1);
  tmp.x = 0;

  const cur = findSupport(r.pos.x, r.pos.z, r.pos.y);
  const nxt = nextPlatform(r);
  const onHex = !!(cur && cur.hex);
  const hexZone = onHex || (nxt && nxt.hex) || (r.pos.z > 298 && r.pos.z < 334);
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
    if (o.kind === "low" && dz > 0.65 && dz < 4.4) wantSlide = true;
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
    r.safePos.set(r.pos.x, r.pos.y, r.pos.z);
    return;
  }
  const spawn = zoneSpawns[r.spawnIndex] || zoneSpawns[0];
  r.pos.set(THREE.MathUtils.clamp(r.lane, -4, 4), 0.66, spawn.z);
  r.vel.set(0, 0, 6);
  r.onGround = true;
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
  if (!r.me) r.vel.z = Math.max(r.vel.z, RUN_SPEED * r.skill);
  if (play) sfx.jump();
}

function trySlide(r, play) {
  if (r.slideCd > 0 || r.finished || state !== "racing") return;
  r.sliding = true;
  r.slideT = SLIDE_DUR;
  r.slideCd = SLIDE_COOLDOWN;
  const fwd = r.vel.z >= 0 ? 1 : -1;
  r.vel.z += 5.8 * fwd * (r.me ? 1 : r.skill);
  if (play) sfx.slide();
}

function updateRacer(r, dt) {
  if (r.finished) {
    r.vel.set(0, 0, 0);
    r.mesh.position.copy(r.pos);
    return;
  }

  r.jumpCd = Math.max(0, r.jumpCd - dt);
  r.slideCd = Math.max(0, r.slideCd - dt);
  r.invuln = Math.max(0, r.invuln - dt);
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
    if (keys.has("Space")) tryJump(r, true);
    if (keys.has("ShiftLeft") || keys.has("ShiftRight")) trySlide(r, true);
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

  if (r.onGround && !r.sliding) {
    const damp = Math.exp(-FRICTION * dt);
    if (wishLen < 0.01) {
      r.vel.x *= damp;
      r.vel.z *= damp;
    } else {
      r.vel.x *= 0.92;
      r.vel.z *= 0.92;
    }
  }

  r.vel.y += GRAVITY * dt;
  r.pos.x += r.vel.x * dt;
  r.pos.y += r.vel.y * dt;
  r.pos.z += r.vel.z * dt;

  const feetY = r.pos.y - feetOf(r);
  const support = findSupport(r.pos.x, r.pos.z, feetY);
  r.onGround = false;
  if (support && r.vel.y <= 3) {
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
      if (!r.me && !(support.hex && support.shake > 0.08)) {
        r.safePos.set(r.pos.x, r.pos.y, r.pos.z);
      }
    }
  }

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
        if (r.me) sfx.bump();
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
  animateBean(r);
}

function animateBean(r) {
  const inner = r.mesh.userData.inner;
  if (r.sliding) {
    inner.scale.set(1.35, 0.4, 1.28);
    inner.rotation.x = 1.05;
    inner.position.y = -0.12;
  } else if (!r.onGround) {
    inner.scale.set(0.88, 1.28, 0.88);
    inner.rotation.x = -0.15;
    inner.position.y = 0;
  } else {
    const spd = Math.hypot(r.vel.x, r.vel.z);
    const bob = Math.abs(Math.sin(performance.now() * 0.01 * (1 + spd))) * (spd > 0.8 ? 0.1 : 0.045);
    inner.position.y = bob;
    inner.scale.set(1 + bob * 0.35, 1 - bob * 0.25, 1);
    inner.rotation.x = 0;
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
  slideFill.style.width = ready ? "100%" : `${((SLIDE_COOLDOWN - me.slideCd) / SLIDE_COOLDOWN) * 100}%`;
  slideHint.textContent = ready ? "준비됨" : `${me.slideCd.toFixed(1)}초`;
  slideCdEl.classList.toggle("ready", ready);
}

function updateCamera(dt) {
  const me = racers[0];
  tmp.set(me.pos.x * 0.55, Math.max(me.pos.y, 0.2) + 5.2, me.pos.z - 9.2);
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
  }

  for (const r of racers) updateRacer(r, dt);

  for (const c of confetti) {
    c.vel.y -= 18 * dt;
    c.mesh.position.addScaledVector(c.vel, dt);
    c.mesh.rotation.x += dt * 4;
  }

  if (state === "racing" || state === "start" || state === "countdown") updateCamera(dt);
  if (state === "racing") {
    updateHud();
    if (racers[0].finished) {
      state = "done";
      hud.classList.add("hidden");
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
  keys.add(e.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("resize", onResize);

document.getElementById("btn-start").addEventListener("click", () => {
  sfx.boot();
  startEl.classList.add("hidden");
  hud.classList.remove("hidden");
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
});

document.getElementById("btn-retry").addEventListener("click", () => location.reload());
muteBtn.addEventListener("click", () => {
  sfx.enabled = !sfx.enabled;
  muteBtn.textContent = sfx.enabled ? "🔊" : "🔇";
  if (sfx.enabled) sfx.boot();
});

buildWorld();
spawnRacers();
window.__beanRun = {
  get state() {
    return state;
  },
  get time() {
    return raceTime;
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
