import * as THREE from "three";

const START_MONEY = 1500;
const GOAL = 10000;
const MIN_BET = 100;
const LOOK_KEY = "lucky-bean-look";
const RPS_NAME = ["바위", "보", "가위"];
const CARD_FACES = ["🌸", "🍋", "⭐", "💎"];
const WHEEL = [
  { label: "꽝", mult: 0, color: "#ff8fb8" },
  { label: "꽝", mult: 0, color: "#d4b3ff" },
  { label: "2배", mult: 2, color: "#ffe066" },
  { label: "꽝", mult: 0, color: "#ffb085" },
  { label: "꽝", mult: 0, color: "#8ec5ff" },
  { label: "3배", mult: 3, color: "#7ce7c4" },
  { label: "꽝", mult: 0, color: "#ff8fb8" },
  { label: "환급", mult: 1, color: "#fffdf8" },
];

const ITEMS = [
  { id: "ribbon", slot: "hat", name: "리본", price: 250, blurb: "말랑한 핑크 리본" },
  { id: "flower", slot: "hat", name: "꽃핀", price: 350, blurb: "노란 꽃 하나" },
  { id: "cap", slot: "hat", name: "캡모자", price: 450, blurb: "노란 챙모자" },
  { id: "prop", slot: "hat", name: "프로펠러", price: 800, blurb: "빙글빙글 돌아요" },
  { id: "crown", slot: "hat", name: "왕관", price: 1800, blurb: "한탕의 증표" },
  { id: "glasses", slot: "face", name: "선글라스", price: 500, blurb: "쿨한 검정 테" },
  { id: "star", slot: "face", name: "별안경", price: 900, blurb: "반짝 별 렌즈" },
  { id: "bow", slot: "neck", name: "나비넥타이", price: 450, blurb: "신사 콩" },
  { id: "bell", slot: "neck", name: "방울목걸이", price: 700, blurb: "살랑살랑 방울" },
];

const STALLS = [
  {
    id: "rps",
    title: "가위바위보",
    npc: "가위콩",
    color: 0xff8fb8,
    x: -10,
    z: 4,
    lead: "이기면 건 돈의 2배, 비기면 돌려받고, 지면 사라져요.",
  },
  {
    id: "wheel",
    title: "돌림판",
    npc: "돌콩",
    color: 0x7ce7c4,
    x: 10,
    z: 4,
    lead: "판을 돌리면 바늘이 가리키는 칸이 배당이에요. 꽝이 많고, 2배·3배·환급이 조금씩 숨어 있습니다.",
  },
  {
    id: "cards",
    title: "짝맞추기",
    npc: "카드콩",
    color: 0xffe066,
    x: -10,
    z: -4,
    lead: "같은 그림을 14번 안에 모두 맞추면 2배예요.",
  },
  {
    id: "odd",
    title: "홀짝",
    npc: "주사콩",
    color: 0xd4b3ff,
    x: 10,
    z: -4,
    lead: "주사위가 홀수인지 짝수인지 맞히면 2배!",
  },
  {
    id: "ladder",
    title: "사다리",
    npc: "사다콩",
    color: 0xffb085,
    x: 0,
    z: 11,
    lead: "세 길 중 당첨 길을 고르면 3배예요.",
  },
  {
    id: "shop",
    title: "꾸미기 상점",
    npc: "상점콩",
    color: 0xfff4c4,
    x: 0,
    z: -11,
    lead: "",
  },
];

const keys = new Set();
const canvas = document.getElementById("view");
const hud = document.getElementById("hud");
const startEl = document.getElementById("start");
const playEl = document.getElementById("play");
const shopEl = document.getElementById("shop");
const resultEl = document.getElementById("result");
const moneyEl = document.getElementById("money");
const progressEl = document.getElementById("progress");
const promptEl = document.getElementById("prompt");
const muteBtn = document.getElementById("mute");

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
  ok() {
    this.tone(523, 0.1);
    setTimeout(() => this.tone(784, 0.14), 80);
  },
  bad() {
    this.tone(180, 0.18, "square", 0.05);
  },
  click() {
    this.tone(440, 0.06, "triangle", 0.04);
  },
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ad8ff);
scene.fog = new THREE.Fog(0x9ad8ff, 28, 58);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 80);
const hemi = new THREE.HemisphereLight(0xfff1c9, 0x7ecbff, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 70;
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

let money = START_MONEY;
let look = loadLook();
let phase = "start";
let nearStall = null;
let currentGame = null;
let currentBet = 0;
let busy = false;
let roundOver = false;
let cardState = null;
let ladderData = null;
let wheelRot = 0;
const colliders = [];
const npcs = [];
const spinBits = [];
const player = {
  pos: new THREE.Vector3(3.6, 0.66, 3.2),
  yaw: 0,
  mesh: null,
  bob: 0,
};

function loadLook() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOOK_KEY));
    if (raw && Array.isArray(raw.owned) && raw.eq) return raw;
  } catch {
    /* keep default */
  }
  return { owned: [], eq: { hat: null, face: null, neck: null } };
}

