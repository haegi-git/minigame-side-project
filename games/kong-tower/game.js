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
    next: document.getElementById("next"),
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
  let pops = [];
  let lastCombo = 0;
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
    return [W / 2 + x * s + jx, H * 0.2 + (cam - y) * s + jy];
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
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const sp = 90 + Math.random() * 160;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp + 40,
        life: 0.18 + Math.random() * 0.14,
        age: 0,
        color,
        size: 2 + Math.random() * 2.5,
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
    pops = [];
    cam = 0;
    shake = 0;
    flash = 0;
    autoPlan = null;
    lastCombo = 0;
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
    if (state.combo !== lastCombo && state.combo >= 2) {
      ui.combo.classList.remove("bump");
      void ui.combo.offsetWidth;
      ui.combo.classList.add("bump");
    }
    lastCombo = state.combo;
    paintLives();
    const kind = state.nextKind || "normal";
    ui.nextName.textContent = KIND_NAME[kind] || "콩";
    const beanColor = kind === "iron" ? "#aeb6c6" : kind === "jelly" ? "#9aefff" : kind === "tiny" ? "#ffe066" : "#ff8fb8";
    ui.nextBean.style.setProperty("--bean", beanColor);
    ui.next.classList.toggle("iron", kind === "iron");
    ui.next.classList.toggle("jelly", kind === "jelly");
    ui.next.classList.toggle("tiny", kind === "tiny");
    const warn = state.wind && state.wind.phase === "warn";
    ui.wind.classList.toggle("hidden", !warn);
    ui.wind.textContent = warn ? (state.wind.dir < 0 ? "← 돌풍" : "돌풍 →") : "";
  }

  function consume() {
    for (const ev of state.events) {
      if (ev.type === "perfect") {
        flash = 0.22;
        shake = Math.max(shake, 0.16);
        burst(ev.x, ev.y, "#ffe066", 14);
        pops.push({ text: "PERFECT", x: ev.x, y: ev.y + 28, age: 0, life: 0.62, color: "#fff6c8", ring: ev.y });
        tone(660, 0.08, "sine", 0.08);
        tone(880, 0.12, "triangle", 0.06);
      } else if (ev.type === "land") {
        shake = Math.max(shake, ev.sliced ? 0.9 : 0.22);
        burst(ev.x, ev.y, ev.sliced ? "#ff8fb8" : "#fffdf8", ev.sliced ? 12 : 8);
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

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(t) { return Math.max(0, Math.min(1, t)); }
  function fadeRange(h, a, b) { return clamp01((h - a) / (b - a)); }

  function skyPaint(height) {
    const stops = [
      { h: 0, top: "#8fd4ff", mid: "#d7f3ff", bot: "#fff3c9" },
      { h: 6, top: "#7ec8ff", mid: "#e7f7ff", bot: "#f3fbff" },
      { h: 12, top: "#ff8f6a", mid: "#ffc1a1", bot: "#ffd6ea" },
      { h: 19, top: "#1a2048", mid: "#5a3d78", bot: "#e7a0c4" },
      { h: 30, top: "#070814", mid: "#141a38", bot: "#243056" },
    ];
    let i = 0;
    while (i < stops.length - 1 && height >= stops[i + 1].h) i += 1;
    const a = stops[i];
    const b = stops[Math.min(stops.length - 1, i + 1)];
    const t = i === stops.length - 1 ? 0 : clamp01((height - a.h) / (b.h - a.h));
    return {
      top: mixHex(a.top, b.top, t),
      mid: mixHex(a.mid, b.mid, t),
      bot: mixHex(a.bot, b.bot, t),
    };
  }

  function mixHex(a, b, t) {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    const c = pa.map((v, i) => Math.round(lerp(v, pb[i], t)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
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

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return `rgb(${r},${g},${b})`;
  }

  function drawBean(sx, sy, w, h, color, expr, angle, squash, kind) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle || 0);
    const sq = squash || 0;
    ctx.scale(1 + sq * 0.22, 1 - sq * 0.28);
    ctx.fillStyle = "rgba(43,33,64,0.16)";
    ctx.beginPath();
    ctx.ellipse(0, h * 0.55, w * 0.42, Math.max(4, h * 0.12), 0, 0, Math.PI * 2);
    ctx.fill();
    const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    body.addColorStop(0, shade(color, 28));
    body.addColorStop(0.45, color);
    body.addColorStop(1, shade(color, -28));
    ctx.fillStyle = body;
    ctx.strokeStyle = "#2b2140";
    ctx.lineWidth = Math.max(2, h * 0.08);
    roundRect(-w / 2, -h / 2, w, h, Math.min(h * 0.48, 18));
    ctx.fill();
    ctx.stroke();
    ctx.save();
    roundRect(-w / 2, -h / 2, w, h, Math.min(h * 0.48, 18));
    ctx.clip();
    ctx.fillStyle = "rgba(255,253,248,0.55)";
    ctx.beginPath();
    ctx.ellipse(-w * 0.18, -h * 0.22, w * 0.16, h * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (kind === "iron") {
      ctx.strokeStyle = "#4d5662";
      ctx.lineWidth = 2;
      ctx.strokeRect(-w * 0.32, -h * 0.22, w * 0.64, h * 0.28);
      ctx.fillStyle = "#d5dbe4";
      ctx.beginPath();
      ctx.arc(-w * 0.22, 0, 2.2, 0, Math.PI * 2);
      ctx.arc(w * 0.22, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (kind === "jelly") {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.ellipse(w * 0.18, h * 0.05, w * 0.1, h * 0.18, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffb7cf";
    ctx.beginPath();
    ctx.ellipse(-w * 0.28, h * 0.08, 4, 2.4, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.28, h * 0.08, 4, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2b2140";
    ctx.strokeStyle = "#2b2140";
    ctx.lineWidth = 2;
    if (expr === "happy") {
      ctx.beginPath();
      ctx.arc(-w * 0.16, -h * 0.02, w * 0.07, Math.PI * 0.1, Math.PI * 0.9);
      ctx.arc(w * 0.16, -h * 0.02, w * 0.07, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    } else if (expr === "dizzy") {
      ctx.beginPath();
      ctx.arc(-w * 0.16, -h * 0.04, 3.2, 0, Math.PI * 1.6);
      ctx.moveTo(w * 0.16 - 3, -h * 0.08);
      ctx.lineTo(w * 0.16 + 3, -h * 0.02);
      ctx.moveTo(w * 0.16 + 3, -h * 0.08);
      ctx.lineTo(w * 0.16 - 3, -h * 0.02);
      ctx.stroke();
    } else {
      const eye = expr === "wow" ? 3.4 : 2.5;
      ctx.beginPath();
      ctx.arc(-w * 0.16, -h * 0.06, eye, 0, Math.PI * 2);
      ctx.arc(w * 0.16, -h * 0.06, eye, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    if (expr === "nervous") {
      ctx.moveTo(-w * 0.14, h * 0.22);
      ctx.quadraticCurveTo(0, h * 0.1, w * 0.14, h * 0.24);
    } else if (expr === "wow") {
      ctx.arc(0, h * 0.16, 3.5, 0, Math.PI * 2);
    } else if (expr === "dizzy") {
      ctx.moveTo(-6, h * 0.2);
      ctx.quadraticCurveTo(0, h * 0.08, 6, h * 0.2);
    } else {
      ctx.arc(0, h * 0.04, Math.max(6, w * 0.12), 0.25, Math.PI - 0.25);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawBuilding(x, base, bw, bh, body, roof, night) {
    ctx.fillStyle = body;
    ctx.fillRect(x, base - bh, bw, bh);
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(x - 4, base - bh);
    ctx.lineTo(x + bw / 2, base - bh - 16);
    ctx.lineTo(x + bw + 4, base - bh);
    ctx.fill();
    const cols = Math.max(2, Math.floor(bw / 14));
    const rows = Math.max(2, Math.floor(bh / 18));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const lit = night ? ((c * 3 + r * 5) % 4 !== 0) : ((c + r) % 5 === 0);
        ctx.fillStyle = lit ? (night ? "#ffe7a4" : "#fffdf8") : "rgba(43,33,64,0.18)";
        ctx.fillRect(x + 4 + c * ((bw - 8) / cols), base - bh + 8 + r * ((bh - 14) / rows), Math.max(3, (bw - 10) / cols - 3), 6);
      }
    }
  }

  function drawTree(x, ground, scale) {
    ctx.fillStyle = "#6b4630";
    ctx.fillRect(x - 3 * scale, ground - 28 * scale, 6 * scale, 28 * scale);
    ctx.fillStyle = "#7dca78";
    ctx.beginPath();
    ctx.arc(x, ground - 36 * scale, 16 * scale, 0, Math.PI * 2);
    ctx.arc(x - 12 * scale, ground - 28 * scale, 12 * scale, 0, Math.PI * 2);
    ctx.arc(x + 12 * scale, ground - 28 * scale, 12 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2b2140";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawCrane(hookX, hookTop, vx) {
    const s = scaleOf();
    const mastX = 28;
    const jibY = 18;
    ctx.fillStyle = "#2b2140";
    ctx.fillRect(mastX, jibY, 14, H * 0.42);
    ctx.fillStyle = "#ffe066";
    for (let y = jibY + 8; y < H * 0.42; y += 16) ctx.fillRect(mastX, y, 14, 5);
    ctx.fillStyle = "#3a3058";
    ctx.fillRect(mastX - 10, jibY, W - 20, 12);
    ctx.fillStyle = "#ffe066";
    for (let x = mastX; x < W - 30; x += 22) ctx.fillRect(x, jibY + 2, 10, 8);
    const trolley = hookX;
    ctx.fillStyle = "#fffdf8";
    ctx.strokeStyle = "#2b2140";
    ctx.lineWidth = 3;
    roundRect(trolley - 16, jibY + 10, 32, 14, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2b2140";
    ctx.beginPath();
    ctx.arc(trolley - 8, jibY + 24, 3, 0, Math.PI * 2);
    ctx.arc(trolley + 8, jibY + 24, 3, 0, Math.PI * 2);
    ctx.fill();
    const sag = Math.max(8, Math.min(28, Math.abs(vx) * 0.05));
    ctx.strokeStyle = "#2b2140";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(trolley, jibY + 24);
    ctx.quadraticCurveTo(trolley + Math.sign(vx || 1) * sag, (jibY + hookTop) / 2, hookX, hookTop);
    ctx.stroke();
    ctx.fillStyle = "#ff8fb8";
    ctx.beginPath();
    ctx.moveTo(hookX - 10, hookTop);
    ctx.lineTo(hookX - 16, hookTop + 12);
    ctx.lineTo(hookX - 6, hookTop + 8);
    ctx.lineTo(hookX, hookTop + 14);
    ctx.lineTo(hookX + 6, hookTop + 8);
    ctx.lineTo(hookX + 16, hookTop + 12);
    ctx.lineTo(hookX + 10, hookTop);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    void s;
  }

  function drawWind() {
    if (!state.wind) return;
    const warn = state.wind.phase === "warn";
    const dir = state.wind.dir;
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < 14; i++) {
      const y = 40 + (i * (H - 80)) / 14;
      const span = W + 180;
      const speed = warn ? 180 : 520;
      const shift = ((state.t * speed * dir) + i * 90) % span;
      const x = dir > 0 ? -120 + (shift < 0 ? shift + span : shift) : W + 120 - Math.abs(shift % span);
      ctx.strokeStyle = warn ? "rgba(255,246,200,0.85)" : "rgba(255,255,255,0.95)";
      ctx.lineWidth = warn ? 3 : 7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + dir * 30, y - 8, x + dir * (warn ? 46 : 84), y + Math.sin(state.t * 8 + i) * 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorld() {
    jx = (Math.random() - 0.5) * shake * 16;
    jy = (Math.random() - 0.5) * shake * 12;
    const height = Sim.heightOf(state);
    const sky = skyPaint(height);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.55, sky.mid);
    g.addColorStop(1, sky.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const town = 1 - fadeRange(height, 8, 16);
    const clouds = fadeRange(height, 3, 8) * (1 - fadeRange(height, 20, 28));
    const sunset = fadeRange(height, 9, 14) * (1 - fadeRange(height, 20, 26));
    const night = fadeRange(height, 16, 22);
    const space = fadeRange(height, 28, 36);
    const s = scaleOf();
    const ground = toScreen(0, 0)[1];

    if (night > 0.05 || space > 0.05) {
      ctx.fillStyle = "#fffdf8";
      for (let i = 0; i < 70; i++) {
        const x = (i * 97 + state.t * (i % 5 === 0 ? 6 : 0)) % W;
        const y = (i * 53 + height * 4) % (H * 0.7);
        ctx.globalAlpha = (0.25 + (i % 5) * 0.12) * Math.max(night, space);
        ctx.beginPath();
        ctx.arc(x, y, i % 9 === 0 ? 2.2 : 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (night > 0.2 && space < 0.8) {
      ctx.globalAlpha = night * (1 - space);
      ctx.fillStyle = "#fff6d8";
      ctx.beginPath();
      ctx.arc(W * 0.78, 110, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = sky.top;
      ctx.beginPath();
      ctx.arc(W * 0.78 + 10, 104, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (space > 0.15) {
      ctx.globalAlpha = space;
      ctx.fillStyle = "#d4b3ff";
      ctx.beginPath();
      ctx.arc(W * 0.22, 150, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,253,248,0.7)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(W * 0.22, 150, 58, 14, -0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#7ce7c4";
      ctx.beginPath();
      ctx.arc(W * 0.7, 210, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff8fb8";
      ctx.beginPath();
      ctx.arc(W * 0.62, 80, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (sunset > 0.05) {
      ctx.globalAlpha = sunset;
      const sun = ctx.createRadialGradient(W * 0.7, ground - 180, 10, W * 0.7, ground - 180, 90);
      sun.addColorStop(0, "#fff6c8");
      sun.addColorStop(1, "rgba(255,140,90,0)");
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.arc(W * 0.7, Math.min(H * 0.42, ground - 160), 78, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (town > 0.02) {
      ctx.globalAlpha = town;
      const farBase = ground - height * s * 0.12;
      const hues = ["#f4d7c4", "#d9c2ea", "#f7e7b0", "#c9dff5", "#f3c6d6"];
      const roofs = ["#c47a6a", "#6d5a8a", "#d2a24a", "#6f8eae", "#c46b86"];
      for (let i = 0; i < 9; i++) {
        const bw = 54 + (i % 3) * 18;
        const bh = 90 + (i % 5) * 36;
        const x = ((i * 118 - 40) % (W + 80)) - 20;
        drawBuilding(x, farBase, bw, bh, hues[i % hues.length], roofs[i % roofs.length], night > 0.4);
      }
      ctx.globalAlpha = 1;
    }

    if (clouds > 0.04 || town > 0.2) {
      ctx.globalAlpha = Math.max(clouds, town * 0.85);
      ctx.fillStyle = sunset > 0.4 ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.82)";
      for (let i = 0; i < 6; i++) {
        const x = ((i * 210 + state.t * 18) % (W + 180)) - 70;
        const y = 70 + (i % 3) * 46 + fadeRange(height, 4, 12) * 30;
        ctx.beginPath();
        ctx.ellipse(x, y, 58, 20, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 28, y + 8, 36, 16, 0, 0, Math.PI * 2);
        ctx.ellipse(x - 26, y + 6, 28, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (town > 0.15 && height < 14) {
      const drift = (state.t * 28) % (W + 80);
      ctx.strokeStyle = "#2b2140";
      ctx.fillStyle = "#ff8fb8";
      ctx.globalAlpha = town;
      ctx.beginPath();
      ctx.arc(drift - 40, 150, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(drift - 48, 158);
      ctx.quadraticCurveTo(drift - 70, 150, drift - 36, 142);
      ctx.moveTo(drift - 32, 158);
      ctx.quadraticCurveTo(drift - 10, 150, drift - 44, 142);
      ctx.stroke();
      ctx.fillStyle = "#ffe066";
      ctx.beginPath();
      ctx.ellipse(W * 0.15 + Math.sin(state.t * 0.6) * 20, 190, 14, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(W * 0.15 + Math.sin(state.t * 0.6) * 20, 206);
      ctx.lineTo(W * 0.15 + Math.sin(state.t * 0.6) * 20, 250);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (ground < H + 40) {
      const plazaTop = ground;
      const plaza = ctx.createLinearGradient(0, plazaTop, 0, H);
      plaza.addColorStop(0, "#9ed68a");
      plaza.addColorStop(0.18, "#e7d3b4");
      plaza.addColorStop(1, "#c9b296");
      ctx.fillStyle = plaza;
      ctx.fillRect(0, plazaTop, W, H - plazaTop + 20);
      ctx.strokeStyle = "rgba(43,33,64,0.15)";
      ctx.lineWidth = 2;
      for (let x = 0; x < W; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, plazaTop + 28);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = plazaTop + 28; y < H; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      drawTree(70, plazaTop, 1);
      drawTree(W - 80, plazaTop, 1.1);
      ctx.fillStyle = "#fffdf8";
      ctx.strokeStyle = "#2b2140";
      ctx.lineWidth = 3;
      roundRect(W / 2 - 70, plazaTop - 8, 140, 18, 6);
      ctx.fill();
      ctx.stroke();
    }

    drawWind();

    const target = state.placed[state.placed.length - 1];
    const sway = Math.sin(state.t * 1.2) * 0.012;
    const [px, py] = toScreen(0, 0);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(sway);
    ctx.translate(-px, -py);
    for (const b of state.placed) {
      const [sx, sy] = toScreen(b.x, b.y);
      const bw = b.w * s;
      const bh = b.h * s;
      if (b.foundation) {
        ctx.fillStyle = "#efe2cf";
        ctx.strokeStyle = "#2b2140";
        ctx.lineWidth = 3;
        roundRect(sx - bw / 2 - 8, sy - bh / 2, bw + 16, bh + 8, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#d7c4a8";
        roundRect(sx - bw / 2, sy - bh / 2 - 4, bw, bh, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#8dca7a";
        roundRect(sx - bw / 2 - 6, sy - bh / 2 - 10, bw + 12, 12, 6);
        ctx.fill();
        ctx.stroke();
        continue;
      }
      const expr = flash > 0 && b === state.placed[state.placed.length - 1] ? "happy" : b.wobble > 0.05 ? "dizzy" : "smile";
      drawBean(sx, sy, bw, bh, b.color, expr, b.angle || 0, b.squash || 0, b.kind);
    }
    ctx.restore();
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
      drawBean(sx, sy, b.w * s, b.h * s, b.color, expr, b.angle || 0, b.mode === "fall" ? 0.25 : 0, b.kind);
      if (b.mode === "hook") drawCrane(sx, sy - b.h * s * 0.5 - 4, b.vx || 0);
    }
    for (const p of particles) {
      const [sx, sy] = toScreen(p.x, p.y);
      const k = Math.max(0, 1 - p.age / p.life);
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size * k, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pop of pops) {
      const k = pop.age / pop.life;
      const [sx, sy] = toScreen(pop.x, pop.y + k * 36);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.translate(sx, sy);
      ctx.scale(1 + Math.sin(Math.min(1, k * 3) * Math.PI) * 0.2, 1 + Math.sin(Math.min(1, k * 3) * Math.PI) * 0.2);
      ctx.strokeStyle = "rgba(255,246,200,0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 18, 18 + k * 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = pop.color;
      ctx.strokeStyle = "#2b2140";
      ctx.lineWidth = 4;
      ctx.font = "28px Jua, sans-serif";
      ctx.textAlign = "center";
      ctx.strokeText(pop.text, 0, 0);
      ctx.fillText(pop.text, 0, 0);
      ctx.restore();
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
    for (const pop of pops) pop.age += dt;
    pops = pops.filter((p) => p.age < p.life);
    if (flash > 0) flash = Math.max(0, flash - dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 1.5);
  }

  function followCamera(dt) {
    const top = state.placed[state.placed.length - 1];
    const hookY = state.active && state.active.mode === "hook"
      ? state.active.y
      : top.y + top.h / 2 + Sim.DROP;
    cam += (hookY - cam) * Math.min(1, dt * 3.4);
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
      const top = state.placed[state.placed.length - 1];
      cam = state.active && state.active.mode === "hook" ? state.active.y : top.y + top.h / 2 + Sim.DROP;
      particles = [];
      pops = [];
      syncHud();
      if (state.over) finish();
      return this.info();
    },
  };
})();
