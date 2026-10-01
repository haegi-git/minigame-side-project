import * as THREE from "three";
import { ITEMS, SLOTS, SLOT_LABEL, RARITY, makePart, outfitTint } from "./parts.js";

const START_MONEY = 1500;
const GOAL = 500000;
const BET_STEPS = [50, 100, 1000, 10000];
const MIN_BET = 100;
const LOOK_KEY = "lucky-bean-look";
const RPS_NAME = ["바위", "보", "가위"];
const CARD_FACES = ["🌸", "🍋", "⭐", "💎"];
const CARD_FLIPS = 12;
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

const SLOT_TABLE = [
  { id: "miss", w: 600, mult: 0, label: "꽝" },
  { id: "pair", w: 220, mult: 1, label: "페어 환급" },
  { id: "bean", w: 110, mult: 2, sym: "🫘", label: "콩 3개" },
  { id: "star", w: 45, mult: 4, sym: "⭐", label: "별 3개" },
  { id: "heart", w: 18, mult: 8, sym: "💗", label: "하트 3개" },
  { id: "gem", w: 5, mult: 15, sym: "💎", label: "보석 3개" },
  { id: "crown", w: 2, mult: 40, sym: "👑", label: "왕관 3개" },
];
const SLOT_SYMS = ["🫘", "⭐", "💗", "💎", "👑"];
const HILO_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const COARSE = window.matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 700;

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
    lead: "같은 그림을 12번 안에 모두 맞추면 2배예요.",
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
    lead: "세 길 중 당첨 길을 고르면 3배예요. 확률은 1/3입니다.",
  },
  {
    id: "slot",
    title: "슬롯",
    npc: "슬롯콩",
    color: 0xff6b9d,
    x: -6.2,
    z: 9.2,
    lead: "릴 세 개가 멈추면 그림에 따라 배당이 정해져요. 표에 적힌 확률이 전부입니다.",
  },
  {
    id: "hilo",
    title: "하이로우",
    npc: "하이콩",
    color: 0x8ec5ff,
    x: 6.2,
    z: 9.2,
    lead: "다음 카드가 더 높을지 낮을지 맞히면, 남은 장수에 맞춰 배당을 받아요. 같으면 환급.",
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
const stick = { nx: 0, ny: 0, active: false };
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
  tick() {
    this.tone(720, 0.04, "square", 0.03);
  },
  win() {
    this.tone(523, 0.08);
    setTimeout(() => this.tone(659, 0.08), 70);
    setTimeout(() => this.tone(784, 0.16), 140);
  },
  big() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, "triangle", 0.08), i * 90));
  },
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !COARSE });
renderer.setPixelRatio(COARSE ? 1 : Math.min(devicePixelRatio, 1.75));
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
sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
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
persistLookShape();
let phase = "start";
let nearStall = null;
let currentGame = null;
let currentBet = 0;
let pendingBet = 0;
let busy = false;
let roundOver = false;
let shopTab = "hat";
let trying = null;
let history = [];
let cardState = null;
let hiloValue = 7;
let ladderData = null;
let wheelRot = 0;
const colliders = [];
const npcs = [];
const motes = [];
const player = {
  pos: new THREE.Vector3(3.6, 0.66, 3.2),
  yaw: 0,
  mesh: null,
  bob: 0,
};

function emptyEq() {
  return Object.fromEntries(SLOTS.map((slot) => [slot, null]));
}

function loadLook() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOOK_KEY));
    if (raw && Array.isArray(raw.owned)) {
      const eq = emptyEq();
      if (raw.eq && typeof raw.eq === "object") {
        for (const slot of SLOTS) {
          const id = raw.eq[slot];
          if (typeof id === "string" && ITEMS.some((item) => item.id === id && item.slot === slot)) eq[slot] = id;
        }
      }
      const owned = raw.owned.filter((id) => typeof id === "string");
      return { owned, eq };
    }
  } catch {
    /* keep default */
  }
  return { owned: [], eq: emptyEq() };
}

function saveLook() {
  localStorage.setItem(LOOK_KEY, JSON.stringify(look));
}

function persistLookShape() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOOK_KEY) || "null");
    if (raw && raw.eq && SLOTS.some((slot) => !(slot in raw.eq))) saveLook();
  } catch {
    /* ignore */
  }
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

function shownEq() {
  const eq = { ...look.eq };
  if (trying) eq[trying.slot] = trying.id;
  return eq;
}