function saveLook() {
  localStorage.setItem(LOOK_KEY, JSON.stringify(look));
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function format(n) {
  return n.toLocaleString("ko-KR");
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

function makeLabel(text, me) {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 72;
  const ctx = c.getContext("2d");
  ctx.fillStyle = me ? "#ff8fb8" : "#fffdf8";
  ctx.strokeStyle = "#2b2140";
  ctx.lineWidth = 6;
  roundRect(ctx, 16, 10, 288, 52, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2b2140";
  ctx.font = "700 30px Jua, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 160, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(2.1, 0.48, 1);
  spr.position.y = 1.5;
  spr.renderOrder = 2;
  return spr;
}

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.05, ...extra });
}

function makePart(id) {
  const g = new THREE.Group();
  g.name = id;
  if (id === "ribbon") {
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(0xff8fb8));
      p.position.set(s * 0.16, 0.78, 0.08);
      p.scale.set(1.1, 0.7, 0.45);
      g.add(p);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), mat(0xff5d8f));
    knot.position.set(0, 0.76, 0.16);
    g.add(knot);
  } else if (id === "flower") {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), mat(0xffe066));
    c.position.set(0.22, 0.78, 0.12);
    g.add(c);
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat(0xff8fb8));
      const a = (i / 5) * Math.PI * 2;
      p.position.set(0.22 + Math.cos(a) * 0.12, 0.78 + Math.sin(a) * 0.12, 0.1);
      g.add(p);
    }
  } else if (id === "cap") {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.22, 16), mat(0xffe066));
    top.position.y = 0.78;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.28), mat(0xffe066));
    brim.position.set(0, 0.68, 0.28);
    g.add(top, brim);
  } else if (id === "prop") {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 8), mat(0x6d5a7a));
    stem.position.y = 0.9;
    const blades = new THREE.Group();
    blades.position.y = 1.04;
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.12), mat(0x8ec5ff));
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.7), mat(0xff8fb8));
    blades.add(b1, b2);
    blades.userData.spin = true;
    g.add(stem, blades);
    spinBits.push(blades);
  } else if (id === "crown") {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.14, 12), mat(0xffe066, { metalness: 0.35 }));
    band.position.y = 0.76;
    g.add(band);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), mat(0xffe066, { metalness: 0.35 }));
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.28, 0.92, Math.sin(a) * 0.28);
      g.add(spike);
    }
  } else if (id === "glasses") {
    const dark = mat(0x2b2140);
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 12), dark);
      r.position.set(s * 0.16, 0.18, 0.5);
      g.add(r);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), dark);
    bar.position.set(0, 0.18, 0.5);
    g.add(bar);
  } else if (id === "star") {
    for (const s of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), mat(0xffe066));
      st.position.set(s * 0.16, 0.18, 0.52);
      g.add(st);
    }
  } else if (id === "bow") {
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 8), mat(0xff5d8f));
      w.rotation.z = s * Math.PI / 2;
      w.position.set(s * 0.1, -0.12, 0.48);
      g.add(w);
    }
  } else if (id === "bell") {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0xffe066, { metalness: 0.4 }));
    bell.position.set(0, -0.22, 0.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 8, 16), mat(0xffe066, { metalness: 0.4 }));
    ring.position.set(0, -0.08, 0.42);
    ring.rotation.x = Math.PI / 2.4;
    g.add(bell, ring);
  }
  return g;
}

function applyLook(bean) {
  const inner = bean.userData.inner;
  spinBits.length = 0;
  if (inner.userData.gear) inner.remove(inner.userData.gear);
  const gear = new THREE.Group();
  inner.userData.gear = gear;
  inner.add(gear);
  for (const slot of ["hat", "face", "neck"]) {
    if (look.eq[slot]) gear.add(makePart(look.eq[slot]));
  }
}

