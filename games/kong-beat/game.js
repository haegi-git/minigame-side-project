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
  let feverHold = false;
  let lastMileSeen = 0;
  let lastBeatSpawn = -99;
  const confetti = [];
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

  function inFever() {
    return feverHold || !!(session && session.combo >= 50);
  }

  function milestoneOn() {
    return !!(session && session.mileAt && performance.now() - session.mileAt < 820);
  }

  function themeOf(mood) {
    if (mood === "dnb") {
      return {
        mood,
        sky: ["#070814", "#1a1440"],
        floor: ["#24143a", "#0c0e18"],
        led: "#3ef0ff",
        spot: ["rgba(90,255,214,0.42)", "rgba(190,70,255,0.38)"],
        crowd: "#070910",
        accent: "#7ce7c4",
      };
    }
    if (mood === "matsuri") {
      return {
        mood,
        sky: ["#140820", "#6a2048"],
        floor: ["#8a4b28", "#4a2614"],
        led: "#ffb15a",
        spot: ["rgba(255,196,96,0.5)", "rgba(255,90,120,0.36)"],
        crowd: "#2a1020",
        accent: "#ffe066",
      };
    }
    return {
      mood: "pop",
      sky: ["#ffb7d8", "#ffe7a4"],
      floor: ["#ffd4ea", "#fff4c4"],
      led: "#ff8fb8",
      spot: ["rgba(255,248,190,0.62)", "rgba(255,150,196,0.42)"],
      crowd: "#7a3d68",
      accent: "#ff8fb8",
    };
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
      stageBox = { x: 10, y: 104, w: W - 20, h: Math.round(Math.min(H * 0.32, 270)) };
      highway = { x: 12, y: stageBox.y + stageBox.h + 8, w: W - 24, h: H - (stageBox.y + stageBox.h) - 18 };
    } else {
      stageBox = { x: 16, y: 92, w: Math.min(500, W * 0.42), h: H - 108 };
      highway = {
        x: stageBox.x + stageBox.w + 18,
        y: 92,
        w: W - (stageBox.x + stageBox.w + 18) - 16,
        h: H - 108,
      };
    }
    if (highway.h < 160) {
      const need = 160 - highway.h;
      stageBox.h = Math.max(120, stageBox.h - need);
      highway.y = stageBox.y + stageBox.h + 8;
      highway.h = H - highway.y - 12;
    }
    const laneW = highway.w / 4;
    const lanes = [0, 1, 2, 3].map((i) => ({
      i,
      x: highway.x + i * laneW,
      w: laneW,
      cx: highway.x + (i + 0.5) * laneW,
    }));
    const receptor = highway.y + highway.h - Math.min(58, Math.max(36, highway.h * 0.12));
    layout = { portrait, stageBox, highway, lanes, receptor, speed: (receptor - highway.y - 8) / 1.15 };
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
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 90 + Math.random() * 260;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: 0.4 + Math.random() * 0.28,
        max: 0.7,
        color,
        size: 3 + Math.random() * 4,
        star: true,
      });
    }
  }

  function spawnConfetti(x, y, n) {
    const colors = ["#ff8fb8", "#ffe066", "#7ce7c4", "#d4b3ff", "#fffdf8", "#8ec5ff"];
    for (let i = 0; i < n; i++) {
      confetti.push({
        x, y,
        vx: (Math.random() - 0.5) * 280,
        vy: -40 - Math.random() * 280,
        life: 0.9 + Math.random() * 0.7,
        max: 1.6,
        color: colors[i % colors.length],
        w: 4 + Math.random() * 5,
        h: 8 + Math.random() * 7,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  function rr(g, x, y, w, h, r) {
    const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    g.beginPath();
    g.moveTo(x + rad, y);
    g.arcTo(x + w, y, x + w, y + h, rad);
    g.arcTo(x + w, y + h, x, y + h, rad);
    g.arcTo(x, y + h, x, y, rad);
    g.arcTo(x, y, x + w, y, rad);
    g.closePath();
  }

  function highwaySpan(y) {
    const box = layout.highway;
    const t = Math.min(1, Math.max(0, (y - box.y) / box.h));
    const width = box.w * (0.52 + 0.48 * t);
    const left = box.x + (box.w - width) / 2;
    return { left, width, t };
  }

  function laneAt(i, y) {
    const s = highwaySpan(y);
    const w = s.width / 4;
    return { x: s.left + i * w, w, cx: s.left + (i + 0.5) * w, t: s.t };
  }

  function draw() {
    const now = songNow();
    const beat = song ? beatDur(song) : 0.5;
    const phase = playing ? (now - (song ? song.lead : 0)) / beat : performance.now() / 520;
    const frac = phase - Math.floor(phase);
    const pulse = playing && now > (song ? song.lead : 0)
      ? Math.pow(Math.max(0, 1 - frac), 4)
      : 0.35 + 0.2 * Math.sin(performance.now() / 380);
    const mood = song ? song.mood : (mode === "select" ? "pop" : "pop");
    const theme = themeOf(inFever() && mode === "play" ? (mood === "matsuri" ? "matsuri" : mood) : mood);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(1, theme.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (!layout) return;
    if (mode === "play") {
      ctx.fillStyle = "rgba(10, 6, 18, 0.72)";
      ctx.fillRect(0, 44, W, layout.portrait ? 54 : 42);
      drawVenue(layout.stageBox, phase, pulse, theme);
      drawHighway(now, pulse, theme);
      drawHud(pulse);
      if (session && session.mile && session.mile !== lastMileSeen) {
        lastMileSeen = session.mile;
        spawnConfetti(layout.stageBox.x + layout.stageBox.w / 2, layout.stageBox.y + 30, 42);
      }
      const beatNo = Math.floor(phase);
      if (playing && inFever() && beatNo !== lastBeatSpawn && phase > 0) {
        lastBeatSpawn = beatNo;
        spawnConfetti(layout.stageBox.x + layout.stageBox.w * 0.5, layout.stageBox.y + 10, 14);
      }
    } else {
      drawVenue({ x: -20, y: H * 0.42, w: W + 40, h: H * 0.62 }, phase, pulse, themeOf(mood));
      ctx.fillStyle = "rgba(18, 10, 32, 0.42)";
      ctx.fillRect(0, 0, W, H);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= 1 / 60;
      p.x += p.vx / 60;
      p.y += p.vy / 60;
      p.vy += 320 / 60;
      if (p.life <= 0) particles.splice(i, 1);
      else drawSpark(p);
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i];
      c.life -= 1 / 60;
      c.x += c.vx / 60;
      c.y += c.vy / 60;
      c.vy += 420 / 60;
      c.rot += c.vr / 60;
      if (c.life <= 0) confetti.splice(i, 1);
      else {
        ctx.save();
        ctx.globalAlpha = Math.max(0, c.life / c.max);
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawSpark(p) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.translate(p.x, p.y);
    if (p.star) {
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * p.size * 2.1, Math.sin(a) * p.size * 2.1);
        ctx.lineTo(Math.cos(a + 0.4) * p.size * 0.45, Math.sin(a + 0.4) * p.size * 0.45);
      }
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVenue(b, phase, pulse, theme) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
    rr(ctx, b.x, b.y, b.w, b.h, 26);
    const sky = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    sky.addColorStop(0, theme.sky[0]);
    sky.addColorStop(0.55, theme.sky[1]);
    sky.addColorStop(1, theme.floor[1]);
    ctx.fillStyle = sky;
    ctx.fill();

    const wallH = b.h * 0.46;
    drawLedWall(b.x + 18, b.y + 14, b.w - 36, wallH - 10, phase, pulse, theme);
    if (theme.mood === "pop") drawLemons(b, phase);
    if (theme.mood === "dnb") drawLasers(b, phase, pulse);
    if (theme.mood === "matsuri") drawLanterns(b, phase);

    const sweep = Math.sin(phase * 0.65) * 0.55;
    drawSpot(b.x + b.w * 0.28, b.y + 8, -0.55 + sweep, b.h * 0.78, theme.spot[0]);
    drawSpot(b.x + b.w * 0.72, b.y + 8, 0.55 - sweep * 0.8, b.h * 0.78, theme.spot[1]);

    drawCrowd(b, phase, theme);
    drawStageFloor(b, pulse, theme);
    drawSpeaker(b.x + 8, b.y + b.h * 0.58, Math.min(54, b.w * 0.12), b.h * 0.28, pulse, theme);
    drawSpeaker(b.x + b.w - Math.min(54, b.w * 0.12) - 8, b.y + b.h * 0.58, Math.min(54, b.w * 0.12), b.h * 0.28, pulse, theme);
    if (theme.mood === "matsuri") drawTaiko(b.x + b.w * 0.8, b.y + b.h * 0.62, Math.min(70, b.w * 0.16), phase);

    const ground = b.y + b.h - Math.max(28, b.h * 0.12);
    const colors = theme.mood === "dnb" ? ["#7ce7c4", "#d4b3ff", "#8ec5ff"] : theme.mood === "matsuri" ? ["#ff8fb8", "#ffe066", "#fffdf8"] : ["#ff8fb8", "#7ce7c4", "#ffe066"];
    const acc = theme.mood === "dnb" ? "phones" : theme.mood === "matsuri" ? "band" : "shades";
    const scale = Math.min(layout.portrait ? 0.62 : 0.92, b.h / 280);
    const special = milestoneOn();
    for (let i = 0; i < 3; i++) {
      const pose = dancePose(i, phase, special, inFever());
      drawDancer(b.x + b.w * (0.28 + i * 0.22), ground, colors[i], pose, scale, acc);
    }
    ctx.restore();
  }

  function drawLedWall(x, y, w, h, phase, pulse, theme) {
    ctx.fillStyle = theme.mood === "pop" ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.35)";
    rr(ctx, x, y, w, h, 16);
    ctx.fill();
    const cols = Math.max(8, Math.floor(w / 22));
    const rows = Math.max(2, Math.floor(h / 18));
    const cw = (w - 16) / cols;
    const rh = (h - 12) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wave = Math.sin(phase * 2 + c * 0.55 + r * 0.8);
        const on = wave > (inFever() ? -0.35 : 0.05) || pulse > 0.72;
        ctx.globalAlpha = on ? 0.45 + pulse * 0.45 : 0.12;
        ctx.fillStyle = on ? theme.led : (theme.mood === "pop" ? "#fff" : "#241433");
        rr(ctx, x + 8 + c * cw, y + 6 + r * rh, cw - 4, rh - 4, 4);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawLemons(b, phase) {
    for (let i = 0; i < 3; i++) {
      const x = b.x + b.w * (0.18 + i * 0.32);
      const y = b.y + 36 + Math.sin(phase + i) * 6;
      ctx.fillStyle = "#ffe566";
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e2b100";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 12, y);
      ctx.lineTo(x + 12, y);
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x, y + 12);
      ctx.stroke();
    }
  }

  function drawLasers(b, phase, pulse) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const colors = ["rgba(80,255,220,0.55)", "rgba(255,70,180,0.45)", "rgba(120,140,255,0.4)"];
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 3 + pulse * 2;
      ctx.beginPath();
      const x = b.x + b.w * (0.2 + i * 0.3);
      ctx.moveTo(x, b.y + 6);
      ctx.lineTo(b.x + b.w * (0.15 + ((phase * 0.15 + i) % 1) * 0.7), b.y + b.h * 0.72);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLanterns(b, phase) {
    const n = Math.max(3, Math.floor(b.w / 90));
    for (let i = 0; i < n; i++) {
      const x = b.x + 36 + i * ((b.w - 72) / Math.max(1, n - 1));
      const y = b.y + 28 + Math.sin(phase * 1.3 + i) * 7;
      ctx.strokeStyle = "rgba(255,220,160,0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, b.y + 8);
      ctx.lineTo(x, y - 14);
      ctx.stroke();
      ctx.fillStyle = i % 2 ? "#ff5a6a" : "#ffb03a";
      ctx.beginPath();
      ctx.ellipse(x, y, 12, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,244,200,0.85)";
      ctx.fillRect(x - 2, y + 14, 4, 10);
    }
  }

  function drawSpot(x, y, angle, len, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-len * 0.18, len);
    ctx.lineTo(len * 0.18, len);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCrowd(b, phase, theme) {
    const y = b.y + b.h * 0.5;
    const count = Math.max(8, Math.floor(b.w / 28));
    for (let i = 0; i < count; i++) {
      const bob = Math.abs(Math.sin(phase * Math.PI + i * 0.45)) * 10;
      const x = b.x + 16 + i * ((b.w - 32) / count);
      ctx.fillStyle = theme.crowd;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(x, y - bob, 9, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      if (theme.mood === "dnb" && i % 2 === 0) {
        ctx.fillStyle = i % 4 ? "#7ce7c4" : "#ff8fb8";
        ctx.fillRect(x + 6, y - bob - 4, 7, 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawStageFloor(b, pulse, theme) {
    const top = b.y + b.h * 0.62;
    const grd = ctx.createLinearGradient(b.x, top, b.x, b.y + b.h);
    grd.addColorStop(0, theme.floor[0]);
    grd.addColorStop(1, theme.floor[1]);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(b.x + b.w * 0.08, top);
    ctx.lineTo(b.x + b.w * 0.92, top);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x, b.y + b.h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = theme.mood === "dnb" ? "rgba(124,231,196,0.35)" : "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      ctx.beginPath();
      ctx.moveTo(b.x + b.w * (0.08 + t * 0.84), top);
      ctx.lineTo(b.x + b.w * t, b.y + b.h);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(255,255,255,${0.08 + pulse * 0.18})`;
    ctx.fillRect(b.x, top, b.w, 4);
  }

  function drawSpeaker(x, y, w, h, pulse, theme) {
    ctx.fillStyle = "#1b1228";
    rr(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#2a2038";
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.42, Math.min(w, h) * 0.28 * (1 + pulse * 0.06), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.42, 4 + pulse * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTaiko(x, y, r, phase) {
    const hit = (phase - Math.floor(phase)) < 0.16;
    ctx.fillStyle = "#f3e2c4";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6b2a22";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = "#8a3028";
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.72, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 4;
    ctx.beginPath();
    const a = hit ? -0.6 : 0.4;
    ctx.moveTo(x - r, y - r * 0.2);
    ctx.lineTo(x - r * 0.2, y + Math.sin(a) * 8);
    ctx.moveTo(x + r, y - r * 0.2);
    ctx.lineTo(x + r * 0.2, y + (hit ? 6 : -8));
    ctx.stroke();
  }

  function dancePose(index, phase, special, fever) {
    const f = phase - Math.floor(phase);
    const kick = Math.pow(Math.max(0, 1 - f * 2.4), 2);
    const sway = Math.sin(phase * Math.PI * 2 + index);
    const boost = fever ? 1.45 : 1;
    const pop = special ? 28 : 0;
    if (index === 0) return { jump: kick * 36 * boost + pop, lean: sway * 0.22, arm: Math.sin(phase * Math.PI * 2), step: phase * Math.PI * 2 };
    if (index === 1) return { jump: kick * 26 * boost + pop + (special ? 10 : 0), lean: sway * 0.35, arm: Math.sin(phase * Math.PI * 4), step: phase * Math.PI * 2 + 1 };
    return { jump: Math.abs(sway) * 14 * boost + kick * 18 + pop * 0.6, lean: sway * 0.4, arm: Math.cos(phase * Math.PI * 2), step: phase * Math.PI * 2 + 2 };
  }

  function drawDancer(x, y, color, pose, scale, accessory) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(20,10,30,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 8, 22 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(pose.lean * 16 * scale, -pose.jump * scale);
    ctx.rotate(pose.lean * 0.2);
    ctx.scale(scale, scale);
    ctx.strokeStyle = "#2b2140";
    ctx.fillStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    const step = Math.sin(pose.step) * 7;
    ctx.beginPath();
    ctx.moveTo(-8, 22);
    ctx.lineTo(-14 - step, 46);
    ctx.moveTo(8, 22);
    ctx.lineTo(14 + step, 46);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const lift = pose.arm;
    ctx.beginPath();
    ctx.moveTo(-16, 2);
    ctx.lineTo(-34, 18 - lift * 34);
    ctx.moveTo(16, 2);
    ctx.lineTo(36, 18 + lift * 30);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-34, 18 - lift * 34, 5, 0, Math.PI * 2);
    ctx.arc(36, 18 + lift * 30, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2b2140";
    if (accessory === "shades") {
      ctx.fillRect(-16, -10, 12, 7);
      ctx.fillRect(4, -10, 12, 7);
    } else {
      ctx.beginPath();
      ctx.ellipse(-8, -6, 3.1, 4, 0, 0, Math.PI * 2);
      ctx.ellipse(8, -6, 3.1, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (accessory === "phones") {
      ctx.strokeStyle = "#1b2436";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -8, 20, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = "#1b2436";
      ctx.fillRect(-24, -10, 8, 14);
      ctx.fillRect(16, -10, 8, 14);
    }
    if (accessory === "band") {
      ctx.fillStyle = "#e23b4a";
      ctx.fillRect(-20, -28, 40, 8);
    }
    ctx.strokeStyle = "#2b2140";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 8, 7, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
  }

  function drawHighway(now, pulse, theme) {
    const box = layout.highway;
    const far = highwaySpan(box.y);
    const near = highwaySpan(box.y + box.h);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(far.left - 8, box.y);
    ctx.lineTo(far.left + far.width + 8, box.y);
    ctx.lineTo(near.left + near.width + 10, box.y + box.h);
    ctx.lineTo(near.left - 10, box.y + box.h);
    ctx.closePath();
    ctx.clip();
    const bg = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
    bg.addColorStop(0, inFever() ? "#4a1030" : "#120a22");
    bg.addColorStop(1, inFever() ? "#ff4d8d" : "#241433");
    ctx.fillStyle = bg;
    ctx.fillRect(box.x - 20, box.y, box.w + 40, box.h);

    for (let i = 0; i < 4; i++) {
      const a = laneAt(i, box.y);
      const b = laneAt(i, box.y + box.h);
      ctx.beginPath();
      ctx.moveTo(a.x + 3, box.y);
      ctx.lineTo(a.x + a.w - 3, box.y);
      ctx.lineTo(b.x + b.w - 4, box.y + box.h);
      ctx.lineTo(b.x + 4, box.y + box.h);
      ctx.closePath();
      ctx.fillStyle = pressed[i] ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.04)";
      ctx.fill();
      if (flashes[i] > 0) {
        flashes[i] = Math.max(0, flashes[i] - 0.045);
        ctx.globalAlpha = flashes[i] * 0.55;
        ctx.fillStyle = laneColor(i);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = laneColor(i);
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, box.y);
      ctx.lineTo(b.x, box.y + box.h);
      ctx.moveTo(a.x + a.w, box.y);
      ctx.lineTo(b.x + b.w, box.y + box.h);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (session) {
      const speed = layout.speed;
      for (const n of session.notes) {
        if (n.done && now - n.time > 0.25) continue;
        const y = layout.receptor - (n.time - now) * speed;
        const y2 = n.kind === "hold" ? layout.receptor - (n.time + n.dur - now) * speed : y;
        if (Math.max(y, y2) < box.y - 40 || Math.min(y, y2) > box.y + box.h + 30) continue;
        drawNote(n, y, y2);
      }
    }

    const judge = laneAt(0, layout.receptor);
    const judgeEnd = laneAt(3, layout.receptor);
    const jx = judge.x;
    const jw = judgeEnd.x + judgeEnd.w - judge.x;
    const jh = 8 + pulse * 10;
    ctx.shadowColor = inFever() ? "#ffe066" : "#fff";
    ctx.shadowBlur = 16 + pulse * 18;
    ctx.fillStyle = inFever() ? "#ffe066" : "#fffdf8";
    ctx.globalAlpha = 0.85;
    rr(ctx, jx, layout.receptor - jh / 2, jw, jh, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    for (let i = 0; i < 4; i++) {
      const lane = laneAt(i, layout.receptor);
      ctx.fillStyle = laneColor(i);
      ctx.beginPath();
      ctx.arc(lane.cx, layout.receptor, pressed[i] ? 16 : 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fffdf8";
      ctx.beginPath();
      ctx.arc(lane.cx, layout.receptor, 4, 0, Math.PI * 2);
      ctx.fill();
      if (!document.body.classList.contains("coarse") && layout.receptor + 28 < box.y + box.h) {
        ctx.fillStyle = "rgba(255,253,248,0.86)";
        ctx.font = "13px Jua, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(LANES[i], lane.cx, layout.receptor + 28);
      }
    }
    ctx.restore();
  }

  function laneColor(i) {
    if (!inFever()) return LANE_COLOR[i];
    return ["#ffe14a", "#ff3d8a", "#3dfff0", "#d09bff"][i];
  }

  function drawNote(n, y, y2) {
    const head = laneAt(n.lane, y);
    const col = laneColor(n.lane);
    const nw = Math.max(16, head.w * 0.62);
    const scale = 0.72 + head.t * 0.38;
    if (n.kind === "hold") {
      const tail = laneAt(n.lane, y2);
      ctx.fillStyle = col;
      ctx.globalAlpha = n.head ? 0.4 : 0.9;
      ctx.beginPath();
      ctx.moveTo(tail.cx - tail.w * 0.16, y2);
      ctx.lineTo(tail.cx + tail.w * 0.16, y2);
      ctx.lineTo(head.cx + nw * 0.22, y);
      ctx.lineTo(head.cx - nw * 0.22, y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tail.cx, y2);
      ctx.lineTo(head.cx, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (n.done) return;
    ctx.save();
    ctx.translate(head.cx, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = col;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    if (n.kind === "flick") {
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(16, 8);
      ctx.lineTo(-16, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#2b2140";
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(-8, -14);
      ctx.lineTo(8, -14);
      ctx.fill();
    } else if (n.kind === "hold") {
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.beginPath();
      ctx.arc(-3, -3, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      rr(ctx, -nw / 2, -11, nw, 22, 11);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      rr(ctx, -nw / 2 + 5, -7, nw - 10, 6, 4);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHud(pulse) {
    if (!session || !layout || !song || mode !== "play") return;
    ctx.save();
    const b = layout.stageBox;
    ctx.fillStyle = "rgba(16,8,24,0.5)";
    rr(ctx, b.x + 10, b.y + 8, Math.min(210, b.w - 20), 22, 10);
    ctx.fill();
    ctx.fillStyle = "#fffdf8";
    ctx.textAlign = "left";
    ctx.font = "13px Jua, sans-serif";
    ctx.fillText(`SCORE ${session.score}   ${accuracyOf(session.counts).toFixed(1)}%`, b.x + 18, b.y + 23);
    if (session.combo >= 5 || inFever()) {
      ctx.textAlign = "center";
      ctx.fillStyle = inFever() ? "#ffe066" : "#fffdf8";
      ctx.font = `${Math.min(64, b.w * 0.18)}px Jua, sans-serif`;
      ctx.fillText(String(session.combo), b.x + b.w / 2, b.y + b.h * 0.28);
      ctx.font = "12px Jua, sans-serif";
      ctx.fillText(inFever() ? "FEVER" : "COMBO", b.x + b.w / 2, b.y + b.h * 0.28 + 16);
    }
    if (session.lastJudge && performance.now() - (session.judgeAt || 0) < 700) {
      const colors = { perfect: "#fff6c8", great: "#b8ffe8", good: "#e2d4ff", miss: "#ffb4c8" };
      ctx.textAlign = "center";
      ctx.font = "36px Jua, sans-serif";
      ctx.fillStyle = colors[session.lastJudge] || "#fff";
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 10;
      ctx.fillText(session.lastJudge.toUpperCase(), layout.highway.x + layout.highway.w / 2, layout.highway.y + 42);
    }
    if (milestoneOn()) {
      ctx.textAlign = "center";
      ctx.font = "20px Jua, sans-serif";
      ctx.fillStyle = "#fffdf8";
      ctx.fillText(`${session.mile} COMBO`, layout.highway.x + layout.highway.w / 2, layout.highway.y + 72);
    }
    ctx.restore();
  }

  function paintCover(g, song) {
    const w = 640;
    const h = 360;
    if (song.id === "dnb") paintClubCover(g, w, h);
    else if (song.id === "matsuri") paintMatsuriCover(g, w, h);
    else paintPopCover(g, w, h);
    g.fillStyle = "rgba(18,8,28,0.72)";
    rr(g, 28, 250, 360, 78, 18);
    g.fill();
    g.fillStyle = "#fffdf8";
    g.font = "36px Jua, sans-serif";
    g.textAlign = "left";
    g.fillText(song.title, 48, 300);
  }

  function paintPopCover(g, w, h) {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#ffd0ea");
    sky.addColorStop(1, "#fff3b0");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff6c8";
    g.fillRect(0, 230, w, 40);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? "#ff8fb8" : "#7ce7c4";
      g.fillRect(i * 80, 40, 80, 18);
    }
    g.fillStyle = "#ffe566";
    g.beginPath();
    g.arc(470, 150, 70, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#e2a400";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(420, 150);
    g.lineTo(520, 150);
    g.moveTo(470, 100);
    g.lineTo(470, 200);
    g.stroke();
    g.strokeStyle = "#7a4a20";
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(500, 70);
    g.lineTo(540, 20);
    g.stroke();
    coverDancers(g, ["#ff8fb8", "#7ce7c4", "#ffe066"], 150, 250, "shades");
    g.fillStyle = "#1b1228";
    rr(g, 40, 250, 46, 70, 8);
    g.fill();
    rr(g, 250, 250, 46, 70, 8);
    g.fill();
  }

  function paintClubCover(g, w, h) {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#070814");
    sky.addColorStop(1, "#243056");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(80,255,220,0.7)";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(80, 0);
    g.lineTo(420, 250);
    g.moveTo(560, 0);
    g.lineTo(180, 250);
    g.stroke();
    g.strokeStyle = "rgba(255,80,180,0.65)";
    g.beginPath();
    g.moveTo(300, 0);
    g.lineTo(300, 240);
    g.stroke();
    for (let i = 0; i < 14; i++) {
      const bh = 40 + ((i * 37) % 90);
      g.fillStyle = i % 2 ? "#7ce7c4" : "#d4b3ff";
      g.globalAlpha = 0.8;
      g.fillRect(30 + i * 42, 250 - bh, 24, bh);
    }
    g.globalAlpha = 1;
    g.fillStyle = "#101018";
    g.fillRect(230, 150, 180, 90);
    coverDancers(g, ["#7ce7c4", "#d4b3ff", "#8ec5ff"], 250, 250, "phones");
    g.fillStyle = "#0c0c14";
    rr(g, 36, 180, 70, 110, 8);
    g.fill();
    rr(g, 530, 180, 70, 110, 8);
    g.fill();
    g.fillStyle = "#7ce7c4";
    g.beginPath();
    g.arc(71, 230, 16, 0, Math.PI * 2);
    g.arc(565, 230, 16, 0, Math.PI * 2);
    g.fill();
  }

  function paintMatsuriCover(g, w, h) {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#1a1030");
    sky.addColorStop(1, "#c44868");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#3a2418";
    g.fillRect(70, 40, 18, 230);
    g.fillRect(250, 40, 18, 230);
    g.fillRect(70, 40, 198, 16);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i % 2 ? "#ff5a6a" : "#ffb03a";
      g.beginPath();
      g.ellipse(90 + i * 110, 78, 22, 28, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#f3e2c4";
    g.beginPath();
    g.ellipse(500, 230, 78, 52, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#6b2a22";
    g.lineWidth = 10;
    g.stroke();
    g.fillStyle = "#8a3028";
    g.beginPath();
    g.ellipse(500, 230, 52, 34, 0, 0, Math.PI * 2);
    g.fill();
    coverDancers(g, ["#ff8fb8", "#ffe066", "#fff6ea"], 160, 270, "band");
  }

  function coverDancers(g, colors, x, y, accessory) {
    colors.forEach((color, i) => {
      const cx = x + i * 58;
      g.fillStyle = color;
      g.strokeStyle = "#2b2140";
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(cx, y, 22, 30, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#2b2140";
      if (accessory === "shades") {
        g.fillRect(cx - 14, y - 10, 10, 6);
        g.fillRect(cx + 4, y - 10, 10, 6);
      } else {
        g.beginPath();
        g.arc(cx - 7, y - 6, 2.4, 0, Math.PI * 2);
        g.arc(cx + 7, y - 6, 2.4, 0, Math.PI * 2);
        g.fill();
      }
      if (accessory === "phones") {
        g.strokeStyle = "#111";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(cx, y - 8, 16, Math.PI, 0);
        g.stroke();
      }
      if (accessory === "band") {
        g.fillStyle = "#e23b4a";
        g.fillRect(cx - 16, y - 26, 32, 7);
      }
      g.strokeStyle = "#2b2140";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx - 14, y);
      g.lineTo(cx - 28, y - 18);
      g.moveTo(cx + 14, y);
      g.lineTo(cx + 30, y - 8);
      g.stroke();
    });
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
    if (!layout) return;
    const at = laneAt(note.lane, layout.receptor);
    const n = note.head === "perfect" ? (inFever() ? 22 : 14) : 8;
    spawnBurst(at.cx, layout.receptor, laneColor(note.lane), n);
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
    feverHold = !!opts.fever;
    lastMileSeen = 0;
    lastBeatSpawn = -99;
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
    const party = document.getElementById("party");
    party.innerHTML = "";
    const colors = ["#ff8fb8", "#ffe066", "#7ce7c4", "#d4b3ff", "#8ec5ff", "#fffdf8"];
    for (let i = 0; i < 32; i++) {
      const bit = document.createElement("i");
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = `${Math.random() * 0.18}s`;
      bit.style.width = `${8 + (i % 4) * 2}px`;
      party.appendChild(bit);
    }
    el.resRank.classList.remove("reveal");
    void el.resRank.offsetWidth;
    el.resRank.classList.add("reveal");
    setMode("result");
  }

  function quit() {
    playing = false;
    bot = null;
    feverHold = false;
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
      const cover = document.createElement("canvas");
      cover.className = "art-canvas";
      cover.width = 640;
      cover.height = 360;
      paintCover(cover.getContext("2d"), s);
      const body = document.createElement("div");
      body.className = "card-body";
      body.innerHTML = `<h2>${s.title}</h2><span class="bpm">${s.bpm} BPM · ${sec}초</span><p>${s.blurb}</p><div class="hi">${best ? `최고 ${best}` : "아직 기록이 없어요"}</div>`;
      btn.append(cover, body);
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
    fever(id, difficulty) {
      return startSong(id || "pop", difficulty || diff, { auto: true, fever: true, sd: 0.015, seed: 4 });
    },
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