function applyLook(bean, eq = shownEq()) {
  const inner = bean.userData.inner;
  if (inner.userData.gear) inner.remove(inner.userData.gear);
  const gear = new THREE.Group();
  inner.userData.gear = gear;
  inner.add(gear);
  for (const slot of SLOTS) {
    if (slot === "outfit" || !eq[slot]) continue;
    const part = makePart(eq[slot]);
    if (part) gear.add(part);
  }
  if (inner.userData.bodyMat) inner.userData.bodyMat.color.setHex(outfitTint(eq.outfit));
}

function createBean(color, name, me) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const bodyMat = mat(color);
  inner.userData.bodyMat = bodyMat;
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

function plazaMap() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(256, 256, 40, 256, 256, 260);
  grd.addColorStop(0, "#fff6fb");
  grd.addColorStop(0.45, "#ffd0e6");
  grd.addColorStop(1, "#f3b7d4");
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(255,255,255,0.45)";
  g.lineWidth = 3;
  for (let i = 1; i <= 6; i++) {
    g.beginPath();
    g.arc(256, 256, i * 38, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(256, 256);
    g.lineTo(256 + Math.cos(a) * 250, 256 + Math.sin(a) * 250);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyMap() {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#6eb6ff");
  grd.addColorStop(0.55, "#b9e4ff");
  grd.addColorStop(1, "#ffe7c4");
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildWorld() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(70, 16, 12),
    new THREE.MeshBasicMaterial({ map: skyMap(), side: THREE.BackSide, depthWrite: false, fog: false })
  );
  scene.add(sky);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ map: plazaMap(), roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(15.4, 0.28, 8, 64), mat(0xff8fb8));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;
  scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(14.6, 0.08, 6, 48), mat(0xffe066, { emissive: 0xffe066, emissiveIntensity: 0.25 }));
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = 0.16;
  scene.add(ring2);

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.5, 0.4, 24),
    mat(0x7ecbff, { emissive: 0x4aa8ff, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.2 })
  );
  water.position.y = 0.2;
  water.name = "fountain";
  scene.add(water);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.12, 8, 24), mat(0xffe066, { metalness: 0.3 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.42;
  scene.add(rim);
  const spout = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 8), mat(0xd7f4ff, { transparent: true, opacity: 0.7, emissive: 0x9fd4ff, emissiveIntensity: 0.4 }));
  spout.position.y = 0.7;
  scene.add(spout);
  addCollider(0, 0, 1.7, 1.7);

  const treeN = COARSE ? 6 : 8;
  for (let i = 0; i < treeN; i++) {
    const a = (i / treeN) * Math.PI * 2 + 0.2;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 8), mat(0xc4896a));
    trunk.position.y = 0.4;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), mat(i % 2 ? 0x7ce7c4 : 0x8fd06a));
    leaf.position.y = 1.15;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), mat(i % 3 ? 0xff8fb8 : 0xffe066));
    cap.position.set(0.2, 1.55, 0.1);
    tree.add(trunk, leaf, cap);
    tree.position.set(Math.cos(a) * 13.2, 0, Math.sin(a) * 13.2);
    scene.add(tree);
  }

  const lampN = COARSE ? 4 : 8;
  for (let i = 0; i < lampN; i++) {
    const a = (i / lampN) * Math.PI * 2;
    const lamp = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.5, 8), mat(0x2b2140));
    post.position.y = 0.75;
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 8),
      mat(0xffe066, { emissive: 0xffe066, emissiveIntensity: 0.8 })
    );
    bulb.position.y = 1.55;
    lamp.add(post, bulb);
    lamp.position.set(Math.cos(a) * 11.2, 0, Math.sin(a) * 11.2);
    scene.add(lamp);
  }

  for (let i = 0; i < (COARSE ? 8 : 14); i++) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff8fb8 : 0xfffdf8, transparent: true, opacity: 0.85 })
    );
    mote.position.set(Math.cos(i) * (4 + (i % 4)), 1.2 + (i % 3) * 0.4, Math.sin(i * 1.7) * (4 + (i % 5)));
    scene.add(mote);
    motes.push(mote);
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
  const talk = document.getElementById("btn-talk");
  if (talk) talk.classList.toggle("ready", !!stall);
  if (!stall || phase !== "play") {
    promptEl.classList.add("hidden");
    return;
  }
  promptEl.textContent = stall.id === "shop" ? "상점" : stall.title;
  promptEl.classList.remove("hidden");
}