function createBean(color, name, me) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const bodyMat = mat(color);
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
  const eyeWhite = mat(0xffffff);
  const pupilMat = mat(0x2b2140);
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
    mat(0x2b2140)
  );
  smile.position.set(0, 0.02, 0.5);
  smile.rotation.set(0, 0, Math.PI);
  inner.add(smile);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), bodyMat);
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
  root.add(makeLabel(name, me));
  root.userData.inner = inner;
  return root;
}

function box(w, h, d, color, x, y, z, recv = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = recv;
  scene.add(m);
  return m;
}

function addCollider(x, z, hw, hd) {
  colliders.push({ x, z, hw, hd });
}

function buildWorld() {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(16, 48),
    mat(0xf4d7e8)
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(15.4, 0.45, 8, 48), mat(0xff8fb8));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  scene.add(ring);

  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.4, 20), mat(0x8ec5ff));
  water.position.y = 0.2;
  scene.add(water);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.16, 8, 20), mat(0xffe066));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.38;
  scene.add(rim);
  addCollider(0, 0, 1.7, 1.7);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 8), mat(0xc4896a));
    trunk.position.y = 0.35;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), mat(i % 2 ? 0x7ce7c4 : 0xbaf55b));
    leaf.position.y = 1.05;
    tree.add(trunk, leaf);
    tree.position.set(Math.cos(a) * 13.2, 0, Math.sin(a) * 13.2);
    scene.add(tree);
  }

  for (const s of STALLS) {
    const facing = new THREE.Vector3(-s.x, 0, -s.z).normalize();
    if (s.x === 0 && s.z === 0) facing.set(0, 0, 1);
    const bx = s.x - facing.x * 0.4;
    const bz = s.z - facing.z * 0.4;
    box(3.4, 0.7, 2.2, s.color, bx, 0.35, bz);
    box(3.5, 0.12, 2.3, 0xffffff, bx, 2.05, bz);
    for (const sx of [-1.5, 1.5]) {
      const pole = box(0.12, 2, 0.12, 0x2b2140, bx + facing.z * sx, 1.1, bz - facing.x * sx);
      pole.castShadow = true;
    }
    addCollider(bx, bz, 1.85, 1.25);

    const npcPos = new THREE.Vector3(s.x + facing.x * 1.6, 0.66, s.z + facing.z * 1.6);
    const npc = createBean(s.color, s.npc, false);
    npc.position.copy(npcPos);
    npc.lookAt(0, 0.66, 0);
    scene.add(npc);
    npcs.push({ stall: s, mesh: npc, pos: npcPos });
  }
}

function blocked(x, z) {
  if (x * x + z * z > 14.4 * 14.4) return true;
  for (const c of colliders) {
    if (Math.abs(x - c.x) < c.hw + 0.42 && Math.abs(z - c.z) < c.hd + 0.42) return true;
  }
  return false;
}

function updateHud() {
  moneyEl.textContent = format(money);
  progressEl.style.width = `${Math.min(100, (money / GOAL) * 100)}%`;
}

function setNear(stall) {
  nearStall = stall;
  if (!stall || phase !== "play") {
    promptEl.classList.add("hidden");
    return;
  }
  promptEl.textContent = stall.id === "shop" ? "E · 꾸미기 상점" : `E · ${stall.title}`;
  promptEl.classList.remove("hidden");
}

function hideStages() {
  for (const id of ["stage-rps", "stage-wheel", "stage-cards", "stage-odd", "stage-ladder"]) {
    document.getElementById(id).classList.add("hidden");
  }
}

function showBetUI() {
  busy = false;
  hideStages();
  document.getElementById("play-result").classList.add("hidden");
  document.getElementById("play-actions").classList.add("hidden");
  document.getElementById("bet-label").classList.remove("hidden");
  document.getElementById("bet-row").classList.remove("hidden");
  const cancel = document.getElementById("btn-cancel");
  cancel.classList.remove("hidden");
  cancel.textContent = "광장으로";
  const row = document.getElementById("bet-row");
  const bets = [100, 300, 500, 1000];
  row.innerHTML = "";
  for (const b of bets) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = format(b);
    btn.disabled = money < b;
    btn.addEventListener("click", () => startRound(b));
    row.appendChild(btn);
  }
  if (money >= MIN_BET) {
    const all = document.createElement("button");
    all.type = "button";
    all.textContent = `올인 ${format(money)}`;
    all.addEventListener("click", () => startRound(money));
    row.appendChild(all);
  }
}

