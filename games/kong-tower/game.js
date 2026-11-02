/* 콩타워 — crane stack. Physics lives in sim.js. */
(() => {
  const BEST_KEY = "kongtower-best";
  const Sim = window.KongTowerSim;
  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const ui = {
    title: document.getElementById("title"),
    hud: document.getElementById("hud"),
    result: document.getElementById("result"),
    height: document.getElementById("height"),
    score: document.getElementById("score"),
    combo: document.getElementById("combo"),
    lives: document.getElementById("lives"),
    nextBean: document.getElementById("next-bean"),
    nextName: document.getElementById("next-name"),
    wind: document.getElementById("wind"),
    mute: document.getElementById("mute"),
    resKicker: document.getElementById("res-kicker"),
    resZone: document.getElementById("res-zone"),
    resHeight: document.getElementById("res-height"),
    resSub: document.getElementById("res-sub"),
    resScore: document.getElementById("res-score"),
    resStats: document.getElementById("res-stats"),
  };

  const KIND_NAME = { normal: "콩", iron: "철콩", jelly: "젤리콩", tiny: "꼬마콩" };
  const ZONE_NAME = { town: "마을 지붕", cloud: "구름", sunset: "노을", night: "밤하늘", space: "우주" };
  let W = 360;
  let H = 640;
  let mode = "title";
  let state = Sim.create(1);
  let cam = 0;
  let shake = 0;
  let muted = false;
  let audio = null;
  let particles = [];
  let auto = null;
  let autoPlan = null;
  let last = 0;
  let acc = 0;
  let flash = 0;
  let jx = 0;
  let jy = 0;
  const rngAuto = () => Math.random();

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(320, r.width);
    H = Math.max(480, r.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function scaleOf() {
    return Math.max(0.72, Math.min(1.15, W / 520));
  }

  function toScreen(x, y) {
    const s = scaleOf();
    return [W / 2 + x * s + jx, H * 0.8 - (y - cam) * s + jy];
  }

  function ensureAudio() {
    if (audio) return audio;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const actx = new Ctx();
    const master = actx.createGain();
    master.gain.value = 0.8;
    master.connect(actx.destination);
    audio = { ctx: actx, master };
    return audio;
  }

  function armAudio() {
    const eng = ensureAudio();
    if (eng.ctx.state === "suspended") eng.ctx.resume();
    return eng;
  }

  function tone(freq, dur, type, peak, slide) {
    if (muted || !audio) return;
    const t = audio.ctx.currentTime;
    const o = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(audio.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, peak) {
    if (muted || !audio) return;
    const t = audio.ctx.currentTime;
    const len = Math.floor(audio.ctx.sampleRate * 0.2);
    const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(g);
    g.connect(audio.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function burst(x, y, color, n) {
    const s = scaleOf();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      particles.push({
        x, y,
        vx: Math.cos(a) * (40 + Math.random() * 90) / s,
        vy: Math.sin(a) * (40 + Math.random() * 90) / s + 30,
        life: 0.45 + Math.random() * 0.25,
        age: 0,
        color,
        size: 3 + Math.random() * 4,
      });
    }
  }

  function loadBest() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (err) { return 0; }
  }

  function saveBest(score) {
    const prev = loadBest();
    const best = Math.max(prev, score);
    if (best > prev) {
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (err) { /* ignore */ }
    }
    return { best, isBest: score > prev && score > 0 };
  }

  function setMode(next) {
    mode = next;
    ui.title.classList.toggle("hidden", next !== "title");
    ui.hud.classList.toggle("hidden", next !== "play");
    ui.result.classList.toggle("hidden", next !== "result");
  }

  function fresh(seed) {
    state = Sim.create(seed || (Date.now() % 100000));
    particles = [];
    cam = 0;
    shake = 0;
    flash = 0;
    autoPlan = null;
  }

  function begin(seed) {
    fresh(seed);
    setMode("play");
    resize();
  }

  function finish() {
    if (mode === "result") return;
    const height = Sim.heightOf(state);
    const zone = Sim.zoneAt(height);
    const saved = saveBest(state.score);
    ui.resKicker.textContent = saved.isBest ? "NEW RECORD" : "GAME OVER";
    ui.resZone.textContent = ZONE_NAME[zone] || zone;
    ui.resHeight.textContent = `${height}층`;
    ui.resSub.textContent = `퍼펙트 ${state.perfects} · 최대 콤보 ${state.maxCombo}`;
    ui.resScore.textContent = String(state.score);
    const rows = [
      ["높이", height],
      ["퍼펙트", state.perfects],
      ["최대 콤보", state.maxCombo],
      ["최고 점수", saved.best],
    ];
    ui.resStats.innerHTML = rows.map(([k, v]) => `<li>${k}<b>${v}</b></li>`).join("");
    setMode("result");
    tone(196, 0.18, "triangle", 0.12, 120);
    tone(247, 0.28, "triangle", 0.08, 160);
  }

  function paintLives() {
    ui.lives.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("i");
      if (i >= state.lives) dot.className = "off";
      ui.lives.appendChild(dot);
    }
  }

  function syncHud() {
    const h = Sim.heightOf(state);
    ui.height.textContent = String(h);
    ui.score.textContent = String(state.score);
    ui.combo.textContent = `${state.combo} COMBO`;
    ui.combo.classList.toggle("on", state.combo >= 2);
    paintLives();
    const kind = state.nextKind || "normal";
    ui.nextName.textContent = KIND_NAME[kind] || "콩";
    ui.nextBean.style.background = kind === "iron" ? "#aeb6c6" : kind === "jelly" ? "#9aefff" : kind === "tiny" ? "#ffe066" : "#ff8fb8";
    const warn = state.wind && state.wind.phase === "warn";
    ui.wind.classList.toggle("hidden", !warn);
    ui.wind.textContent = warn ? (state.wind.dir < 0 ? "← 돌풍" : "돌풍 →") : "";
  }

  function consume() {
    for (const ev of state.events) {
      if (ev.type === "perfect") {
        flash = 0.35;
        shake = Math.max(shake, 0.2);
        burst(ev.x, ev.y, "#fff6c8", 16);
        tone(660, 0.08, "sine", 0.08);
        tone(880, 0.12, "triangle", 0.06);
      } else if (ev.type === "land") {
        shake = Math.max(shake, ev.sliced ? 0.35 : 0.18);
        burst(ev.x, ev.y, "#fffdf8", ev.sliced ? 10 : 6);
        tone(180, 0.09, "sine", 0.12, 70);
        if (ev.sliced) noise(0.08, 0.08);
      } else if (ev.type === "miss" || ev.type === "topple") {
        shake = Math.max(shake, 0.7);
        burst(ev.x || 0, ev.y || Sim.heightOf(state) * 36, "#ff8fb8", 18);
        tone(240, 0.16, "sawtooth", 0.06, 80);
      } else if (ev.type === "drop") tone(520, 0.04, "square", 0.03);
      else if (ev.type === "wind-warn") tone(740, 0.1, "triangle", 0.05);
      else if (ev.type === "gust") noise(0.25, 0.07);
    }
    shake = Math.max(shake, state.shakes || 0);
  }

  function skyColors(height) {
    const stops = [
      { h: 0, top: "#b9e6ff", bot: "#fff1c4" },
      { h: 5, top: "#8ecfff", bot: "#e7f4ff" },
      { h: 11, top: "#ff9d73", bot: "#ffd0ea" },
      { h: 18, top: "#24315f", bot: "#c47aa4" },
      { h: 30, top: "#070814", bot: "#1c2a4a" },
    ];
    let i = 0;
    while (i < stops.length - 1 && height >= stops[i + 1].h) i += 1;
    return stops[i];
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

  function drawBean(sx, sy, w, h, color, expr, angle, squash, kind) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle || 0);
    const sq = squash || 0;
    ctx.scale(1 + sq * 0.16, 1 - sq * 0.22);
    ctx.fillStyle = "rgba(43,33,64,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, h * 0.46, w * 0.36, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    body.addColorStop(0, "#fffdf8");
    body.addColorStop(0.35, color);
    body.addColorStop(1, color);
    ctx.fillStyle = body;
    ctx.strokeStyle = "#2b2140";
    ctx.lineWidth = 3;
    roundRect(-w / 2, -h / 2, w, h, Math.min(18, h * 0.45));
    ctx.fill();
    ctx.stroke();
    if (kind === "iron") {
      ctx.strokeStyle = "#5c6570";
      ctx.lineWidth = 2;
      ctx.strokeRect(-w * 0.28, -h * 0.18, w * 0.56, h * 0.36);
    }
    if (kind === "jelly") {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.ellipse(-w * 0.16, -h * 0.12, w * 0.12, h * 0.16, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#2b2140";
    const eye = expr === "happy" ? 1.5 : expr === "dizzy" ? 3.2 : 2.4;
    ctx.beginPath();
    ctx.arc(-w * 0.16, -h * 0.06, eye, 0, Math.PI * 2);
    ctx.arc(w * 0.16, -h * 0.06, eye, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2b2140";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (expr === "nervous") {
      ctx.moveTo(-w * 0.16, h * 0.22);
      ctx.quadraticCurveTo(0, h * 0.08, w * 0.16, h * 0.22);
    } else if (expr === "dizzy") {
      ctx.arc(0, h * 0.16, 4, 0, Math.PI * 1.4);
    } else if (expr === "happy") {
      ctx.arc(0, h * 0.02, w * 0.16, 0.15, Math.PI - 0.15);
    } else {
      ctx.arc(0, h * 0.02, w * 0.14, 0.2, Math.PI - 0.2);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawWorld() {
    jx = (Math.random() - 0.5) * shake * 14;
    jy = (Math.random() - 0.5) * shake * 10;
    const height = Sim.heightOf(state);
    const zone = Sim.zoneAt(height);
    const sky = skyColors(height);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top);
    g.addColorStop(1, sky.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const s = scaleOf();
    const parallax = cam * s;
    if (zone === "night" || zone === "space") {
      ctx.fillStyle = "#fffdf8";
      for (let i = 0; i < 40; i++) {
        const x = (i * 97) % W;
        const y = ((i * 53) - parallax * 0.15) % H;
        ctx.globalAlpha = 0.35 + (i % 5) * 0.1;
        ctx.fillRect(x, (y + H) % H, i % 7 === 0 ? 3 : 2, i % 7 === 0 ? 3 : 2);
      }
      ctx.globalAlpha = 1;
    }
    if (zone === "town" || zone === "cloud") {
      for (let i = 0; i < 7; i++) {
        const bw = 46 + (i % 3) * 16;
        const bh = 70 + (i % 4) * 24;
        const x = ((i * 110 - parallax * 0.25) % (W + 160)) - 80;
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.45)" : "rgba(43,33,64,0.12)";
        ctx.fillRect(x, H * 0.62 - bh + parallax * 0.05, bw, bh);
        ctx.fillStyle = "rgba(255,224,102,0.8)";
        for (let wy = 0; wy < 3; wy++) ctx.fillRect(x + 8, H * 0.62 - bh + 12 + wy * 18, 8, 8);
      }
    }
    if (zone === "cloud" || zone === "sunset" || zone === "town") {
      ctx.fillStyle = zone === "sunset" ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.72)";
      for (let i = 0; i < 4; i++) {
        const x = ((i * 220 - parallax * 0.4) % (W + 200)) - 60;
        const y = 80 + (i % 3) * 50;
        ctx.beginPath();
        ctx.ellipse(x, y, 54, 18, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 30, y + 6, 36, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (zone === "sunset") {
      const sun = ctx.createRadialGradient(W * 0.72, H * 0.28, 8, W * 0.72, H * 0.28, 70);
      sun.addColorStop(0, "#fff6c8");
      sun.addColorStop(1, "rgba(255,176,120,0)");
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.arc(W * 0.72, H * 0.28, 70, 0, Math.PI * 2);
      ctx.fill();
    }
    if (zone === "space") {
      ctx.fillStyle = "#d4b3ff";
      ctx.beginPath();
      ctx.arc(W * 0.78, 90 + parallax * 0.05, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,253,248,0.45)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(W * 0.78, 90, 46, 14, -0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (state.wind) {
      const warn = state.wind.phase === "warn";
      ctx.strokeStyle = warn ? "rgba(255,246,200,0.9)" : "rgba(255,255,255,0.92)";
      ctx.lineWidth = warn ? 4 : 6;
      const dir = state.wind.dir;
      for (let i = 0; i < 9; i++) {
        const y = 90 + i * 56;
        const span = W + 120;
        const shift = ((state.t * (warn ? 140 : 320) * dir) + i * 70) % span;
        const x = dir > 0 ? -80 + shift : W + 80 - shift;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dir * (warn ? 28 : 54), y + Math.sin(state.t * 6 + i) * 3);
        ctx.stroke();
      }
    }

    const target = Sim.heightOf(state) > 0 ? state.placed[state.placed.length - 1] : state.placed[0];
    for (const b of state.placed) {
      const [sx, sy] = toScreen(b.x, b.y);
      const bw = b.w * s;
      const bh = b.h * s;
      if (b.foundation) {
        ctx.fillStyle = "#d7c4a8";
        ctx.strokeStyle = "#2b2140";
        ctx.lineWidth = 3;
        roundRect(sx - bw / 2, sy - bh / 2, bw, bh, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#8dca7a";
        ctx.fillRect(sx - bw / 2, sy - bh / 2 - 6, bw, 10);
        continue;
      }
      const expr = flash > 0 && b === state.placed[state.placed.length - 1] ? "happy" : b.wobble > 0.08 ? "nervous" : "smile";
      drawBean(sx, sy, bw, bh, b.color, expr, b.angle || 0, b.squash || 0, b.kind);
    }
    for (const d of state.debris) {
      const [sx, sy] = toScreen(d.x, d.y);
      ctx.globalAlpha = Math.max(0, Math.min(1, d.life));
      drawBean(sx, sy, d.w * s, d.h * s, d.color, "dizzy", d.angle || 0, 0, d.kind);
      ctx.globalAlpha = 1;
    }
    if (state.active) {
      const b = state.active;
      const [sx, sy] = toScreen(b.x, b.y);
      const overhang = Math.abs(b.x - target.x) > b.w * 0.34;
      const expr = b.mode === "fall" ? "wow" : overhang ? "nervous" : "smile";
      if (b.mode === "hook") {
        ctx.strokeStyle = "#2b2140";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx, 28);
        ctx.lineTo(sx, sy - b.h * s * 0.5);
        ctx.stroke();
        ctx.fillStyle = "#2b2140";
        ctx.fillRect(0, 16, W, 10);
        ctx.fillStyle = "#ffe066";
        ctx.strokeStyle = "#2b2140";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, 22, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      drawBean(sx, sy, b.w * s, b.h * s, b.color, expr, b.angle || 0, b.mode === "fall" ? 0.2 : 0, b.kind);
    }
    for (const p of particles) {
      const [sx, sy] = toScreen(p.x, p.y);
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,246,200,${flash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function stepParticles(dt) {
    for (const p of particles) {
      p.age += dt;
      p.vy -= 180 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    particles = particles.filter((p) => p.age < p.life);
    if (flash > 0) flash = Math.max(0, flash - dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 1.5);
  }

  function followCamera(dt) {
    const focus = (state.placed[state.placed.length - 1].y) - 10;
    cam += (focus - cam) * Math.min(1, dt * 3.2);
  }

  function maybeAuto() {
    if (!auto || mode !== "play" || !state.active || state.active.mode !== "hook" || !state.active.ready) {
      if (!state.active || state.active.mode !== "hook") autoPlan = null;
      return;
    }
    const moved = autoPlan != null && Math.abs(state.placed[state.placed.length - 1].x - (state.active.planTop || 0)) > 3;
    if (autoPlan == null || (moved && auto.lead >= 0.5)) {
      const wait = Sim.botDelay(state, auto, rngAuto);
      autoPlan = state.t + wait;
      state.active.planTop = state.placed[state.placed.length - 1].x;
    }
    if (autoPlan != null && state.t >= autoPlan) {
      Sim.drop(state);
      autoPlan = null;
    }
  }

  function frame(ts) {
    const dt = Math.min(0.034, last ? (ts - last) / 1000 : 0.016);
    last = ts;
    if (mode === "play" && !state.over) {
      acc += dt;
      while (acc >= Sim.DT) {
        maybeAuto();
        Sim.step(state, Sim.DT);
        consume();
        acc -= Sim.DT;
      }
      followCamera(dt);
      syncHud();
      if (state.over) finish();
    } else if (mode === "title") {
      Sim.step(state, Math.min(0.016, dt));
      followCamera(dt);
    }
    stepParticles(dt);
    drawWorld();
    requestAnimationFrame(frame);
  }

  function onPress(fromButton) {
    armAudio();
    if (mode === "title") {
      begin();
      return;
    }
    if (mode === "result") return;
    if (fromButton) return;
    Sim.drop(state);
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (e.cancelable) e.preventDefault();
    onPress(false);
  });
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      onPress(false);
    }
  });
  document.getElementById("btn-start").addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    onPress(true);
  });
  document.getElementById("btn-retry").addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    armAudio();
    begin();
  });
  document.getElementById("btn-title").addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    fresh(2);
    setMode("title");
  });
  ui.mute.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const eng = armAudio();
    muted = !muted;
    ui.mute.textContent = muted ? "🔇" : "🔊";
    eng.master.gain.value = muted ? 0 : 0.8;
  });

  window.addEventListener("resize", resize);
  resize();
  setMode("title");
  requestAnimationFrame(frame);

  window.__kongtower = {
    start(seed) { begin(seed || 1); return Sim.heightOf(state); },
    auto(profile) {
      begin(7);
      auto = typeof profile === "string" ? (Sim.PROFILES[profile] || Sim.PROFILES.average) : profile;
      autoPlan = null;
    },
    stopAuto() { auto = null; },
    drop() { return Sim.drop(state); },
    info() {
      return {
        mode,
        height: Sim.heightOf(state),
        score: state.score,
        lives: state.lives,
        combo: state.combo,
        zone: Sim.zoneAt(Sim.heightOf(state)),
        wind: state.wind ? state.wind.phase : "",
        over: state.over,
        t: Math.round(state.t * 10) / 10,
      };
    },
    benchmark: (n) => Sim.benchmark(n),
    run: (seed, profile, limit) => Sim.run(seed, profile, limit),
    async record(seconds, profile) {
      const eng = ensureAudio();
      if (eng.ctx.state === "suspended") await eng.ctx.resume();
      if (!eng.capture) {
        eng.capture = eng.ctx.createMediaStreamDestination();
        eng.master.connect(eng.capture);
      }
      const canvasStream = canvas.captureStream(30);
      const mixed = new MediaStream([...canvasStream.getVideoTracks(), ...eng.capture.stream.getAudioTracks()]);
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm";
      const rec = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 2200000, audioBitsPerSecond: 96000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((resolve) => { rec.onstop = () => resolve(); });
      rec.start(200);
      this.auto(profile || { ...Sim.PROFILES.skilled, soonest: true });
      await new Promise((r) => setTimeout(r, Math.round(seconds * 1000)));
      rec.stop();
      await stopped;
      auto = null;
      const blob = new Blob(chunks, { type: mime });
      window.__recBlob = blob;
      return { size: blob.size, type: blob.type, seconds, info: this.info() };
    },
    fast(profile, until, seed, wantWind) {
      begin(seed || 11);
      auto = null;
      const spec = Sim.PROFILES[profile] || Sim.PROFILES.average;
      let plan = null;
      let guard = 0;
      const rng = () => ((guard * 9301 + 49297) % 233280) / 233280;
      while (!state.over && guard < 80000) {
        const tall = Sim.heightOf(state) >= until;
        const warned = state.wind && state.wind.phase === "warn";
        if (tall && (!wantWind || warned)) break;
        guard += 1;
        if (state.active && state.active.mode === "hook" && state.active.ready) {
          const top = state.placed[state.placed.length - 1];
          const moved = plan != null && Math.abs(top.x - (state.active.planTop || 0)) > 3;
          if (plan == null || (moved && spec.lead >= 0.5)) {
            plan = state.t + Sim.botDelay(state, spec, rng);
            state.active.planTop = top.x;
          }
          if (plan != null && state.t >= plan) {
            Sim.drop(state);
            plan = null;
          }
        } else plan = null;
        Sim.step(state, Sim.DT);
        consume();
      }
      cam = state.placed[state.placed.length - 1].y - 10;
      syncHud();
      if (state.over) finish();
      return this.info();
    },
  };
})();