function hideStages() {
  for (const id of ["stage-rps", "stage-wheel", "stage-cards", "stage-odd", "stage-ladder", "stage-slot", "stage-hilo"]) {
    document.getElementById(id)?.classList.add("hidden");
  }
}

function setOdds(text) {
  const el = document.getElementById("odds-line");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden");
}

function pushHistory(text, win) {
  history.unshift({ text, win });
  history = history.slice(0, 6);
  const el = document.getElementById("history");
  if (!el) return;
  el.innerHTML = history.map((h) => `<li class="${h.win ? "win" : "lose"}">${h.text}</li>`).join("");
}

function spawnCoins(n) {
  const host = document.getElementById("fx");
  if (!host) return;
  for (let i = 0; i < n; i++) {
    const c = document.createElement("i");
    c.className = "coin";
    c.style.left = `${40 + Math.random() * 20}%`;
    c.style.setProperty("--dx", `${(Math.random() - 0.5) * 180}px`);
    c.style.animationDelay = `${Math.random() * 0.15}s`;
    host.appendChild(c);
    setTimeout(() => c.remove(), 1100);
  }
}

function juice(win, mult) {
  const panel = document.querySelector("#play .panel");
  if (!panel) return;
  panel.classList.remove("shake", "bigwin");
  void panel.offsetWidth;
  if (win && mult >= 8) {
    panel.classList.add("shake", "bigwin");
    spawnCoins(26);
    sfx.big();
    const banner = document.getElementById("big-banner");
    if (banner) {
      banner.textContent = "대박!";
      banner.classList.remove("hidden");
      setTimeout(() => banner.classList.add("hidden"), 2400);
    }
  } else if (win && mult >= 3) {
    panel.classList.add("shake");
    spawnCoins(14);
    sfx.win();
  } else if (win) {
    spawnCoins(8);
    sfx.ok();
  } else {
    panel.classList.add("shake");
    sfx.bad();
  }
}

function clampBet(n) {
  return Math.max(0, Math.min(money, n));
}

function renderBetUI() {
  document.getElementById("bet-amount").textContent = format(pendingBet);
  document.getElementById("btn-bet").disabled = pendingBet < MIN_BET || pendingBet > money;
  document.getElementById("btn-allin").disabled = money < MIN_BET;
  document.querySelectorAll("#bet-minus button").forEach((btn) => {
    btn.disabled = pendingBet <= 0;
  });
  document.querySelectorAll("#bet-plus button").forEach((btn) => {
    btn.disabled = pendingBet >= money;
  });
}

function ensureBetButtons() {
  const minus = document.getElementById("bet-minus");
  const plus = document.getElementById("bet-plus");
  if (minus.childElementCount) return;
  for (const step of BET_STEPS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `-${format(step)}`;
    btn.addEventListener("click", () => {
      pendingBet = clampBet(pendingBet - step);
      renderBetUI();
      sfx.click();
    });
    minus.appendChild(btn);
  }
  for (const step of BET_STEPS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `+${format(step)}`;
    btn.addEventListener("click", () => {
      pendingBet = clampBet(pendingBet + step);
      renderBetUI();
      sfx.click();
    });
    plus.appendChild(btn);
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
  pendingBet = 0;
  ensureBetButtons();
  renderBetUI();
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
  if (trying) {
    trying = null;
    if (player.mesh) applyLook(player.mesh);
  }
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
  document.getElementById("touch-ui")?.classList.add("hidden");
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
  pushHistory(text, win);
  juice(win, mult);
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
    setOdds("당첨 확률 1/3 · 맞히면 3배 · 기대값 1.00");
    setupLadder();
  } else if (currentGame.id === "slot") {
    document.getElementById("stage-slot").classList.remove("hidden");
    setOdds("기대값 약 0.92 · 왕관 3개 0.2% · 40배");
    setupSlot();
  } else if (currentGame.id === "hilo") {
    document.getElementById("stage-hilo").classList.remove("hidden");
    setOdds("맞히면 12÷남은장, 같으면 환급 · 기대값 1.00");
    setupHilo();
  }
  if (currentGame.id === "rps") setOdds("승 1/3 → 2배 · 무 1/3 → 환급 · 패 1/3 → 0");
  if (currentGame.id === "wheel") setOdds("8칸 중 꽝 5 · 2배 1 · 3배 1 · 환급 1 · 기대값 0.75");
  if (currentGame.id === "cards") setOdds("12번 안에 4쌍을 맞추면 2배");
  if (currentGame.id === "odd") setOdds("홀 3/6 · 짝 3/6 · 맞히면 2배 · 기대값 1.00");
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
  const ticks = [70, 90, 120, 160, 220, 300, 420, 600, 850];
  ticks.forEach((t) => setTimeout(() => sfx.tick(), t));
  await wait(3900);
  const hit = WHEEL[idx];
  const prev = WHEEL[(idx + WHEEL.length - 1) % WHEEL.length];
  const next = WHEEL[(idx + 1) % WHEEL.length];
  if (hit.mult <= 0 && (prev.mult > 1 || next.mult > 1)) {
    const near = document.getElementById("play-result");
    if (near) {
      near.textContent = "아슬아슬...";
      near.classList.remove("hidden");
    }
    await wait(420);
  }
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
  document.getElementById("card-flips").textContent = `뒤집은 횟수 0 / ${CARD_FLIPS}`;
}