function openStall(stall) {
  sfx.boot();
  sfx.click();
  if (stall.id === "shop") {
    shopEl.classList.remove("hidden");
    phase = "shop";
    renderShop();
    setNear(null);
    return;
  }
  currentGame = stall;
  playEl.classList.remove("hidden");
  phase = "minigame";
  document.getElementById("play-title").textContent = stall.title;
  document.getElementById("play-lead").textContent = stall.lead;
  showBetUI();
  setNear(null);
}

function closePlay() {
  playEl.classList.add("hidden");
  shopEl.classList.add("hidden");
  currentGame = null;
  currentBet = 0;
  busy = false;
  phase = "play";
  maybeEnd();
}

function maybeEnd() {
  if (money >= GOAL) {
    finish(true);
    return true;
  }
  if (money < MIN_BET) {
    finish(false);
    return true;
  }
  return false;
}

function finish(won) {
  phase = "over";
  playEl.classList.add("hidden");
  shopEl.classList.add("hidden");
  hud.classList.add("hidden");
  resultEl.classList.remove("hidden");
  document.getElementById("result-title").textContent = won ? "한탕 성공!" : "파산...";
  document.getElementById("result-sub").textContent = won
    ? `콩알 ${format(money)}으로 목표를 찍었어요. 광장의 전설!`
    : "남은 콩알이 100 미만이라 더 이상 판에 앉을 수 없어요.";
  if (won) sfx.ok();
  else sfx.bad();
}

function payout(mult, text, win) {
  if (mult > 0) money += Math.round(currentBet * mult);
  updateHud();
  const el = document.getElementById("play-result");
  el.textContent = text;
  el.classList.remove("hidden", "win", "lose");
  el.classList.add(win ? "win" : "lose");
  document.getElementById("play-actions").classList.remove("hidden");
  document.getElementById("btn-cancel").classList.add("hidden");
  document.getElementById("btn-again").disabled = money < MIN_BET;
  if (win) sfx.ok();
  else sfx.bad();
  busy = false;
  roundOver = true;
  if (money >= GOAL || money < MIN_BET) {
    setTimeout(() => maybeEnd(), 900);
  }
}

function startRound(bet) {
  if (bet < MIN_BET || bet > money || !currentGame) return;
  money -= bet;
  currentBet = bet;
  roundOver = false;
  busy = false;
  updateHud();
  document.getElementById("bet-label").classList.add("hidden");
  document.getElementById("bet-row").classList.add("hidden");
  document.getElementById("play-result").classList.add("hidden");
  document.getElementById("play-actions").classList.add("hidden");
  const cancel = document.getElementById("btn-cancel");
  cancel.classList.remove("hidden");
  cancel.textContent = "포기하기";
  hideStages();
  sfx.click();
  if (currentGame.id === "rps") {
    document.getElementById("stage-rps").classList.remove("hidden");
  } else if (currentGame.id === "wheel") {
    document.getElementById("stage-wheel").classList.remove("hidden");
    setupWheel();
  } else if (currentGame.id === "cards") {
    document.getElementById("stage-cards").classList.remove("hidden");
    setupCards();
  } else if (currentGame.id === "odd") {
    document.getElementById("stage-odd").classList.remove("hidden");
    document.getElementById("dice").textContent = "?";
    document.getElementById("dice").classList.remove("spin");
  } else if (currentGame.id === "ladder") {
    document.getElementById("stage-ladder").classList.remove("hidden");
    setupLadder();
  }
}

function setupWheel() {
  const el = document.getElementById("wheel");
  const slice = 360 / WHEEL.length;
  el.style.background = `conic-gradient(${WHEEL.map((s, i) => `${s.color} ${i * slice}deg ${(i + 1) * slice}deg`).join(", ")})`;
  el.innerHTML = WHEEL.map(
    (s, i) =>
      `<span style="transform: rotate(${i * slice + slice / 2}deg) translateY(-88px)">${s.label}</span>`
  ).join("");
  document.getElementById("btn-spin").disabled = false;
}

