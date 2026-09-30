(() => {
  const SEGMENT_LENGTH = 200;
  const ROAD_WIDTH = 2000;
  const CAMERA_HEIGHT = 1000;
  const BASE_FOV = 102;
  const BASE_DEPTH = 1 / Math.tan((BASE_FOV / 2) * Math.PI / 180);
  const PLAYER_Z = CAMERA_HEIGHT * BASE_DEPTH;
  const RUMBLE = 3;
  const BEST_KEY = "kongtrider-best";
  const LANES = 3;

  const INK = "#2b2140";
  const SKY = [158, 214, 255];
  const PAL = {
    grass: [
      [124, 231, 196],
      [90, 201, 168],
    ],
    rumble: [
      [255, 143, 184],
      [255, 224, 102],
    ],
    road: [
      [108, 99, 132],
      [86, 78, 110],
    ],
    lane: [255, 248, 236],
    paper: [255, 253, 248],
    ink: [43, 33, 64],
  };

  const ITEM_INFO = {
    boost: { name: "부스터", icon: "🔥" },
    banana: { name: "바나나", icon: "🍌" },
    shield: { name: "방패", icon: "🛡️" },
    missile: { name: "콩탄", icon: "🫘" },
  };

  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d", { alpha: false });
  const hud = document.getElementById("hud");
  const startEl = document.getElementById("start");
  const countEl = document.getElementById("countdown");
  const countNum = document.getElementById("count-num");
  const resultEl = document.getElementById("result");
  const boardEl = document.getElementById("board");
  const rankEl = document.getElementById("rank");
  const rankTotalEl = document.getElementById("rank-total");
  const timeEl = document.getElementById("time");
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

  const keys = new Set();
  const stick = { nx: 0, ny: 0, drift: false };

  let viewW = 360;
  let viewH = 640;
  let dpr = 1;
  let drawDistance = 170;
  let skyGrad = null;
  let state = "start";
  let raceTime = 0;
  let doneAt = 0;
  let fov = BASE_FOV;
  let shake = 0;
  let toast = null;
  let confetti = [];

  let maxSpeed = 6000;
  let boostSpeed = 9000;
  let offLimit = 2400;
  let accel = 3800;

  const segments = [];
  const boxes = [];
  const bananas = [];
  const missiles = [];
  const smokes = [];
  const racers = [];
  let finishZ = 0;
  let gridZ = 0;
  let sprites = {};

  const sfx = {
    enabled: true,
    ctx: null,
    engine: null,
    engineGain: null,
    noise: null,
    noiseGain: null,
    boot() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) {
        this.ctx = new AC();
        this.engine = this.ctx.createOscillator();
        this.engine.type = "sawtooth";
        this.engine.frequency.value = 80;
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 480;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engine.connect(filter).connect(this.engineGain).connect(this.ctx.destination);
        this.engine.start();

        const len = this.ctx.sampleRate * 0.25;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.noise = this.ctx.createBufferSource();
        this.noise.buffer = buf;
        this.noise.loop = true;
        const nf = this.ctx.createBiquadFilter();
        nf.type = "bandpass";
        nf.frequency.value = 900;
        this.noiseGain = this.ctx.createGain();
        this.noiseGain.gain.value = 0;
        this.noise.connect(nf).connect(this.noiseGain).connect(this.ctx.destination);
        this.noise.start();
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
      o.connect(g).connect(this.ctx.destination);
      o.start();
      o.stop(this.ctx.currentTime + dur);
    },
    count(n) {
      this.tone(n === "GO" ? 660 : 392, 0.16, "sine", 0.08);
    },
    boost() {
      this.tone(220, 0.18, "square", 0.04);
      this.tone(520, 0.22, "sawtooth", 0.035);
    },
    pickup() {
      this.tone(620, 0.08, "triangle", 0.05);
      this.tone(880, 0.12, "triangle", 0.04);
    },
    hit() {
      this.tone(90, 0.18, "square", 0.06);
    },
    pop() {
      this.tone(740, 0.1, "sine", 0.05);
    },
    finish() {
      this.tone(523, 0.14);
      setTimeout(() => this.tone(659, 0.14), 90);
      setTimeout(() => this.tone(784, 0.26), 180);
    },
    setDrive(ratio, boosting, drifting, audible) {
      if (!this.engineGain) return;
      const now = this.ctx.currentTime;
      if (!this.enabled || !audible) {
        this.engineGain.gain.setTargetAtTime(0, now, 0.05);
        this.noiseGain.gain.setTargetAtTime(0, now, 0.05);
        return;
      }
      const f = 68 + ratio * 110 + (boosting ? 48 : 0);
      this.engine.frequency.setTargetAtTime(f, now, 0.06);
      this.engineGain.gain.setTargetAtTime(0.012 + ratio * 0.018, now, 0.08);
      this.noiseGain.gain.setTargetAtTime(drifting ? 0.02 : 0, now, 0.05);
    },
  };

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function formatTime(t) {
    if (!Number.isFinite(t) || t < 0) return "--";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const cs = Math.floor((t * 100) % 100);
    return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }

  function loadBest() {
    try {
      const n = Number(localStorage.getItem(BEST_KEY));
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  function saveBest(t) {
    const prev = loadBest();
    if (prev && t >= prev) return false;
    try {
      localStorage.setItem(BEST_KEY, (Math.round(t * 100) / 100).toFixed(2));
    } catch {
      /* private mode */
    }
    return true;
  }

  function paintBest() {
    const best = loadBest();
    const label = best ? `최고 ${formatTime(best)}` : "최고 --";
    if (hudBestEl) hudBestEl.textContent = label;
    if (bestLineEl) bestLineEl.textContent = best ? `최고 기록 ${formatTime(best)}` : "아직 최고 기록이 없어요";
  }

  function rgb(c) {
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function mix(a, b, t) {
    return [
      (a[0] + (b[0] - a[0]) * t) | 0,
      (a[1] + (b[1] - a[1]) * t) | 0,
      (a[2] + (b[2] - a[2]) * t) | 0,
    ];
  }

  const FOG_STEPS = 8;
  function fogRamp(color) {
    const ramp = [];
    for (let i = 0; i < FOG_STEPS; i++) {
      const t = Math.pow(i / (FOG_STEPS - 1), 1.35);
      ramp.push(rgb(mix(color, SKY, t * 0.86)));
    }
    return ramp;
  }

  const FOG = {
    grass: PAL.grass.map(fogRamp),
    rumble: PAL.rumble.map(fogRamp),
    road: PAL.road.map(fogRamp),
    lane: fogRamp(PAL.lane),
    paper: fogRamp(PAL.paper),
    ink: fogRamp(PAL.ink),
  };

  function easeIn(a, b, p) {
    return a + (b - a) * p * p;
  }

  function easeInOut(a, b, p) {
    return a + (b - a) * (0.5 - Math.cos(p * Math.PI) / 2);
  }

  function lastY() {
    return segments.length ? segments[segments.length - 1].p2.world.y : 0;
  }

  function addSegment(curve, y) {
    const n = segments.length;
    const seg = {
      index: n,
      p1: { world: { x: 0, y: lastY(), z: n * SEGMENT_LENGTH }, camera: {}, screen: {} },
      p2: { world: { x: 0, y, z: (n + 1) * SEGMENT_LENGTH }, camera: {}, screen: {} },
      curve,
      sprites: [],
      color: Math.floor(n / RUMBLE) % 2,
      stripe: null,
      clip: 0,
      visible: false,
    };
    segments.push(seg);
    if (n > 8 && n % 5 === 0) {
      const side = n % 10 === 0 ? -1 : 1;
      seg.sprites.push({
        type: "tree",
        offset: side * (1.35 + (n % 3) * 0.12),
        scale: 1.05 + (n % 4) * 0.08,
      });
    }
    if (n > 12 && n % 14 === 4) {
      const side = n % 28 === 4 ? 1 : -1;
      seg.sprites.push({
        type: "bean",
        offset: side * 1.72,
        scale: 0.85,
        tint: n % 4,
      });
    }
    if (n > 20 && n % 37 === 9) {
      seg.sprites.push({
        type: "sign",
        offset: n % 2 === 0 ? -1.55 : 1.55,
        scale: 1,
        tint: n % 3,
      });
    }
    return seg;
  }

  function addRoad(enter, hold, leave, curve, hill) {
    const startY = lastY();
    const endY = startY + hill * SEGMENT_LENGTH;
    const total = Math.max(1, enter + hold + leave);
    const step = (n, c) => addSegment(c, easeInOut(startY, endY, n / total));
    for (let n = 0; n < enter; n++) step(n, easeIn(0, curve, enter ? n / enter : 1));
    for (let n = 0; n < hold; n++) step(enter + n, curve);
    for (let n = 0; n < leave; n++) step(enter + hold + n, easeInOut(curve, 0, leave ? n / leave : 1));
  }

  function addStraight(len) {
    addRoad(len, 0, 0, 0, 0);
  }

  function markStripe(at, kind) {
    for (let i = 0; i < 6; i++) {
      const seg = segments[at + i];
      if (seg) seg.stripe = kind;
    }
    const host = segments[at + 2];
    if (host) host.sprites.push({ type: "banner", offset: 0, scale: 1, kind });
  }

  function addBoxes(back) {
    const i = segments.length - back;
    if (i < 10) return;
    [-0.52, 0, 0.52].forEach((offset) => {
      boxes.push({
        seg: i,
        z: i * SEGMENT_LENGTH + SEGMENT_LENGTH * 0.5,
        offset,
        active: true,
        timer: 0,
      });
    });
  }

  function buildTrack() {
    const S = 28;
    const M = 52;
    const L = 96;
    addStraight(46);
    markStripe(30, "start");
    gridZ = 26 * SEGMENT_LENGTH;
    addRoad(M, M, M, 2.2, 16);
    addStraight(S);
    addBoxes(14);
    addRoad(M, L, M, -4.2, 0);
    addRoad(M, M, M, 0, 32);
    addRoad(S, M, S, 6.2, -26);
    addStraight(M);
    addBoxes(18);
    addRoad(M, M, M, -3.1, 10);
    addRoad(S, L, S, 5.1, -14);
    addStraight(L);
    addBoxes(40);
    addRoad(M, M, M, -6.4, 20);
    addRoad(S, 150, S, 2.4, -28);
    addRoad(M, M, M, -4.4, 6);
    addStraight(S);
    addBoxes(16);
    addRoad(M, L, M, 3.6, 18);
    addRoad(S, M, S, -5.6, -22);
    addStraight(L + 10);
    const finishAt = segments.length - 18;
    markStripe(finishAt, "finish");
    finishZ = (finishAt + 3) * SEGMENT_LENGTH;
    addStraight(230);
  }

  function tuneSpeed() {
    const dist = Math.max(1, finishZ - gridZ);
    maxSpeed = dist / 50;
    boostSpeed = maxSpeed * 1.5;
    offLimit = maxSpeed * 0.36;
    accel = maxSpeed / 1.55;
  }

  function rollItem() {
    const bag = ["boost", "boost", "boost", "banana", "banana", "banana", "shield", "shield", "missile", "missile"];
    return bag[(Math.random() * bag.length) | 0];
  }

  function makeRacer(opts) {
    return {
      id: opts.id,
      name: opts.name,
      color: opts.color,
      me: !!opts.me,
      z: opts.z,
      prevZ: opts.z,
      x: opts.x,
      speed: 0,
      cruise: opts.cruise || maxSpeed * 0.84,
      skill: opts.skill || 0.8,
      line: opts.line || 0,
      phase: Math.random() * 6,
      item: null,
      itemCd: 0.4,
      shield: false,
      shieldT: 0,
      spin: 0,
      boost: 0,
      drift: 0,
      charge: 0,
      drifting: false,
      finished: false,
      finishTime: 0,
    };
  }

  function spawnRacers() {
    racers.length = 0;
    racers.push(
      makeRacer({
        id: 0,
        name: "나",
        color: "#ff8fb8",
        me: true,
        z: gridZ,
        x: -0.28,
        cruise: maxSpeed,
        skill: 1,
      }),
      makeRacer({
        id: 1,
        name: "콩이",
        color: "#7ce7c4",
        z: gridZ + 30,
        x: 0.3,
        cruise: maxSpeed * 0.86,
        skill: 0.9,
        line: 0.18,
      }),
      makeRacer({
        id: 2,
        name: "뭉치",
        color: "#ffe066",
        z: gridZ - 380,
        x: -0.22,
        cruise: maxSpeed * 0.8,
        skill: 0.74,
        line: -0.2,
      }),
      makeRacer({
        id: 3,
        name: "토실",
        color: "#d4b3ff",
        z: gridZ - 340,
        x: 0.26,
        cruise: maxSpeed * 0.9,
        skill: 0.86,
        line: 0.05,
      })
    );
    racers.forEach((r) => {
      r.prevZ = r.z;
    });
  }

  function segmentAt(z) {
    const i = Math.floor(z / SEGMENT_LENGTH);
    if (i < 0) return segments[0];
    if (i >= segments.length) return segments[segments.length - 1];
    return segments[i];
  }

  function showToast(text) {
    toast = { text, life: 1.15 };
  }

  function fireBoost(racer, tier) {
    const add = [0, 0.42, 0.78, 1.15][tier] || 0.7;
    racer.boost = Math.min(1.65, racer.boost + add);
    if (racer.me) {
      shake = Math.max(shake, 3.5 + tier * 1.6);
      sfx.boost();
      showToast(tier >= 3 ? "3단 부스터!" : tier === 2 ? "2단 부스터!" : "부스터!");
    }
  }

  function dropBanana(racer) {
    bananas.push({
      z: racer.z - 520,
      x: racer.x,
      owner: racer.id,
      life: 12,
    });
    if (bananas.length > 14) bananas.shift();
  }

  function nearestAhead(racer) {
    let best = null;
    for (const other of racers) {
      if (other === racer || other.finished) continue;
      if (other.z > racer.z + 80 && (!best || other.z < best.z)) best = other;
    }
    return best;
  }

  function someoneBehind(racer) {
    return racers.some((other) => other !== racer && !other.finished && racer.z - other.z > 40 && racer.z - other.z < 2800 && Math.abs(other.x - racer.x) < 0.7);
  }

  function fireMissile(racer) {
    const target = nearestAhead(racer);
    missiles.push({
      z: racer.z + 180,
      x: racer.x,
      target,
      owner: racer.id,
      life: 2.5,
    });
    if (racer.me) showToast(target ? "콩탄 발사!" : "콩탄!");
  }

  function useItem(racer) {
    if (!racer.item || racer.spin > 0) return;
    const it = racer.item;
    racer.item = null;
    if (it === "boost") fireBoost(racer, 2);
    else if (it === "banana") dropBanana(racer);
    else if (it === "shield") {
      racer.shield = true;
      racer.shieldT = 9;
      if (racer.me) showToast("방패!");
    } else if (it === "missile") fireMissile(racer);
    if (racer.me) sfx.tone(500, 0.08, "square", 0.04);
  }

  function applyHit(racer) {
    if (racer.shield) {
      racer.shield = false;
      racer.shieldT = 0;
      sfx.pop();
      if (racer.me) showToast("방패가 막았어요");
      return;
    }
    racer.spin = 0.85;
    racer.speed *= 0.42;
    racer.boost = 0;
    racer.charge = 0;
    racer.drifting = false;
    sfx.hit();
    if (racer.me) {
      shake = Math.max(shake, 8);
      showToast("스핀!");
    }
  }

  function crossed(z0, z1, mark) {
    return mark >= Math.min(z0, z1) - 20 && mark <= Math.max(z0, z1) + 20;
  }

  function tryPickups(racer) {
    if (racer.item || racer.finished) return;
    for (const box of boxes) {
      if (!box.active) continue;
      if (!crossed(racer.prevZ, racer.z, box.z)) continue;
      if (Math.abs(racer.x - box.offset) > 0.3) continue;
      box.active = false;
      box.timer = 8;
      racer.item = rollItem();
      racer.itemCd = 0.55 + Math.random() * 0.4;
      if (racer.me) {
        sfx.pickup();
        showToast(ITEM_INFO[racer.item].name + "!");
      }
      break;
    }
  }

  function tryHazards(racer) {
    if (racer.finished || racer.spin > 0) return;
    for (let i = bananas.length - 1; i >= 0; i--) {
      const b = bananas[i];
      if (b.owner === racer.id) continue;
      if (!crossed(racer.prevZ, racer.z, b.z)) continue;
      if (Math.abs(racer.x - b.x) > 0.24) continue;
      bananas.splice(i, 1);
      applyHit(racer);
      if (racer.me) showToast("바나나!");
      return;
    }
  }

  function updateBoxes(dt) {
    for (const box of boxes) {
      if (box.active) continue;
      box.timer -= dt;
      if (box.timer <= 0) box.active = true;
    }
    for (let i = bananas.length - 1; i >= 0; i--) {
      bananas[i].life -= dt;
      if (bananas[i].life <= 0) bananas.splice(i, 1);
    }
  }

  function updateMissiles(dt) {
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      m.life -= dt;
      const target = m.target && !m.target.finished ? m.target : null;
      if (target) m.x += (target.x - m.x) * Math.min(1, dt * 1.7);
      m.z += maxSpeed * 2.15 * dt;
      if (target && m.z >= target.z - 60 && Math.abs(m.x - target.x) < 0.26) {
        applyHit(target);
        if (target.me) showToast("콩탄 맞음!");
        else if (m.owner === 0) showToast("콩탄 명중!");
        missiles.splice(i, 1);
        continue;
      }
      if (m.life <= 0 || m.z > finishZ + 4000) missiles.splice(i, 1);
    }
  }

  function updateAI(ai, dt) {
    if (ai.finished) {
      ai.speed = Math.max(0, ai.speed - accel * dt);
      ai.z += ai.speed * dt;
      return;
    }
    ai.prevZ = ai.z;
    if (ai.shield) {
      ai.shieldT -= dt;
      if (ai.shieldT <= 0) ai.shield = false;
    }
    const seg = segmentAt(ai.z);
    const look = segmentAt(ai.z + 700);
    const curve = seg ? seg.curve : 0;
    const absC = Math.abs(curve);

    if (ai.spin > 0) {
      ai.spin -= dt;
      ai.speed = Math.max(offLimit * 0.5, ai.speed - accel * 1.4 * dt);
      ai.x += Math.sin((ai.spin + ai.phase) * 28) * dt * 0.9;
      ai.z += ai.speed * dt;
      if (ai.z >= finishZ) finishRacer(ai);
      return;
    }

    if (absC > 2.4 && ai.speed > maxSpeed * 0.45) ai.drift += dt;
    else if (ai.drift > 0.45) {
      ai.boost = Math.min(1.2, 0.35 + ai.drift * 0.38);
      ai.drift = 0;
    } else ai.drift = Math.max(0, ai.drift - dt);

    if (ai.boost > 0) {
      ai.boost -= dt;
      const target = ai.cruise * 1.22;
      ai.speed += (target - ai.speed) * Math.min(1, dt * 3.2);
    } else {
      let target = ai.cruise;
      if (absC > 3.2 && ai.drift < 0.15) target *= 0.7;
      else if (absC > 5) target *= 0.82;
      if (Math.abs(ai.x) > 1) target = offLimit * 0.9;
      ai.speed += (target - ai.speed) * Math.min(1, dt * 1.5);
    }

    const lookC = look ? look.curve : 0;
    let targetX = clamp(-lookC * 0.085 + ai.line, -0.78, 0.78);
    targetX += Math.sin(ai.z * 0.0008 + ai.phase) * (1 - ai.skill) * 0.16;
    ai.x += (targetX - ai.x) * Math.min(1, dt * (1.8 + ai.skill));
    const sp = clamp(ai.speed / maxSpeed, 0, 1.4);
    const slide = ai.drift > 0 ? 0.42 : 1;
    ai.x -= dt * 2 * sp * sp * curve * 0.34 * slide;
    ai.x = clamp(ai.x, -1.7, 1.7);
    ai.z += ai.speed * dt;

    tryPickups(ai);
    tryHazards(ai);

    ai.itemCd -= dt;
    if (ai.item && ai.itemCd <= 0) {
      if (ai.item === "shield") useItem(ai);
      else if (ai.item === "boost" && (ai.speed < ai.cruise * 0.92 || ai.itemCd < -1.2)) useItem(ai);
      else if (ai.item === "banana" && (someoneBehind(ai) || ai.itemCd < -1.6)) useItem(ai);
      else if (ai.item === "missile" && (nearestAhead(ai) || ai.itemCd < -1.4)) useItem(ai);
    }

    if (ai.drift > 0.2 && Math.random() < dt * 8) smokes.push({ z: ai.z - 80, x: ai.x, life: 0.35, max: 0.35 });
    if (ai.z >= finishZ) finishRacer(ai);
  }

  function finishRacer(racer) {
    if (racer.finished) return;
    racer.finished = true;
    racer.finishTime = raceTime;
    racer.speed = Math.min(racer.speed, maxSpeed);
    if (racer.me) {
      state = "done";
      doneAt = raceTime;
      shake = Math.max(shake, 5);
      sfx.finish();
      spawnConfetti();
      const record = saveBest(racer.finishTime);
      racer.newRecord = record;
      showToast(record ? "최고 기록!" : "골인!");
    }
  }

  function steerInput() {
    let s = 0;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) s -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD")) s += 1;
    if (Math.abs(stick.nx) > 0.12) s = stick.nx;
    return clamp(s, -1, 1);
  }

  function brakeInput() {
    return keys.has("ArrowDown") || keys.has("KeyS") || stick.ny > 0.55;
  }

  function driftInput() {
    return stick.drift || keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("Space");
  }

  function updatePlayer(dt) {
    const me = racers[0];
    me.prevZ = me.z;
    if (me.finished) {
      me.speed = Math.max(0, me.speed - accel * dt);
      me.z += me.speed * dt;
      me.drifting = false;
      return;
    }
    if (me.shield) {
      me.shieldT -= dt;
      if (me.shieldT <= 0) me.shield = false;
    }

    const seg = segmentAt(me.z);
    const curve = seg ? seg.curve : 0;
    let steer = steerInput();
    const braking = brakeInput();
    const wantDrift = driftInput() && me.speed > maxSpeed * 0.28 && me.spin <= 0;
    const drifting = wantDrift && Math.abs(steer) > 0.12;

    if (me.spin > 0) {
      me.spin -= dt;
      steer *= 0.15;
      me.speed = Math.max(offLimit * 0.45, me.speed - accel * 1.5 * dt);
      me.x += Math.sin(me.spin * 32) * dt * 1.1;
    } else if (braking) {
      me.speed = Math.max(0, me.speed - accel * 1.7 * dt);
    } else if (me.boost > 0) {
      me.boost -= dt;
      me.speed += (boostSpeed - me.speed) * Math.min(1, dt * 4.5);
    } else {
      const cap = Math.abs(me.x) > 1 ? offLimit : maxSpeed;
      if (me.speed < cap) me.speed = Math.min(cap, me.speed + accel * dt);
      else me.speed += (cap - me.speed) * Math.min(1, dt * 2.2);
      if (!drifting && Math.abs(curve) > 3 && me.speed > maxSpeed * 0.78) {
        me.speed -= (Math.abs(curve) - 2) * accel * 0.35 * dt;
      }
    }

    const sp = clamp(me.speed / maxSpeed, 0, 1.5);
    const steerRate = (1.25 + 0.55 * (1 - Math.min(1, sp))) * (drifting ? 1.18 : 1);
    me.x += steer * steerRate * dt;
    const centrifugal = drifting ? 0.12 : 0.34;
    me.x -= dt * 2 * sp * sp * curve * centrifugal;
    if (drifting) me.x += steer * dt * 0.35;
    me.x = clamp(me.x, -1.8, 1.8);

    if (Math.abs(me.x) > 1 && me.speed > offLimit && me.boost <= 0) {
      me.speed += (offLimit - me.speed) * Math.min(1, dt * 3.4);
    }

    if (drifting) {
      me.charge = Math.min(3, me.charge + dt * (0.7 + Math.min(1, Math.abs(steer)) * 0.55 + Math.min(1, Math.abs(curve) / 4) * 0.85));
      if (Math.random() < dt * 18) smokes.push({ z: me.z - 100, x: me.x + steer * 0.05, life: 0.4, max: 0.4 });
    }
    me.drifting = drifting;

    if (!wantDrift && me.charge > 0) {
      const tier = me.charge >= 2.65 ? 3 : me.charge >= 1.6 ? 2 : me.charge >= 0.72 ? 1 : 0;
      if (tier) fireBoost(me, tier);
      else if (me.charge > 0.2) me.speed *= 0.94;
      me.charge = 0;
    }

    me.z += me.speed * dt;
    tryPickups(me);
    tryHazards(me);
    if (me.z >= finishZ) finishRacer(me);
  }

  function resolveBumps() {
    for (let i = 0; i < racers.length; i++) {
      for (let j = i + 1; j < racers.length; j++) {
        const a = racers[i];
        const b = racers[j];
        if (a.finished && b.finished) continue;
        if (Math.abs(a.z - b.z) > 170) continue;
        if (Math.abs(a.x - b.x) > 0.3) continue;
        const push = a.x < b.x ? -1 : 1;
        a.x += push * 0.04;
        b.x -= push * 0.04;
        if (a.z < b.z) a.speed *= 0.96;
        else b.speed *= 0.96;
        if (a.me || b.me) shake = Math.max(shake, 2.5);
      }
    }
  }

  function ranking() {
    return [...racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.z - a.z;
    });
  }

  function updateHud() {
    const order = ranking();
    const me = racers[0];
    const place = order.findIndex((r) => r.me) + 1;
    rankEl.textContent = String(place || 1);
    rankTotalEl.textContent = `/${racers.length}`;
    timeEl.textContent = formatTime(me.finished ? me.finishTime : raceTime);
    const span = Math.max(1, finishZ - gridZ);
    const p = clamp((me.z - gridZ) / span, 0, 1);
    progressEl.style.width = `${(p * 100).toFixed(1)}%`;
    const charge = me.boost > 0 ? 3 : me.charge;
    pips.forEach((el, i) => {
      el.style.setProperty("--fill", String(clamp(charge - i, 0, 1)));
    });
    boostMeter.classList.toggle("firing", me.boost > 0);
    if (me.item) {
      const info = ITEM_INFO[me.item];
      itemSlot.classList.add("ready");
      itemSlot.classList.remove("empty");
      itemIcon.textContent = info.icon;
      itemName.textContent = info.name;
      itemBtn?.classList.add("ready");
    } else {
      itemSlot.classList.remove("ready");
      itemSlot.classList.add("empty");
      itemIcon.textContent = "·";
      itemName.textContent = "없음";
      itemBtn?.classList.remove("ready");
    }
  }

  function spawnConfetti() {
    confetti = [];
    const colors = ["#ff8fb8", "#7ce7c4", "#ffe066", "#d4b3ff", "#8ec5ff"];
    for (let i = 0; i < 70; i++) {
      confetti.push({
        x: Math.random(),
        y: -Math.random() * 0.4,
        vy: 0.25 + Math.random() * 0.55,
        vx: (Math.random() - 0.5) * 0.15,
        r: 3 + Math.random() * 4,
        c: colors[i % colors.length],
        rot: Math.random() * 6,
      });
    }
  }

  function project(p, camX, camY, camZ, depth, width, height) {
    const cz = p.world.z - camZ;
    p.camera.z = cz;
    p.camera.x = -camX;
    p.camera.y = p.world.y - camY;
    if (cz <= 0.01) {
      p.screen.scale = 0;
      return;
    }
    const scale = depth / cz;
    p.screen.scale = scale;
    p.screen.x = width / 2 + scale * (0 - camX) * width * 0.5;
    p.screen.y = height / 2 - scale * p.camera.y * height * 0.5;
    p.screen.w = scale * ROAD_WIDTH * width * 0.5;
  }

  function poly(x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function makeCanvas(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    return c;
  }

  function drawBeanShape(g, w, h, color, face) {
    g.fillStyle = "rgba(43,33,64,0.18)";
    g.beginPath();
    g.ellipse(w / 2, h * 0.86, w * 0.28, h * 0.06, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.strokeStyle = INK;
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(w / 2, h * 0.58, w * 0.3, h * 0.28, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#8fd18a";
    g.beginPath();
    g.ellipse(w / 2, h * 0.28, 7, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (face) {
      g.fillStyle = INK;
      g.beginPath();
      g.ellipse(w * 0.4, h * 0.54, 4, 5, 0, 0, Math.PI * 2);
      g.ellipse(w * 0.6, h * 0.54, 4, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(w / 2, h * 0.62, 8, 0.15, Math.PI - 0.15);
      g.stroke();
    }
  }

  function buildSprites() {
    sprites.tree = makeCanvas(128, 168, (g, w, h) => {
      g.fillStyle = "#d38b5f";
      g.strokeStyle = INK;
      g.lineWidth = 6;
      roundOn(g, w * 0.42, h * 0.48, w * 0.16, h * 0.4, 6);
      g.fill();
      g.stroke();
      g.fillStyle = "#7ce7c4";
      g.beginPath();
      g.arc(w * 0.5, h * 0.4, 46, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#ff8fb8";
      g.beginPath();
      g.arc(w * 0.38, h * 0.36, 7, 0, Math.PI * 2);
      g.arc(w * 0.62, h * 0.42, 6, 0, Math.PI * 2);
      g.fill();
    });
    sprites.beans = ["#ff8fb8", "#7ce7c4", "#ffe066", "#d4b3ff"].map((color) =>
      makeCanvas(120, 150, (g, w, h) => drawBeanShape(g, w, h, color, true))
    );
    sprites.signs = ["급커브", "콩길", "부스터"].map((text, i) =>
      makeCanvas(180, 140, (g, w, h) => {
        const bg = ["#ff8fb8", "#ffe066", "#7ce7c4"][i];
        g.fillStyle = "#fffdf8";
        g.fillRect(w * 0.46, 52, 10, h - 52);
        g.strokeStyle = INK;
        g.lineWidth = 6;
        g.strokeRect(w * 0.46, 52, 10, h - 56);
        g.fillStyle = bg;
        roundOn(g, 12, 10, w - 24, 64, 12);
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = 6;
        g.stroke();
        g.fillStyle = INK;
        g.font = "700 28px Jua, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, w / 2, 42);
      })
    );
    sprites.banner = {
      start: makeBanner("출발", "#7ce7c4"),
      finish: makeBanner("골인", "#ffe066"),
    };
    sprites.banana = makeCanvas(140, 90, (g, w, h) => {
      g.lineCap = "round";
      g.strokeStyle = "#f5c400";
      g.lineWidth = 18;
      g.beginPath();
      g.arc(w * 0.48, h * 0.95, 46, Math.PI * 1.12, Math.PI * 1.88);
      g.stroke();
      g.strokeStyle = INK;
      g.lineWidth = 5;
      g.beginPath();
      g.arc(w * 0.48, h * 0.95, 46, Math.PI * 1.12, Math.PI * 1.88);
      g.stroke();
      g.fillStyle = "#6a4a12";
      g.beginPath();
      g.arc(w * 0.78, h * 0.28, 5, 0, Math.PI * 2);
      g.fill();
    });
  }

  function roundOn(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function makeBanner(text, bg) {
    return makeCanvas(360, 180, (g, w, h) => {
      g.strokeStyle = INK;
      g.lineWidth = 8;
      g.fillStyle = "#fffdf8";
      g.fillRect(28, 20, 16, 150);
      g.strokeRect(28, 20, 16, 150);
      g.fillRect(w - 44, 20, 16, 150);
      g.strokeRect(w - 44, 20, 16, 150);
      g.fillStyle = bg;
      roundOn(g, 18, 28, w - 36, 78, 16);
      g.fill();
      g.stroke();
      g.fillStyle = INK;
      g.font = "700 48px Jua, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, w / 2, 68);
    });
  }

  function resize() {
    const coarse = matchMedia("(pointer: coarse)").matches;
    dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.35 : 1.75);
    viewW = canvas.clientWidth || window.innerWidth;
    viewH = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.floor(viewW * dpr));
    canvas.height = Math.max(1, Math.floor(viewH * dpr));
    drawDistance = viewW < 760 ? 120 : 180;
    skyGrad = ctx.createLinearGradient(0, 0, 0, viewH);
    skyGrad.addColorStop(0, "#8ec5ff");
    skyGrad.addColorStop(0.42, "#d7f1ff");
    skyGrad.addColorStop(0.72, "#ffe4f2");
    skyGrad.addColorStop(1, "#fff3d6");
  }

  function drawSky(shift) {
    ctx.fillStyle = skyGrad || "#8ec5ff";
    ctx.fillRect(0, 0, viewW, viewH);
    const sunY = viewH * 0.3;
    ctx.fillStyle = "#ffe066";
    ctx.beginPath();
    ctx.arc(viewW * 0.78 + shift * 0.05, sunY, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const clouds = [
      [0.12, 0.16, 70],
      [0.4, 0.22, 90],
      [0.62, 0.12, 60],
    ];
    for (const [px, py, rw] of clouds) {
      const x = ((px * viewW + shift * 0.25) % (viewW + 160)) - 80;
      const y = py * viewH;
      ctx.beginPath();
      ctx.ellipse(x, y, rw, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(x - rw * 0.35, y + 6, rw * 0.45, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(x + rw * 0.4, y + 4, rw * 0.4, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const base = viewH * 0.5;
    ctx.fillStyle = "#e4d4ff";
    ctx.beginPath();
    ctx.moveTo(0, base);
    for (let i = 0; i <= 8; i++) {
      const x = ((i / 8) * (viewW + 80) + shift * 0.45) % (viewW + 80) - 40;
      const peak = base - viewH * (0.08 + ((i * 37) % 10) * 0.012);
      ctx.lineTo(x, peak);
      ctx.lineTo(x + 48, base);
    }
    ctx.lineTo(viewW, base);
    ctx.lineTo(0, base);
    ctx.fill();
  }

  function drawRoad() {
    const me = racers[0];
    const camZ = me.z - PLAYER_Z;
    const playerSeg = segmentAt(me.z);
    const playerPercent = clamp((me.z - playerSeg.p1.world.z) / SEGMENT_LENGTH, 0, 1);
    const playerY = playerSeg.p1.world.y + (playerSeg.p2.world.y - playerSeg.p1.world.y) * playerPercent;
    const depth = 1 / Math.tan((fov / 2) * Math.PI / 180);
    const base = segmentAt(camZ);
    const basePercent = clamp((camZ - base.p1.world.z) / SEGMENT_LENGTH, 0, 1);

    let x = 0;
    let dx = -(base.curve * basePercent);
    const camY = playerY + CAMERA_HEIGHT;

    for (let n = 0; n < drawDistance; n++) {
      const idx = base.index + n;
      if (idx >= segments.length) break;
      const seg = segments[idx];
      seg.visible = false;
      project(seg.p1, me.x * ROAD_WIDTH - x, camY, camZ, depth, viewW, viewH);
      const x2 = x + dx;
      project(seg.p2, me.x * ROAD_WIDTH - x2, camY, camZ, depth, viewW, viewH);
      x = x2;
      dx += seg.curve;

      const fog = Math.min(FOG_STEPS - 1, (n / drawDistance) * (FOG_STEPS - 1) * 1.15) | 0;
      seg.fog = fog;

      if (seg.p1.camera.z <= BASE_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= viewH) continue;

      const y1 = seg.p1.screen.y;
      const y2 = seg.p2.screen.y;
      const x1 = seg.p1.screen.x;
      const w1 = seg.p1.screen.w;
      const sx2 = seg.p2.screen.x;
      const w2 = seg.p2.screen.w;
      const alt = seg.color;
      const top = Math.max(-20, y2);
      const bot = Math.min(viewH + 40, y1);
      if (bot > top) {
        ctx.fillStyle = FOG.grass[alt][fog];
        ctx.fillRect(0, top, viewW, bot - top);
      }
      const rumble = seg.stripe ? FOG.ink[fog] : FOG.rumble[alt][fog];
      const road = seg.stripe ? FOG.paper[fog] : FOG.road[alt][fog];
      const r1 = w1 * 0.14;
      const r2 = w2 * 0.14;
      poly(x1 - w1 - r1, y1, x1 + w1 + r1, y1, sx2 + w2 + r2, y2, sx2 - w2 - r2, y2, rumble);
      poly(x1 - w1, y1, x1 + w1, y1, sx2 + w2, y2, sx2 - w2, y2, road);
      if (seg.stripe) {
        const cols = 10;
        for (let c = 0; c < cols; c++) {
          if ((c + seg.index) % 2 === 0) continue;
          const t0 = -1 + (2 * c) / cols;
          const t1 = -1 + (2 * (c + 1)) / cols;
          poly(x1 + t0 * w1, y1, x1 + t1 * w1, y1, sx2 + t1 * w2, y2, sx2 + t0 * w2, y2, FOG.ink[fog]);
        }
      } else if (seg.index % 6 < 3) {
        const lane = FOG.lane[fog];
        const marks = [-w1 / 3, w1 / 3];
        const marks2 = [-w2 / 3, w2 / 3];
        for (let m = 0; m < marks.length; m++) {
          const lw1 = w1 * 0.025;
          const lw2 = w2 * 0.025;
          poly(
            x1 + marks[m] - lw1,
            y1,
            x1 + marks[m] + lw1,
            y1,
            sx2 + marks2[m] + lw2,
            y2,
            sx2 + marks2[m] - lw2,
            y2,
            lane
          );
        }
      }
      seg.visible = true;
      seg.clip = y1;
    }
    return { camZ, depth, playerY };
  }

  function spritePoint(z, xOff) {
    const i = Math.floor(z / SEGMENT_LENGTH);
    const seg = segments[i];
    if (!seg || !seg.visible || seg.p1.camera.z <= BASE_DEPTH) return null;
    const p = clamp((z - seg.p1.world.z) / SEGMENT_LENGTH, 0, 1);
    const sw = seg.p1.screen.w + (seg.p2.screen.w - seg.p1.screen.w) * p;
    const sx = seg.p1.screen.x + (seg.p2.screen.x - seg.p1.screen.x) * p;
    const sy = seg.p1.screen.y + (seg.p2.screen.y - seg.p1.screen.y) * p;
    if (sy >= seg.clip + 8) return null;
    return { x: sx + xOff * sw, y: sy, sw, seg };
  }

  function drawImageSprite(img, pt, heightRatio, yLift) {
    if (!img || !pt || pt.sw < 2) return;
    const h = pt.sw * heightRatio;
    const w = h * (img.width / img.height);
    if (h < 3 || h > viewH * 1.4) return;
    ctx.drawImage(img, pt.x - w / 2, pt.y - h * yLift, w, h);
  }

  function drawWorldSprites() {
    const base = segmentAt(racers[0].z - PLAYER_Z).index;
    for (let n = drawDistance - 1; n >= 0; n--) {
      const seg = segments[base + n];
      if (!seg || !seg.visible) continue;
      for (const sp of seg.sprites) {
        const pt = {
          x: seg.p1.screen.x + sp.offset * seg.p1.screen.w,
          y: seg.p1.screen.y,
          sw: seg.p1.screen.w,
        };
        if (pt.y >= seg.clip) continue;
        if (sp.type === "tree") drawImageSprite(sprites.tree, pt, 2.1 * sp.scale, 1);
        else if (sp.type === "bean") drawImageSprite(sprites.beans[sp.tint] || sprites.beans[0], pt, 1.35 * sp.scale, 1);
        else if (sp.type === "sign") drawImageSprite(sprites.signs[sp.tint] || sprites.signs[0], pt, 1.5 * sp.scale, 1);
        else if (sp.type === "banner") {
          const img = sprites.banner[sp.kind];
          const w = seg.p1.screen.w * 2.5;
          const h = w * (img.height / img.width);
          if (h > 6 && h < viewH) ctx.drawImage(img, pt.x - w / 2, pt.y - h, w, h);
        }
      }
    }

    const dynamics = [];
    for (const box of boxes) {
      if (!box.active) continue;
      dynamics.push({ z: box.z, kind: "box", x: box.offset, box });
    }
    for (const b of bananas) dynamics.push({ z: b.z, kind: "banana", x: b.x });
    for (const m of missiles) dynamics.push({ z: m.z, kind: "missile", x: m.x });
    for (const s of smokes) dynamics.push({ z: s.z, kind: "smoke", x: s.x, smoke: s });
    for (const r of racers) {
      if (!r.me && !r.finished) dynamics.push({ z: r.z, kind: "kart", x: r.x, racer: r });
      else if (!r.me && r.finished) dynamics.push({ z: r.z, kind: "kart", x: r.x, racer: r });
    }
    dynamics.sort((a, b) => b.z - a.z);
    const t = performance.now() / 1000;
    for (const d of dynamics) {
      const bob = d.kind === "box" ? Math.sin(t * 4 + d.z) * 0.08 : 0;
      const pt = spritePoint(d.z, d.x);
      if (!pt) continue;
      if (d.kind === "box") drawBox(pt, bob);
      else if (d.kind === "banana") drawImageSprite(sprites.banana, pt, 0.55, 0.7);
      else if (d.kind === "missile") drawMissile(pt);
      else if (d.kind === "smoke") drawSmoke(pt, d.smoke);
      else if (d.kind === "kart") drawWorldKart(pt, d.racer, t);
    }
  }

  function drawBox(pt, bob) {
    const s = pt.sw * 0.22;
    if (s < 4 || s > viewH) return;
    const y = pt.y - s * (1.15 + bob);
    ctx.save();
    ctx.translate(pt.x, y);
    ctx.rotate(Math.sin(performance.now() / 280 + pt.x) * 0.25);
    ctx.fillStyle = "#ffe066";
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, s * 0.08);
    roundRect(-s / 2, -s / 2, s, s, s * 0.18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `${Math.max(10, s * 0.55)}px Jua, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", 0, s * 0.04);
    ctx.restore();
  }

  function drawMissile(pt) {
    const s = pt.sw * 0.16;
    if (s < 3) return;
    ctx.save();
    ctx.translate(pt.x, pt.y - s);
    ctx.fillStyle = "#ff8fb8";
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, s * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-s * 0.22, -s * 0.05, s * 0.08, 0, Math.PI * 2);
    ctx.arc(s * 0.22, -s * 0.05, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSmoke(pt, smoke) {
    const k = clamp(smoke.life / smoke.max, 0, 1);
    const s = pt.sw * (0.18 + (1 - k) * 0.25);
    ctx.fillStyle = `rgba(255,253,248,${0.35 * k})`;
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y - s * 0.2, s, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWorldKart(pt, racer, t) {
    const s = pt.sw * 0.4;
    if (s < 6 || s > viewH * 0.8) return;
    ctx.save();
    ctx.translate(pt.x, pt.y);
    const wobble = racer.spin > 0 ? Math.sin(t * 30) * 0.4 : 0;
    ctx.rotate(wobble);
    paintKart(s, racer.color, racer.boost > 0, racer.shield, t, false);
    if (s > 28) {
      ctx.fillStyle = INK;
      ctx.font = `${Math.max(10, s * 0.16)}px Jua, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(racer.name, 0, -s * 1.35);
    }
    ctx.restore();
  }

  function paintKart(s, color, boosting, shield, t, rearFace) {
    ctx.fillStyle = "rgba(43,33,64,0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 4, s * 0.46, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    const wheel = (x) => {
      ctx.fillStyle = INK;
      roundRect(x - s * 0.1, -s * 0.34, s * 0.2, s * 0.42, s * 0.06);
      ctx.fill();
      ctx.fillStyle = "#fffdf8";
      ctx.beginPath();
      ctx.arc(x, -s * 0.12, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
    };
    wheel(-s * 0.34);
    wheel(s * 0.34);

    ctx.fillStyle = color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(3, s * 0.045);
    roundRect(-s * 0.36, -s * 0.72, s * 0.72, s * 0.5, s * 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    roundRect(-s * 0.22, -s * 0.64, s * 0.44, s * 0.1, s * 0.05);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.78, s * 0.2, s * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#8fd18a";
    ctx.beginPath();
    ctx.ellipse(0, -s * 1.05, s * 0.045, s * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (rearFace) {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(-s * 0.07, -s * 0.8, s * 0.025, 0, Math.PI * 2);
      ctx.arc(s * 0.07, -s * 0.8, s * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }

    if (boosting) {
      const flick = 0.75 + Math.sin(t * 40) * 0.25;
      ctx.fillStyle = "#ffe066";
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, -s * 0.18);
      ctx.lineTo(0, s * 0.28 * flick);
      ctx.lineTo(s * 0.12, -s * 0.18);
      ctx.fill();
      ctx.fillStyle = "#ff8fb8";
      ctx.beginPath();
      ctx.moveTo(-s * 0.06, -s * 0.16);
      ctx.lineTo(0, s * 0.12 * flick);
      ctx.lineTo(s * 0.06, -s * 0.16);
      ctx.fill();
    }

    if (shield) {
      ctx.strokeStyle = "rgba(142,197,255,0.95)";
      ctx.lineWidth = Math.max(3, s * 0.04);
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.55, s * 0.55, s * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlayerKart() {
    const me = racers[0];
    const coarse = matchMedia("(pointer: coarse)").matches;
    const s = clamp(Math.min(viewW, viewH) * 0.2, 86, 150);
    const y = viewH - (coarse ? 28 : 18);
    const steer = steerInput();
    const t = performance.now() / 1000;
    ctx.save();
    ctx.translate(viewW / 2 + steer * 18, y);
    const yaw = steer * (me.drifting ? 0.38 : 0.16);
    ctx.rotate(yaw + (me.spin > 0 ? Math.sin(t * 28) * 0.35 : 0));
    paintKart(s, me.color, me.boost > 0, me.shield, t, true);
    ctx.restore();
  }

  function drawSpeedLines(ratio, boosting) {
    const amt = boosting ? 1 : clamp((ratio - 0.62) / 0.38, 0, 1);
    if (amt <= 0.02) return;
    const cx = viewW / 2;
    const cy = viewH * 0.46;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = 2;
    const n = 16;
    const time = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + time * 0.4;
      const inner = Math.min(viewW, viewH) * (0.28 + (i % 3) * 0.03);
      const len = (18 + (i % 4) * 10) * amt;
      ctx.strokeStyle = `rgba(255,253,248,${0.18 + amt * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner * 0.62);
      ctx.lineTo(Math.cos(a) * (inner + len), Math.sin(a) * (inner + len) * 0.62);
      ctx.stroke();
    }
    ctx.restore();
    if (boosting) {
      const g = ctx.createRadialGradient(cx, cy, viewH * 0.15, cx, cy, viewH * 0.72);
      g.addColorStop(0, "rgba(255,224,102,0)");
      g.addColorStop(1, "rgba(255,143,184,0.2)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  function drawToast() {
    if (!toast) return;
    ctx.font = "700 32px Jua, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = INK;
    ctx.fillStyle = "#fffdf8";
    const y = viewH * 0.3;
    ctx.strokeText(toast.text, viewW / 2, y);
    ctx.fillText(toast.text, viewW / 2, y);
  }

  function drawConfetti(dt) {
    if (!confetti.length) return;
    for (const c of confetti) {
      c.y += c.vy * dt;
      c.x += c.vx * dt;
      c.rot += dt * 4;
      ctx.save();
      ctx.translate(c.x * viewW, c.y * viewH);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.c;
      ctx.fillRect(-c.r, -c.r * 0.6, c.r * 2, c.r * 1.2);
      ctx.restore();
    }
    if (confetti[0] && confetti[0].y > 1.2) confetti.length = 0;
  }

  function render(dt) {
    const me = racers[0];
    const ratio = clamp(me.speed / maxSpeed, 0, 1.5);
    const targetFov = BASE_FOV + Math.min(1, ratio) * 8 + (me.boost > 0 ? 14 : 0);
    fov += (targetFov - fov) * Math.min(1, dt * 4);
    shake = Math.max(0, shake - dt * 16);
    const sx = Math.sin(raceTime * 70) * shake;
    const sy = Math.cos(raceTime * 54) * shake * 0.65;
    const steer = steerInput();

    ctx.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
    ctx.translate(viewW / 2, viewH / 2);
    ctx.rotate(steer * (me.drifting ? 0.035 : 0.015));
    ctx.translate(-viewW / 2, -viewH / 2);

    drawSky(-me.x * 70);
    drawRoad();
    drawWorldSprites();
    drawPlayerKart();
    drawSpeedLines(ratio, me.boost > 0);
    drawToast();
    drawConfetti(dt);
  }

  function tickSmokes(dt) {
    for (let i = smokes.length - 1; i >= 0; i--) {
      smokes[i].life -= dt;
      if (smokes[i].life <= 0) smokes.splice(i, 1);
    }
    if (smokes.length > 50) smokes.splice(0, smokes.length - 50);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (state === "racing" || state === "done") {
      raceTime += dt;
      updatePlayer(dt);
      for (let i = 1; i < racers.length; i++) updateAI(racers[i], dt);
      updateMissiles(dt);
      updateBoxes(dt);
      resolveBumps();
      if (toast) {
        toast.life -= dt;
        if (toast.life <= 0) toast = null;
      }
      updateHud();
      if (state === "done" && raceTime - doneAt > 1.05) showResults();
    }
    tickSmokes(dt);
    const me = racers[0];
    sfx.setDrive(
      clamp(me.speed / maxSpeed, 0, 1.4),
      me.boost > 0,
      me.drifting,
      state === "racing" || state === "countdown" || state === "done"
    );
    render(dt);
    requestAnimationFrame(frame);
  }

  function projectRemaining() {
    const saved = raceTime;
    let sim = 0;
    while (sim < 40 && racers.some((r) => !r.me && !r.finished)) {
      const dt = 0.05;
      sim += dt;
      raceTime = saved + sim;
      for (let i = 1; i < racers.length; i++) updateAI(racers[i], dt);
      updateMissiles(dt);
    }
    raceTime = saved;
  }

  function showResults() {
    if (state !== "done") return;
    state = "result";
    projectRemaining();
    hud.classList.add("hidden");
    document.getElementById("touch-ui")?.classList.add("hidden");
    const order = ranking();
    const me = racers[0];
    const place = order.findIndex((r) => r.me) + 1;
    const titles = ["1등 골인!", "2등 골인!", "3등 골인!", "아쉽지만 골인!"];
    document.getElementById("result-title").textContent = titles[place - 1] || "골인!";
    const best = loadBest();
    const gap = best && !me.newRecord ? me.finishTime - best : 0;
    let sub = `기록 ${formatTime(me.finishTime)}`;
    if (me.newRecord) sub += " · 최고 기록 갱신!";
    else if (best) sub += ` · 최고까지 ${gap.toFixed(2)}초`;
    document.getElementById("result-sub").textContent = sub;
    boardEl.innerHTML = "";
    order.forEach((r, i) => {
      const li = document.createElement("li");
      if (r.me) li.className = "me";
      const time = r.finished ? formatTime(r.finishTime) : "주행 중";
      li.innerHTML = `<span class="place">${i + 1}</span><span>${r.name}</span><span>${time}</span>`;
      boardEl.appendChild(li);
    });
    paintBest();
    resultEl.classList.remove("hidden");
  }

  function resetRace() {
    bananas.length = 0;
    missiles.length = 0;
    smokes.length = 0;
    confetti = [];
    toast = null;
    boxes.forEach((b) => {
      b.active = true;
      b.timer = 0;
    });
    spawnRacers();
    raceTime = 0;
    doneAt = 0;
    fov = BASE_FOV;
    shake = 0;
    updateHud();
    paintBest();
  }

  function onResize() {
    resize();
  }

  window.addEventListener("keydown", (e) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if ((e.code === "KeyF" || e.code === "KeyE") && state === "racing") useItem(racers[0]);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => {
    keys.clear();
    stick.drift = false;
    stick.nx = 0;
    stick.ny = 0;
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

  function bindHold(el, onDown, onUp) {
    if (!el) return;
    const down = (e) => {
      e.preventDefault();
      onDown();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("lostpointercapture", onUp);
  }

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
    if (state === "racing") useItem(racers[0]);
  });
  canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  document.getElementById("btn-start").addEventListener("click", () => {
    sfx.boot();
    resetRace();
    startEl.classList.add("hidden");
    resultEl.classList.add("hidden");
    hud.classList.remove("hidden");
    document.getElementById("touch-ui")?.classList.remove("hidden");
    document.getElementById("touch-ui")?.setAttribute("aria-hidden", "false");
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
          if (state === "countdown") {
            state = "racing";
            raceTime = 0;
          }
        }, 520);
      }
    };
    step();
  });

  document.getElementById("btn-retry").addEventListener("click", () => {
    resultEl.classList.add("hidden");
    document.getElementById("btn-start").click();
  });

  muteBtn.addEventListener("click", () => {
    sfx.enabled = !sfx.enabled;
    muteBtn.textContent = sfx.enabled ? "🔊" : "🔇";
    muteBtn.setAttribute("aria-label", sfx.enabled ? "소리 끄기" : "소리 켜기");
    if (sfx.enabled) sfx.boot();
  });

  buildTrack();
  tuneSpeed();
  spawnRacers();
  buildSprites();
  document.fonts?.ready?.then(() => buildSprites());
  paintBest();
  resize();
  window.__kongTrider = {
    get state() {
      return state;
    },
    get time() {
      return raceTime;
    },
    get maxSpeed() {
      return maxSpeed;
    },
    get finishZ() {
      return finishZ;
    },
    get gridZ() {
      return gridZ;
    },
    snapshot() {
      return racers.map((r) => ({
        name: r.name,
        me: r.me,
        z: r.z,
        x: r.x,
        speed: r.speed,
        finished: r.finished,
        finishTime: r.finishTime,
        item: r.item,
      }));
    },
  };
  requestAnimationFrame(frame);
})();