async function flipCard(i, btn) {
  if (!cardState || cardState.lock || roundOver || cardState.matched.includes(i) || cardState.open.includes(i)) return;
  btn.textContent = cardState.faces[i];
  btn.classList.add("on");
  cardState.open.push(i);
  cardState.flips += 1;
  document.getElementById("card-flips").textContent = `뒤집은 횟수 ${cardState.flips} / ${CARD_FLIPS}`;
  if (cardState.flips > CARD_FLIPS) {
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

const PIPS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

async function playOdd(isOdd) {
  if (busy || roundOver || currentGame?.id !== "odd") return;
  busy = true;
  const dice = document.getElementById("dice");
  dice.classList.add("spin");
  for (let i = 0; i < 12; i++) {
    dice.textContent = PIPS[1 + Math.floor(Math.random() * 6)];
    sfx.tick();
    await wait(60 + i * 12);
  }
  const n = 1 + Math.floor(Math.random() * 6);
  dice.textContent = PIPS[n];
  dice.classList.remove("spin");
  const odd = n % 2 === 1;
  if (odd === !!isOdd) payout(2, `${n} · 맞혔어요! +${format(currentBet * 2)}`, true);
  else payout(0, `${n} · 반대였어요...`, false);
}

function rollSlot() {
  const total = SLOT_TABLE.reduce((s, row) => s + row.w, 0);
  let r = Math.random() * total;
  for (const row of SLOT_TABLE) {
    r -= row.w;
    if (r <= 0) return row;
  }
  return SLOT_TABLE[0];
}

function slotFaces(row) {
  if (row.sym) return [row.sym, row.sym, row.sym];
  if (row.id === "pair") {
    const a = SLOT_SYMS[Math.floor(Math.random() * 3)];
    let b = SLOT_SYMS[Math.floor(Math.random() * SLOT_SYMS.length)];
    while (b === a) b = SLOT_SYMS[Math.floor(Math.random() * SLOT_SYMS.length)];
    const faces = [a, a, b];
    return faces.sort(() => Math.random() - 0.5);
  }
  const bag = [...SLOT_SYMS].sort(() => Math.random() - 0.5);
  return bag.slice(0, 3);
}

function setupSlot() {
  for (let i = 0; i < 3; i++) {
    const reel = document.getElementById(`reel-${i}`);
    if (!reel) continue;
    reel.classList.remove("spinning");
    reel.innerHTML = `<b>${SLOT_SYMS[i % SLOT_SYMS.length]}</b>`;
  }
  const btn = document.getElementById("btn-slot");
  if (btn) btn.disabled = false;
}

async function spinSlot() {
  if (busy || roundOver || currentGame?.id !== "slot") return;
  busy = true;
  const btn = document.getElementById("btn-slot");
  if (btn) btn.disabled = true;
  const row = rollSlot();
  const faces = slotFaces(row);
  for (let i = 0; i < 3; i++) {
    const reel = document.getElementById(`reel-${i}`);
    reel.classList.add("spinning");
    const spinFor = 700 + i * 480;
    const started = performance.now();
    while (performance.now() - started < spinFor) {
      reel.innerHTML = `<b>${SLOT_SYMS[Math.floor(Math.random() * SLOT_SYMS.length)]}</b>`;
      if (i === 2 && faces[0] === faces[1] && performance.now() - started > spinFor - 280) {
        reel.innerHTML = `<b>${faces[0]}</b>`;
      }
      sfx.tick();
      await wait(70 + i * 20);
    }
    reel.classList.remove("spinning");
    reel.innerHTML = `<b>${faces[i]}</b>`;
    sfx.click();
    await wait(180);
  }
  if (row.mult <= 0) payout(0, "그림이 어긋났어요...", false);
  else if (row.mult === 1) payout(1, `페어! 건 돈 ${format(currentBet)}을 돌려받아요`, true);
  else payout(row.mult, `${row.label}! +${format(Math.round(currentBet * row.mult))}`, true);
}

function hiloSide(card, dir) {
  const n = dir === "hi" ? 13 - card : card - 1;
  return { n, mult: n > 0 ? 12 / n : 0 };
}

function setupHilo() {
  hiloValue = 1 + Math.floor(Math.random() * 13);
  const card = document.getElementById("hilo-card");
  if (card) {
    card.textContent = HILO_RANKS[hiloValue - 1];
    card.classList.remove("flip");
  }
  for (const dir of ["hi", "lo"]) {
    const btn = document.querySelector(`[data-hi="${dir}"]`);
    const side = hiloSide(hiloValue, dir);
    if (!btn) continue;
    const odds = btn.querySelector("small");
    if (side.n <= 0) {
      btn.disabled = true;
      if (odds) odds.textContent = "없음";
    } else {
      btn.disabled = false;
      if (odds) odds.textContent = `${side.n}장 · ×${side.mult.toFixed(2)}`;
    }
  }
}

async function playHilo(dir) {
  if (busy || roundOver || currentGame?.id !== "hilo") return;
  const side = hiloSide(hiloValue, dir);
  if (side.n <= 0) return;
  busy = true;
  document.querySelectorAll("[data-hi]").forEach((b) => {
    b.disabled = true;
  });
  const card = document.getElementById("hilo-card");
  card?.classList.add("flip");
  sfx.tick();
  await wait(280);
  const next = 1 + Math.floor(Math.random() * 13);
  if (card) card.textContent = HILO_RANKS[next - 1];
  await wait(220);
  if (next === hiloValue) payout(1, `같은 ${HILO_RANKS[next - 1]} · 환급`, true);
  else if ((dir === "hi" && next > hiloValue) || (dir === "lo" && next < hiloValue)) {
    payout(side.mult, `${HILO_RANKS[next - 1]}! ×${side.mult.toFixed(2)} · +${format(Math.round(currentBet * side.mult))}`, true);
  } else payout(0, `${HILO_RANKS[next - 1]} · 반대였어요...`, false);
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
  const tabs = document.getElementById("shop-tabs");
  const grid = document.getElementById("shop-grid");
  if (!tabs || !grid) return;
  tabs.innerHTML = "";
  for (const slot of SLOTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = SLOT_LABEL[slot];
    b.className = slot === shopTab ? "on" : "";
    b.addEventListener("click", () => {
      shopTab = slot;
      sfx.click();
      renderShop();
    });
    tabs.appendChild(b);
  }
  grid.innerHTML = "";
  for (const item of ITEMS.filter((it) => it.slot === shopTab)) {
    const owned = look.owned.includes(item.id);
    const on = look.eq[item.slot] === item.id;
    const preview = trying && trying.id === item.id;
    const el = document.createElement("article");
    el.className = `shop-item rarity-${item.rarity}${on ? " equipped" : ""}${preview ? " trying" : ""}`;
    const rare = RARITY[item.rarity];
    el.innerHTML = `<h3>${item.name}</h3><em style="color:${rare.color}">${rare.name}</em><p>${item.blurb} · ${SLOT_LABEL[item.slot]}</p>`;
    const row = document.createElement("div");
    row.className = "row";
    const price = document.createElement("span");
    price.textContent = owned ? (on ? "착용 중" : "보유") : `${format(item.price)} 콩알`;
    const btn = document.createElement("button");
    btn.type = "button";
    if (!owned) {
      btn.textContent = money < item.price ? "콩알 부족" : `구매 ${format(item.price)}`;
      btn.disabled = money < item.price;
      btn.addEventListener("click", () => buyItem(item));
      const tryBtn = document.createElement("button");
      tryBtn.type = "button";
      tryBtn.className = "try";
      tryBtn.textContent = preview ? "해제" : "입어보기";
      tryBtn.addEventListener("click", () => {
        trying = preview ? null : { slot: item.slot, id: item.id };
        applyLook(player.mesh);
        sfx.click();
        renderShop();
      });
      row.append(price, tryBtn, btn);
    } else if (on) {
      btn.textContent = "벗기";
      btn.classList.add("on");
      btn.addEventListener("click", () => wear(item.slot, null));
      row.append(price, btn);
    } else {
      btn.textContent = "착용";
      btn.addEventListener("click", () => wear(item.slot, item.id));
      row.append(price, btn);
    }
    el.appendChild(row);
    grid.appendChild(el);
  }
}

function buyItem(item) {
  if (money < item.price || look.owned.includes(item.id)) return;
  money -= item.price;
  look.owned.push(item.id);
  look.eq[item.slot] = item.id;
  if (trying && trying.slot === item.slot) trying = null;
  saveLook();
  applyLook(player.mesh);
  updateHud();
  sfx.win();
  spawnCoins(12);
  shopEl.classList.remove("just-bought");
  void shopEl.offsetWidth;
  shopEl.classList.add("just-bought");
  renderShop();
  if (maybeEnd()) return;
}

function wear(slot, id) {
  look.eq[slot] = id;
  if (trying && trying.slot === slot) trying = null;
  saveLook();
  applyLook(player.mesh);
  sfx.click();
  renderShop();
}

function interact() {
  if (phase !== "play" || !nearStall) return;
  openStall(nearStall);
}

const RPS_EMOJI = ["✊", "✋", "✌️"];

async function playRps(choice) {
  if (busy || roundOver || currentGame?.id !== "rps") return;
  busy = true;
  const meEl = document.getElementById("rps-me");
  const npcEl = document.getElementById("rps-npc");
  const npc = Math.floor(Math.random() * 3);
  for (let i = 0; i < 8; i++) {
    if (meEl) meEl.textContent = RPS_EMOJI[i % 3];
    if (npcEl) npcEl.textContent = RPS_EMOJI[(i + 1) % 3];
    sfx.tick();
    await wait(90 + i * 18);
  }
  if (meEl) meEl.textContent = RPS_EMOJI[choice];
  if (npcEl) npcEl.textContent = RPS_EMOJI[npc];
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
    if (stick.active) {
      ix += stick.nx;
      iz += stick.ny;
    }
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
    let best = 2.45;
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

  const gear = player.mesh.userData.inner.userData.gear;
  if (gear) {
    gear.traverse((obj) => {
      if (obj.userData.spin) obj.rotation.y += dt * 8;
      if (obj.userData.aura) obj.rotation.y += dt * 0.8;
      if (obj.userData.pet) obj.position.y = 0.05 + Math.sin(now * 0.004 + 1) * 0.07;
    });
  }
  for (const mote of motes) {
    mote.position.y += Math.sin(now * 0.001 + mote.position.x) * 0.002;
  }

  const shopping = phase === "shop";
  const camTarget = shopping
    ? tmp.set(player.pos.x + 0.15, 1.45, player.pos.z + 2.55)
    : tmp.set(player.pos.x, 9.2, player.pos.z + 11);
  camera.position.lerp(camTarget, 1 - Math.exp(-dt * (shopping ? 6 : 3.2)));
  camera.lookAt(player.pos.x, shopping ? 0.95 : 0.8, player.pos.z);
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

bindStick(document.getElementById("stick"));
document.getElementById("btn-talk")?.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  interact();
});
canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

promptEl.addEventListener("click", interact);
document.getElementById("btn-start").addEventListener("click", () => {
  sfx.boot();
  startEl.classList.add("hidden");
  hud.classList.remove("hidden");
  document.getElementById("touch-ui")?.classList.remove("hidden");
  phase = "play";
});
document.getElementById("btn-cancel").addEventListener("click", closePlay);
document.getElementById("btn-leave").addEventListener("click", closePlay);
document.getElementById("btn-shop-close").addEventListener("click", closePlay);
document.getElementById("btn-again").addEventListener("click", () => {
  if (maybeEnd()) return;
  showBetUI();
});
document.getElementById("btn-bet").addEventListener("click", () => startRound(pendingBet));
document.getElementById("btn-allin").addEventListener("click", () => startRound(money));
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
document.getElementById("btn-slot")?.addEventListener("click", () => spinSlot());
document.querySelectorAll("[data-hi]").forEach((b) => {
  b.addEventListener("click", () => playHilo(b.dataset.hi));
});
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