async function spinWheel() {
  if (busy || roundOver || currentGame?.id !== "wheel") return;
  busy = true;
  const btn = document.getElementById("btn-spin");
  btn.disabled = true;
  sfx.click();
  const idx = Math.floor(Math.random() * WHEEL.length);
  const slice = 360 / WHEEL.length;
  const jitter = (Math.random() - 0.5) * 18;
  const center = idx * slice + slice / 2 + jitter;
  const targetMod = (360 - center + 360) % 360;
  const extra = 360 * (5 + Math.floor(Math.random() * 3));
  const need = (targetMod - (((wheelRot % 360) + 360) % 360) + 360) % 360;
  wheelRot += extra + need;
  const el = document.getElementById("wheel");
  el.style.transform = `rotate(${wheelRot}deg)`;
  await wait(3900);
  const hit = WHEEL[idx];
  if (hit.mult <= 0) payout(0, "꽝... 바늘이 빈칸에 멈췄어요", false);
  else if (hit.mult === 1) payout(1, `환급! 건 돈 ${format(currentBet)}을 돌려받아요`, true);
  else payout(hit.mult, `${hit.label}! +${format(currentBet * hit.mult)}`, true);
}

function setupCards() {
  const faces = [...CARD_FACES, ...CARD_FACES].sort(() => Math.random() - 0.5);
  cardState = { faces, open: [], matched: [], flips: 0, lock: false };
  const grid = document.getElementById("card-grid");
  grid.innerHTML = "";
  faces.forEach((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mcard";
    b.textContent = "";
    b.addEventListener("click", () => flipCard(i, b));
    grid.appendChild(b);
  });
  document.getElementById("card-flips").textContent = "뒤집은 횟수 0 / 14";
}

async function flipCard(i, btn) {
  if (!cardState || cardState.lock || roundOver || cardState.matched.includes(i) || cardState.open.includes(i)) return;
  btn.textContent = cardState.faces[i];
  btn.classList.add("on");
  cardState.open.push(i);
  cardState.flips += 1;
  document.getElementById("card-flips").textContent = `뒤집은 횟수 ${cardState.flips} / 14`;
  if (cardState.flips > 14) {
    cardState.lock = true;
    payout(0, "뒤집기를 너무 많이 했어요...", false);
    return;
  }
  if (cardState.open.length < 2) return;
  const [a, b] = cardState.open;
  const nodes = [...document.querySelectorAll(".mcard")];
  if (cardState.faces[a] === cardState.faces[b]) {
    cardState.matched.push(a, b);
    nodes[a].classList.add("done");
    nodes[b].classList.add("done");
    cardState.open = [];
    sfx.click();
    if (cardState.matched.length === 8) payout(2, `전부 맞췄어요! +${format(currentBet * 2)}`, true);
  } else {
    cardState.lock = true;
    await wait(550);
    nodes[a].textContent = "";
    nodes[b].textContent = "";
    nodes[a].classList.remove("on");
    nodes[b].classList.remove("on");
    cardState.open = [];
    cardState.lock = false;
  }
}

async function playOdd(isOdd) {
  if (busy || roundOver || currentGame?.id !== "odd") return;
  busy = true;
  const dice = document.getElementById("dice");
  dice.classList.add("spin");
  for (let i = 0; i < 10; i++) {
    dice.textContent = String(1 + Math.floor(Math.random() * 6));
    await wait(70);
  }
  const n = 1 + Math.floor(Math.random() * 6);
  dice.textContent = String(n);
  dice.classList.remove("spin");
  const odd = n % 2 === 1;
  if (odd === !!isOdd) payout(2, `${n} · 맞혔어요! +${format(currentBet * 2)}`, true);
  else payout(0, `${n} · 반대였어요...`, false);
}

function setupLadder() {
  const rows = 7;
  const rungs = [];
  for (let r = 0; r < rows; r++) rungs.push({ row: r, gap: Math.random() < 0.5 ? 0 : 1 });
  ladderData = { rows, rungs, prize: Math.floor(Math.random() * 3), done: false };
  drawLadder(-1, -1);
  document.querySelectorAll("#ladder-picks button").forEach((b) => {
    b.disabled = false;
  });
}

