/* 콩가이 — horizontal Tengai-style shooter. No build step. */
(() => {
  const W = 960;
  const H = 540;
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
    charId: "ninja", color: "#7ce7c4",
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

  const bullets = makePool(340, () => ({ hits: [] }));
  const enemies = makePool(28);
  const items = makePool(24);
  const parts = makePool(220);
  const pops = makePool(18);

  const ambience = Array.from({ length: 56 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    s: 0.4 + Math.random() * 1.4,
    v: 20 + Math.random() * 80,
    p: Math.random() * 6.28,
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

  function curtain(x, gapY, gapH, speed, r, color) {
    for (let y = 20; y < H - 20; y += 26) {
      if (Math.abs(y - gapY) < gapH * 0.5) continue;
      fireE(x, y, Math.PI, speed, r, color, "rice");
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
      const s = 50 + Math.random() * (big ? 280 : 160);
      particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.35 + Math.random() * 0.35, color, 2 + Math.random() * 3, "dot");
    }
    particle(x, y, 0, 0, 0.4, "#fff", big ? 70 : 36, "ring");
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
    if (e.hp <= 0) killEnemy(e);
  }

  function showBanner(kicker, title, sec) {
    el.bannerK.textContent = kicker;
    el.bannerT.textContent = title;
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
        spawnEnemy(ev.kind === "rush" ? "rush" : ev.kind, {
          y, color: ev.color,
          hp: ev.kind === "rush" ? 5 : ev.kind === "sine" ? 7 : 9,
          r: 15,
          score: 120,
          vy: i % 2 ? 50 : -50,
          cd1: 0.25 + i * 0.12,
        });
      }
    } else if (ev.kind === "turret") {
      spawnEnemy("turret", { y: H * 0.32, color: ev.color, hp: 30, r: 20, score: 400, tx: W * 0.8 });
      spawnEnemy("turret", { y: H * 0.7, color: ev.color, hp: 30, r: 20, score: 400, tx: W * 0.72, cd1: 0.6 });
    } else if (ev.kind === "mid") {
      mid = spawnEnemy(st.midBrain, {
        y: H * 0.5, hp: 130, r: 32, color: st.color, score: 2500,
        mid: true, name: st.mid, intro: 1.3, tx: W * 0.78,
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
    boss = spawnEnemy(st.bossBrain, {
      y: H * 0.5, hp: 680, r: 48, color: st.color, score: 8000,
      boss: true, name: st.boss, intro: 1.7, tx: W * 0.76,
    });
    if (!boss) return;
    boss.phase = 1;
    director.fighting = true;
    showBanner("보스", st.boss, 1.8);
    el.bossHud.classList.remove("hidden");
    el.bossName.textContent = st.boss;
    sfx.phase();
  }

  function bossPhase(e) {
    const ratio = e.hp / e.maxHp;
    const next = ratio > 0.67 ? 1 : ratio > 0.34 ? 2 : 3;
    if (e.phase !== next) {
      e.phase = next;
      e.intro = 0.85;
      e.cd1 = 0.25;
      e.cd2 = 0.45;
      clearEnemyBullets();
      flash = 0.18;
      showBanner(`${next}상`, e.name, 1.1);
      sfx.phase();
    }
  }

  function patternBoss(e, dt) {
    bossPhase(e);
    const hover = e.phase === 2 ? 150 : 100;
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
    if (e.phase === 1) {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.42;
        fireE(e.x - 8, e.y, e.spin, 130, 8, "#ff8fb8", "orb");
        fireE(e.x - 8, e.y, e.spin + Math.PI, 130, 8, "#ff8fb8", "orb");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.55;
        fan(e.x, e.y, 7, 0.16, 175, 7, "#ffe066", "orb");
      }
    } else if (e.phase === 2) {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.85;
        const gap = H * 0.5 + Math.sin(e.t * 1.25) * 150;
        curtain(W - 30, gap, 110, 155, 7, "#ffb7d5");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.9;
        fan(e.x, e.y, 5, 0.2, 200, 6, "#fff", "rice");
      }
    } else {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.36;
        fireE(e.x - 16, e.y - 18, e.spin, 125, 8, "#ff8fb8", "orb");
        fireE(e.x - 16, e.y + 18, -e.spin + 0.4, 125, 8, "#d4b3ff", "orb");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.55;
        ring(e.x, e.y, 22, 115, 8, "#ffe066", e.spin, 0.48);
      }
    }
  }

  function patternFortress(e, dt) {
    if (e.phase === 1) {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.7;
        const gap = H * 0.35 + (Math.sin(e.t * 0.9) * 0.5 + 0.5) * H * 0.35;
        curtain(e.x + 20, gap, 120, 170, 7, "#9be7ff");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.7;
        fan(e.x, e.y, 6, 0.14, 210, 7, "#fff6c8", "knife");
      }
    } else if (e.phase === 2) {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.28;
        fireE(e.x - 20, e.y - 30, e.spin, 140, 8, "#7ee0ff", "orb");
        fireE(e.x - 20, e.y + 30, e.spin + Math.PI, 140, 8, "#ffe066", "orb");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 2;
        ring(e.x - 10, e.y, 18, 100, 9, "#d7f6ff", -e.spin, 0.55);
      }
    } else {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 1.05;
        curtain(W - 16, player.y, 96, 200, 6, "#fff");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 0.85;
        fan(e.x, e.y, 9, 0.12, 165, 7, "#9be7ff", "orb");
      }
    }
  }

  function patternGuardian(e, dt) {
    if (e.phase === 1) {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 1.35;
        ring(e.x, e.y, 16, 95, 9, "#d4b3ff", aim(e.x, e.y), 0.55);
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.5;
        fan(e.x, e.y, 5, 0.22, 185, 7, "#fff", "rice");
      }
    } else if (e.phase === 2) {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 0.33;
        fireE(e.x - 8, e.y, e.spin, 120, 8, "#e7d4ff", "orb");
        fireE(e.x - 8, e.y, e.spin + Math.PI * 0.5, 120, 8, "#ffb7d5", "orb");
        fireE(e.x - 8, e.y, e.spin + Math.PI, 120, 8, "#e7d4ff", "orb");
        fireE(e.x - 8, e.y, e.spin + Math.PI * 1.5, 120, 8, "#ffe066", "orb");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.8;
        fan(e.x, e.y, 8, 0.13, 190, 6, "#fff6c8", "knife");
      }
    } else {
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 1.15;
        const gap = H * 0.5 + Math.sin(e.t * 1.6) * 160;
        curtain(W - 24, gap, 100, 145, 7, "#d4b3ff");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.4;
        ring(e.x, e.y, 24, 110, 8, "#fff", e.spin * 1.4, 0.4);
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
        e.cd1 = 1.05;
        ring(e.x, e.y, 14, 120, 8, "#ffb15a", e.spin, 0.5);
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.7;
        fan(e.x, e.y, 5, 0.2, 185, 7, "#fff", "orb");
      }
    } else if (e.brain === "ship") {
      if (e.cd1 <= 0) {
        e.cd1 = 0.9;
        curtain(e.x + 10, H * 0.5 + Math.sin(e.t) * 140, 130, 180, 7, "#9be7ff");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.4;
        fan(e.x, e.y, 4, 0.18, 210, 7, "#ffe066", "knife");
      }
    } else {
      if (e.cd1 <= 0) {
        e.cd1 = 0.38;
        fireE(e.x, e.y, e.spin, 135, 7, "#e7d4ff", "orb");
        fireE(e.x, e.y, e.spin + Math.PI, 135, 7, "#ffb7d5", "orb");
      }
      e.cd2 -= dt;
      if (e.cd2 <= 0) {
        e.cd2 = 1.6;
        fan(e.x, e.y, 6, 0.16, 175, 7, "#fff6c8", "rice");
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
          fan(e.x, e.y, 3, 0.22, 190, 7, e.color, "orb");
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
        e.cd1 = 0.95;
        fan(e.x, e.y, 2, 0.15, 200, 6, "#fff", "rice");
      }
    } else if (e.brain === "turret") {
      if (e.x > e.tx) e.x -= 110 * dt;
      e.cd1 -= dt;
      if (e.cd1 <= 0 && e.x < W - 10) {
        e.cd1 = 1.05;
        ring(e.x, e.y, 16, 115, 7, e.color, e.t * 0.9, 0.48);
      }
      if (e.t > 11) e.hp = 0;
    } else if (e.brain === "rush") {
      e.x -= 200 * dt;
      e.cd1 -= dt;
      if (e.cd1 <= 0) {
        e.cd1 = 99;
        fan(e.x, e.y, 3, 0.26, 210, 7, "#ffe066", "orb");
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
        sfx.shoot();
        particle(player.x + 16, player.y, 80, (Math.random() - 0.5) * 40, 0.15, player.color, 3, "dot");
      }
    } else if (player.firing) {
      releaseCharge();
    }
    player.firing = wantFire && mode === "play";
    if (player.bombT > 0) {
      const rad = (1 - player.bombT / 0.7) * 640;
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
      if (d < 110 || player.y < 48) {
        it.vx += (player.x - it.x) * dt * 6;
        it.vy += (player.y - it.y) * dt * 6;
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
      if (a.x < -10) a.x = W + 10;
      if (a.y > H + 10) a.y = -10;
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

  function drawBean(g, x, y, color, id, scale, hostile) {
    g.save();
    g.translate(x, y);
    g.scale(scale || 1, scale || 1);
    g.fillStyle = "rgba(20,10,24,0.25)";
    g.beginPath();
    g.ellipse(2, 16, 12, 4, 0, 0, Math.PI * 2);
    g.fill();
    if (!hostile) {
      g.fillStyle = color;
      g.globalAlpha = 0.9;
      g.beginPath();
      g.moveTo(-6, -4);
      g.quadraticCurveTo(-30, 2, -16, 12);
      g.quadraticCurveTo(-24, 4, -6, 8);
      g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = hostile ? color : "#fff7f1";
    g.beginPath();
    g.ellipse(0, 2, 15, 18, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "#2b2140";
    g.stroke();
    g.fillStyle = hostile ? "#2b2140" : "#ffb7d0";
    g.beginPath();
    g.ellipse(-7, 7, 3.2, 2, 0, 0, Math.PI * 2);
    g.ellipse(7, 7, 3.2, 2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2b2140";
    g.beginPath();
    if (hostile) {
      g.moveTo(-8, -1); g.lineTo(-2, 2); g.lineTo(-8, 4);
      g.moveTo(8, -1); g.lineTo(2, 2); g.lineTo(8, 4);
    } else {
      g.arc(-5, 0, 2.1, 0, Math.PI * 2);
      g.arc(5, 0, 2.1, 0, Math.PI * 2);
    }
    g.fill();
    if (id === "ninja") {
      g.fillStyle = "#1c3d38";
      g.fillRect(-15, -12, 30, 7);
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(14, -6); g.lineTo(28, 0); g.lineTo(14, 4); g.fill();
    } else if (id === "miko") {
      g.fillStyle = "#fff";
      g.fillRect(-16, -18, 32, 6);
      g.strokeStyle = "#2b2140";
      g.strokeRect(-16, -18, 32, 6);
      g.fillStyle = "#e23d6a";
      g.fillRect(-3, -22, 6, 16);
    } else if (id === "samurai") {
      g.fillStyle = "#3a2a14";
      g.beginPath();
      g.moveTo(-14, -8); g.lineTo(0, -24); g.lineTo(14, -8); g.closePath();
      g.fill(); g.stroke();
      g.fillStyle = color;
      g.fillRect(12, -2, 18, 4);
    }
    g.restore();
  }

  function drawFoe(g, e) {
    g.save();
    g.translate(e.x, e.y);
    if (e.flash > 0) g.globalAlpha = 0.55 + Math.sin(e.flash * 80) * 0.2;
    if (e.brain === "lantern") {
      g.fillStyle = "#ffb15a";
      g.strokeStyle = "#2b2140";
      g.lineWidth = 4;
      roundRect(g, -22, -28, 44, 50, 12);
      g.fill(); g.stroke();
      g.fillStyle = "#fff6c8";
      g.beginPath(); g.arc(0, -2, 8, 0, 7); g.fill();
      g.fillStyle = "#2b2140";
      g.fillRect(-16, -34, 32, 8);
    } else if (e.brain === "ship") {
      g.fillStyle = "#243044";
      g.strokeStyle = "#9be7ff";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(-40, 8); g.lineTo(36, 8); g.lineTo(18, 26); g.lineTo(-28, 26); g.closePath();
      g.fill(); g.stroke();
      g.fillStyle = "#9be7ff";
      g.fillRect(-6, -22, 12, 30);
      g.beginPath(); g.arc(28, 0, 10, 0, 7); g.stroke();
    } else if (e.brain === "fox") {
      drawBean(g, 0, 0, "#fff3e4", "", 1.15, false);
      g.fillStyle = "#ff8fb8";
      g.beginPath();
      g.moveTo(-12, -16); g.lineTo(-4, -30); g.lineTo(0, -14); g.fill();
      g.beginPath();
      g.moveTo(12, -16); g.lineTo(4, -30); g.lineTo(0, -14); g.fill();
    } else if (e.brain === "general") {
      drawBean(g, 0, 0, "#ff8fb8", "samurai", 2.05, false);
      g.strokeStyle = "#ffe066";
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 40, 0.4, 1.4); g.stroke();
      g.fillStyle = "#ffb7d5";
      for (let i = 0; i < 5; i++) {
        const a = e.spin + i;
        g.beginPath();
        g.ellipse(Math.cos(a) * 46, Math.sin(a) * 28, 7, 4, a, 0, 7);
        g.fill();
      }
    } else if (e.brain === "fortress") {
      g.fillStyle = "#1b2436";
      g.strokeStyle = "#9be7ff";
      g.lineWidth = 4;
      roundRect(g, -46, -36, 92, 72, 16);
      g.fill(); g.stroke();
      g.fillStyle = "#ffe066";
      g.fillRect(-8, -48, 16, 16);
      g.fillStyle = "#7ee0ff";
      g.fillRect(-30, -10, 18, 10);
      g.fillRect(12, -10, 18, 10);
      drawBean(g, 0, 4, "#9be7ff", "", 0.8, true);
    } else if (e.brain === "guardian") {
      g.fillStyle = "rgba(212,179,255,0.35)";
      g.beginPath(); g.arc(0, 0, 58, 0, 7); g.fill();
      drawBean(g, 0, 0, "#fff", "miko", 2.1, false);
      g.strokeStyle = "#ffe066";
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 50, e.spin, e.spin + 1.2); g.stroke();
      g.beginPath(); g.arc(0, 0, 50, e.spin + Math.PI, e.spin + Math.PI + 1.2); g.stroke();
    } else if (e.brain === "turret") {
      g.fillStyle = "#3a2a44";
      g.strokeStyle = "#ffe066";
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 18, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = e.color;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-22, 0); g.stroke();
    } else {
      drawBean(g, 0, 0, e.color, "", 0.85, true);
    }
    g.restore();
  }

  function drawBackground(g) {
    const theme = mode === "title" ? stageIndex : stageIndex;
    if (theme === 0) {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#ffb7d2");
      sky.addColorStop(0.55, "#ffe0ef");
      sky.addColorStop(1, "#ffe7bf");
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#fff6c8";
      g.beginPath(); g.arc(760, 84, 42, 0, 7); g.fill();
      g.fillStyle = "#e7a0c0";
      g.beginPath();
      g.moveTo(0, 300);
      for (let x = 0; x <= W + 40; x += 40) g.lineTo(x, 280 + Math.sin((x + cam * 0.15) * 0.02) * 18);
      g.lineTo(W, H); g.lineTo(0, H); g.fill();
      const castleX = 620 - (cam * 0.25) % 800;
      g.fillStyle = "#c45b86";
      g.fillRect(castleX, 168, 90, 150);
      g.beginPath(); g.moveTo(castleX - 16, 180); g.lineTo(castleX + 45, 120); g.lineTo(castleX + 106, 180); g.fill();
      g.fillStyle = "#d46e98";
      g.fillRect(0, 390, W, 160);
      g.fillStyle = "#b84e78";
      for (let i = -1; i < 8; i++) {
        const x = i * 170 - (cam * 0.55) % 170;
        g.beginPath();
        g.moveTo(x, 430); g.lineTo(x + 70, 360); g.lineTo(x + 140, 430); g.fill();
      }
    } else if (theme === 1) {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#1b2440");
      sky.addColorStop(0.5, "#35506e");
      sky.addColorStop(1, "#163044");
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      if (Math.sin(cam * 0.05) > 0.92) {
        g.fillStyle = "rgba(220,240,255,0.18)";
        g.fillRect(0, 0, W, H);
      }
      g.fillStyle = "#0e1c30";
      g.fillRect(520 - (cam * 0.2) % 400, 150, 220, 80);
      g.fillRect(560 - (cam * 0.2) % 400, 110, 28, 50);
      g.fillStyle = "#1d4a62";
      g.beginPath();
      g.moveTo(0, 360);
      for (let x = 0; x <= W; x += 28) g.lineTo(x, 350 + Math.sin(x * 0.03 + cam * 0.04) * 10);
      g.lineTo(W, H); g.lineTo(0, H); g.fill();
      g.fillStyle = "#16384e";
      g.beginPath();
      g.moveTo(0, 410);
      for (let x = 0; x <= W; x += 24) g.lineTo(x, 400 + Math.sin(x * 0.05 + cam * 0.08) * 12);
      g.lineTo(W, H); g.lineTo(0, H); g.fill();
    } else {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#1a1030");
      sky.addColorStop(0.6, "#2a1850");
      sky.addColorStop(1, "#120c22");
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#fff6d4";
      g.beginPath(); g.arc(180, 90, 36, 0, 7); g.fill();
      g.strokeStyle = "#c9a6ff";
      g.lineWidth = 8;
      for (let i = 0; i < 3; i++) {
        const x = 200 + i * 280 - (cam * 0.35) % 280;
        g.beginPath();
        g.moveTo(x, 430); g.lineTo(x + 30, 300); g.lineTo(x + 60, 430);
        g.moveTo(x + 8, 340); g.lineTo(x + 52, 340);
        g.stroke();
      }
      g.fillStyle = "#241636";
      g.fillRect(0, 450, W, 100);
    }
    g.save();
    for (const a of ambience) {
      if (theme === 1) {
        g.strokeStyle = "rgba(200,230,255,0.35)";
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(a.x - 8, a.y + 16);
        g.stroke();
      } else if (theme === 2) {
        g.fillStyle = "rgba(255, 230, 160, 0.8)";
        g.beginPath();
        g.arc(a.x, a.y, 2 + Math.sin(a.p) * 0.6, 0, 7);
        g.fill();
      } else {
        g.fillStyle = "rgba(255, 180, 200, 0.85)";
        g.beginPath();
        g.ellipse(a.x, a.y, 4, 2.4, a.p, 0, 7);
        g.fill();
      }
    }
    g.restore();
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
      ctx.fill(); ctx.stroke();
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
      ctx.fillRect(player.x, player.y - 10, W - player.x, 20);
      ctx.fillStyle = "#fff";
      ctx.fillRect(player.x, player.y - 3, W - player.x, 6);
    }
    if (player.bombT > 0) {
      const rad = (1 - player.bombT / 0.7) * 640;
      ctx.strokeStyle = player.color;
      ctx.globalAlpha = player.bombT;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(player.x, player.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const blink = player.inv > 0 && Math.sin(player.inv * 28) > 0;
    if (!blink && mode !== "title") {
      if (player.charge > 0) {
        ctx.strokeStyle = player.color;
        ctx.globalAlpha = 0.35 + player.charge * 0.6;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(player.x, player.y, 22 + player.charge * 8, -Math.PI / 2, -Math.PI / 2 + player.charge * Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      drawBean(ctx, player.x, player.y, player.color, player.charId, 1, false);
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
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (1 - p.life / p.max) * p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.font = "700 14px Jua, sans-serif";
    ctx.textAlign = "center";
    for (const p of pops.all) {
      if (!p.alive) continue;
      ctx.globalAlpha = Math.max(0, p.life / 0.7);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash})`;
      ctx.fillRect(0, 0, W, H);
    }
    const vig = ctx.createRadialGradient(W / 2, H / 2, 180, W / 2, H / 2, 420);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(10,6,16,0.28)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawBullet(g, b) {
    const orb = b.kind === "orb" || b.kind === "home";
    const spr = orb ? orbSprite(b.color) : knifeSprite(b.color);
    const dw = b.r * (orb ? 3.1 : 4.4);
    const dh = b.r * (orb ? 3.1 : 1.7);
    g.save();
    g.translate(b.x, b.y);
    if (!orb) g.rotate(Math.atan2(b.vy, b.vx));
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
    }
    updateParts(dt);
    drawWorld();
    requestAnimationFrame(frame);
  }
  frame.last = performance.now();

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.floor(r.width * dpr));
    canvas.height = Math.max(2, Math.floor(r.height * dpr));
    const s = Math.min(canvas.width / W, canvas.height / H);
    view.s = s;
    view.ox = (canvas.width - W * s) / 2;
    view.oy = (canvas.height - H * s) / 2;
    const coarse = window.matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 760;
    document.body.classList.toggle("coarse", coarse);
  }

  function toWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const x = ((clientX - r.left) * canvas.width) / r.width;
    const y = ((clientY - r.top) * canvas.height) / r.height;
    return { x: (x - view.ox) / view.s, y: (y - view.oy) / view.s };
  }

  function buildPicks() {
    el.charRow.innerHTML = CHARS.map((c, i) => `
      <button type="button" class="pick ${i === charIndex ? "on" : ""}" data-char="${i}" role="radio" aria-checked="${i === charIndex}">
        <div class="swatch" style="background:${c.color}"></div>
        <b>${c.name}</b>
        <small>${c.blurb}</small>
      </button>`).join("");
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
      ring(W * 0.7, H * 0.45, 20, 90, 8, c, 0.4, 0.4);
      fan(W * 0.75, H * 0.3, 9, 0.12, 140, 7, "#fff", "orb");
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
      };
    },
  };
})();
