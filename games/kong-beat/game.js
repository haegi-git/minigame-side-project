/* 콩비트 — 4-lane rhythm game. Charts and audio share one beat clock. */
(() => {
  const HI_KEY = "kongbeat-hiscore";
  const OFF_KEY = "kongbeat-offset";
  const LANES = ["D", "F", "J", "K"];
  const LANE_COLOR = ["#ff8fb8", "#7ce7c4", "#ffe066", "#d4b3ff"];
  const TUNE = {
    perfect: 0.04,
    great: 0.072,
    good: 0.108,
    wPerfect: 1,
    wGreat: 0.78,
    wGood: 0.45,
  };

  const SONGS = [
    {
      id: "pop",
      title: "반짝 레모네이드",
      bpm: 120,
      bars: 24,
      lead: 2,
      mood: "pop",
      blurb: "밝은 팝. 손뼉이 멜로디를 밀어 올려요.",
    },
    {
      id: "dnb",
      title: "미드나잇 콩주스",
      bpm: 174,
      bars: 32,
      lead: 2,
      mood: "dnb",
      blurb: "빠른 드럼앤베이스. 베이스가 바닥을 긁어요.",
    },
    {
      id: "matsuri",
      title: "콩북 난장",
      bpm: 126,
      bars: 24,
      lead: 2,
      mood: "matsuri",
      blurb: "축제 북과 피리. 발이 먼저 굴러요.",
    },
  ];

  const DIFFS = [
    { id: "easy", name: "EASY" },
    { id: "normal", name: "NORMAL" },
    { id: "hard", name: "HARD" },
  ];

  const LANE_PAT = {
    pop: [0, 2, 1, 3, 2, 0, 3, 1],
    dnb: [0, 1, 3, 2, 1, 3, 0, 2],
    matsuri: [0, 1, 0, 2, 3, 2, 3, 1],
  };

  function q(t) {
    return Math.round(t * 10000) / 10000;
  }

  function beatDur(song) {
    return 60 / song.bpm;
  }

  function beatTime(song, beat) {
    return q(song.lead + beat * beatDur(song));
  }

  function songEnd(song) {
    return beatTime(song, song.bars * 4);
  }

  function musicSpan(song) {
    return songEnd(song) - song.lead;
  }

  function buildChart(song, diff) {
    const notes = [];
    const laneOf = (bar, step) => LANE_PAT[song.id][step % 8];
    const add = (bar, step16, lane, kind, dur16) => {
      notes.push({
        time: beatTime(song, bar * 4 + step16 / 4),
        lane: ((lane % 4) + 4) % 4,
        kind,
        dur: dur16 ? q((dur16 / 4) * beatDur(song)) : 0,
        dir: "up",
      });
    };
    for (let bar = 0; bar < song.bars; bar++) {
      const phase = bar / song.bars;
      const chorus = phase >= 0.3 && phase < 0.82;
      const finale = phase >= 0.82;
      const intro = bar === 0;
      if (diff === "easy") {
        if (intro) continue;
        for (let b = 0; b < 4; b++) add(bar, b * 4, laneOf(bar, b), "tap", 0);
        continue;
      }
      if (diff === "normal") {
        const eighth = chorus || finale;
        const count = eighth ? 8 : 4;
        for (let s = 0; s < count; s++) {
          const step16 = eighth ? s * 2 : s * 4;
          const lane = laneOf(bar, s);
          if (intro && s % 2 === 1) continue;
          if (chorus && s === 0 && bar % 2 === 0) add(bar, step16, lane, "hold", eighth ? 4 : 4);
          else if (s === 6 && bar % 4 === 2) add(bar, step16, lane, "flick", 0);
          else if (finale && s === 4) {
            add(bar, step16, lane, "tap", 0);
            add(bar, step16, lane + 2, "tap", 0);
          } else add(bar, step16, lane, "tap", 0);
        }
        continue;
      }
      const fillAt = song.id === "dnb" ? 4 : 2;
      for (let s = 0; s < 8; s++) {
        const step16 = s * 2;
        const lane = laneOf(bar, s);
        if (s === 0 && (chorus || finale) && bar % 2 === 0) {
          add(bar, 0, lane, "hold", 4);
          continue;
        }
        if (s === 6 && bar % 4 === 3) {
          for (let k = 0; k < 4; k++) add(bar, step16 + k, lane, k === 3 ? "flick" : "tap", 0);
          continue;
        }
        if (s === 7 && bar % 4 === 3) continue;
        if ((chorus || finale) && s >= fillAt) {
          add(bar, step16, lane, s === fillAt && bar % 2 === 0 ? "flick" : "tap", 0);
          add(bar, step16 + 1, lane, "tap", 0);
          continue;
        }
        if (finale && s % 4 === 0) {
          add(bar, step16, lane, "tap", 0);
          add(bar, step16, lane + 2, "tap", 0);
          continue;
        }
        if (s === 4 && bar % 3 === 1) {
          add(bar, step16, lane, "flick", 0);
          continue;
        }
        add(bar, step16, lane, "tap", 0);
      }
    }
    return sanitize(notes);
  }

  function sanitize(notes) {
    const lanes = [[], [], [], []];
    notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
    for (const n of notes) lanes[n.lane].push(n);
    const out = [];
    for (const lane of lanes) {
      let busy = -1;
      for (const n of lane) {
        if (n.time < busy - 0.012) continue;
        out.push(n);
        busy = n.time + (n.kind === "hold" ? n.dur : 0.02);
      }
    }
    return out.sort((a, b) => a.time - b.time || a.lane - b.lane);
  }

  function audioEvents(song) {
    const ev = [];
    const step = beatDur(song) / 4;
    const total = song.bars * 16;
    for (let i = 0; i < total; i++) {
      const t = beatTime(song, i / 4);
      const six = i % 16;
      ev.push({ time: t, kind: "tick" });
      if (six % 4 === 0) ev.push({ time: t, kind: song.mood === "matsuri" ? "don" : "kick" });
      if (six === 4 || six === 12) ev.push({ time: t, kind: song.mood === "matsuri" ? "ka" : "snare" });
      if (six % 2 === 0) ev.push({ time: t, kind: "hat" });
      if (six % 4 === 0) ev.push({ time: t, kind: "bass", bar: Math.floor(i / 16), step: six / 4 });
      if (six % 2 === 0) ev.push({ time: t, kind: "lead", bar: Math.floor(i / 16), step: six / 2 });
    }
    for (let i = 1; i <= 4; i++) {
      const t = q(song.lead - i * beatDur(song));
      if (t >= 0) ev.push({ time: t, kind: "count" });
    }
    return ev;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(rng) {
    let u = rng();
    const v = rng();
    if (u < 1e-9) u = 1e-9;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
  }

  function freshSession(notes) {
    return {
      notes: notes.map((n, i) => ({ ...n, id: i, head: null, tail: null, held: false, done: false })),
      score: 0,
      combo: 0,
      maxCombo: 0,
      counts: { perfect: 0, great: 0, good: 0, miss: 0 },
      lastJudge: null,
      mile: 0,
    };
  }

  function judgeName(delta) {
    const a = Math.abs(delta);
    if (a <= TUNE.perfect) return "perfect";
    if (a <= TUNE.great) return "great";
    return "good";
  }

  function award(session, name) {
    session.counts[name] += 1;
    session.lastJudge = name;
    session.judgeAt = performance.now();
    if (name === "miss") {
      session.combo = 0;
      return;
    }
    session.combo += 1;
    if (session.combo > session.maxCombo) session.maxCombo = session.combo;
    const base = name === "perfect" ? 1000 : name === "great" ? 720 : 400;
    const mult = 1 + Math.min(session.combo, 200) / 400;
    session.score += Math.round(base * mult);
    if (session.combo === 25 || session.combo === 50 || session.combo === 100 || session.combo === 200) {
      session.mile = session.combo;
      session.mileAt = performance.now();
    }
  }

  function resolveMisses(session, now) {
    for (const n of session.notes) {
      if (n.done) continue;
      if (!n.head && now > n.time + TUNE.good) {
        n.head = "miss";
        if (n.kind === "hold") n.tail = "miss";
        n.done = true;
        n.held = false;
        award(session, "miss");
        continue;
      }
      if (n.kind === "hold" && n.head && n.head !== "miss" && !n.tail && now > n.time + n.dur + TUNE.good) {
        n.tail = "miss";
        n.done = true;
        n.held = false;
        award(session, "miss");
      }
    }
  }

  function nearestOpen(session, lane, now, flick) {
    let best = null;
    let bestAbs = 1e9;
    for (const n of session.notes) {
      if (n.lane !== lane || n.head) continue;
      const d = now - n.time;
      if (d < -TUNE.good || d > TUNE.good) continue;
      const ad = Math.abs(d);
      if (ad < bestAbs) {
        best = n;
        bestAbs = ad;
      }
    }
    if (!best) return null;
    if (best.kind === "flick" && !flick) return null;
    return best;
  }

  function pressLane(session, lane, now, flick) {
    resolveMisses(session, now);
    const n = nearestOpen(session, lane, now, !!flick);
    if (!n) return null;
    n.head = judgeName(now - n.time);
    award(session, n.head);
    if (n.kind === "hold") n.held = true;
    else n.done = true;
    return n;
  }

  function releaseLane(session, lane, now) {
    resolveMisses(session, now);
    let held = null;
    for (const n of session.notes) {
      if (n.lane === lane && n.held && !n.tail) held = n;
    }
    if (!held) return null;
    const d = now - (held.time + held.dur);
    held.held = false;
    held.done = true;
    if (Math.abs(d) <= TUNE.good) {
      held.tail = judgeName(d);
      award(session, held.tail);
    } else {
      held.tail = "miss";
      award(session, "miss");
    }
    return held;
  }

  function accuracyOf(counts) {
    const total = counts.perfect + counts.great + counts.good + counts.miss;
    if (!total) return 100;
    const w = counts.perfect * TUNE.wPerfect + counts.great * TUNE.wGreat + counts.good * TUNE.wGood;
    return (w / total) * 100;
  }

  function rankFor(acc) {
    if (acc >= 96) return "S";
    if (acc >= 88) return "A";
    if (acc >= 76) return "B";
    if (acc >= 62) return "C";
    return "D";
  }

  function simulate(notes, sd, seed) {
    const rng = mulberry32(seed || 1);
    const session = freshSession(notes);
    const events = [];
    for (const n of notes) {
      const spread = n.kind === "flick" ? sd * 1.25 : sd;
      events.push({ time: n.time + gauss(rng) * spread, lane: n.lane, down: true, flick: true });
      if (n.kind === "hold") {
        events.push({ time: n.time + n.dur + gauss(rng) * sd, lane: n.lane, down: false, flick: false });
      }
    }
    events.sort((a, b) => a.time - b.time || (a.down === b.down ? 0 : a.down ? 1 : -1));
    for (const e of events) {
      if (e.down) pressLane(session, e.lane, e.time, e.flick);
      else releaseLane(session, e.lane, e.time);
    }
    const end = notes.reduce((m, n) => Math.max(m, n.time + (n.dur || 0)), 0) + 1;
    resolveMisses(session, end);
    const acc = accuracyOf(session.counts);
    return {
      acc: Math.round(acc * 10) / 10,
      rank: rankFor(acc),
      score: session.score,
      maxCombo: session.maxCombo,
      ...session.counts,
      total: notes.length,
    };
  }

  function loadHi() {
    try { return JSON.parse(localStorage.getItem(HI_KEY) || "{}"); } catch (err) { return {}; }
  }
  function hiKey(song, diff) { return `${song}:${diff}`; }

  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const el = {
    select: document.getElementById("select"),
    result: document.getElementById("result"),
    hud: document.getElementById("hud"),
    diff: document.getElementById("diff-row"),
    songs: document.getElementById("song-row"),
    offset: document.getElementById("offset"),
    offsetVal: document.getElementById("offset-val"),
    score: document.getElementById("score"),
    acc: document.getElementById("acc"),
    combo: document.getElementById("combo"),
    comboWrap: document.getElementById("combo-wrap"),
    judge: document.getElementById("judge-pop"),
    mile: document.getElementById("mile"),
    now: document.getElementById("now-playing"),
    mute: document.getElementById("mute"),
    touch: document.getElementById("touch-lanes"),
    resRank: document.getElementById("res-rank"),
    resTitle: document.getElementById("res-title"),
    resSub: document.getElementById("res-sub"),
    resScore: document.getElementById("res-score"),
    resStats: document.getElementById("res-stats"),
    resKicker: document.getElementById("res-kicker"),
  };

  let W = 960;
  let H = 540;
  let diff = "normal";
  let offsetMs = Number(localStorage.getItem(OFF_KEY) || 0) || 0;
  let muted = false;
  let mode = "select";
  let session = null;
  let song = null;
  let layout = null;
  let particles = [];
  let flashes = [0, 0, 0, 0];
  let pressed = [false, false, false, false];
  let pointers = new Map();
  let audio = null;
  let origin = 0;
  let playing = false;
  let bot = null;
  let autoSd = 0.018;
  const keysDown = new Set();

  function ensureAudio() {
    if (audio) return audio;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const actx = new Ctx();
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    const master = actx.createGain();
    master.gain.value = 0.85;
    comp.connect(master);
    master.connect(actx.destination);
    audio = { ctx: actx, input: comp, master, nodes: [] };
    return audio;
  }

  function noiseBuffer(actx) {
    if (actx._noise) return actx._noise;
    const len = Math.floor(actx.sampleRate * 0.8);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    let v = 1;
    for (let i = 0; i < len; i++) {
      v = (v * 16807) % 2147483647;
      d[i] = v / 2147483647 * 2 - 1;
    }
    actx._noise = buf;
    return buf;
  }

  function track(node) {
    if (audio && audio.nodes) audio.nodes.push(node);
    return node;
  }

  function gainEnv(actx, dest, t, peak, attack, dur) {
    const g = actx.createGain();
    g.connect(dest);
    const a = Math.max(0.004, attack);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.01));
    return g;
  }

  function tone(actx, dest, t, freq, dur, type, peak, slide) {
    const o = track(actx.createOscillator());
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, freq), t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    const g = gainEnv(actx, dest, t, peak, 0.008, dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function burst(actx, dest, t, dur, peak, hp) {
    const src = track(actx.createBufferSource());
    src.buffer = noiseBuffer(actx);
    const filter = actx.createBiquadFilter();
    filter.type = hp ? "highpass" : "bandpass";
    filter.frequency.value = hp ? 5000 : 1400;
    filter.Q.value = hp ? 0.7 : 0.8;
    src.connect(filter);
    const g = gainEnv(actx, dest, t, peak, 0.004, dur);
    filter.connect(g);
    const off = (t * 17) % (src.buffer.duration - dur - 0.05);
    src.start(t, Math.max(0, off), dur + 0.02);
    src.stop(t + dur + 0.03);
  }

  function scheduleImpulse(actx, dest, t) {
    const len = Math.max(8, Math.floor(actx.sampleRate * 0.003));
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (1 - i / len) * (i % 2 ? -1 : 1);
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    src.start(t);
  }

  function midi(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  function scheduleSong(actx, dest, song, when) {
    const ev = audioEvents(song);
    const mood = song.mood;
    const bassRoots = mood === "dnb" ? [38, 41, 36, 43] : mood === "matsuri" ? [57, 60, 57, 53] : [48, 55, 57, 53];
    const leadPool = mood === "matsuri" ? [69, 72, 74, 76, 79, 76, 74, 72] : mood === "dnb" ? [60, 63, 67, 70, 67, 63, 58, 63] : [72, 74, 76, 79, 76, 74, 72, 79];
    for (const e of ev) {
      const t = when + e.time;
      if (t < 0) continue;
      if (e.kind === "tick") tone(actx, dest, t, mood === "matsuri" ? 740 : 980, 0.03, "square", 0.045);
      else if (e.kind === "count") tone(actx, dest, t, 880, 0.06, "square", 0.12);
      else if (e.kind === "kick") tone(actx, dest, t, 168, 0.16, "sine", 0.9, 52);
      else if (e.kind === "don") {
        tone(actx, dest, t, 110, 0.28, "sine", 0.95, 48);
        burst(actx, dest, t, 0.12, 0.25, false);
      } else if (e.kind === "snare") {
        tone(actx, dest, t, 196, 0.1, "triangle", 0.25);
        burst(actx, dest, t, 0.12, 0.45, false);
      } else if (e.kind === "ka") burst(actx, dest, t, 0.07, 0.4, true);
      else if (e.kind === "hat") burst(actx, dest, t, mood === "dnb" ? 0.035 : 0.04, mood === "dnb" ? 0.16 : 0.1, true);
      else if (e.kind === "bass") {
        const root = bassRoots[e.bar % bassRoots.length];
        const f = midi(root);
        if (mood === "dnb") {
          tone(actx, dest, t, f, 0.28, "sawtooth", 0.16);
          tone(actx, dest, t, f * 1.01, 0.28, "sawtooth", 0.12);
        } else tone(actx, dest, t, f, mood === "matsuri" ? 0.22 : 0.18, "triangle", 0.28);
      } else if (e.kind === "lead") {
        const f = midi(leadPool[(e.bar * 3 + e.step) % leadPool.length] + (mood === "pop" && e.bar % 8 >= 4 ? 12 : 0));
        const type = mood === "pop" ? "square" : mood === "matsuri" ? "triangle" : "sawtooth";
        tone(actx, dest, t, f, mood === "dnb" ? 0.1 : 0.16, type, mood === "pop" ? 0.07 : 0.08);
      }
    }
  }

  function stopNodes() {
    if (!audio) return;
    for (const n of audio.nodes) {
      try { n.stop(); } catch (err) { /* already ended */ }
    }
    audio.nodes = [];
  }

  function songNow() {
    if (!playing || !audio) return 0;
    return audio.ctx.currentTime - origin - offsetMs / 1000;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(320, r.width);
    H = Math.max(420, r.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const portrait = H > W * 1.02;
    let stageBox;
    let highway;
    if (portrait) {
      stageBox = { x: 16, y: 108, w: W - 32, h: Math.max(120, Math.min(200, H * 0.24)) };
      highway = { x: W * 0.08, y: stageBox.y + stageBox.h + 12, w: W * 0.84, h: H - (stageBox.y + stageBox.h) - 28 };
    } else {
      stageBox = { x: 20, y: 78, w: Math.min(440, W * 0.38), h: H - 110 };
      highway = { x: stageBox.x + stageBox.w + 28, y: 86, w: W - stageBox.x - stageBox.w - 56, h: H - 120 };
    }
    const laneW = highway.w / 4;
    const lanes = [0, 1, 2, 3].map((i) => ({
      i,
      x: highway.x + i * laneW,
      w: laneW,
      cx: highway.x + (i + 0.5) * laneW,
    }));
    const receptor = highway.y + highway.h - Math.min(54, highway.h * 0.12);
    layout = { portrait, stageBox, highway, lanes, receptor, speed: (receptor - highway.y - 12) / 1.15 };
    placeTouch();
  }

  function placeTouch() {
    if (!layout) return;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / W;
    const sy = rect.height / H;
    const box = layout.highway;
    el.touch.style.left = `${rect.left + box.x * sx}px`;
    el.touch.style.top = `${rect.top + box.y * sy}px`;
    el.touch.style.width = `${box.w * sx}px`;
    el.touch.style.height = `${box.h * sy}px`;
  }

  function spawnBurst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const sp = 80 + Math.random() * 220;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.45 + Math.random() * 0.25,
        max: 0.7,
        color,
        size: 3 + Math.random() * 4,
      });
    }
  }

  function drawBean(g, x, y, color, phase, s) {
    const bounce = Math.abs(Math.sin(phase * Math.PI)) * 16 * s;
    const squash = 1 - bounce / 140;
    g.save();
    g.translate(x, y - bounce);
    g.scale((1 + (1 - squash) * 0.35) * s, squash * s);
    g.fillStyle = "rgba(43,33,64,0.18)";
    g.beginPath();
    g.ellipse(0, 34, 18, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.strokeStyle = "#2b2140";
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(0, 0, 26, 34, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#2b2140";
    g.beginPath();
    g.ellipse(-8, -4, 3.2, 4.2, 0, 0, Math.PI * 2);
    g.ellipse(8, -4, 3.2, 4.2, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#2b2140";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 8, 8, 0.15, Math.PI - 0.15);
    g.stroke();
    const arm = Math.sin(phase * Math.PI * 2) * 0.6;
    g.lineWidth = 5;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(-20, 2);
    g.lineTo(-34, 8 + arm * 14);
    g.moveTo(20, 2);
    g.lineTo(34, 8 - arm * 14);
    g.stroke();
    g.restore();
  }

  function draw() {
    const now = songNow();
    const beat = song ? beatDur(song) : 0.5;
    const phase = playing ? (now - (song ? song.lead : 0)) / beat : performance.now() / 500;
    const pulse = playing && now > (song ? song.lead : 0) ? Math.pow(Math.max(0, 1 - (phase - Math.floor(phase))), 5) : 0.35 + 0.15 * Math.sin(performance.now() / 400);
    const mood = song ? song.mood : "pop";
    const sky = mood === "dnb" ? ["#1b2438", "#3a6ea5"] : mood === "matsuri" ? ["#4a1d42", "#ff8fb8"] : ["#3a2468", "#ffb7d5"];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky[0]);
    g.addColorStop(1, sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(255,224,102,${0.05 + pulse * 0.16})`;
    ctx.fillRect(0, 0, W, H);
    if (!layout) return;
    drawStage(phase, pulse);
    if (mode === "play") {
      drawHighway(now, pulse);
      drawHud();
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= 1 / 60;
      p.x += p.vx / 60;
      p.y += p.vy / 60;
      p.vy += 280 / 60;
      if (p.life <= 0) particles.splice(i, 1);
      else {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawStage(phase, pulse) {
    const b = layout.stageBox;
    roundRect(b.x, b.y, b.w, b.h, 28);
    const grd = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    grd.addColorStop(0, "rgba(255,255,255,0.16)");
    grd.addColorStop(1, "rgba(255,255,255,0.04)");
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.fillStyle = `rgba(255,224,102,${0.08 + pulse * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(b.x + b.w * 0.3, b.y + 28, 50 + pulse * 20, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(b.x + b.w * 0.7, b.y + 36, 40, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(43,33,64,0.35)";
    ctx.beginPath();
    ctx.ellipse(b.x + b.w / 2, b.y + b.h - 28, b.w * 0.38, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    const colors = ["#ff8fb8", "#7ce7c4", "#ffe066"];
    const ground = b.y + b.h - 36;
    for (let i = 0; i < 3; i++) {
      const x = b.x + b.w * (0.24 + i * 0.26);
      drawBean(ctx, x, ground, colors[i], phase + i * 0.17, layout.portrait ? 0.72 : 0.95);
    }
  }

  function drawHighway(now, pulse) {
    const h = layout.highway;
    roundRect(h.x - 8, h.y - 8, h.w + 16, h.h + 16, 28);
    ctx.fillStyle = "rgba(18,10,32,0.55)";
    ctx.fill();
    for (const lane of layout.lanes) {
      ctx.fillStyle = pressed[lane.i] ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.05)";
      roundRect(lane.x + 6, h.y, lane.w - 12, h.h, 18);
      ctx.fill();
      const flash = flashes[lane.i];
      if (flash > 0) {
        flashes[lane.i] = Math.max(0, flash - 0.05);
        ctx.fillStyle = LANE_COLOR[lane.i];
        ctx.globalAlpha = flash;
        ctx.beginPath();
        ctx.arc(lane.cx, layout.receptor, 28 + (1 - flash) * 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = LANE_COLOR[lane.i];
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(lane.cx, layout.receptor, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = pressed[lane.i] ? LANE_COLOR[lane.i] : "rgba(255,253,248,0.85)";
      ctx.beginPath();
      ctx.arc(lane.cx, layout.receptor, 8, 0, Math.PI * 2);
      ctx.fill();
      if (!document.body.classList.contains("coarse")) {
        ctx.fillStyle = "rgba(255,253,248,0.8)";
        ctx.font = "14px Jua, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(LANES[lane.i], lane.cx, layout.receptor + 36);
      }
    }
    if (!session) return;
    const speed = layout.speed;
    const top = h.y;
    const bot = h.y + h.h;
    for (const n of session.notes) {
      if (n.done && n.time < now - 0.2) continue;
      const y = layout.receptor - (n.time - now) * speed;
      const tail = n.kind === "hold" ? layout.receptor - (n.time + n.dur - now) * speed : y;
      if (Math.max(y, tail) < top - 30 || Math.min(y, tail) > bot + 20) continue;
      const lane = layout.lanes[n.lane];
      const nw = Math.min(46, lane.w * 0.62);
      ctx.fillStyle = LANE_COLOR[n.lane];
      if (n.kind === "hold") {
        const y1 = Math.min(y, tail);
        const y2 = Math.max(y, tail);
        roundRect(lane.cx - nw * 0.28, y1, nw * 0.56, Math.max(8, y2 - y1), 12);
        ctx.globalAlpha = n.head ? 0.35 : 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (!n.done) {
        roundRect(lane.cx - nw / 2, y - 12, nw, 24, 12);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        roundRect(lane.cx - nw / 2 + 4, y - 8, nw - 8, 6, 6);
        ctx.fill();
        if (n.kind === "flick") {
          ctx.fillStyle = "#2b2140";
          ctx.beginPath();
          ctx.moveTo(lane.cx, y - 22);
          ctx.lineTo(lane.cx - 7, y - 10);
          ctx.lineTo(lane.cx + 7, y - 10);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 0.35 + pulse * 0.4;
    ctx.fillStyle = "#fff";
    ctx.fillRect(h.x, layout.receptor, h.w, 2);
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    if (!session || !layout || !song) return;
    ctx.save();
    ctx.fillStyle = "#fffdf8";
    ctx.textAlign = "left";
    ctx.font = "28px Jua, sans-serif";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 12;
    ctx.fillText(song.title, layout.highway.x, Math.max(36, layout.highway.y - 18));
    ctx.font = "18px Jua, sans-serif";
    ctx.fillText(`SCORE ${session.score}`, layout.stageBox.x + 18, layout.stageBox.y + 34);
    ctx.fillText(`ACC ${accuracyOf(session.counts).toFixed(1)}%`, layout.stageBox.x + 18, layout.stageBox.y + 58);
    if (session.combo >= 5) {
      ctx.textAlign = "center";
      ctx.font = `${Math.min(84, layout.stageBox.w * 0.28)}px Jua, sans-serif`;
      ctx.fillStyle = "#ffe066";
      ctx.fillText(String(session.combo), layout.stageBox.x + layout.stageBox.w / 2, layout.stageBox.y + layout.stageBox.h * 0.42);
      ctx.font = "14px Jua, sans-serif";
      ctx.fillStyle = "#fffdf8";
      ctx.fillText("COMBO", layout.stageBox.x + layout.stageBox.w / 2, layout.stageBox.y + layout.stageBox.h * 0.42 + 22);
    }
    if (session.lastJudge && performance.now() - (session.judgeAt || 0) < 700) {
      const colors = { perfect: "#fff6c8", great: "#b8ffe8", good: "#d4b3ff", miss: "#ffb4c8" };
      ctx.textAlign = "center";
      ctx.font = "40px Jua, sans-serif";
      ctx.fillStyle = colors[session.lastJudge] || "#fff";
      ctx.fillText(session.lastJudge.toUpperCase(), layout.highway.x + layout.highway.w / 2, layout.highway.y + 58);
    }
    if (session.mile && performance.now() - (session.mileAt || 0) < 900) {
      ctx.textAlign = "center";
      ctx.font = "22px Jua, sans-serif";
      ctx.fillStyle = "#fffdf8";
      ctx.fillText(`${session.mile} COMBO`, layout.highway.x + layout.highway.w / 2, layout.highway.y + 96);
    }
    ctx.restore();
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

  function frame(ts) {
    if (playing && session) {
      const now = songNow();
      if (bot) runBot(now);
      resolveMisses(session, now);
      syncHud();
      if (now >= songEnd(song) + 0.75) finish();
    }
    draw();
    requestAnimationFrame(frame);
  }

  function runBot(now) {
    while (bot.length && bot[0].time <= now + 0.008) {
      const e = bot.shift();
      if (e.down) {
        const hit = pressLane(session, e.lane, e.time, e.flick);
        if (hit) onHit(hit);
      } else releaseLane(session, e.lane, e.time);
    }
  }

  function onHit(note) {
    flashes[note.lane] = 1;
    if (note.head === "perfect" && layout) {
      spawnBurst(layout.lanes[note.lane].cx, layout.receptor, LANE_COLOR[note.lane], 16);
    }
  }

  function syncHud() {
    if (!session) return;
    el.score.textContent = String(session.score);
    const acc = accuracyOf(session.counts);
    el.acc.textContent = `${acc.toFixed(1)}%`;
    el.combo.textContent = String(session.combo);
    el.comboWrap.classList.toggle("on", session.combo >= 5);
    if (session.lastJudge && session.judgeAt && performance.now() - session.judgeAt < 60) {
      el.judge.textContent = session.lastJudge.toUpperCase();
      el.judge.className = `judge-pop show ${session.lastJudge}`;
    }
    if (session.mile && session.mileAt && performance.now() - session.mileAt < 80) {
      el.mile.textContent = `${session.mile} COMBO`;
      el.mile.className = "mile show";
    }
  }

  function setMode(next) {
    mode = next;
    el.select.classList.toggle("hidden", next !== "select");
    el.result.classList.toggle("hidden", next !== "result");
    el.hud.classList.toggle("hidden", next !== "play");
    const showTouch = next === "play" && document.body.classList.contains("coarse");
    el.touch.hidden = !showTouch;
  }

  async function startSong(id, difficulty, opts) {
    opts = opts || {};
    const picked = SONGS.find((s) => s.id === id) || SONGS[0];
    song = picked;
    diff = difficulty || diff;
    const eng = ensureAudio();
    if (eng.ctx.state === "suspended") await eng.ctx.resume();
    stopNodes();
    const notes = buildChart(song, diff);
    session = freshSession(notes);
    session.judgeAt = 0;
    particles = [];
    flashes = [0, 0, 0, 0];
    origin = eng.ctx.currentTime + 0.12;
    playing = true;
    if (!muted) scheduleSong(eng.ctx, eng.input, song, origin);
    bot = null;
    if (opts.auto) {
      const rng = mulberry32(opts.seed || 7);
      const sd = opts.sd || autoSd;
      const events = [];
      for (const n of notes) {
        const spread = n.kind === "flick" ? sd * 1.15 : sd;
        events.push({ time: n.time + gauss(rng) * spread, lane: n.lane, down: true, flick: true });
        if (n.kind === "hold") events.push({ time: n.time + n.dur + gauss(rng) * sd * 0.8, lane: n.lane, down: false });
      }
      events.sort((a, b) => a.time - b.time || (a.down === b.down ? 0 : a.down ? 1 : -1));
      bot = events;
    }
    el.now.textContent = `${song.title} · ${diff.toUpperCase()}`;
    setMode("play");
    resize();
  }

  function finish() {
    if (!playing && mode === "result") return;
    playing = false;
    bot = null;
    stopNodes();
    if (!session || !song) return;
    const acc = accuracyOf(session.counts);
    const stats = {
      song: song.id,
      title: song.title,
      diff,
      score: session.score,
      acc: Math.round(acc * 10) / 10,
      rank: rankFor(acc),
      maxCombo: session.maxCombo,
      perfect: session.counts.perfect,
      great: session.counts.great,
      good: session.counts.good,
      miss: session.counts.miss,
    };
    const map = loadHi();
    const key = hiKey(song.id, diff);
    const prev = map[key] || 0;
    stats.hi = Math.max(prev, stats.score);
    stats.isHi = stats.score > prev && stats.score > 0;
    if (stats.isHi) {
      map[key] = stats.score;
      try { localStorage.setItem(HI_KEY, JSON.stringify(map)); } catch (err) { /* ignore */ }
    }
    showResult(stats);
    buildCards();
  }

  function showResult(stats) {
    el.resRank.textContent = stats.rank;
    el.resRank.className = `rank ${stats.rank}`;
    el.resKicker.textContent = stats.isHi ? "NEW RECORD" : "CLEAR";
    el.resTitle.textContent = stats.title || stats.song;
    el.resSub.textContent = `${String(stats.diff).toUpperCase()} · 정확도 ${Number(stats.acc).toFixed(1)}%`;
    el.resScore.textContent = String(stats.score);
    const rows = [
      ["PERFECT", stats.perfect],
      ["GREAT", stats.great],
      ["GOOD", stats.good],
      ["MISS", stats.miss],
      ["MAX COMBO", stats.maxCombo],
      ["BEST", stats.hi],
    ];
    el.resStats.innerHTML = rows.map(([k, v]) => `<li>${k}<b>${v}</b></li>`).join("");
    setMode("result");
  }

  function quit() {
    playing = false;
    bot = null;
    stopNodes();
    session = null;
    setMode("select");
  }

  function buildDiffs() {
    el.diff.innerHTML = "";
    for (const d of DIFFS) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = d.name;
      b.className = d.id === diff ? "on" : "";
      b.addEventListener("click", () => {
        diff = d.id;
        buildDiffs();
      });
      el.diff.appendChild(b);
    }
  }

  function buildCards() {
    const map = loadHi();
    el.songs.innerHTML = "";
    for (const s of SONGS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "song-card";
      const sec = Math.round(musicSpan(s));
      const best = map[hiKey(s.id, diff)] || 0;
      btn.innerHTML = `<div class="art ${s.mood}"><span class="b1"></span><span class="b2"></span><span class="b3"></span></div>
        <div class="card-body"><h2>${s.title}</h2><span class="bpm">${s.bpm} BPM · ${sec}초</span><p>${s.blurb}</p><div class="hi">${best ? `최고 ${best}` : "아직 기록이 없어요"}</div></div>`;
      btn.addEventListener("click", () => startSong(s.id, diff));
      el.songs.appendChild(btn);
    }
  }

  function buildTouch() {
    el.touch.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.lane = String(i);
      b.setAttribute("aria-label", `${LANES[i]} 레인`);
      el.touch.appendChild(b);
    }
  }

  function hitDown(lane, flick) {
    if (mode !== "play" || !session || bot) return;
    pressed[lane] = true;
    const note = pressLane(session, lane, songNow(), flick);
    if (note) onHit(note);
  }

  function hitUp(lane) {
    pressed[lane] = false;
    if (mode !== "play" || !session || bot) return;
    releaseLane(session, lane, songNow());
  }

  function bootInput() {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const lane = LANES.indexOf(key);
      if (lane < 0) return;
      if (mode !== "play") return;
      e.preventDefault();
      keysDown.add(lane);
      ensureAudio();
      hitDown(lane, true);
    });
    window.addEventListener("keyup", (e) => {
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const lane = LANES.indexOf(key);
      if (lane < 0) return;
      keysDown.delete(lane);
      hitUp(lane);
    });
    el.touch.addEventListener("pointerdown", (e) => {
      const lane = laneOfTarget(e.target);
      if (lane < 0 || mode !== "play") return;
      e.preventDefault();
      pointers.set(e.pointerId, { lane, y: e.clientY, flicked: false, hit: false });
      try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
      ensureAudio();
      const note = mode === "play" && session && !bot ? pressLane(session, lane, songNow(), false) : null;
      pressed[lane] = true;
      if (note) {
        pointers.get(e.pointerId).hit = true;
        onHit(note);
      }
    });
    el.touch.addEventListener("pointermove", (e) => {
      const p = pointers.get(e.pointerId);
      if (!p || p.flicked || p.hit) return;
      if (p.y - e.clientY > 28) {
        p.flicked = true;
        if (mode === "play" && session && !bot) {
          const note = pressLane(session, p.lane, songNow(), true);
          if (note) {
            p.hit = true;
            onHit(note);
          }
        }
      }
    });
    const endPointer = (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      pointers.delete(e.pointerId);
      if (p.flicked && session) {
        const open = session.notes.find((n) => n.lane === p.lane && n.held);
        if (open) hitUp(p.lane);
        else pressed[p.lane] = false;
      } else hitUp(p.lane);
    };
    el.touch.addEventListener("pointerup", endPointer);
    el.touch.addEventListener("pointercancel", endPointer);
    el.touch.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function laneOfTarget(node) {
    const eln = node.closest ? node.closest("[data-lane]") : null;
    if (!eln) return -1;
    return Number(eln.dataset.lane);
  }

  function applyCoarse() {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    const longSide = Math.max(window.innerWidth, window.innerHeight);
    const phone = shortSide < 760 && longSide < 1100;
    const coarse = touch || phone;
    document.body.classList.toggle("coarse", coarse);
    document.body.classList.toggle("fine", !coarse);
    if (mode === "play") el.touch.hidden = !coarse;
  }

  function structuralDrift(songId, difficulty) {
    const s = SONGS.find((x) => x.id === songId);
    const notes = buildChart(s, difficulty);
    const ev = audioEvents(s);
    let max = 0;
    let missing = 0;
    for (const n of notes) {
      let best = Infinity;
      for (const e of ev) best = Math.min(best, Math.abs(e.time - n.time));
      if (!Number.isFinite(best)) missing += 1;
      else max = Math.max(max, best * 1000);
    }
    return { maxMs: Math.round(max * 1000) / 1000, missing, notes: notes.length };
  }

  async function acousticDrift(songId, difficulty) {
    const s = SONGS.find((x) => x.id === songId);
    const notes = buildChart(s, difficulty);
    const times = [];
    const seen = new Set();
    for (const n of notes) {
      const k = n.time.toFixed(4);
      if (seen.has(k)) continue;
      seen.add(k);
      times.push(n.time);
    }
    const sr = 44100;
    const dur = songEnd(s) + 0.2;
    const off = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
    const mix = off.createBuffer(1, Math.ceil(dur * sr), sr);
    const ch = mix.getChannelData(0);
    for (const t of times) {
      const i = Math.round(t * sr);
      if (i >= 0 && i < ch.length) ch[i] = 1;
    }
    const src = off.createBufferSource();
    src.buffer = mix;
    src.connect(off.destination);
    src.start(0);
    const rendered = await off.startRendering();
    const data = rendered.getChannelData(0);
    const rate = rendered.sampleRate;
    let max = 0;
    let sum = 0;
    let missed = 0;
    for (const t of times) {
      const i0 = Math.max(0, Math.floor((t - 0.004) * rate));
      const i1 = Math.min(data.length - 1, Math.floor((t + 0.008) * rate));
      let onset = -1;
      for (let i = i0; i <= i1; i++) {
        if (Math.abs(data[i]) > 0.2) { onset = i; break; }
      }
      if (onset < 0) missed += 1;
      else {
        const ms = Math.abs(onset / rate - t) * 1000;
        sum += ms;
        if (ms > max) max = ms;
      }
    }
    const probes = [times[0], times[Math.floor(times.length / 2)], times[times.length - 1]];
    const off2 = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
    const dest = off2.createGain();
    dest.connect(off2.destination);
    for (const t of probes) scheduleImpulse(off2, dest, t);
    const spotBuf = await off2.startRendering();
    const spotData = spotBuf.getChannelData(0);
    let spotMax = 0;
    let spotMissed = 0;
    for (const t of probes) {
      const i0 = Math.max(0, Math.floor((t - 0.004) * spotBuf.sampleRate));
      const i1 = Math.min(spotData.length - 1, Math.floor((t + 0.008) * spotBuf.sampleRate));
      let onset = -1;
      for (let i = i0; i <= i1; i++) if (Math.abs(spotData[i]) > 0.2) { onset = i; break; }
      if (onset < 0) spotMissed += 1;
      else spotMax = Math.max(spotMax, Math.abs(onset / spotBuf.sampleRate - t) * 1000);
    }
    const found = times.length - missed;
    return {
      song: songId,
      diff: difficulty,
      notes: times.length,
      maxMs: Math.round(max * 1000) / 1000,
      meanMs: found ? Math.round((sum / found) * 1000) / 1000 : 0,
      missed,
      spotMaxMs: Math.round(spotMax * 1000) / 1000,
      spotMissed,
    };
  }

  function densityReport() {
    return SONGS.flatMap((s) => DIFFS.map((d) => {
      const notes = buildChart(s, d.id);
      const span = musicSpan(s);
      const kinds = { tap: 0, hold: 0, flick: 0 };
      let doubles = 0;
      const at = new Map();
      for (const n of notes) {
        kinds[n.kind] = (kinds[n.kind] || 0) + 1;
        const k = n.time.toFixed(4);
        at.set(k, (at.get(k) || 0) + 1);
      }
      for (const v of at.values()) if (v >= 2) doubles += 1;
      return {
        song: s.id,
        diff: d.id,
        notes: notes.length,
        seconds: Math.round(span * 10) / 10,
        nps: Math.round((notes.length / span) * 100) / 100,
        ...kinds,
        chords: doubles,
      };
    }));
  }

  function simReport(sd) {
    const rows = [];
    for (const s of SONGS) {
      for (const d of ["normal", "hard", "easy"]) {
        const notes = buildChart(s, d);
        const runs = [];
        for (let seed = 1; seed <= 7; seed++) runs.push(simulate(notes, sd, seed));
        const acc = runs.reduce((a, r) => a + r.acc, 0) / runs.length;
        const ranks = {};
        for (const r of runs) ranks[r.rank] = (ranks[r.rank] || 0) + 1;
        rows.push({
          song: s.id,
          diff: d,
          sdMs: Math.round(sd * 1000),
          acc: Math.round(acc * 10) / 10,
          rank: rankFor(acc),
          ranks,
          miss: Math.round(runs.reduce((a, r) => a + r.miss, 0) / runs.length),
          perfect: Math.round(runs.reduce((a, r) => a + r.perfect, 0) / runs.length),
        });
      }
    }
    return rows;
  }

  el.offset.value = String(offsetMs);
  el.offsetVal.textContent = `${offsetMs} ms`;
  el.offset.addEventListener("input", () => {
    offsetMs = Number(el.offset.value) || 0;
    el.offsetVal.textContent = `${offsetMs} ms`;
    try { localStorage.setItem(OFF_KEY, String(offsetMs)); } catch (err) { /* ignore */ }
  });
  el.mute.addEventListener("click", async () => {
    muted = !muted;
    el.mute.textContent = muted ? "🔇" : "🔊";
    const eng = ensureAudio();
    if (eng.ctx.state === "suspended") await eng.ctx.resume();
    eng.master.gain.value = muted ? 0 : 0.85;
  });
  document.getElementById("btn-quit").addEventListener("click", quit);
  document.getElementById("btn-back").addEventListener("click", quit);
  document.getElementById("btn-retry").addEventListener("click", () => {
    if (song) startSong(song.id, diff);
  });

  applyCoarse();
  window.addEventListener("resize", () => { applyCoarse(); resize(); });
  buildDiffs();
  buildCards();
  buildTouch();
  bootInput();
  resize();
  setMode("select");
  requestAnimationFrame(frame);

  window.__kongbeat = {
    songs: () => SONGS.map((s) => s.id),
    start: (id, difficulty, opts) => startSong(id, difficulty, opts),
    quit,
    now: () => (playing ? songNow() : null),
    info() {
      return {
        mode,
        song: song && song.id,
        diff,
        playing,
        now: playing ? Math.round(songNow() * 1000) / 1000 : 0,
        score: session ? session.score : 0,
        combo: session ? session.combo : 0,
        acc: session ? Math.round(accuracyOf(session.counts) * 10) / 10 : 100,
        offsetMs,
        coarse: document.body.classList.contains("coarse"),
      };
    },
    density: densityReport,
    structural: () => SONGS.flatMap((s) => DIFFS.map((d) => ({ song: s.id, diff: d.id, ...structuralDrift(s.id, d.id) }))),
    acoustic: async () => {
      const rows = [];
      for (const s of SONGS) {
        for (const d of DIFFS) rows.push(await acousticDrift(s.id, d.id));
      }
      return rows;
    },
    sim: (sd) => simReport(sd == null ? 0.04 : sd),
    showSimResult(songId, difficulty, seed) {
      const s = SONGS.find((x) => x.id === songId) || SONGS[0];
      const d = difficulty || "normal";
      const row = simulate(buildChart(s, d), 0.04, seed || 2);
      const map = loadHi();
      showResult({
        song: s.id,
        title: s.title,
        diff: d,
        score: row.score,
        acc: row.acc,
        rank: row.rank,
        maxCombo: row.maxCombo,
        perfect: row.perfect,
        great: row.great,
        good: row.good,
        miss: row.miss,
        hi: Math.max(map[hiKey(s.id, d)] || 0, row.score),
        isHi: false,
      });
      return row;
    },
    async mixEnergy(songId) {
      const s = SONGS.find((x) => x.id === songId) || SONGS[0];
      const sr = 22050;
      const dur = songEnd(s) + 0.2;
      const off = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
      const comp = off.createDynamicsCompressor();
      const master = off.createGain();
      master.gain.value = 0.85;
      comp.connect(master);
      master.connect(off.destination);
      scheduleSong(off, comp, s, 0);
      const buf = await off.startRendering();
      const data = buf.getChannelData(0);
      const bins = [];
      const hop = sr * 2;
      for (let i = 0; i < data.length; i += hop) {
        let e = 0;
        const n = Math.min(hop, data.length - i);
        for (let j = 0; j < n; j += 8) e += data[i + j] * data[i + j];
        bins.push(Math.round(Math.sqrt(e / (n / 8)) * 1000) / 1000);
      }
      return { song: s.id, seconds: Math.round(dur), rms: bins };
    },
    async record(seconds, songId, difficulty) {
      const eng = ensureAudio();
      if (eng.ctx.state === "suspended") await eng.ctx.resume();
      if (!eng.capture) {
        eng.capture = eng.ctx.createMediaStreamDestination();
        eng.master.connect(eng.capture);
      }
      const canvasStream = canvas.captureStream(30);
      const mixed = new MediaStream([...canvasStream.getVideoTracks(), ...eng.capture.stream.getAudioTracks()]);
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm";
      const rec = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 2400000, audioBitsPerSecond: 128000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((resolve) => { rec.onstop = () => resolve(); });
      rec.start(250);
      await startSong(songId || "pop", difficulty || "normal", { auto: true, sd: 0.015, seed: 5 });
      await new Promise((r) => setTimeout(r, Math.round(seconds * 1000)));
      rec.stop();
      await stopped;
      playing = false;
      bot = null;
      stopNodes();
      const blob = new Blob(chunks, { type: mime });
      window.__recBlob = blob;
      return { size: blob.size, type: blob.type, seconds };
    },
    async tests() {
      const structural = this.structural();
      const acoustic = await this.acoustic();
      const density = this.density();
      const sim = this.sim(0.04);
      const maxAcoustic = acoustic.reduce((m, r) => Math.max(m, r.maxMs), 0);
      const maxStructural = structural.reduce((m, r) => Math.max(m, r.maxMs), 0);
      return { maxAcoustic, maxStructural, structural, acoustic, density, sim };
    },
  };
})();