function drawLadder(start, end, progress = 1) {
  const c = document.getElementById("ladder-canvas");
  const ctx = c.getContext("2d");
  const xs = [60, 180, 300];
  const top = 28;
  const bot = 230;
  const rowH = (bot - top) / (ladderData.rows + 1);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#2b2140";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  for (const x of xs) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bot);
    ctx.stroke();
  }
  for (const rung of ladderData.rungs) {
    const y = top + (rung.row + 1) * rowH;
    ctx.beginPath();
    ctx.moveTo(xs[rung.gap], y);
    ctx.lineTo(xs[rung.gap + 1], y);
    ctx.stroke();
  }
  ctx.font = "20px Jua, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#2b2140";
  for (let i = 0; i < 3; i++) {
    const label = ladderData.done ? (i === ladderData.prize ? "당첨" : "꽝") : "?";
    ctx.fillText(label, xs[i], bot + 28);
  }
  if (start >= 0) {
    const path = ladderPath(start);
    const steps = path.length;
    const vis = Math.max(1, Math.floor(steps * progress));
    ctx.strokeStyle = "#ff5d8f";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < vis; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
    const p = path[vis - 1];
    ctx.fillStyle = "#ffe066";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2b2140";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function ladderPath(start) {
  const xs = [60, 180, 300];
  const top = 28;
  const bot = 230;
  const rowH = (bot - top) / (ladderData.rows + 1);
  const pts = [{ x: xs[start], y: top }];
  let col = start;
  for (const rung of ladderData.rungs) {
    const y = top + (rung.row + 1) * rowH;
    pts.push({ x: xs[col], y });
    if (rung.gap === 0 && (col === 0 || col === 1)) col = col === 0 ? 1 : 0;
    else if (rung.gap === 1 && (col === 1 || col === 2)) col = col === 1 ? 2 : 1;
    pts.push({ x: xs[col], y });
  }
  pts.push({ x: xs[col], y: bot });
  return pts;
}

function followLadder(start) {
  let col = start;
  for (const rung of ladderData.rungs) {
    if (rung.gap === 0 && (col === 0 || col === 1)) col = col === 0 ? 1 : 0;
    else if (rung.gap === 1 && (col === 1 || col === 2)) col = col === 1 ? 2 : 1;
  }
  return col;
}

async function pickLadder(start) {
  if (busy || roundOver || !ladderData || currentGame?.id !== "ladder") return;
  busy = true;
  document.querySelectorAll("#ladder-picks button").forEach((b) => {
    b.disabled = true;
  });
  const end = followLadder(start);
  for (let t = 0; t <= 24; t++) {
    drawLadder(start, end, t / 24);
    await wait(40);
  }
  ladderData.done = true;
  drawLadder(start, end, 1);
  await wait(250);
  if (end === ladderData.prize) payout(3, `당첨 길! +${format(currentBet * 3)}`, true);
  else payout(0, "꽝 길이었어요...", false);
}

function renderShop() {
  const grid = document.getElementById("shop-grid");
  grid.innerHTML = "";
  for (const item of ITEMS) {
    const owned = look.owned.includes(item.id);
    const on = look.eq[item.slot] === item.id;
    const el = document.createElement("article");
    el.className = "shop-item";
    const btn = document.createElement("button");
    btn.type = "button";
    if (!owned) {
      btn.textContent = money < item.price ? "콩알 부족" : `구매 ${format(item.price)}`;
      btn.disabled = money < item.price;
      btn.addEventListener("click", () => buyItem(item));
    } else if (on) {
      btn.textContent = "벗기";
      btn.classList.add("on");
      btn.addEventListener("click", () => wear(item.slot, null));
    } else {
      btn.textContent = "착용";
      btn.addEventListener("click", () => wear(item.slot, item.id));
    }
    el.innerHTML = `<h3>${item.name}</h3><p>${item.blurb} · ${item.slot === "hat" ? "모자" : item.slot === "face" ? "얼굴" : "목"}</p>`;
    const row = document.createElement("div");
    row.className = "row";
    const price = document.createElement("span");
    price.textContent = owned ? (on ? "착용 중" : "보유") : `${format(item.price)} 콩알`;
    row.append(price, btn);
    el.appendChild(row);
    grid.appendChild(el);
  }
}

function buyItem(item) {
  if (money < item.price || look.owned.includes(item.id)) return;
  money -= item.price;
  look.owned.push(item.id);
  look.eq[item.slot] = item.id;
  saveLook();
  applyLook(player.mesh);
  updateHud();
  sfx.ok();
  renderShop();
  if (maybeEnd()) return;
}

function wear(slot, id) {
  look.eq[slot] = id;
  saveLook();
  applyLook(player.mesh);
  sfx.click();
  renderShop();
}

