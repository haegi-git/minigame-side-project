/* 콩가이 — horizontal Tengai-style shooter. No build step. */
(() => {
  let W = 960;
  let H = 540;
  const HI_KEY = "kongai-hiscore";

  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const el = {
    hud: document.getElementById("hud"),
    score: document.getElementById("score"),
    hi: document.getElementById("hi"),
    lives: document.getElementById("lives"),
    bombs: document.getElementById("bombs"),
    power: document.getElementById("power"),
    charge: document.getElementById("charge-fill"),
    bossHud: document.getElementById("boss-hud"),
    bossName: document.getElementById("boss-name"),
    bossFill: document.getElementById("boss-fill"),
    banner: document.getElementById("banner"),
    bannerK: document.getElementById("banner-k"),
    bannerT: document.getElementById("banner-t"),
    title: document.getElementById("title"),
    panel: document.getElementById("panel"),
    panelKicker: document.getElementById("panel-kicker"),
    panelTitle: document.getElementById("panel-title"),
    panelSub: document.getElementById("panel-sub"),
    panelStats: document.getElementById("panel-stats"),
    btnNext: document.getElementById("btn-next"),
    btnStart: document.getElementById("btn-start"),
    mute: document.getElementById("mute"),
    charRow: document.getElementById("char-row"),
    stageRow: document.getElementById("stage-row"),
  };

  const CHARS = [
    {
      id: "ninja",
      name: "닌자콩",
      color: "#7ce7c4",
      blurb: "빠른 표창. 차지는 관통 수리검. 폭탄은 연막.",
      rate: 0.085,
      shot(p, lvl) {
        const n = 1 + lvl;
        for (let i = 0; i < n; i++) {
          const a = (i - (n - 1) / 2) * 0.07;
          shot(p.x + 18, p.y, a, 760, 5, 1, "#d9fff4", "orb", 1);
        }
      },
      charge(p) {
        for (let i = 0; i < 6; i++) {
          const a = (i - 2.5) * 0.12;
          shot(p.x + 16, p.y, a, 980, 7, 7, "#b8fff0", "knife", 8);
        }
      },
    },
    {
      id: "miko",
      name: "무녀콩",
      color: "#ff8fb8",
      blurb: "부적 부채꼴. 차지는 유도 영령. 폭탄은 정화진.",
      rate: 0.11,
      shot(p, lvl) {
        const n = 3 + lvl;
        for (let i = 0; i < n; i++) {
          const a = (i - (n - 1) / 2) * 0.14;
          shot(p.x + 16, p.y + (i - (n - 1) / 2) * 2, a, 560, 5, 1, "#ffe0ee", "knife", 1);
        }
      },
      charge(p) {
        for (let i = 0; i < 4; i++) {
          const a = (i - 1.5) * 0.35;
          shot(p.x + 12, p.y, a, 280, 8, 8, "#fff6c8", "home", 1);
        }
      },
    },
    {
      id: "samurai",
      name: "사무라이콩",
      color: "#ffe066",
      blurb: "무거운 참격. 차지는 일섬. 폭탄은 발도.",
      rate: 0.2,
      shot(p, lvl) {
        shot(p.x + 20, p.y, 0, 680, 8 + lvl, 3 + lvl, "#fff3b0", "knife", 2);
        if (lvl >= 3) {
          shot(p.x + 14, p.y - 10, -0.08, 640, 6, 2, "#ffe066", "knife", 1);
          shot(p.x + 14, p.y + 10, 0.08, 640, 6, 2, "#ffe066", "knife", 1);
        }
      },
      charge(p) {
        p.beam = 0.42;
        p.beamTick = 0;
      },
    },
  ];

  const STAGES = [
    { name: "벚꽃 성읍", sub: "아침 안개와 흩날리는 꽃잎", mid: "등롱 요괴", boss: "벚꽃 장군", midBrain: "lantern", bossBrain: "general", color: "#ff8fb8" },
    { name: "뇌운 요새", sub: "폭풍의 바다 위 하늘 성채", mid: "뇌운 함선", boss: "요새의 핵", midBrain: "ship", bossBrain: "fortress", color: "#9be7ff" },
    { name: "달밤 신사", sub: "혼불이 도는 밤의 참배길", mid: "여우령", boss: "신사 수호령", midBrain: "fox", bossBrain: "guardian", color: "#d4b3ff" },
  ];

  const view = { s: 1, ox: 0, oy: 0 };
  const keys = new Set();
  const pointer = { down: false, id: null };
  let focusHeld = false;
  let uidSeq = 1;
  let mode = "title";
  let charIndex = 0;
  let stageIndex = 0;
  let continues = 2;
  let score = 0;
  let hi = Number(localStorage.getItem(HI_KEY) || 0) || 0;
  let stageStartScore = 0;
  let grazeN = 0;
  let killN = 0;
  let itemN = 0;
  let shake = 0;
  let flash = 0;
  let bannerT = 0;
  let clearT = 0;
  let cam = 0;
  let shotSnd = 0;
  const director = { t: 0, hold: 0, spawned: {}, fighting: false };

  const player = {
    x: 140, y: H / 2, vx: 0, vy: 0,
    hitR: 4.6, grazeR: 28,
    lives: 3, bombs: 3, power: 0,
    charge: 0, chargeFull: false, fireCd: 0, firing: false,
    inv: 0, bombT: 0, bombId: 0, beam: 0, beamTick: 0,
    charId: "ninja", color: "#7ce7c4", anim: 0, muzzle: 0,
  };

  let mid = null;
  let boss = null;

  function makePool(n, extra) {
    const all = [];
    for (let i = 0; i < n; i++) all.push(Object.assign({ alive: false }, extra ? extra() : {}));
    return {
      all,
      alloc() {
        for (let i = 0; i < n; i++) {
          if (!all[i].alive) {
            all[i].alive = true;
            return all[i];
          }
        }
        return null;
      },
    };
  }

  const bullets = makePool(560, () => ({ hits: [] }));
  const enemies = makePool(36);
  const items = makePool(28);
  const parts = makePool(380);
  const pops = makePool(24);
  let bolt = 0;
  let boltPts = [];

  const SPELL = {
    general: ["벚꽃 나선 「춘풍」", "꽃비 장막 「난무」", "만개 「쌍나선」"],
    fortress: ["뇌격 커튼 「해일」", "이중 나선 「폭풍핵」", "포화 「포문」"],
    guardian: ["영환 「달무리」", "사방 나선 「여우불」", "신탁 「백광륜」"],
  };

  const ambience = Array.from({ length: 80 }, (_, i) => ({
    x: Math.random() * 960,
    y: Math.random() * 540,
    s: 0.5 + Math.random() * 1.8,
    v: 16 + Math.random() * 100,
    p: Math.random() * 6.28,
    front: i >= 58,
  }));

  const spriteCache = {};
  function orbSprite(color) {
    const key = "o" + color;
    if (spriteCache[key]) return spriteCache[key];
    const c = document.createElement("canvas");
    c.width = c.height = 48;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(24, 24, 1, 24, 24, 23);
    grd.addColorStop(0, "#ffffff");
    grd.addColorStop(0.22, "#fffef8");
    grd.addColorStop(0.38, color);
    grd.addColorStop(0.62, color);
    grd.addColorStop(0.74, "#241628");
    grd.addColorStop(0.86, color);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(24, 24, 23, 0, Math.PI * 2);
    g.fill();
    spriteCache[key] = c;
    return c;
  }
  function knifeSprite(color) {
    const key = "k" + color;
    if (spriteCache[key]) return spriteCache[key];
    const c = document.createElement("canvas");
    c.width = 72;
    c.height = 32;
    const g = c.getContext("2d");
    g.translate(36, 16);
    g.fillStyle = color;
    g.globalAlpha = 0.45;
    g.beginPath();
    g.ellipse(0, 0, 30, 11, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = "#241628";
    g.beginPath();
    g.ellipse(0, 0, 24, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(1, 0, 18, 4.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.ellipse(4, 0, 7, 2, 0, 0, Math.PI * 2);
    g.fill();
    spriteCache[key] = c;
    return c;
  }
  function petalSprite(color) {
    const key = "p" + color;
    if (spriteCache[key]) return spriteCache[key];
    const c = document.createElement("canvas");
    c.width = 48;
    c.height = 48;
    const g = c.getContext("2d");
    g.translate(24, 24);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.beginPath();
    g.ellipse(0, 0, 16, 20, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2b2140";
    g.beginPath();
    g.moveTo(0, -18);
    g.bezierCurveTo(16, -10, 14, 12, 0, 18);
    g.bezierCurveTo(-14, 12, -16, -10, 0, -18);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, -14);
    g.bezierCurveTo(12, -8, 10, 10, 0, 14);
    g.bezierCurveTo(-10, 10, -12, -8, 0, -14);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.ellipse(0, -2, 4, 7, 0, 0, Math.PI * 2);
    g.fill();
    spriteCache[key] = c;
    return c;
  }
  function ofudaSprite(color) {
    const key = "f" + color;
    if (spriteCache[key]) return spriteCache[key];
    const c = document.createElement("canvas");
    c.width = 40;
    c.height = 56;
    const g = c.getContext("2d");
    g.fillStyle = "#241628";
    g.fillRect(2, 2, 36, 52);
    g.fillStyle = color;
    g.fillRect(5, 5, 30, 46);
    g.fillStyle = "#2b2140";
    g.fillRect(17, 10, 6, 34);
    g.beginPath();
    g.arc(20, 18, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.fillRect(18, 26, 4, 14);
    spriteCache[key] = c;
    return c;
  }

  const sfx = {
    ctx: null,
    enabled: true,
    boot() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
    },
    tone(freq, dur, type, gain, slide) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    noise(dur, gain) {
      if (!this.enabled || !this.ctx) return;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      src.buffer = buf;
      g.gain.value = gain;
      src.connect(g);
      g.connect(this.ctx.destination);
      src.start();
    },
    shoot() {
      if (shotSnd > 0) return;
      shotSnd = 0.07;
      this.tone(720, 0.04, "square", 0.03);
    },
    charge() { this.tone(240, 0.18, "sawtooth", 0.05, 880); },
    bomb() { this.noise(0.35, 0.18); this.tone(90, 0.3, "sine", 0.08, 40); },
    hit() { this.tone(160, 0.18, "sawtooth", 0.06, 60); },
    graze() { this.tone(1280, 0.04, "sine", 0.025); },
    item() { this.tone(880, 0.08, "square", 0.04); this.tone(1320, 0.1, "square", 0.03); },
    boom() { this.noise(0.22, 0.12); },
    phase() { this.tone(180, 0.2, "triangle", 0.05, 520); },
  };

  function fmt(n) { return Math.floor(n).toLocaleString("ko-KR"); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function addScore(n) {
    score += n;
    if (score > hi) {
      hi = score;
      localStorage.setItem(HI_KEY, String(hi));
    }
  }
  function charDef() { return CHARS[charIndex] || CHARS[0]; }
  function stageDef() { return STAGES[stageIndex]; }

  function shot(x, y, a, speed, r, dmg, color, kind, pierce) {
    const b = bullets.alloc();
    if (!b) return;
    b.side = "p";
    b.x = x;
    b.y = y;
    b.vx = Math.cos(a) * speed;
    b.vy = Math.sin(a) * speed;
    b.r = r;
    b.dmg = dmg;
    b.color = color;
    b.kind = kind;
    b.pierce = pierce;
    b.hits.length = 0;
    b.life = 2.4;
    b.grazed = false;
  }

  function fireE(x, y, a, speed, r, color, kind) {
    const b = bullets.alloc();
    if (!b) return;
    b.side = "e";
    b.x = x;
    b.y = y;
    b.vx = Math.cos(a) * speed;
    b.vy = Math.sin(a) * speed;
    b.r = r;
    b.dmg = 1;
    b.color = color;
    b.kind = kind || "orb";
    b.pierce = 1;
    b.hits.length = 0;
    b.life = 8;
    b.grazed = false;
  }

  function aim(x, y) { return Math.atan2(player.y - y, player.x - x); }

  function fan(x, y, n, spread, speed, r, color, kind) {
    const c = aim(x, y);
    for (let i = 0; i < n; i++) fireE(x, y, c + (i - (n - 1) / 2) * spread, speed, r, color, kind);
  }

  function ring(x, y, n, speed, r, color, gapDir, gap) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      let d = a - gapDir;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < gap) continue;
      fireE(x, y, a, speed, r, color, "orb");
    }
  }

  function curtain(x, gapY, gapH, speed, r, color, kind) {
    const step = 20;
    for (let y = 16; y < H - 16; y += step) {
      if (Math.abs(y - gapY) < gapH * 0.5) continue;
      fireE(x, y + Math.sin(y * 0.08) * 4, Math.PI, speed, r, color, kind || "petal");
    }
  }

  function spiral(x, y, spin, arms, speed, r, color, kind) {
    for (let i = 0; i < arms; i++) {
      fireE(x, y, spin + (i * Math.PI * 2) / arms, speed, r, color, kind);
    }
  }

  function particle(x, y, vx, vy, life, color, size, kind) {
    const p = parts.alloc();
    if (!p) return;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.color = color; p.size = size; p.kind = kind || "dot";
  }

  function burst(x, y, color, n, big) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 70 + Math.random() * (big ? 420 : 220);
      particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.45 + Math.random() * 0.4, i % 3 ? color : "#fff", 3 + Math.random() * 4, "dot");
    }
    particle(x, y, 0, 0, 0.5, "#fff", big ? 120 : 48, "ring");
    if (big) particle(x, y, 0, 0, 0.7, color, 180, "ring");
  }

  function popup(x, y, text, color) {
    const p = pops.alloc();
    if (!p) return;
    p.x = x; p.y = y; p.text = text; p.life = 0.7; p.color = color || "#fff6c8";
  }

  function spawnItem(x, y, kind) {
    const it = items.alloc();
    if (!it) return;
    it.x = x; it.y = y; it.kind = kind;
    it.vx = -40 - Math.random() * 30;
    it.vy = (Math.random() - 0.5) * 40;
    it.life = 8;
  }

  function maybeDrop(e) {
    if (e.boss) return;
    const roll = Math.random();
    let kind = null;
    if (e.mid) kind = Math.random() < 0.5 ? "P" : "C";
    else if (roll < 0.22) kind = "P";
    else if (roll < 0.3) kind = "B";
    else if (roll < 0.55) kind = "M";
    else if (roll < 0.72) kind = "C";
    if (kind) spawnItem(e.x, e.y, kind);
  }

  function spawnEnemy(brain, opts) {
    const e = enemies.alloc();
    if (!e) return null;
    e.uid = ++uidSeq;
    e.brain = brain;
    e.x = opts.x ?? W + 36;
    e.y = opts.y ?? H * 0.5;
    e.baseY = e.y;
    e.vx = opts.vx ?? 0;
    e.vy = opts.vy ?? 0;
    e.hp = opts.hp;
    e.maxHp = opts.hp;
    e.r = opts.r || 16;
    e.color = opts.color || "#ff8fb8";
    e.score = opts.score || 100;
    e.t = 0;
    e.phase = 0;
    e.intro = opts.intro || 0;
    e.cd1 = opts.cd1 ?? 0.4;
    e.cd2 = opts.cd2 ?? 1;
    e.cd3 = opts.cd3 ?? 0.6;
    e.look = opts.look || brain;
    e.spin = Math.random() * 6;
    e.tx = opts.tx || W * 0.76;
    e.flash = 0;
    e.bombSeen = 0;
    e.mid = !!opts.mid;
    e.boss = !!opts.boss;
    e.name = opts.name || "";
    e.dead = false;
    return e;
  }

  function clearEnemyBullets() {
    for (const b of bullets.all) if (b.alive && b.side === "e") b.alive = false;
  }

  function killEnemy(e) {
    if (!e.alive) return;
    e.alive = false;
    addScore(e.score);
    killN++;
    burst(e.x, e.y, e.color, e.boss ? 28 : 10, e.boss || e.mid);
    sfx.boom();
    maybeDrop(e);
    if (e === mid) {
      mid = null;
      director.fighting = false;
      showBanner("중보스 격파", "길이 열렸다", 1.2);
    }
    if (e === boss) {
      boss = null;
      director.fighting = false;
      el.bossHud.classList.add("hidden");
      clearEnemyBullets();
      shake = 16;
      flash = 0.35;
      player.inv = Math.max(player.inv, 1.6);
      clearT = 1.35;
      addScore(5000);
    }
  }

  function hurtEnemy(e, dmg) {
    e.hp -= dmg;
    e.flash = 0.07;
    particle(e.x - e.r * 0.2, e.y, -80, (Math.random() - 0.5) * 90, 0.16, "#fff", 3, "spark");
    particle(e.x, e.y, 40 + Math.random() * 80, (Math.random() - 0.5) * 120, 0.14, "#fff6c8", 2.4, "spark");
    if (e.hp <= 0) killEnemy(e);
  }

  function showBanner(kicker, title, sec) {
    el.bannerK.textContent = kicker;
    el.bannerT.textContent = title;
    el.banner.classList.toggle("spell", kicker === "SPELL CARD");
    el.banner.classList.remove("hidden");
    bannerT = sec;
  }

  function eventsFor(i) {
    const c = STAGES[i].color;
    return [
      { id: "a", t: 0.5, kind: "arc", n: 4, color: c },
      { id: "b", t: 4, kind: "sine", n: 3, color: c },
      { id: "c", t: 7.2, kind: "turret", n: 2, color: c },
      { id: "d", t: 10.6, kind: "rush", n: 6, color: c },
      { id: "m", t: 14.5, kind: "mid" },
      { id: "e", t: 17.5, kind: "arc", n: 3, color: c },
      { id: "f", t: 20.5, kind: "sine", n: 4, color: c },
      { id: "g", t: 25, kind: "boss" },
    ];
  }

  function runEvent(ev) {
    const st = stageDef();
    if (ev.kind === "arc" || ev.kind === "sine" || ev.kind === "rush") {
      for (let i = 0; i < ev.n; i++) {
        const y = 70 + ((i + 0.5) / ev.n) * (H - 140);
        const look = ev.kind === "rush" ? "ashigaru" : ev.kind === "sine" ? "oni" : i % 2 ? "kite" : "ashigaru";
        spawnEnemy(ev.kind === "rush" ? "rush" : ev.kind, {
          y, color: ev.color,
          hp: ev.kind === "rush" ? 6 : ev.kind === "sine" ? 8 : 10,
          r: 16,
          score: 120,
          vy: i % 2 ? 50 : -50,
          cd1: 0.2 + i * 0.08,
          look,
        });
      }
    } else if (ev.kind === "turret") {
      spawnEnemy("turret", { y: H * 0.32, color: ev.color, hp: 34, r: 22, score: 400, tx: W * 0.8, look: "cannon" });
      spawnEnemy("turret", { y: H * 0.7, color: ev.color, hp: 34, r: 22, score: 400, tx: W * 0.72, cd1: 0.45, look: "cannon" });
    } else if (ev.kind === "mid") {
      mid = spawnEnemy(st.midBrain, {
        y: H * 0.5, hp: 160, r: 46, color: st.color, score: 2500,
        mid: true, name: st.mid, intro: 1.3, tx: W * 0.74,
        look: st.midBrain,
      });
      director.fighting = true;
      showBanner("중보스", st.mid, 1.5);
      sfx.phase();
    } else if (ev.kind === "boss") {
      spawnBoss();
    }
  }

  function spawnBoss() {
    const st = stageDef();
    const rad = st.bossBrain === "fortress" ? 86 : st.bossBrain === "guardian" ? 74 : 68;
    boss = spawnEnemy(st.bossBrain, {
      y: H * 0.5, hp: 980, r: rad, color: st.color, score: 8000,
      boss: true, name: st.boss, intro: 1.7, tx: Math.min(W * 0.72, W - rad - 24),
      look: st.bossBrain,
    });
    if (!boss) return;
    boss.phase = 1;
    director.fighting = true;
    showBanner("SPELL CARD", SPELL[st.bossBrain][0], 1.8);
    el.bossHud.classList.remove("hidden");
    el.bossName.textContent = st.boss;
    sfx.phase();
  }

  function bossPhase(e) {
    const ratio = e.hp / e.maxHp;
    const next = ratio > 0.67 ? 1 : ratio > 0.34 ? 2 : 3;
    if (e.phase !== next) {
      e.phase = next;
      e.intro = 0.9;
      e.cd1 = 0.2;
      e.cd2 = 0.35;
      e.cd3 = 0.5;
      clearEnemyBullets();
      flash = 0.28;
      shake = 10;
      burst(e.x, e.y, e.color, 26, true);
      showBanner("SPELL CARD", (SPELL[e.brain] || [])[next - 1] || e.name, 1.45);
      sfx.phase();
    }
  }

  function patternBoss(e, dt) {
    bossPhase(e);
    const hover = Math.min(H * 0.22, e.phase === 2 ? 170 : 120);
    e.y += (H * 0.5 + Math.sin(e.t * (e.phase === 3 ? 1.15 : 0.75)) * hover - e.y) * Math.min(1, dt * 2.2);
    e.x += ((e.intro > 0 ? W * 0.86 : e.tx) - e.x) * Math.min(1, dt * 2);
    e.spin += dt * (e.phase === 3 ? 1.5 : 0.9);
    if (e.intro > 0) return;
    const brain = e.brain;
    if (brain === "general") patternGeneral(e, dt);
    else if (brain === "fortress") patternFortress(e, dt);
    else patternGuardian(e, dt);
  }

  function patternGeneral(e, dt) {
    const gapH = Math.max(130, H * 0.2);
    if (e.phase === 1) {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.1;
        spiral(e.x - 10, e.y, e.spin, 5, 112, 7, "#ff8fb8", "petal");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.35;
        ring(e.x, e.y, 28, 100, 8, "#ffe066", e.spin, 0.55);
      }
      e.cd3 -= dt;
      if (e.cd3 <= 0) {
        e.cd3 = 1.7;
        fan(e.x, e.y, 8, 0.14, 168, 6, "#fff", "kunai");
      }
    } else if (e.phase === 2) {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.48;
        const gap = H * 0.5 + Math.sin(e.t * 1.15) * H * 0.28;
        curtain(W - 24, gap, gapH, 145, 7, "#ffb7d5", "petal");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.15;
        ring(e.x - 20, e.y, 20, 90, 8, "#fff6c8", -e.spin * 0.7, 0.62);
      }
      e.cd3 -= dt;
      if (e.cd3 <= 0) {
        e.cd3 = 1.6;
        fan(e.x, e.y, 6, 0.18, 185, 6, "#ffe066", "ofuda");
      }
    } else {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.12;
        spiral(e.x - 24, e.y - 16, e.spin, 3, 125, 7, "#ff8fb8", "petal");
        spiral(e.x - 24, e.y + 16, -e.spin + 0.4, 3, 125, 7, "#d4b3ff", "petal");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.05;
        ring(e.x, e.y, 32, 108, 8, "#ffe066", e.spin, 0.5);
      }
    }
  }

  function patternFortress(e, dt) {
    const gapH = Math.max(140, H * 0.2);
    if (e.phase === 1) {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.28;
        const gap = H * 0.5 + Math.sin(e.t * 0.85) * H * 0.26;
        curtain(e.x + 30, gap, gapH, 148, 7, "#9be7ff", "kunai");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.25;
        fan(e.x - 20, e.y, 9, 0.11, 175, 7, "#fff6c8", "kunai");
      }
      e.cd3 -= dt;
      if (e.cd3 <= 0) {
        e.cd3 = 1.6;
        ring(e.x, e.y, 24, 95, 8, "#7ee0ff", e.spin, 0.58);
      }
    } else if (e.phase === 2) {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.11;
        spiral(e.x - 30, e.y - 36, e.spin, 3, 128, 7, "#7ee0ff", "orb");
        spiral(e.x - 30, e.y + 36, e.spin + 0.6, 3, 128, 7, "#ffe066", "orb");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.35;
        ring(e.x, e.y, 30, 102, 8, "#d7f6ff", -e.spin, 0.5);
      }
    } else {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.55;
        const gap = H * 0.5 + Math.sin(e.t * 1.4) * H * 0.24;
        curtain(W - 18, gap, gapH * 0.85, 170, 6, "#fff", "kunai");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 0.7;
        fan(e.x, e.y, 11, 0.1, 160, 7, "#9be7ff", "orb");
      }
      e.cd3 -= dt;
      if (e.cd3 <= 0) {
        e.cd3 = 1.5;
        ring(e.x - 10, e.y, 22, 88, 9, "#ffe066", e.t, 0.7);
      }
    }
  }

  function patternGuardian(e, dt) {
    const gapH = Math.max(130, H * 0.2);
    if (e.phase === 1) {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.95;
        ring(e.x, e.y, 26, 96, 8, "#e7d4ff", aim(e.x, e.y), 0.62);
        ring(e.x, e.y, 18, 140, 6, "#fff", aim(e.x, e.y) + 0.2, 0.7);
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.35;
        fan(e.x, e.y, 7, 0.16, 172, 6, "#ffe066", "ofuda");
      }
      e.cd3 -= dt;
      if (e.cd3 <= 0) {
        e.cd3 = 0.22;
        spiral(e.x - 8, e.y, e.spin * 0.6, 2, 110, 7, "#ffb7d5", "petal");
      }
    } else if (e.phase === 2) {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.13;
        spiral(e.x, e.y, e.spin, 4, 120, 7, "#e7d4ff", "ofuda");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.2;
        fan(e.x, e.y, 10, 0.12, 168, 6, "#fff6c8", "kunai");
      }
      e.cd3 -= dt;
      if (e.cd3 <= 0) {
        e.cd3 = 1.5;
        ring(e.x, e.y, 24, 100, 8, "#ffb7d5", -e.spin, 0.55);
      }
    } else {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.5;
        const gap = H * 0.5 + Math.sin(e.t * 1.35) * H * 0.26;
        curtain(W - 20, gap, gapH, 140, 7, "#d4b3ff", "ofuda");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 0.9;
        ring(e.x, e.y, 34, 105, 7, "#fff", e.spin * 1.2, 0.46);
      }
      e.cd3 -= dt;
      if (e.cd3 <= 0) {
        e.cd3 = 0.16;
        spiral(e.x - 16, e.y, -e.spin, 3, 115, 6, "#ffe066", "petal");
      }
    }
  }

  function patternMid(e, dt) {
    e.y += (H * 0.5 + Math.sin(e.t * 1.1) * 120 - e.y) * Math.min(1, dt * 2);
    e.x += (e.tx - e.x) * Math.min(1, dt * 2);
    e.spin += dt;
    if (e.intro > 0) return;
    e.cd1 -= dt;
    if (e.brain === "lantern") {
      if (e.cd1 <= 0) {
        e.cd1 = 0.72;
        ring(e.x, e.y, 20, 115, 7, "#ffb15a", e.spin, 0.55);
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.2;
        fan(e.x, e.y, 7, 0.16, 170, 6, "#fff", "ofuda");
      }
    } else if (e.brain === "ship") {
      if (e.cd1 <= 0) {
        e.cd1 = 0.62;
        curtain(e.x + 16, H * 0.5 + Math.sin(e.t) * H * 0.22, Math.max(140, H * 0.22), 165, 7, "#9be7ff", "kunai");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.15;
        fan(e.x, e.y, 6, 0.16, 185, 7, "#ffe066", "kunai");
      }
    } else {
      if (e.cd1 <= 0) {
        e.cd1 = 0.16;
        spiral(e.x, e.y, e.spin, 3, 125, 7, "#e7d4ff", "petal");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.25;
        fan(e.x, e.y, 8, 0.14, 165, 6, "#fff6c8", "ofuda");
      }
    }
  }

  function updateGrunt(e, dt) {
    e.t += dt;
    if (e.brain === "arc") {
      if (e.phase === 0) {
        e.x -= 150 * dt;
        if (e.x < W * 0.8) {
          e.phase = 1;
          fan(e.x, e.y, 6, 0.16, 175, 6, e.color, "petal");
        }
      } else {
        e.x -= 80 * dt;
        e.y += e.vy * dt;
      }
    } else if (e.brain === "sine") {
      e.x -= 125 * dt;
      e.y = e.baseY + Math.sin(e.t * 2.5) * 64;
      e.cd1 -= dt;
      if (e.cd1 <= 0 && e.x < W - 20) {
        e.cd1 = 0.72;
        fan(e.x, e.y, 5, 0.14, 180, 6, "#fff", "kunai");
      }
    } else if (e.brain === "turret") {
      if (e.x > e.tx) e.x -= 110 * dt;
      e.cd1 -= dt;
      if (e.cd1 <= 0 && e.x < W - 10) {
        e.cd1 = 0.78;
        ring(e.x, e.y, 18, 108, 7, e.color, e.t * 0.9, 0.55);
      }
      if (e.t > 11) e.hp = 0;
    } else if (e.brain === "rush") {
      e.x -= 200 * dt;
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 99;
        fan(e.x, e.y, 5, 0.2, 190, 6, "#ffe066", "kunai");
      }
    }
    if (e.hp <= 0) killEnemy(e);
    else if (e.x < -60 || e.y < -80 || e.y > H + 80) e.alive = false;
  }

  function useBomb() {
    if (mode !== "play" || player.bombs <= 0 || player.bombT > 0) return;
    player.bombs--;
    player.bombT = 0.7;
    player.bombId++;
    player.inv = Math.max(player.inv, 2);
    shake = 12;
    flash = 0.25;
    sfx.bomb();
    burst(player.x, player.y, player.color, 18, true);
  }

  function releaseCharge() {
    if (player.charge < 1 || mode !== "play") {
      player.charge = 0;
      player.chargeFull = false;
      return;
    }
    player.charge = 0;
    player.chargeFull = false;
    charDef().charge(player);
    sfx.charge();
    burst(player.x + 16, player.y, player.color, 8, false);
  }

  function hitPlayer() {
    if (player.inv > 0 || player.bombT > 0 || mode !== "play" || clearT > 0) return;
    sfx.hit();
    shake = 8;
    flash = 0.2;
    burst(player.x, player.y, "#fff", 12, false);
    clearEnemyBullets();
    player.lives--;
    player.power = Math.max(0, player.power - 1);
    if (player.lives <= 0) {
      player.lives = 0;
      gameOver();
      return;
    }
    player.inv = 2.3;
    player.x = 130;
    player.y = H / 2;
    showBanner("피격", `남은 목숨 ${player.lives}`, 0.9);
  }

  function collect(it) {
    it.alive = false;
    itemN++;
    sfx.item();
    if (it.kind === "P") {
      if (player.power < 4) {
        player.power++;
        popup(it.x, it.y, "POWER", "#ff8fb8");
      } else {
        addScore(800);
        popup(it.x, it.y, "+800", "#ff8fb8");
      }
    } else if (it.kind === "B") {
      if (player.bombs < 6) {
        player.bombs++;
        popup(it.x, it.y, "BOMB", "#ffe066");
      } else {
        addScore(1000);
        popup(it.x, it.y, "+1000", "#ffe066");
      }
    } else if (it.kind === "M") {
      addScore(300);
      popup(it.x, it.y, "+300", "#9be7ff");
    } else {
      addScore(1000);
      popup(it.x, it.y, "+1000", "#ffe066");
    }
  }

  function resetWorld() {
    for (const pool of [bullets, enemies, items, parts, pops]) {
      for (const o of pool.all) o.alive = false;
    }
    mid = null;
    boss = null;
    director.t = 0;
    director.hold = 1.5;
    director.spawned = {};
    director.fighting = false;
    clearT = 0;
    shake = 0;
    cam = 0;
    player.x = 140;
    player.y = H / 2;
    player.charge = 0;
    player.chargeFull = false;
    player.fireCd = 0;
    player.beam = 0;
    player.bombT = 0;
    player.inv = 1.2;
    const ch = charDef();
    player.charId = ch.id;
    player.color = ch.color;
  }

  function startGame(index, stage, keep) {
    charIndex = clamp(index, 0, CHARS.length - 1);
    stageIndex = clamp(stage, 0, STAGES.length - 1);
    if (!keep) {
      score = 0;
      continues = 2;
      grazeN = 0;
      killN = 0;
      itemN = 0;
      player.lives = 3;
      player.bombs = 3;
      player.power = 1;
    }
    stageStartScore = score;
    resetWorld();
    mode = "play";
    el.title.classList.add("hidden");
    el.panel.classList.add("hidden");
    el.hud.classList.remove("hidden");
    el.bossHud.classList.add("hidden");
    const st = stageDef();
    showBanner(`STAGE ${stageIndex + 1}`, st.name, 1.6);
    sfx.boot();
    syncHud(true);
    requestAnimationFrame(resize);
  }

  function gameOver() {
    mode = "over";
    el.bossHud.classList.add("hidden");
    openPanel("over");
  }

  function openPanel(kind) {
    const st = stageDef();
    const last = stageIndex >= STAGES.length - 1;
    el.panel.classList.remove("hidden");
    el.panelStats.innerHTML = "";
    const rows = [
      ["점수", fmt(score)],
      ["최고 점수", fmt(hi)],
      ["그레이즈", String(grazeN)],
      ["격파", String(killN)],
      ["아이템", String(itemN)],
      ["파워", String(player.power)],
    ];
    for (const [k, v] of rows) {
      const li = document.createElement("li");
      li.innerHTML = `<span>${k}</span><b>${v}</b>`;
      el.panelStats.appendChild(li);
    }
    if (kind === "clear") {
      el.panelKicker.textContent = st.name;
      el.panelTitle.textContent = last ? "전국을 지켰다!" : "스테이지 클리어";
      el.panelSub.textContent = last
        ? "세 곳의 밤과 폭풍, 꽃잎을 지나 콩이 돌아왔어요."
        : `${st.boss}를 쓰러뜨렸습니다.`;
      el.btnNext.textContent = last ? "타이틀로" : "다음 스테이지";
      el.btnNext.dataset.act = last ? "title" : "next";
      el.btnNext.classList.remove("hidden");
    } else {
      el.panelKicker.textContent = "콩가이";
      el.panelTitle.textContent = "게임 오버";
      el.panelSub.textContent = continues > 0 ? "이어하면 이 스테이지를 목숨 3으로 다시 시작합니다." : "최고 점수는 이 기기에 남아요.";
      el.btnNext.textContent = continues > 0 ? `이어하기 (${continues})` : "타이틀로";
      el.btnNext.dataset.act = continues > 0 ? "cont" : "title";
    }
  }

  function toTitle() {
    mode = "title";
    el.panel.classList.add("hidden");
    el.hud.classList.add("hidden");
    el.bossHud.classList.add("hidden");
    el.banner.classList.add("hidden");
    el.title.classList.remove("hidden");
    requestAnimationFrame(resize);
  }

  let hudCache = "";
  function syncHud(force) {
    const sig = `${score}|${hi}|${player.lives}|${player.bombs}|${player.power}|${player.charge.toFixed(2)}`;
    if (!force && sig === hudCache) return;
    hudCache = sig;
    el.score.textContent = fmt(score);
    el.hi.textContent = fmt(hi);
    el.lives.textContent = "목숨 " + "🫘".repeat(player.lives) + "·".repeat(Math.max(0, 3 - player.lives));
    el.bombs.textContent = "폭탄 " + "✦".repeat(player.bombs);
    el.power.textContent = "파워 " + "●".repeat(player.power) + "○".repeat(4 - player.power);
    el.charge.style.width = `${Math.floor(player.charge * 100)}%`;
    if (boss && boss.alive) {
      el.bossFill.style.transform = `scaleX(${clamp(boss.hp / boss.maxHp, 0, 1)})`;
    }
  }

  function updatePlayer(dt) {
    let ix = 0;
    let iy = 0;
    if (keys.has("arrowleft") || keys.has("a")) ix -= 1;
    if (keys.has("arrowright") || keys.has("d")) ix += 1;
    if (keys.has("arrowup") || keys.has("w")) iy -= 1;
    if (keys.has("arrowdown") || keys.has("s")) iy += 1;
    const focus = keys.has("shift") || focusHeld;
    const speed = focus ? 150 : 320;
    if (!pointer.down) {
      const len = Math.hypot(ix, iy) || 1;
      player.x += (ix / len) * speed * dt;
      player.y += (iy / len) * speed * dt;
    }
    player.x = clamp(player.x, 28, W * 0.62);
    player.y = clamp(player.y, 26, H - 26);
    player.anim += dt;
    player.muzzle = Math.max(0, player.muzzle - dt);
    player.inv = Math.max(0, player.inv - dt);
    player.bombT = Math.max(0, player.bombT - dt);
    if (player.beam > 0) {
      player.beam -= dt;
      player.beamTick -= dt;
      if (player.beamTick <= 0) {
        player.beamTick = 0.08;
        for (const e of enemies.all) {
          if (!e.alive) continue;
          if (e.x > player.x - 10 && Math.abs(e.y - player.y) < e.r + 16) hurtEnemy(e, 8);
        }
      }
    }
    const wantFire = keys.has("z") || keys.has(" ") || keys.has("space") || pointer.down;
    if (wantFire && mode === "play") {
      player.charge = Math.min(1, player.charge + dt / 1.15);
      if (player.charge >= 1 && !player.chargeFull) {
        player.chargeFull = true;
        sfx.tone(660, 0.06, "square", 0.04);
      }
      player.fireCd -= dt;
      if (player.fireCd <= 0) {
        player.fireCd = charDef().rate;
        charDef().shot(player, player.power);
        player.muzzle = 0.08;
        sfx.shoot();
        particle(player.x + 18, player.y, 140, (Math.random() - 0.5) * 50, 0.12, "#fff6c8", 3, "spark");
        particle(player.x + 14, player.y, 90, (Math.random() - 0.5) * 30, 0.1, player.color, 2.5, "dot");
      }
    } else if (player.firing) {
      releaseCharge();
    }
    player.firing = wantFire && mode === "play";
    if (player.bombT > 0) {
      const rad = (1 - player.bombT / 0.7) * Math.hypot(W, H);
      for (const b of bullets.all) {
        if (!b.alive || b.side !== "e") continue;
        if (Math.hypot(b.x - player.x, b.y - player.y) < rad) b.alive = false;
      }
      for (const e of enemies.all) {
        if (!e.alive || e.bombSeen === player.bombId) continue;
        if (Math.hypot(e.x - player.x, e.y - player.y) < rad + e.r) {
          e.bombSeen = player.bombId;
          hurtEnemy(e, e.boss ? 70 : e.mid ? 50 : 40);
        }
      }
    }
  }

  function updateBullets(dt) {
    for (const b of bullets.all) {
      if (!b.alive) continue;
      if (b.kind === "home" && b.side === "p") {
        let best = null;
        let bestD = 1e9;
        for (const e of enemies.all) {
          if (!e.alive) continue;
          const d = Math.hypot(e.x - b.x, e.y - b.y);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) {
          const ang = Math.atan2(best.y - b.y, best.x - b.x);
          const cur = Math.atan2(b.vy, b.vx);
          let d = ang - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const na = cur + clamp(d, -4 * dt, 4 * dt);
          const sp = 360;
          b.vx = Math.cos(na) * sp;
          b.vy = Math.sin(na) * sp;
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -40 || b.x > W + 50 || b.y < -40 || b.y > H + 40) b.alive = false;
    }
  }

  function updateEnemies(dt) {
    for (const e of enemies.all) {
      if (!e.alive) continue;
      e.t += dt;
      e.intro = Math.max(0, e.intro - dt);
      e.flash = Math.max(0, e.flash - dt);
      if (e.boss) patternBoss(e, dt);
      else if (e.mid) patternMid(e, dt);
      else updateGrunt(e, dt);
    }
  }

  function collide(dt) {
    for (const b of bullets.all) {
      if (!b.alive) continue;
      if (b.side === "p") {
        for (const e of enemies.all) {
          if (!e.alive) continue;
          let seen = false;
          for (let i = 0; i < b.hits.length; i++) if (b.hits[i] === e.uid) { seen = true; break; }
          if (seen) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r * 0.6) {
            b.hits.push(e.uid);
            hurtEnemy(e, b.dmg);
            if (b.hits.length >= b.pierce) { b.alive = false; break; }
          }
        }
      } else if (mode === "play" && clearT <= 0) {
        const d = Math.hypot(b.x - player.x, b.y - player.y);
        if (d < b.r * 0.72 + player.hitR) hitPlayer();
        else if (!b.grazed && d < b.r + player.grazeR) {
          b.grazed = true;
          grazeN++;
          addScore(100);
          sfx.graze();
          particle(player.x, player.y, (Math.random() - 0.5) * 80, -40 - Math.random() * 40, 0.35, "#fff6c8", 3, "spark");
          if (grazeN % 8 === 0) popup(player.x, player.y - 16, "GRAZE", "#fff6c8");
        }
      }
    }
    if (player.inv <= 0 && mode === "play" && clearT <= 0) {
      for (const e of enemies.all) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - player.x, e.y - player.y) < e.r * 0.55 + player.hitR) {
          hitPlayer();
          break;
        }
      }
    }
    for (const it of items.all) {
      if (!it.alive) continue;
      it.life -= dt;
      const d = Math.hypot(it.x - player.x, it.y - player.y);
      const focus = keys.has("shift") || focusHeld;
      const reach = focus ? 280 : 190;
      if (d < reach || player.y < 72) {
        const pull = (focus ? 20 : 14) * (player.y < 72 ? 1.35 : 1);
        it.vx += (player.x - it.x) * dt * pull;
        it.vy += (player.y - it.y) * dt * pull;
      }
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      if (d < 24) collect(it);
      else if (it.life <= 0 || it.x < -20) it.alive = false;
    }
  }

  function updateDirector(dt) {
    if (mode !== "play" || clearT > 0) return;
    if (director.hold > 0) {
      director.hold -= dt;
      return;
    }
    if (director.fighting) return;
    director.t += dt;
    for (const ev of eventsFor(stageIndex)) {
      if (director.spawned[ev.id] || ev.t > director.t) continue;
      director.spawned[ev.id] = true;
      runEvent(ev);
    }
  }

  function updateParts(dt) {
    for (const p of parts.all) {
      if (!p.alive) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === "spark" ? -20 : 0) * dt;
      if (p.life <= 0) p.alive = false;
    }
    for (const p of pops.all) {
      if (!p.alive) continue;
      p.life -= dt;
      p.y -= 28 * dt;
      if (p.life <= 0) p.alive = false;
    }
    for (const a of ambience) {
      a.p += dt;
      if (stageIndex === 1 && mode !== "title") {
        a.x -= a.v * 4 * dt;
        a.y += a.v * 7 * dt;
      } else {
        a.x -= a.v * dt * (stageIndex === 2 ? 0.35 : 0.55);
        a.y += Math.sin(a.p) * dt * 16 + dt * (stageIndex === 2 ? 12 : 22);
      }
      if (a.x < -20) a.x = W + 16;
      if (a.y > H + 16) a.y = -12;
    }
    if (stageIndex === 1) {
      if (bolt > 0) bolt -= dt;
      else if (Math.random() < dt * 0.85) sparkBolt();
    } else {
      bolt = 0;
    }
    if (shotSnd > 0) shotSnd -= dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 28);
    if (flash > 0) flash = Math.max(0, flash - dt);
    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0) el.banner.classList.add("hidden");
    }
    if (clearT > 0) {
      clearT -= dt;
      if (clearT <= 0 && mode === "play") {
        mode = "clear";
        openPanel("clear");
      }
    }
    cam += dt * 48;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function sparkBolt() {
    bolt = 0.22;
    const pts = [];
    let x = W * (0.22 + Math.random() * 0.58);
    let y = -12;
    pts.push(x, y);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      x += (Math.random() - 0.4) * 86;
      y = H * 0.62 * (i / steps);
      pts.push(x, y);
    }
    boltPts = pts;
  }

  function kawara(g, x, y, w, rise, drop, color) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + w * 0.5, y - rise, x + w, y);
    g.lineTo(x + w * 0.94, y + drop);
    g.quadraticCurveTo(x + w * 0.5, y + drop - rise * 0.45, x + w * 0.06, y + drop);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(43,33,64,0.3)";
    g.lineWidth = 1.4;
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.2)";
    g.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const yy = y + drop * (i / 5) * 0.85;
      g.beginPath();
      g.moveTo(x + w * 0.1, yy);
      g.quadraticCurveTo(x + w * 0.5, yy - rise * 0.42, x + w * 0.9, yy);
      g.stroke();
    }
  }

  function drawCastle(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = "#f6e7ee";
    g.strokeStyle = "#6a3548";
    g.lineWidth = 2;
    g.fillRect(-36, -8, 72, 86);
    g.strokeRect(-36, -8, 72, 86);
    g.fillStyle = "#ead0dc";
    g.fillRect(-24, -62, 48, 58);
    g.strokeRect(-24, -62, 48, 58);
    g.fillStyle = "#f8eef3";
    g.fillRect(-13, -104, 26, 46);
    g.strokeRect(-13, -104, 26, 46);
    g.fillStyle = "#2b2140";
    [[-6, -92], [3, -92], [-8, -42], [3, -42], [-12, 16], [5, 16]].forEach((p) => {
      g.fillRect(p[0], p[1], 5, 9);
    });
    g.fillStyle = "#d8b4c4";
    g.fillRect(-4, 28, 8, 22);
    kawara(g, -86, -6, 172, 30, 22, "#c4476e");
    kawara(g, -54, -60, 108, 22, 16, "#d2557c");
    kawara(g, -30, -102, 60, 16, 12, "#e06a92");
    g.fillStyle = "#ffe066";
    g.beginPath();
    g.moveTo(0, -128);
    g.quadraticCurveTo(6, -114, 0, -108);
    g.quadraticCurveTo(-6, -114, 0, -128);
    g.fill();
    g.restore();
  }

  function cherryTree(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.strokeStyle = "#6a3846";
    g.lineWidth = 5;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(0, 18);
    g.quadraticCurveTo(-10, -8, -30, -46);
    g.moveTo(0, 18);
    g.quadraticCurveTo(8, -12, 32, -40);
    g.moveTo(-2, 4);
    g.quadraticCurveTo(0, -28, 6, -62);
    g.stroke();
    const puffs = [[-30, -56, 26], [-2, -72, 32], [28, -50, 24], [4, -98, 18], [-18, -36, 16]];
    puffs.forEach((p, i) => {
      g.fillStyle = i % 2 ? "#ffb3ce" : "#ff8fb8";
      g.beginPath();
      g.arc(p[0], p[1], p[2], 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.beginPath();
      g.arc(p[0] - 5, p[1] - 6, p[2] * 0.36, 0, Math.PI * 2);
      g.fill();
    });
    g.restore();
  }

  function chochin(g, x, y, s, hot) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.strokeStyle = "#5c3344";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -34);
    g.lineTo(0, -16);
    g.stroke();
    const glow = g.createRadialGradient(0, 2, 2, 0, 2, 22);
    glow.addColorStop(0, "#fff6c8");
    glow.addColorStop(0.45, hot || "#ffb15a");
    glow.addColorStop(1, "#e07a32");
    g.fillStyle = glow;
    g.beginPath();
    g.moveTo(0, -16);
    g.bezierCurveTo(16, -8, 16, 14, 0, 20);
    g.bezierCurveTo(-16, 14, -16, -8, 0, -16);
    g.fill();
    g.strokeStyle = "#2b2140";
    g.lineWidth = 2;
    g.stroke();
    g.strokeStyle = "rgba(90,30,40,0.35)";
    g.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(-12, i * 5);
      g.quadraticCurveTo(0, i * 5 + 3, 12, i * 5);
      g.stroke();
    }
    g.fillStyle = "#2b2140";
    g.fillRect(-11, -18, 22, 4);
    g.fillRect(-11, 16, 22, 4);
    g.restore();
  }

  function cloudBank(g, x, y, s, color) {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(x, y, 78 * s, 28 * s, 0, 0, Math.PI * 2);
    g.ellipse(x - 52 * s, y + 8 * s, 48 * s, 22 * s, 0, 0, Math.PI * 2);
    g.ellipse(x + 58 * s, y + 6 * s, 54 * s, 24 * s, 0, 0, Math.PI * 2);
    g.ellipse(x + 8 * s, y - 16 * s, 42 * s, 22 * s, 0, 0, Math.PI * 2);
    g.fill();
  }

  function shipSail(g, x, y, w, h) {
    g.fillStyle = "rgba(226, 240, 248, 0.92)";
    g.strokeStyle = "#7eb8d0";
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + w * 0.72, y + h * 0.18, x + w, y + h * 0.42);
    g.quadraticCurveTo(x + w * 0.55, y + h * 0.72, x, y + h);
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = "rgba(90, 140, 168, 0.55)";
    g.beginPath();
    g.moveTo(x + 4, y + h * 0.28);
    g.quadraticCurveTo(x + w * 0.45, y + h * 0.4, x + w * 0.82, y + h * 0.5);
    g.moveTo(x + 4, y + h * 0.62);
    g.quadraticCurveTo(x + w * 0.4, y + h * 0.7, x + w * 0.62, y + h * 0.74);
    g.stroke();
  }

  function farFort(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = "rgba(0, 0, 0, 0.28)";
    g.beginPath();
    g.ellipse(8, 34, 132, 9, 0, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = "#14283e";
    g.strokeStyle = "#9ad4ea";
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(-168, 2);
    g.quadraticCurveTo(-158, 30, -70, 26);
    g.quadraticCurveTo(40, 30, 128, 16);
    g.quadraticCurveTo(168, 8, 188, -6);
    g.lineTo(176, -14);
    g.quadraticCurveTo(120, -22, 36, -16);
    g.lineTo(-96, -14);
    g.quadraticCurveTo(-150, -20, -172, -6);
    g.closePath();
    g.fill();
    g.stroke();

    g.strokeStyle = "rgba(186, 224, 240, 0.45)";
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-150, 4);
    g.quadraticCurveTo(10, 16, 160, -6);
    g.stroke();

    g.fillStyle = "#1c3c58";
    g.strokeStyle = "#c5e8f6";
    g.lineWidth = 1.8;
    roundRect(g, -158, -38, 42, 28, 4);
    g.fill();
    g.stroke();
    roundRect(g, -28, -42, 78, 30, 5);
    g.fill();
    g.stroke();
    g.fillStyle = "#102434";
    g.fillRect(-8, -54, 36, 14);
    g.strokeStyle = "#9ad4ea";
    g.strokeRect(-8, -54, 36, 14);

    g.fillStyle = "#ffe9a0";
    [-146, -132, -16, -2, 12, 28].forEach((wx, i) => {
      g.globalAlpha = 0.55 + (Math.sin(cam * 0.25 + i) * 0.5 + 0.5) * 0.45;
      g.fillRect(wx, -30, 8, 6);
    });
    g.globalAlpha = 1;

    g.strokeStyle = "#d7eef8";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(170, -12);
    g.lineTo(214, -28);
    g.stroke();
    g.fillStyle = "#ffb15a";
    g.beginPath();
    g.arc(214, -28, 3.2, 0, Math.PI * 2);
    g.fill();

    g.strokeStyle = "#d5e8f4";
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(-78, -14);
    g.lineTo(-78, -108);
    g.moveTo(18, -54);
    g.lineTo(18, -118);
    g.stroke();
    shipSail(g, -76, -102, 62, 58);
    shipSail(g, 20, -112, 48, 46);
    g.fillStyle = "#ff8fb8";
    g.beginPath();
    g.moveTo(-78, -108);
    g.lineTo(-58, -100);
    g.lineTo(-78, -92);
    g.closePath();
    g.fill();

    g.save();
    g.translate(-172, -2);
    g.rotate(cam * 0.42);
    g.strokeStyle = "#e7f6ff";
    g.fillStyle = "rgba(190, 224, 240, 0.55)";
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      g.rotate((Math.PI * 2) / 3);
      g.beginPath();
      g.moveTo(5, 0);
      g.quadraticCurveTo(22, 8, 40, 2);
      g.quadraticCurveTo(24, -6, 5, 0);
      g.fill();
      g.stroke();
    }
    g.fillStyle = "#ffe066";
    g.beginPath();
    g.arc(0, 0, 4.5, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.fillStyle = "#0e1c28";
    [-40, -8, 24, 56, 88, 120].forEach((px) => {
      g.beginPath();
      g.ellipse(px, 6, 5, 3.2, 0, 0, Math.PI * 2);
      g.fill();
    });
    [-110, -60, -10, 40, 90, 140].forEach((lx, i) => {
      g.fillStyle = i % 2 ? "#9be7ff" : "#ffe066";
      g.globalAlpha = 0.6 + Math.sin(cam * 0.3 + i) * 0.4;
      g.beginPath();
      g.arc(lx, 12, 2.8, 0, Math.PI * 2);
      g.fill();
    });
    g.globalAlpha = 1;
    g.fillStyle = "#ff5a3c";
    g.beginPath();
    g.arc(-164, 8, 3.4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function seaBand(g, y, amp, freq, speed, color) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, H + 4);
    g.lineTo(0, y);
    for (let x = 0; x <= W + 8; x += 12) {
      const yy = y
        + Math.sin(x * freq + cam * speed) * amp
        + Math.sin(x * freq * 2.15 + cam * speed * 1.35) * amp * 0.33;
      g.lineTo(x, yy);
    }
    g.lineTo(W, H + 4);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.42)";
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= W + 8; x += 12) {
      const yy = y
        + Math.sin(x * freq + cam * speed) * amp
        + Math.sin(x * freq * 2.15 + cam * speed * 1.35) * amp * 0.33;
      if (x === 0) g.moveTo(0, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }

  function toriiGate(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = "#c81f1a";
    g.fillRect(-64, -108, 20, 116);
    g.fillRect(44, -108, 20, 116);
    g.fillStyle = "#ff5a45";
    g.fillRect(-60, -108, 6, 116);
    g.fillRect(48, -108, 6, 116);
    g.fillStyle = "#7a1412";
    g.fillRect(-74, -66, 148, 16);
    g.fillStyle = "#e10600";
    g.beginPath();
    g.moveTo(-102, -138);
    g.quadraticCurveTo(0, -108, 102, -138);
    g.lineTo(92, -118);
    g.quadraticCurveTo(0, -94, -92, -118);
    g.closePath();
    g.fill();
    g.strokeStyle = "#2b2140";
    g.lineWidth = 2.4;
    g.stroke();
    g.fillStyle = "#fffdf8";
    g.beginPath();
    g.moveTo(-96, -130);
    g.quadraticCurveTo(0, -112, 96, -130);
    g.lineTo(90, -122);
    g.quadraticCurveTo(0, -106, -90, -122);
    g.closePath();
    g.fill();
    g.restore();
  }

  function toro(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = "#ddd4ca";
    g.fillRect(-18, -6, 36, 16);
    g.fillRect(-7, -38, 14, 34);
    g.fillStyle = "#fff3c4";
    roundRect(g, -16, -56, 32, 20, 3);
    g.fill();
    g.strokeStyle = "#2b2140";
    g.lineWidth = 1.5;
    g.stroke();
    const fire = g.createRadialGradient(0, -46, 1, 0, -46, 16);
    fire.addColorStop(0, "#fff");
    fire.addColorStop(1, "rgba(255,224,102,0)");
    g.fillStyle = fire;
    g.beginPath();
    g.arc(0, -46, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#c9bfb4";
    g.beginPath();
    g.moveTo(-24, -56);
    g.quadraticCurveTo(0, -82, 24, -56);
    g.lineTo(18, -50);
    g.quadraticCurveTo(0, -70, -18, -50);
    g.closePath();
    g.fill();
    g.restore();
  }

  function haiden(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = "#f7f1e8";
    g.fillRect(-78, -10, 156, 52);
    g.fillStyle = "#e23b2f";
    [-62, -16, 8, 54].forEach((px) => g.fillRect(px, -10, 9, 52));
    g.fillStyle = "#2b2140";
    g.fillRect(-4, 8, 16, 28);
    kawara(g, -108, -16, 216, 28, 18, "#546880");
    g.fillStyle = "#d5cdc2";
    g.fillRect(-30, 42, 60, 8);
    g.fillRect(-24, 50, 48, 6);
    g.restore();
  }

  function drawAmbience(g, front) {
    for (const a of ambience) {
      if (!!a.front !== front) continue;
      if (stageIndex === 1) {
        g.strokeStyle = front ? "rgba(226,242,255,0.62)" : "rgba(170,204,232,0.28)";
        g.lineWidth = front ? 1.7 : 1;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(a.x - (front ? 16 : 8), a.y + (front ? 30 : 16));
        g.stroke();
      } else if (stageIndex === 2) {
        const glow = 0.4 + Math.sin(a.p * 3) * 0.4;
        g.fillStyle = front ? `rgba(255, 236, 170, ${0.45 + glow * 0.5})` : `rgba(206, 186, 255, ${0.25 + glow * 0.45})`;
        g.beginPath();
        g.arc(a.x, a.y, (front ? 3.4 : 1.7) + Math.sin(a.p) * 0.7, 0, Math.PI * 2);
        g.fill();
        if (front) {
          g.strokeStyle = "rgba(255,244,210,0.4)";
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(a.x - 8, a.y);
          g.quadraticCurveTo(a.x, a.y - 7, a.x + 9, a.y + 2);
          g.stroke();
        }
      } else {
        g.save();
        g.translate(a.x, a.y);
        g.rotate(a.p);
        g.fillStyle = front ? "rgba(255, 164, 194, 0.95)" : "rgba(255, 198, 216, 0.72)";
        g.beginPath();
        g.ellipse(0, 0, front ? 8 : 4.4, front ? 4.4 : 2.5, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.6)";
        g.beginPath();
        g.ellipse(-1.2, -0.5, front ? 2.4 : 1.2, front ? 1.5 : 0.7, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
  }

  function drawPass(g) {
    if (stageIndex === 0) {
      const spacing = 380;
      const start = -((cam * 1.25) % spacing) - 80;
      for (let x = start; x < W + spacing; x += spacing) cherryTree(g, x, H + 8, 0.95);
    } else if (stageIndex === 1) {
      g.fillStyle = "rgba(232,246,255,0.32)";
      const spacing = 150;
      const start = -((cam * 1.7) % spacing);
      for (let x = start; x < W + 30; x += spacing) {
        const y = H * 0.8 + Math.sin(cam * 0.07 + x * 0.02) * 8;
        g.beginPath();
        g.ellipse(x, y, 24, 7, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(x + 14, y - 14, 5, 11, 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function drawBean(g, x, y, color, id, scale, hostile, anim) {
    const t = anim || 0;
    const bob = Math.sin(t * 6.4) * 1.6;
    g.save();
    g.translate(x, y + bob);
    g.scale(scale || 1, scale || 1);
    g.fillStyle = "rgba(20,10,24,0.22)";
    g.beginPath();
    g.ellipse(2, 22, 16, 4.5, 0, 0, Math.PI * 2);
    g.fill();

    if (id === "ninja" && !hostile) {
      const flutter = Math.sin(t * 12) * 7;
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(-2, -8);
      g.quadraticCurveTo(-26, -8 + flutter * 0.3, -46, 2 + flutter);
      g.quadraticCurveTo(-28, 10 + flutter * 0.45, -16, 2);
      g.quadraticCurveTo(-24, -2, -4, -2);
      g.fill();
      g.fillStyle = "#12302c";
      g.beginPath();
      g.moveTo(0, -6);
      g.quadraticCurveTo(-20, 0 + flutter * 0.2, -36, 8 + flutter);
      g.quadraticCurveTo(-18, 6, -6, 1);
      g.fill();
    }

    if (id === "samurai" && !hostile) {
      g.fillStyle = "#3a2814";
      g.strokeStyle = "#ffe066";
      g.lineWidth = 1.6;
      g.beginPath();
      g.ellipse(-16, 2, 9, 6, -0.5, 0, Math.PI * 2);
      g.ellipse(16, 1, 9, 6, 0.45, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }

    if (id === "miko" && !hostile) {
      g.fillStyle = "#c4284e";
      g.beginPath();
      g.moveTo(-13, 6);
      g.lineTo(-20, 24);
      g.lineTo(-1, 21);
      g.lineTo(0, 7);
      g.closePath();
      g.moveTo(13, 6);
      g.lineTo(20, 24);
      g.lineTo(1, 21);
      g.lineTo(0, 7);
      g.fill();
      g.strokeStyle = "#2b2140";
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = "#fffdf8";
      g.fillRect(-2, 7, 4, 13);
    }

    g.fillStyle = hostile ? color : "#fff7f1";
    g.beginPath();
    g.ellipse(0, 0, 15, 18, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "#2b2140";
    g.stroke();
    if (!hostile) {
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.beginPath();
      g.ellipse(-5, -6, 4.5, 6.5, -0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = hostile ? "rgba(43,33,64,0.45)" : "#ffb7d0";
    g.beginPath();
    g.ellipse(-7, 6, 3.4, 2.1, 0, 0, Math.PI * 2);
    g.ellipse(7, 6, 3.4, 2.1, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2b2140";
    if (hostile) {
      g.beginPath();
      g.moveTo(-8, -2); g.lineTo(-2, 1); g.lineTo(-8, 3);
      g.moveTo(8, -2); g.lineTo(2, 1); g.lineTo(8, 3);
      g.fill();
    } else {
      g.beginPath();
      g.ellipse(-5, -1, 2.2, 2.6, 0, 0, Math.PI * 2);
      g.ellipse(5, -1, 2.2, 2.6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(-4.2, -2, 0.8, 0, Math.PI * 2);
      g.arc(5.8, -2, 0.8, 0, Math.PI * 2);
      g.fill();
    }

    if (id === "ninja" && !hostile) {
      g.fillStyle = "#102824";
      g.fillRect(-16, -15, 32, 8);
      g.fillStyle = color;
      g.fillRect(-16, -13, 32, 3);
      g.beginPath();
      g.moveTo(15, -12);
      g.lineTo(24, -18);
      g.lineTo(22, -8);
      g.fill();
    } else if (id === "miko" && !hostile) {
      g.fillStyle = "#fffdf8";
      g.fillRect(-15, -18, 30, 5);
      g.strokeStyle = "#2b2140";
      g.lineWidth = 1.6;
      g.strokeRect(-15, -18, 30, 5);
      g.fillStyle = "#e23d6a";
      g.beginPath();
      g.moveTo(0, -16);
      g.lineTo(7, -26);
      g.lineTo(0, -22);
      g.lineTo(-7, -26);
      g.closePath();
      g.fill();
      g.save();
      g.translate(22, 2);
      g.rotate(0.4 + Math.sin(t * 5) * 0.1);
      g.strokeStyle = "#c9a36a";
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(0, 18);
      g.lineTo(0, -18);
      g.stroke();
      g.fillStyle = "#fffdf8";
      g.strokeStyle = "#2b2140";
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(0, -18);
      g.lineTo(9, -9);
      g.lineTo(0, -2);
      g.lineTo(-9, -9);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(8, 2);
      g.lineTo(0, 8);
      g.lineTo(-8, 2);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    } else if (id === "samurai" && !hostile) {
      g.fillStyle = "#2a2118";
      g.strokeStyle = "#ffe066";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-16, -4);
      g.quadraticCurveTo(-14, -22, 0, -18);
      g.quadraticCurveTo(14, -22, 16, -4);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(-5, -18);
      g.lineTo(-2, -32);
      g.lineTo(0, -20);
      g.lineTo(2, -32);
      g.lineTo(5, -18);
      g.closePath();
      g.fill();
      g.stroke();
      g.save();
      g.translate(14, 6);
      g.rotate(-0.85);
      g.fillStyle = "#8d6a3a";
      g.fillRect(-2, -3, 12, 6);
      g.fillStyle = "#ffe066";
      g.beginPath();
      g.ellipse(10, 0, 3.2, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#f4f7ff";
      g.beginPath();
      g.moveTo(10, -1.6);
      g.lineTo(36, 0);
      g.lineTo(10, 1.6);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.restore();
  }

  function drawFoe(g, e) {
    g.save();
    g.translate(e.x, e.y);
    const intro = e.intro > 0 ? Math.max(0.5, 1 - e.intro * 0.38) : 1;
    const pulse = 1 + Math.sin(e.t * 3.1) * (e.boss ? 0.03 : 0.045);
    g.scale(intro * pulse, intro * pulse);
    if (e.flash > 0) g.globalAlpha = 0.62 + Math.sin(e.flash * 70) * 0.2;
    const look = e.look || e.brain;

    if (look === "kite") {
      const wag = Math.sin(e.t * 7) * 8;
      g.fillStyle = e.color;
      g.strokeStyle = "#2b2140";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, -28);
      g.lineTo(22, 0);
      g.lineTo(0, 26);
      g.lineTo(-22, 0);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = "#fff6c8";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -16);
      g.lineTo(0, 14);
      g.moveTo(-12, 0);
      g.lineTo(12, 0);
      g.stroke();
      g.strokeStyle = e.color;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 24);
      g.quadraticCurveTo(wag, 40, -wag * 0.4, 56);
      g.stroke();
      drawBean(g, 0, 0, "#fff7f1", "", 0.55, false, e.t);
    } else if (look === "oni") {
      drawBean(g, 0, 4, "#ff5d78", "", 1.05, true, e.t);
      g.fillStyle = "#f4f0ea";
      g.strokeStyle = "#2b2140";
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(0, -2, 16, 14, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#e23b2f";
      g.beginPath();
      g.moveTo(-14, -12);
      g.quadraticCurveTo(-8, -28, 0, -14);
      g.fill();
      g.beginPath();
      g.moveTo(14, -12);
      g.quadraticCurveTo(8, -28, 0, -14);
      g.fill();
      g.fillStyle = "#2b2140";
      g.beginPath();
      g.ellipse(-6, -2, 3, 3.2, 0.2, 0, Math.PI * 2);
      g.ellipse(6, -2, 3, 3.2, -0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.beginPath();
      g.moveTo(-4, 6);
      g.lineTo(-1, 2);
      g.lineTo(1, 6);
      g.lineTo(4, 2);
      g.lineTo(4, 8);
      g.lineTo(-4, 8);
      g.fill();
    } else if (look === "ashigaru") {
      drawBean(g, 0, 4, "#fff7f1", "", 0.95, false, e.t);
      g.fillStyle = "#6b4a2a";
      g.beginPath();
      g.ellipse(0, -16, 20, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#8d6238";
      g.beginPath();
      g.ellipse(0, -20, 10, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#d7dde8";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(16, 8);
      g.lineTo(34, -22);
      g.stroke();
      g.fillStyle = "#c9a36a";
      g.beginPath();
      g.moveTo(32, -18);
      g.lineTo(40, -30);
      g.lineTo(28, -26);
      g.fill();
      g.fillStyle = "#3a2818";
      g.fillRect(-12, 6, 24, 8);
    } else if (look === "cannon" || look === "turret") {
      g.fillStyle = "#4a3424";
      g.strokeStyle = "#2b2140";
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(-8, 10, 10, 10, 0, 0, Math.PI * 2);
      g.ellipse(16, 12, 10, 10, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#6b4a32";
      roundRect(g, -18, -6, 36, 18, 4);
      g.fill();
      g.stroke();
      g.fillStyle = "#2a241c";
      roundRect(g, -46, -8, 34, 14, 6);
      g.fill();
      g.stroke();
      g.fillStyle = "#ffb15a";
      g.beginPath();
      g.arc(-44, -1, 4, 0, Math.PI * 2);
      g.fill();
    } else if (look === "lantern") {
      g.save();
      g.scale(2.15, 2.15);
      chochin(g, 0, 6, 1, "#ffb15a");
      g.fillStyle = "#2b2140";
      g.beginPath();
      g.ellipse(-6, 4, 2.2, 2.6, 0, 0, Math.PI * 2);
      g.ellipse(6, 4, 2.2, 2.6, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#6a2830";
      g.lineWidth = 2;
      const wag = Math.sin(e.t * 5) * 6;
      g.beginPath();
      g.moveTo(0, 28);
      g.quadraticCurveTo(wag, 40, 0, 52);
      g.stroke();
      g.restore();
    } else if (look === "ship") {
      g.fillStyle = "#243044";
      g.strokeStyle = "#9be7ff";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-70, 8);
      g.quadraticCurveTo(-20, 36, 54, 10);
      g.lineTo(36, 24);
      g.quadraticCurveTo(-10, 40, -48, 22);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "#1a2838";
      g.fillRect(-46, 6, 16, 8);
      g.fillRect(-16, 8, 16, 8);
      g.fillRect(12, 6, 16, 8);
      g.fillStyle = "#e7f6ff";
      g.beginPath();
      g.moveTo(-8, 4);
      g.lineTo(-8, -48);
      g.lineTo(36, -8);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "#9be7ff";
      g.fillRect(-10, -52, 6, 56);
      g.beginPath();
      g.moveTo(-6, -50);
      g.lineTo(8, -62);
      g.lineTo(-6, -40);
      g.fill();
    } else if (look === "fox") {
      for (let i = 0; i < 3; i++) {
        const wag = Math.sin(e.t * 4 + i) * 8;
        g.fillStyle = i === 1 ? "#fff" : "#ffe1c4";
        g.strokeStyle = "#2b2140";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(-6, 8);
        g.quadraticCurveTo(-30 - i * 10, 10 + wag, -46 - i * 6, -8 + wag);
        g.quadraticCurveTo(-24, 4 + wag, -4, 14);
        g.fill();
        g.stroke();
      }
      drawBean(g, 0, 0, "#fff6ee", "", 1.35, false, e.t);
      g.fillStyle = "#ff8fb8";
      g.beginPath();
      g.moveTo(-12, -16);
      g.lineTo(-18, -36);
      g.lineTo(-2, -18);
      g.fill();
      g.beginPath();
      g.moveTo(12, -16);
      g.lineTo(18, -36);
      g.lineTo(2, -18);
      g.fill();
      g.fillStyle = "#fff";
      g.beginPath();
      g.moveTo(-10, -18);
      g.lineTo(-14, -30);
      g.lineTo(-4, -18);
      g.fill();
      g.beginPath();
      g.moveTo(10, -18);
      g.lineTo(14, -30);
      g.lineTo(4, -18);
      g.fill();
    } else if (look === "general") {
      g.save();
      for (let i = 0; i < 11; i++) {
        const a = -2.4 + i * 0.42 + Math.sin(e.t * 2 + i) * 0.08;
        g.fillStyle = i % 2 ? "#ff8fb8" : "#ffd6e6";
        g.strokeStyle = "#2b2140";
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(Math.cos(a) * 62, Math.sin(a) * 54 + 16, 24, 40, a, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      g.restore();
      drawBean(g, 0, 6, "#fff7f1", "samurai", 2.45, false, e.t);
      g.strokeStyle = "#ffe066";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(0, 8, 58, 0.15, Math.PI - 0.15);
      g.stroke();
    } else if (look === "fortress") {
      g.save();
      g.scale(1.28, 1.28);
      g.save();
      g.rotate(e.spin * 0.35);
      g.strokeStyle = "#d7f6ff";
      g.lineWidth = 7;
      g.beginPath();
      g.arc(0, 0, 102, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#8ec4de";
      for (let i = 0; i < 12; i++) {
        g.save();
        g.rotate((i / 12) * Math.PI * 2);
        g.fillRect(-9, 94, 18, 28);
        g.restore();
      }
      g.restore();
      g.fillStyle = "#c5d4e4";
      g.strokeStyle = "#f4fbff";
      g.lineWidth = 5;
      roundRect(g, -86, -70, 172, 140, 18);
      g.fill();
      g.stroke();
      g.fillStyle = "#8ea4bc";
      g.fillRect(-100, -108, 32, 52);
      g.fillRect(68, -122, 34, 64);
      g.fillRect(-18, -132, 36, 66);
      kawara(g, -110, -106, 52, 16, 12, "#e2b15a");
      kawara(g, 58, -120, 54, 18, 12, "#e2b15a");
      kawara(g, -32, -130, 64, 18, 14, "#ffe066");
      g.fillStyle = "#2a3848";
      g.strokeStyle = "#9be7ff";
      g.lineWidth = 3;
      g.fillRect(-142, -24, 58, 16);
      g.strokeRect(-142, -24, 58, 16);
      g.fillRect(-136, 10, 50, 14);
      g.strokeRect(-136, 10, 50, 14);
      g.fillRect(-130, 36, 44, 12);
      g.strokeRect(-130, 36, 44, 12);
      g.fillStyle = "#ff7a3c";
      g.beginPath();
      g.arc(-138, -16, 5, 0, Math.PI * 2);
      g.arc(-132, 16, 4.5, 0, Math.PI * 2);
      g.fill();
      const core = g.createRadialGradient(0, 8, 6, 0, 8, 58);
      core.addColorStop(0, "#fff");
      core.addColorStop(0.28, "#ffe066");
      core.addColorStop(0.62, "#7ee0ff");
      core.addColorStop(1, "rgba(126,224,255,0)");
      g.fillStyle = core;
      g.beginPath();
      g.arc(0, 8, 58, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#fff";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 8, 18 + Math.sin(e.t * 6) * 3, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#163044";
      g.fillRect(-48, -16, 18, 10);
      g.fillRect(28, -16, 18, 10);
      g.fillRect(-22, 34, 44, 10);
      g.restore();
    } else if (look === "guardian") {
      g.fillStyle = "rgba(255, 214, 140, 0.16)";
      g.beginPath();
      g.arc(0, 0, 108, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 6; i++) {
        const a = e.spin * 0.6 + i * 1.05;
        g.strokeStyle = i % 2 ? "#e23b2f" : "#fff1c4";
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(Math.cos(a) * 24, Math.sin(a) * 16);
        g.quadraticCurveTo(Math.cos(a) * 70, Math.sin(a) * 48, Math.cos(a + 0.5) * 96, Math.sin(a + 0.4) * 72);
        g.stroke();
      }
      drawBean(g, 0, 10, "#fffdf8", "miko", 2.35, false, e.t);
      g.strokeStyle = "#ffe066";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 8, 70, e.spin, e.spin + 1.1);
      g.stroke();
      g.beginPath();
      g.arc(0, 8, 70, e.spin + Math.PI, e.spin + Math.PI + 1.1);
      g.stroke();
    } else {
      drawBean(g, 0, 0, e.color, "", 0.9, true, e.t);
    }

    if (e.boss && e.flash > 0.02) {
      g.globalAlpha = 0.28;
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(0, 0, 100, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  function drawBackground(g) {
    if (stageIndex === 0) {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#ffb7d4");
      sky.addColorStop(0.42, "#ffe4ef");
      sky.addColorStop(1, "#ffe0b8");
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      const sunX = W * 0.78;
      const sunY = H * 0.16;
      g.save();
      g.translate(sunX, sunY);
      g.rotate(cam * 0.008);
      g.strokeStyle = "rgba(255,246,210,0.28)";
      g.lineWidth = 10;
      g.lineCap = "round";
      for (let i = 0; i < 8; i++) {
        g.rotate(Math.PI / 4);
        g.beginPath();
        g.moveTo(0, 30);
        g.lineTo(0, H * 0.55);
        g.stroke();
      }
      g.restore();
      const sun = g.createRadialGradient(sunX, sunY, 8, sunX, sunY, 70);
      sun.addColorStop(0, "#fff");
      sun.addColorStop(0.45, "#fff6c8");
      sun.addColorStop(1, "rgba(255,246,200,0)");
      g.fillStyle = sun;
      g.beginPath();
      g.arc(sunX, sunY, 70, 0, Math.PI * 2);
      g.fill();
      const far = g.createLinearGradient(0, H * 0.58, 0, H * 0.78);
      far.addColorStop(0, "rgba(232, 170, 190, 0)");
      far.addColorStop(1, "rgba(214, 150, 176, 0.35)");
      g.fillStyle = far;
      g.fillRect(0, H * 0.55, W, H * 0.45);
      const span = W + 520;
      const castleX = ((W * 0.55 - cam * 0.18) % span + span) % span - 120;
      drawCastle(g, castleX, H * 0.46, 1.55);
      const treeSpace = 250;
      let tx = -((cam * 0.38) % treeSpace) - 40;
      for (; tx < W + treeSpace; tx += treeSpace) cherryTree(g, tx, H * 0.62, 0.95);
      const roofSpace = 168;
      let rx = -((cam * 0.62) % roofSpace) - 20;
      g.save();
      for (; rx < W + roofSpace; rx += roofSpace) {
        g.fillStyle = "#f0d5e0";
        g.fillRect(rx + 14, H * 0.7, 90, 36);
        kawara(g, rx, H * 0.68, 120, 16, 14, "#b85a78");
        chochin(g, rx + 56, H * 0.66, 0.55, "#ffd27a");
      }
      g.restore();
      const haze = g.createLinearGradient(0, H * 0.72, 0, H);
      haze.addColorStop(0, "rgba(255,236,214,0)");
      haze.addColorStop(1, "rgba(255,214,196,0.55)");
      g.fillStyle = haze;
      g.fillRect(0, H * 0.7, W, H * 0.3);
    } else if (stageIndex === 1) {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#12182e");
      sky.addColorStop(0.45, "#2a4060");
      sky.addColorStop(1, "#163044");
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      const cSpace = 320;
      let cx = -((cam * 0.12) % cSpace);
      for (; cx < W + cSpace; cx += cSpace) cloudBank(g, cx, H * 0.16, 1.3, "rgba(18,26,48,0.9)");
      cx = -((cam * 0.28) % 260);
      for (; cx < W + 260; cx += 260) cloudBank(g, cx + 40, H * 0.28, 1.05, "rgba(40,58,88,0.8)");
      if (bolt > 0 && boltPts.length > 3) {
        g.save();
        g.globalAlpha = Math.min(1, bolt * 5);
        g.strokeStyle = "rgba(210,235,255,0.95)";
        g.lineWidth = 5;
        g.lineJoin = "round";
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(boltPts[0], boltPts[1]);
        for (let i = 2; i < boltPts.length; i += 2) g.lineTo(boltPts[i], boltPts[i + 1]);
        g.stroke();
        g.strokeStyle = "#fff";
        g.lineWidth = 1.6;
        g.stroke();
        g.restore();
        if (bolt > 0.12) {
          g.fillStyle = "rgba(214,236,255,0.22)";
          g.fillRect(0, 0, W, H);
        }
      }
      const fspan = W + 640;
      const fx = ((W * 0.7 - cam * 0.2) % fspan + fspan) % fspan - 200;
      farFort(g, fx, H * 0.36, 1.18);
      seaBand(g, H * 0.62, 12, 0.02, 0.05, "#1d4e66");
      seaBand(g, H * 0.72, 16, 0.028, 0.09, "#18607a");
      seaBand(g, H * 0.84, 10, 0.04, 0.14, "#124858");
    } else {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#140e28");
      sky.addColorStop(0.55, "#243056");
      sky.addColorStop(1, "#121820");
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 36; i++) {
        const sx = (i * 137) % W;
        const sy = (i * 61) % (H * 0.48);
        g.fillStyle = "rgba(255,255,255,0.75)";
        g.fillRect(sx, sy, i % 4 === 0 ? 2 : 1.4, i % 4 === 0 ? 2 : 1.4);
      }
      const moon = g.createRadialGradient(W * 0.2, H * 0.16, 6, W * 0.2, H * 0.16, 64);
      moon.addColorStop(0, "#fff");
      moon.addColorStop(0.5, "#fff6d4");
      moon.addColorStop(1, "rgba(255,246,212,0)");
      g.fillStyle = moon;
      g.beginPath();
      g.arc(W * 0.2, H * 0.16, 64, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#f7f1e4";
      g.beginPath();
      g.arc(W * 0.2, H * 0.16, 26, 0, Math.PI * 2);
      g.fill();
      const spacing = 170;
      let x = -((cam * 0.16) % spacing);
      g.fillStyle = "#101820";
      for (; x < W + spacing; x += spacing) {
        g.beginPath();
        g.ellipse(x, H * 0.5, 40, 70, 0, 0, Math.PI * 2);
        g.fill();
        g.fillRect(x - 4, H * 0.48, 8, H * 0.22);
      }
      x = -((cam * 0.32) % 210) - 20;
      g.fillStyle = "#18261e";
      for (; x < W + 210; x += 210) {
        g.beginPath();
        g.ellipse(x + 20, H * 0.58, 48, 54, 0, 0, Math.PI * 2);
        g.ellipse(x - 16, H * 0.62, 30, 40, 0, 0, Math.PI * 2);
        g.fill();
      }
      const hallX = ((W * 0.58 - cam * 0.24) % (W + 480) + (W + 480)) % (W + 480) - 140;
      haiden(g, hallX, H * 0.62, 1);
      const gateSpace = 640;
      let gx = -((cam * 0.22) % gateSpace) - 80;
      g.save();
      g.globalAlpha = 0.34;
      for (; gx < W + gateSpace; gx += gateSpace) toriiGate(g, gx, H + 42, 0.68);
      g.restore();
      let lx = -((cam * 0.55) % 220);
      for (; lx < W + 220; lx += 220) toro(g, lx + 40, H * 0.8, 0.85);
      const band = g.createLinearGradient(0, H * 0.46, 0, H * 0.7);
      band.addColorStop(0, "rgba(180,190,220,0)");
      band.addColorStop(0.5, "rgba(186,196,220,0.18)");
      band.addColorStop(1, "rgba(180,190,220,0)");
      g.fillStyle = band;
      g.fillRect(0, H * 0.4, W, H * 0.35);
    }
    drawAmbience(g, false);
  }

  function drawWorld() {
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.s, 0, 0, view.s, view.ox + sx, view.oy + sy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    drawBackground(ctx);
    for (const it of items.all) {
      if (!it.alive) continue;
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.fillStyle = it.kind === "P" ? "#ff8fb8" : it.kind === "B" ? "#ffe066" : it.kind === "M" ? "#9be7ff" : "#ffe9a0";
      ctx.strokeStyle = "#2b2140";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#2b2140";
      ctx.font = "700 12px Jua, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(it.kind === "C" ? "★" : it.kind, 0, 1);
      ctx.restore();
    }
    for (const b of bullets.all) {
      if (!b.alive || b.side !== "e") continue;
      drawBullet(ctx, b);
    }
    for (const e of enemies.all) if (e.alive) drawFoe(ctx, e);
    for (const b of bullets.all) {
      if (!b.alive || b.side !== "p") continue;
      drawBullet(ctx, b);
    }
    if (player.beam > 0) {
      const grd = ctx.createLinearGradient(player.x, player.y, W, player.y);
      grd.addColorStop(0, "rgba(255,240,160,0.1)");
      grd.addColorStop(0.15, "rgba(255,224,102,0.95)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(player.x, player.y - 14, W - player.x, 28);
      ctx.fillStyle = "#fff";
      ctx.fillRect(player.x, player.y - 4, W - player.x, 8);
    }
    const blink = player.inv > 0 && Math.sin(player.inv * 28) > 0;
    if (!blink && mode !== "title") {
      if (player.charge > 0.02) {
        const spin = player.anim * (2.4 + player.charge * 4);
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.strokeStyle = player.color;
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = 0.28 + player.charge * 0.5;
          const rad = 16 + player.charge * 16 + i * 8;
          const a = spin * (i % 2 ? -1 : 1) + i * 2.1;
          ctx.beginPath();
          ctx.arc(0, 0, rad, a, a + 0.85 + player.charge * 1.5);
          ctx.stroke();
        }
        if (player.charge > 0.82) {
          ctx.fillStyle = "#fff";
          ctx.globalAlpha = (player.charge - 0.82) * 2;
          ctx.beginPath();
          ctx.arc(0, 0, 12 + player.charge * 10, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      drawBean(ctx, player.x, player.y, player.color, player.charId, 1, false, player.anim);
      if (player.muzzle > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, player.muzzle / 0.08);
        ctx.fillStyle = "#fffef6";
        ctx.beginPath();
        ctx.moveTo(player.x + 12, player.y);
        ctx.lineTo(player.x + 32, player.y - 8);
        ctx.lineTo(player.x + 26, player.y);
        ctx.lineTo(player.x + 32, player.y + 8);
        ctx.fill();
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(player.x + 16, player.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const focus = keys.has("shift") || focusHeld;
      if (focus) {
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.beginPath();
        ctx.arc(player.x, player.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.hitR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = player.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    for (const p of parts.all) {
      if (!p.alive) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.kind === "ring") {
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (1 - p.life / p.max) * p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.kind === "spark" ? 1.3 : 1), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    drawAmbience(ctx, true);
    drawPass(ctx);
    if (player.bombT > 0 && mode !== "title") {
      const k = player.bombT / 0.7;
      ctx.save();
      ctx.globalAlpha = 0.45 * k;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      const grd = ctx.createRadialGradient(player.x, player.y, 8, player.x, player.y, Math.hypot(W, H) * (1.05 - k));
      grd.addColorStop(0, "#ffffff");
      grd.addColorStop(0.22, player.color);
      grd.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0.2, k);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(player.x, player.y, (1 - k) * Math.hypot(W, H), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.font = "700 20px Jua, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#2b2140";
    for (const p of pops.all) {
      if (!p.alive) continue;
      ctx.globalAlpha = Math.max(0, p.life / 0.7);
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash})`;
      ctx.fillRect(0, 0, W, H);
    }
    const reach = Math.max(W, H) * 0.68;
    const vig = ctx.createRadialGradient(W / 2, H / 2, reach * 0.42, W / 2, H / 2, reach);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(10,6,16,0.28)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawBullet(g, b) {
    let spr;
    let dw;
    let dh;
    let turn = 0;
    if (b.kind === "petal") {
      spr = petalSprite(b.color);
      dw = b.r * 3.8;
      dh = b.r * 4.6;
      turn = Math.PI / 2;
    } else if (b.kind === "ofuda") {
      spr = ofudaSprite(b.color);
      dw = b.r * 2.6;
      dh = b.r * 3.8;
      turn = Math.PI / 2;
    } else if (b.kind === "orb" || b.kind === "home") {
      spr = orbSprite(b.color);
      dw = b.r * 3.4;
      dh = dw;
    } else {
      spr = knifeSprite(b.color);
      dw = b.r * 4.8;
      dh = b.r * 1.9;
    }
    g.save();
    g.translate(b.x, b.y);
    if (b.kind !== "orb" && b.kind !== "home") g.rotate(Math.atan2(b.vy, b.vx) + turn);
    g.drawImage(spr, -dw / 2, -dh / 2, dw, dh);
    g.restore();
  }

  function frame(ts) {
    const dt = Math.min(0.033, (ts - frame.last) / 1000 || 0);
    frame.last = ts;
    if (mode === "play") {
      updateDirector(dt);
      updatePlayer(dt);
      updateEnemies(dt);
      updateBullets(dt);
      collide(dt);
      syncHud(false);
    } else if (mode === "title") {
      cam += dt * 24;
      paintPortraits();
    }
    updateParts(dt);
    drawWorld();
    requestAnimationFrame(frame);
  }
  frame.last = performance.now();

  let lastBox = "";
  let fieldCss = { x: 0, y: 0, w: 0, h: 0 };
  function resize() {
    const stage = document.getElementById("stage");
    const coarse = window.matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 760;
    const portrait = coarse && window.innerHeight > window.innerWidth * 1.05;
    document.body.classList.toggle("coarse", coarse);
    document.body.classList.toggle("phone-tall", portrait);
    W = 960;
    H = 540;
    const sr = stage ? stage.getBoundingClientRect() : canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = Math.min(sr.width / W, sr.height / H);
    const fw = Math.max(2, Math.floor(sr.width > 2 ? W * fit : 2));
    const fh = Math.max(2, Math.floor(sr.height > 2 ? H * fit : 2));
    if (canvas.style.width !== fw + "px") canvas.style.width = fw + "px";
    if (canvas.style.height !== fh + "px") canvas.style.height = fh + "px";
    const bw = Math.max(2, Math.floor(fw * dpr));
    const bh = Math.max(2, Math.floor(fh * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    view.s = canvas.width / W;
    view.ox = 0;
    view.oy = 0;
    const cr = canvas.getBoundingClientRect();
    fieldCss = {
      x: cr.left - sr.left,
      y: cr.top - sr.top,
      w: cr.width,
      h: cr.height,
    };
    if (stage) {
      stage.style.setProperty("--field-x", fieldCss.x + "px");
      stage.style.setProperty("--field-y", fieldCss.y + "px");
      stage.style.setProperty("--field-w", fieldCss.w + "px");
      stage.style.setProperty("--field-h", fieldCss.h + "px");
    }
    const box = `${Math.round(sr.width)}x${Math.round(sr.height)}`;
    if (box !== lastBox && sr.width > 2 && sr.height > 2) {
      lastBox = box;
      for (const a of ambience) {
        a.x = Math.random() * W;
        a.y = Math.random() * H;
      }
    }
    player.x = clamp(player.x, 28, W * 0.62);
    player.y = clamp(player.y, 26, H - 26);
    paintPortraits();
  }

  function toWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const x = ((clientX - r.left) * canvas.width) / r.width;
    const y = ((clientY - r.top) * canvas.height) / r.height;
    return { x: (x - view.ox) / view.s, y: (y - view.oy) / view.s };
  }

  function paintPortraits() {
    const t = performance.now() / 1000;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    document.querySelectorAll("#char-row canvas.portrait").forEach((c) => {
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (w < 2 || h < 2) return;
      const bw = Math.floor(w * dpr);
      const bh = Math.floor(h * dpr);
      if (c.width !== bw || c.height !== bh) {
        c.width = bw;
        c.height = bh;
      }
      const g = c.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const id = c.dataset.id;
      const ch = CHARS.find((x) => x.id === id);
      const sky = g.createLinearGradient(0, 0, 0, h);
      if (id === "ninja") {
        sky.addColorStop(0, "#14584e");
        sky.addColorStop(1, "#d9fff3");
      } else if (id === "miko") {
        sky.addColorStop(0, "#ffd0e4");
        sky.addColorStop(1, "#fff4e8");
      } else {
        sky.addColorStop(0, "#4a3418");
        sky.addColorStop(1, "#ffe7a4");
      }
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(43,33,64,0.1)";
      g.fillRect(0, h * 0.78, w, h * 0.22);
      drawBean(g, w * 0.48, h * 0.64, ch.color, id, Math.min(w, h) / 72, false, t + (id === "miko" ? 1 : id === "samurai" ? 2 : 0));
    });
  }

  function buildPicks() {
    el.charRow.innerHTML = CHARS.map((c, i) => `
      <button type="button" class="pick ${i === charIndex ? "on" : ""}" data-char="${i}" role="radio" aria-checked="${i === charIndex}">
        <canvas class="portrait" data-id="${c.id}" width="360" height="280" aria-hidden="true"></canvas>
        <b>${c.name}</b>
        <small>${c.blurb}</small>
      </button>`).join("");
    paintPortraits();
    el.stageRow.innerHTML = STAGES.map((s, i) => `
      <button type="button" class="pick ${i === stageIndex ? "on" : ""}" data-stage="${i}" role="radio" aria-checked="${i === stageIndex}">
        <b>${i + 1}. ${s.name}</b>
        <small>${s.sub}</small>
      </button>`).join("");
  }

  function isFireKey(k) { return k === "z" || k === " " || k === "space"; }

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "space"].includes(k) || e.code === "Space") e.preventDefault();
    const code = e.code === "Space" ? " " : k;
    if (mode === "title") {
      if (code === "arrowleft" || code === "a") { charIndex = (charIndex + CHARS.length - 1) % CHARS.length; buildPicks(); }
      if (code === "arrowright" || code === "d") { charIndex = (charIndex + 1) % CHARS.length; buildPicks(); }
      if (code === "1" || code === "2" || code === "3") { stageIndex = Number(code) - 1; buildPicks(); }
      if (code === "enter") startGame(charIndex, stageIndex, false);
      return;
    }
    if (mode === "play") {
      keys.add(code);
      sfx.boot();
      if ((code === "x" || code === "shift") && !e.repeat) {
        if (code === "x") useBomb();
      }
    }
  });
  window.addEventListener("keyup", (e) => {
    const code = e.code === "Space" ? " " : e.key.toLowerCase();
    keys.delete(code);
    if (isFireKey(code) && !keys.has("z") && !keys.has(" ") && player.firing && !pointer.down) releaseCharge();
  });
  window.addEventListener("blur", () => keys.clear());

  canvas.addEventListener("pointerdown", (e) => {
    if (mode !== "play") return;
    if (e.target !== canvas) return;
    pointer.down = true;
    pointer.id = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    sfx.boot();
    const p = toWorld(e.clientX, e.clientY);
    const coarse = document.body.classList.contains("coarse");
    player.x = clamp(p.x, 28, W * 0.62);
    player.y = clamp(p.y - (coarse ? 68 : 0), 26, H - 26);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointer.down || e.pointerId !== pointer.id) return;
    const p = toWorld(e.clientX, e.clientY);
    const coarse = document.body.classList.contains("coarse");
    player.x = clamp(p.x, 28, W * 0.62);
    player.y = clamp(p.y - (coarse ? 68 : 0), 26, H - 26);
  });
  function endPointer(e) {
    if (e.pointerId !== pointer.id) return;
    pointer.down = false;
    pointer.id = null;
    if (!keys.has("z") && !keys.has(" ")) releaseCharge();
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  document.getElementById("btn-bomb").addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    sfx.boot();
    useBomb();
  });
  const focusBtn = document.getElementById("btn-focus");
  focusBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    focusHeld = true;
    sfx.boot();
  });
  window.addEventListener("pointerup", () => { focusHeld = false; });

  el.btnStart.addEventListener("click", () => startGame(charIndex, stageIndex, false));
  el.charRow.addEventListener("click", (e) => {
    const b = e.target.closest("[data-char]");
    if (!b) return;
    charIndex = Number(b.dataset.char);
    buildPicks();
  });
  el.stageRow.addEventListener("click", (e) => {
    const b = e.target.closest("[data-stage]");
    if (!b) return;
    stageIndex = Number(b.dataset.stage);
    buildPicks();
  });
  el.btnNext.addEventListener("click", () => {
    const act = el.btnNext.dataset.act;
    if (act === "next") {
      stageIndex = Math.min(STAGES.length - 1, stageIndex + 1);
      startGame(charIndex, stageIndex, true);
      player.lives = Math.max(player.lives, 3);
    } else if (act === "cont") {
      continues--;
      const keepScore = score;
      const pow = player.power;
      startGame(charIndex, stageIndex, true);
      score = keepScore;
      player.power = pow;
      player.lives = 3;
      player.bombs = 3;
    } else toTitle();
  });
  document.getElementById("btn-retry").addEventListener("click", () => {
    score = stageStartScore;
    startGame(charIndex, stageIndex, true);
    score = stageStartScore;
    player.lives = 3;
    player.bombs = 3;
    player.power = 1;
  });
  document.getElementById("btn-title").addEventListener("click", toTitle);
  el.mute.addEventListener("click", () => {
    sfx.enabled = !sfx.enabled;
    el.mute.textContent = sfx.enabled ? "🔊" : "🔇";
    el.mute.setAttribute("aria-label", sfx.enabled ? "소리 끄기" : "소리 켜기");
    if (sfx.enabled) sfx.boot();
  });

  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(document.getElementById("stage"));
  buildPicks();
  resize();
  el.hi.textContent = fmt(hi);
  requestAnimationFrame(frame);

  function wipeFight() {
    for (const e of enemies.all) e.alive = false;
    clearEnemyBullets();
    mid = null;
    boss = null;
    director.fighting = false;
    director.hold = 0;
  }

  window.__kongai = {
    start(id, stage) {
      const idx = CHARS.findIndex((c) => c.id === id);
      startGame(idx < 0 ? 0 : idx, stage || 0, false);
    },
    boss(stage) {
      if (typeof stage === "number") stageIndex = stage;
      if (mode !== "play") startGame(charIndex, stageIndex, false);
      wipeFight();
      director.t = 30;
      for (const ev of eventsFor(stageIndex)) director.spawned[ev.id] = true;
      spawnBoss();
    },
    dense(stage) {
      if (typeof stage === "number") stageIndex = stage;
      if (mode !== "play") startGame(charIndex, stageIndex, false);
      wipeFight();
      const c = stageDef().color;
      runEvent({ kind: "turret", n: 2, color: c });
      runEvent({ kind: "rush", n: 6, color: c });
      runEvent({ kind: "sine", n: 4, color: c });
      runEvent({ kind: "arc", n: 4, color: c });
      spiral(W * 0.72, H * 0.38, 0.4, 5, 108, 7, c, "petal");
      spiral(W * 0.66, H * 0.64, 1.2, 4, 96, 6, "#fff6c8", "ofuda");
      ring(W * 0.78, H * 0.32, 26, 92, 7, c, 0.5, 0.3);
      ring(W * 0.74, H * 0.68, 22, 110, 6, "#ffe066", 0.55, 1.4);
      curtain(W * 0.92, H * 0.48, Math.max(140, H * 0.22), 120, 6, "#ffb7d5", "petal");
      fan(W * 0.8, H * 0.5, 11, 0.14, 140, 6, "#fff", "kunai");
    },
    info() {
      let eb = 0;
      for (const b of bullets.all) if (b.alive && b.side === "e") eb++;
      return {
        mode, score, hi, lives: player.lives, bombs: player.bombs, power: player.power,
        stage: stageIndex, char: player.charId, graze: grazeN,
        boss: boss && boss.alive ? { name: boss.name, hp: Math.round(boss.hp), phase: boss.phase } : null,
        mid: !!(mid && mid.alive),
        enemyBullets: eb,
        coarse: document.body.classList.contains("coarse"),
        portrait: document.body.classList.contains("phone-tall"),
        w: W, h: H,
        field: fieldCss,
      };
    },
  };
})();