function interact() {
  if (phase !== "play" || !nearStall) return;
  openStall(nearStall);
}

function playRps(choice) {
  if (busy || roundOver || currentGame?.id !== "rps") return;
  const npc = Math.floor(Math.random() * 3);
  const win = choice === (npc + 1) % 3;
  const draw = choice === npc;
  const mine = RPS_NAME[choice];
  const theirs = RPS_NAME[npc];
  if (draw) payout(1, `서로 ${mine}! 비겨서 돌려받아요`, true);
  else if (win) payout(2, `${mine} vs ${theirs} · 이겼어요! +${format(currentBet * 2)}`, true);
  else payout(0, `${mine} vs ${theirs} · 졌어요...`, false);
}

function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  if (phase === "play") {
    let ix = 0;
    let iz = 0;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) iz -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) iz += 1;
    if (ix || iz) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
      const spd = 6.4;
      const nx = player.pos.x + ix * spd * dt;
      const nz = player.pos.z + iz * spd * dt;
      if (!blocked(nx, player.pos.z)) player.pos.x = nx;
      if (!blocked(player.pos.x, nz)) player.pos.z = nz;
      player.yaw = Math.atan2(ix, iz);
      player.bob += dt * 10;
    } else {
      player.bob *= 0.9;
    }

    let closest = null;
    let best = 2.15;
    for (const n of npcs) {
      const d = Math.hypot(player.pos.x - n.pos.x, player.pos.z - n.pos.z);
      if (d < best) {
        best = d;
        closest = n.stall;
      }
    }
    setNear(closest);
  }

  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.yaw;
  player.mesh.userData.inner.position.y = Math.abs(Math.sin(player.bob)) * 0.08;

  for (const bit of spinBits) {
    if (bit.parent) bit.rotation.y += dt * 8;
  }

  const camTarget = tmp.set(player.pos.x, 9.2, player.pos.z + 11);
  camera.position.lerp(camTarget, 1 - Math.exp(-dt * 3.2));
  camera.lookAt(player.pos.x, 0.8, player.pos.z);
  sun.position.set(player.pos.x + 8, 18, player.pos.z - 6);
  sun.target.position.copy(player.pos);
  sun.target.updateMatrixWorld();

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

const tmp = new THREE.Vector3();
let last = performance.now();

buildWorld();
player.mesh = createBean(0xff7eb3, "나", true);
applyLook(player.mesh);
scene.add(player.mesh);
updateHud();

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyE") interact();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

promptEl.addEventListener("click", interact);
document.getElementById("btn-start").addEventListener("click", () => {
  sfx.boot();
  startEl.classList.add("hidden");
  hud.classList.remove("hidden");
  phase = "play";
});
document.getElementById("btn-cancel").addEventListener("click", closePlay);
document.getElementById("btn-leave").addEventListener("click", closePlay);
document.getElementById("btn-shop-close").addEventListener("click", closePlay);
document.getElementById("btn-again").addEventListener("click", () => {
  if (maybeEnd()) return;
  showBetUI();
});
document.getElementById("btn-retry").addEventListener("click", () => location.reload());
muteBtn.addEventListener("click", () => {
  sfx.enabled = !sfx.enabled;
  muteBtn.textContent = sfx.enabled ? "🔊" : "🔇";
  if (sfx.enabled) sfx.boot();
});

document.querySelectorAll("[data-rps]").forEach((b) => {
  b.addEventListener("click", () => playRps(Number(b.dataset.rps)));
});
document.getElementById("btn-spin").addEventListener("click", () => spinWheel());
document.querySelectorAll("[data-odd]").forEach((b) => {
  b.addEventListener("click", () => playOdd(Number(b.dataset.odd)));
});
document.querySelectorAll("[data-lad]").forEach((b) => {
  b.addEventListener("click", () => pickLadder(Number(b.dataset.lad)));
});

requestAnimationFrame(tick);

window.__luckyBean = {
  get money() {
    return money;
  },
  set money(v) {
    money = v;
    updateHud();
  },
  get phase() {
    return phase;
  },
  get near() {
    return nearStall?.id || null;
  },
  get pos() {
    return { x: player.pos.x, z: player.pos.z };
  },
  open(id) {
    const stall = STALLS.find((s) => s.id === id);
    if (stall) openStall(stall);
  },
};

document.fonts.ready.then(() => {
  /* labels already drawn; fine if Jua loaded late */
});
