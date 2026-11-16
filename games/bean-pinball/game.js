/* 콩핀볼 — table, input, audio. Physics lives in sim.js. */
(() => {
  const Sim = window.BeanPinballSim;
  const BEST_KEY = "beanpinball-best";
  const MUTE_KEY = "beanpinball-mute";
  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const ui = {
    title: document.getElementById("title"),
    hud: document.getElementById("hud"),
    pause: document.getElementById("pause"),
    result: document.getElementById("result"),
    pips: document.getElementById("pips"),
    mult: document.getElementById("mult"),
    tilt: document.getElementById("tilt"),
    mute: document.getElementById("mute"),
    pauseBtn: document.getElementById("pause-btn"),
    titleBest: document.getElementById("title-best"),
    resScore: document.getElementById("res-score"),
    resBest: document.getElementById("res-best"),
    resStats: document.getElementById("res-stats"),
  };

  const GLYPH = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["01110", "10000", "11110", "10001", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    "x": ["00000", "10001", "01010", "00100", "01010", "10001", "00000"],
    B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  };

  const params = new URLSearchParams(location.search);
  const buttons = { left: false, right: false, plunge: false, nudge: false };
  const keys = { left: false, right: false, plunge: false, nudge: false };
  const touch = { left: 0, right: 0 };
  let mode = "title";
  let state = Sim.create(1);
  let attract = Sim.create(3);
  let attractBot = Sim.botCreate("random", 3);
  let demoBot = params.get("bot") ? Sim.botCreate(params.get("bot"), 11) : null;
  let muted = false;
  let audio = null;
  let W = 360;
  let H = 640;
  let dpr = 1;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let hudH = 80;
  let staticCv = null;
  let staticStamp = 0;
  let shake = 0;
  let shownScore = 0;
  let particles = [];
  let callouts = [];
  let flashes = {};
  let chase = 0;
  let last = 0;
  let acc = 0;
  let fpsAvg = 60;
  let fpsN = 0;
  let fpsT = 0;
  let best = loadBest();
  let nudgeEdge = false;
  let pausedByHide = false;
  let ballFlash = 0;

  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (err) { muted = false; }
  ui.titleBest.textContent = fmt(best);
  ui.mute.textContent = muted ? "🔇" : "🔊";

  function fmt(n) { return Math.round(n || 0).toLocaleString("ko-KR"); }
  function loadBest() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (err) { return 0; }
  }
  function saveBest(score) {
    const prev = loadBest();
    const next = Math.max(prev, score);
    if (next > prev) {
      try { localStorage.setItem(BEST_KEY, String(next)); } catch (err) { /* ignore */ }
    }
    best = next;
    return { best: next, isBest: score > prev && score > 0 };
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(280, r.width);
    H = Math.max(420, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    hudH = 148;
    const availW = W - 12;
    const availH = H - hudH - 8;
    scale = Math.min(availW / Sim.TABLE_W, availH / Sim.TABLE_H);
    ox = (W - Sim.TABLE_W * scale) / 2;
    oy = hudH + Math.max(0, (availH - Sim.TABLE_H * scale) / 2);
    staticStamp = 0;
  }

  function ensureStatic(which) {
    const key = Math.round(scale * dpr * 100);
    if (staticCv && staticStamp === key) return;
    staticStamp = key;
    staticCv = document.createElement("canvas");
    staticCv.width = Math.max(2, Math.round(Sim.TABLE_W * scale * dpr));
    staticCv.height = Math.max(2, Math.round(Sim.TABLE_H * scale * dpr));
    const g = staticCv.getContext("2d");
    g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    drawTableArt(g, which);
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

  function drawTableArt(g, which) {
    const bg = g.createLinearGradient(0, 0, 0, 720);
    bg.addColorStop(0, "#4b1d78");
    bg.addColorStop(0.28, "#b4236e");
    bg.addColorStop(0.55, "#ff6b9a");
    bg.addColorStop(0.78, "#3a2d8a");
    bg.addColorStop(1, "#161433");
    roundRect(g, 8, 8, 384, 704, 36);
    g.fillStyle = bg;
    g.fill();
    const gloss = g.createRadialGradient(200, 90, 10, 200, 180, 280);
    gloss.addColorStop(0, "rgba(255,255,255,0.28)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gloss;
    g.fill();
    g.save();
    g.globalAlpha = 0.14;
    g.fillStyle = "#fff";
    g.beginPath();
    g.ellipse(200, 250, 70, 90, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(90, 420, 36, 48, -0.3, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.save();
    g.globalAlpha = 0.18;
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.moveTo(40 + i * 18, 150);
      g.quadraticCurveTo(70 + i * 18, 80, 110 + i * 22, 150);
      g.stroke();
    }
    g.restore();
    for (const path of [Sim.LEFT_ORBIT, Sim.RIGHT_RAMP, Sim.SKILL_RAIL]) drawRail(g, path, "rgba(255,255,255,0.16)", 10);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "rgba(20,8,30,0.55)";
    g.lineWidth = 10;
    traceWalls(g, which);
    g.stroke();
    g.strokeStyle = "rgba(255, 230, 150, 0.85)";
    g.lineWidth = 2.4;
    traceWalls(g, which);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(g, 352, 250, 40, 450, 12);
    g.fill();
    g.fillStyle = "rgba(255,229,106,0.18)";
    g.font = "700 22px Jua, sans-serif";
    g.textAlign = "center";
    const labels = which.targets.map((t) => t.letter);
    labels.forEach((ch, i) => {
      g.fillText(ch, which.targets[i].x, which.targets[i].y1 - 8);
    });
    g.font = "700 28px Jua, sans-serif";
    g.fillStyle = "rgba(255,255,255,0.16)";
    g.fillText("콩핀볼", 200, 690);
  }

  function traceWalls(g, which) {
    g.beginPath();
    for (const w of which.walls) {
      if (w.tag === "oneway") continue;
      g.moveTo(w.x1, w.y1);
      g.lineTo(w.x2, w.y2);
    }
  }

  function drawRail(g, path, color, width) {
    g.beginPath();
    path.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.stroke();
  }

  function drawFlipper(g, flip) {
    const tip = Sim.flipTip(flip);
    const grd = g.createLinearGradient(flip.pivotX, flip.pivotY, tip.x, tip.y);
    grd.addColorStop(0, "#fff");
    grd.addColorStop(0.25, "#ff8ec4");
    grd.addColorStop(1, "#ff2f7a");
    g.strokeStyle = grd;
    g.lineWidth = flip.radius * 2;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(flip.pivotX, flip.pivotY);
    g.lineTo(tip.x, tip.y);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.75)";
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(flip.pivotX + (tip.x - flip.pivotX) * 0.18, flip.pivotY + (tip.y - flip.pivotY) * 0.18);
    g.lineTo(flip.pivotX + (tip.x - flip.pivotX) * 0.72, flip.pivotY + (tip.y - flip.pivotY) * 0.72);
    g.stroke();
    g.fillStyle = "#ffe56a";
    g.beginPath();
    g.arc(flip.pivotX, flip.pivotY, 6.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#2a1840";
    g.lineWidth = 1.5;
    g.stroke();
  }

  function drawBumper(g, b, now) {
    const flash = flashes[b.id] || 0;
    const pulse = 1 + Math.sin(now / 220 + b.x) * 0.035 + flash * 0.22;
    const hue = b.id === "b1" ? "#7cf7d4" : b.id === "b2" ? "#ffe56a" : "#ff5fa8";
    g.save();
    g.translate(b.x, b.y);
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.beginPath();
    g.arc(0, 2, b.r * 1.15 * pulse, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#f3d2a4";
    roundRect(g, -3.5, b.r * 0.15, 7, 12, 3);
    g.fill();
    const cap = g.createRadialGradient(-b.r * 0.25, -b.r * 0.35, 2, 0, -2, b.r * pulse);
    cap.addColorStop(0, "#fff");
    cap.addColorStop(0.42, hue);
    cap.addColorStop(1, "#2a1038");
    g.fillStyle = cap;
    g.beginPath();
    g.ellipse(0, -2, b.r * pulse, b.r * 0.78 * pulse, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath(); g.arc(-b.r * 0.28, -b.r * 0.32, b.r * 0.16, 0, 7); g.fill();
    g.beginPath(); g.arc(b.r * 0.22, -b.r * 0.05, b.r * 0.1, 0, 7); g.fill();
    if (flash > 0.05) {
      g.strokeStyle = hue;
      g.globalAlpha = flash;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, -2, b.r * (1.15 + (1 - flash) * 0.45), 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  function drawBean(g, b) {
    const sp = Math.hypot(b.vx, b.vy);
    const ang = Math.atan2(b.vy || 0.001, b.vx || 0.001);
    const stretch = 1 + Math.min(0.26, sp / 3000);
    const impact = b.squash || 0;
    g.save();
    g.translate(b.x, b.y);
    g.scale(1.28, 1.28);
    g.rotate(ang);
    g.scale(stretch * (1 + impact * 0.12), (1 / Math.sqrt(stretch)) * (1 - impact * 0.22));
    g.rotate(-ang);
    const body = g.createRadialGradient(-3, -4, 1, 0, 1, b.r * 1.2);
    body.addColorStop(0, "#fff7fb");
    body.addColorStop(0.42, "#ff8ec4");
    body.addColorStop(1, "#d63b78");
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 0, b.r * 0.96, b.r * 1.08, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.8)";
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.beginPath();
    g.ellipse(-2.4, -3.4, 2.3, 3.1, -0.4, 0, Math.PI * 2);
    g.fill();
    const squint = Math.min(0.72, sp / 1100);
    const eyeH = 2.15 * (1 - squint);
    g.fillStyle = "#2a1840";
    g.beginPath(); g.ellipse(-2.5, -0.2, 1.15, Math.max(0.45, eyeH), 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(2.5, -0.2, 1.15, Math.max(0.45, eyeH), 0, 0, 7); g.fill();
    g.fillStyle = "#fff";
    g.beginPath(); g.arc(-2.1, -0.7, 0.4, 0, 7); g.arc(2.9, -0.7, 0.4, 0, 7); g.fill();
    g.strokeStyle = "#2a1840";
    g.lineWidth = 1.15;
    g.beginPath();
    if ((b.hitT || 0) > 0.02) g.arc(0, 2.4, 1.7, 0, Math.PI * 2);
    else g.arc(0, 1.1, 2.3, 0.18 * Math.PI, 0.82 * Math.PI);
    g.stroke();
    g.restore();
  }

  function drawDmd(g, which) {
    const panelW = Math.min(W - 24, 520);
    const panelH = 52;
    const x = (W - panelW) / 2;
    const y = 56;
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    roundRect(g, x, y, panelW, panelH, 16);
    const glass = g.createLinearGradient(x, y, x, y + panelH);
    glass.addColorStop(0, "rgba(28,10,40,0.92)");
    glass.addColorStop(1, "rgba(10,6,20,0.92)");
    g.fillStyle = glass;
    g.fill();
    g.strokeStyle = "rgba(255,229,106,0.7)";
    g.lineWidth = 1.5;
    g.stroke();
    const text = String(Math.round(shownScore)).padStart(7, " ");
    const dot = Math.max(2.1, Math.min(3.4, panelH / 18));
    const gw = dot * 6.2;
    const startX = x + panelW - 16 - text.length * gw;
    const startY = y + (panelH - dot * 9) / 2;
    for (let i = 0; i < text.length; i++) drawGlyph(g, text[i], startX + i * gw, startY, dot);
    const status = statusText(which);
    g.font = "12px Jua, sans-serif";
    g.fillStyle = "#7cf7d4";
    g.textAlign = "left";
    g.fillText(status, x + 14, y + panelH * 0.62);
    g.restore();
  }

  function drawGlyph(g, ch, x, y, dot) {
    const rows = GLYPH[ch] || GLYPH[" "];
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (rows[r][c] !== "1") continue;
        const hot = 0.45 + r / 12;
        g.fillStyle = `rgba(255, ${Math.round(210 - r * 12)}, ${Math.round(170 + r * 8)}, ${0.95})`;
        g.beginPath();
        g.arc(x + c * dot * 1.15, y + r * dot * 1.25, dot * 0.42, 0, 7);
        g.fill();
        g.fillStyle = `rgba(255,255,255,${hot * 0.35})`;
        g.beginPath();
        g.arc(x + c * dot * 1.15 - 0.3, y + r * dot * 1.25 - 0.3, dot * 0.16, 0, 7);
        g.fill();
      }
    }
  }

  function statusText(which) {
    if (which.tilted) return "TILT";
    if (which.phase === "plunge") return "HOLD TO LAUNCH";
    if (which.multiball) return which.superJack ? "SUPER JACKPOT" : "SPROUT FRENZY";
    if (which.kongLit) return "RAMP IS LIT";
    if (which.ballSave > 0) return "BALL SAVE";
    if (which.combo > 1) return "COMBO x" + which.combo;
    return "BEAN PINBALL";
  }

  function spawnBurst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random());
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        life: 0.35 + Math.random() * 0.4, age: 0, color, r: 1.4 + Math.random() * 2.2,
      });
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }

  function addCallout(text, x, y, color) {
    callouts.push({ text, x, y, color, life: 1.15, max: 1.15 });
    if (callouts.length > 5) callouts.shift();
  }

  function consume(which) {
    for (const e of which.events) {
      if (e.type === "bumper") {
        flashes[e.x + "," + e.y] = 1;
        const id = which.bumpers.find((b) => Math.abs(b.x - e.x) < 2);
        if (id) flashes[id.id] = 1;
        spawnBurst(e.x, e.y, "#fff", 14, 180);
        shake = Math.max(shake, 7);
        tone(520, 0.08, "square", 0.07, 180);
      } else if (e.type === "sling") {
        spawnBurst(e.x, e.y, "#7cf7d4", 8, 140);
        shake = Math.max(shake, 4);
        tone(320, 0.05, "triangle", 0.05, 180);
      } else if (e.type === "target") {
        spawnBurst(e.x, e.y, "#ffe56a", 10, 160);
        addCallout(e.letter, e.x, e.y, "#ffe56a");
        tone(680, 0.07, "square", 0.06, 880);
      } else if (e.type === "kong") {
        addCallout("K-O-N-G!", 200, 170, "#ffe56a");
        shake = Math.max(shake, 8);
        chord([523, 659, 784], 0.22);
      } else if (e.type === "skill") {
        addCallout("스킬샷!", 200, 120, "#7cf7d4");
        chord([880, 1174, 1568], 0.28);
      } else if (e.type === "ramp") {
        addCallout("램프!", e.x, e.y, "#fff");
        tone(640, 0.1, "sawtooth", 0.05, 980);
      } else if (e.type === "orbit") {
        addCallout("오빗!", e.x, e.y, "#7cf7d4");
        tone(520, 0.09, "triangle", 0.05, 760);
      } else if (e.type === "jackpot") {
        addCallout(e.super ? "SUPER JACKPOT!" : "JACKPOT!", 200, 240, "#ffe56a");
        spawnBurst(200, 250, "#ffe56a", 46, 280);
        shake = Math.max(shake, 16);
        chord([523, 659, 784, 1046], 0.4);
      } else if (e.type === "multiball") {
        addCallout("콩나물 프렌지!", 200, 300, "#ff8ec4");
        shake = Math.max(shake, 12);
        chord([392, 523, 659], 0.35);
      } else if (e.type === "combo" && e.n >= 2) {
        addCallout("COMBO x" + e.n, e.x || 200, (e.y || 260) - 20, "#fff");
      } else if (e.type === "live") addCallout("라이브 캐치", e.x, e.y, "#7cf7d4");
      else if (e.type === "post") addCallout("포스트 패스", e.x, e.y, "#fff");
      else if (e.type === "save") addCallout("볼 세이브", 200, 560, "#7cf7d4");
      else if (e.type === "kickback") addCallout("킥백", e.x, e.y, "#ffe56a");
      else if (e.type === "tilt") {
        addCallout("TILT", 200, 360, "#ff4d6a");
        buzz();
      } else if (e.type === "extraball") {
        addCallout("엑스트라 볼!", 200, 280, "#ffe56a");
        chord([659, 880, 1318], 0.3);
      } else if (e.type === "laneset") addCallout("레인 x" + e.mult, 200, 110, "#7cf7d4");
      else if (e.type === "launch") noise(0.12, 0.08, 180);
      else if (e.type === "drain") tone(220, 0.2, "sawtooth", 0.05, 70);
      else if (e.type === "flip") { /* handled on press */ }
    }
    which.events.length = 0;
  }

  function renderWorld(which, alpha) {
    ensureStatic(which);
    ctx.save();
    ctx.globalAlpha = alpha;
    const jx = (Math.random() - 0.5) * shake;
    const jy = (Math.random() - 0.5) * shake;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(staticCv, ox + jx, oy + jy, Sim.TABLE_W * scale, Sim.TABLE_H * scale);
    ctx.translate(ox + jx, oy + jy);
    ctx.scale(scale, scale);
    drawInserts(which);
    drawRailsLive(which);
    for (const b of which.bumpers) drawBumper(ctx, b, performance.now());
    for (const t of which.targets) drawTarget(t);
    for (const p of which.posts) {
      ctx.fillStyle = "#d7d3e6";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.fill();
    }
    drawFlipper(ctx, which.flipL);
    drawFlipper(ctx, which.flipR);
    drawPlunger(which);
    for (const b of which.balls) if (!b.dead && b.mode !== "hidden") drawBean(ctx, b);
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life) * alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = alpha;
    for (const c of callouts) drawCallout(c);
    if (which.phase === "bonus") drawBonus(which);
    if (which.tilted) {
      ctx.fillStyle = "rgba(255,40,70,0.16)";
      ctx.fillRect(0, 0, 400, 720);
    }
    ctx.restore();
  }

  function drawInserts(which) {
    which.lanes.forEach((lane, i) => {
      const lit = which.lanesLit[i];
      ctx.fillStyle = lit ? "rgba(255,229,106,0.9)" : "rgba(255,255,255,0.12)";
      roundRect(ctx, lane.x - lane.w / 2, lane.y - 8, lane.w, 16, 8);
      ctx.fill();
      if (lit) {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
    const bulbs = 18;
    for (let i = 0; i < bulbs; i++) {
      const a = (i / bulbs) * Math.PI * 2;
      const x = 200 + Math.cos(a) * 168;
      const y = 360 + Math.sin(a) * 250;
      const on = which.combo > 1 && ((i + Math.floor(chase)) % 4 === 0);
      ctx.fillStyle = on ? "#7cf7d4" : "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.arc(x, y, on ? 4.2 : 2.4, 0, 7);
      ctx.fill();
    }
    if (which.kongLit || which.multiball) {
      ctx.fillStyle = which.multiball ? "#ffe56a" : "#7cf7d4";
      roundRect(ctx, 250, 250, 78, 18, 9);
      ctx.fill();
      ctx.fillStyle = "#2a1840";
      ctx.font = "12px Jua, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(which.multiball ? "JACKPOT" : "RAMP LIT", 289, 263);
    }
  }

  function drawRailsLive(which) {
    const hot = which.combo > 1 ? "rgba(124,247,212,0.85)" : "rgba(255,255,255,0.28)";
    drawRail(ctx, Sim.LEFT_ORBIT, hot, 3);
    drawRail(ctx, Sim.RIGHT_RAMP, which.kongLit || which.multiball ? "rgba(255,229,106,0.9)" : "rgba(255,255,255,0.28)", 3);
    drawRail(ctx, Sim.SKILL_RAIL, "rgba(255,143,196,0.45)", 3);
  }

  function drawTarget(t) {
    const y = t.up ? t.y1 : t.y2 + 18;
    const h = t.up ? t.y2 - t.y1 : 10;
    const grd = ctx.createLinearGradient(t.x - 8, y, t.x + 8, y);
    grd.addColorStop(0, t.up ? "#fff" : "#665");
    grd.addColorStop(0.5, t.up ? "#ffe56a" : "#443");
    grd.addColorStop(1, t.up ? "#c9862a" : "#221");
    ctx.fillStyle = grd;
    roundRect(ctx, t.x - 8, y, 16, Math.max(8, h), 6);
    ctx.fill();
    if (t.up) {
      ctx.fillStyle = "#2a1840";
      ctx.font = "700 14px Jua, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t.letter, t.x, y + h * 0.72);
    }
  }

  function drawPlunger(which) {
    const charge = which.plunger || 0;
    const y = 640 + charge * 28;
    ctx.fillStyle = "#c5c8d6";
    roundRect(ctx, 366, y, 16, 58, 6);
    ctx.fill();
    ctx.fillStyle = "#ffe56a";
    roundRect(ctx, 362, y - 8, 24, 14, 6);
    ctx.fill();
    if (charge > 0.05) {
      ctx.globalAlpha = charge;
      ctx.fillStyle = "#ff5fa2";
      ctx.beginPath();
      ctx.arc(374, y - 16, 8 + charge * 10, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawCallout(c) {
    const k = 1 - c.life / c.max;
    const pop = k < 0.2 ? k / 0.2 : 1;
    ctx.save();
    ctx.translate(c.x, c.y - k * 28);
    ctx.scale(pop, pop);
    ctx.globalAlpha = Math.min(1, c.life * 2);
    ctx.font = "700 22px Jua, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(20,8,30,0.75)";
    ctx.strokeText(c.text, 0, 0);
    ctx.fillStyle = c.color;
    ctx.fillText(c.text, 0, 0);
    ctx.restore();
  }

  function drawBonus(which) {
    const shown = Math.round((which.bonusAward || 0) * Math.min(1, which.bonusT / 1.1));
    ctx.fillStyle = "rgba(12,6,24,0.45)";
    roundRect(ctx, 90, 300, 220, 90, 18);
    ctx.fill();
    ctx.fillStyle = "#ffe56a";
    ctx.font = "16px Jua, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BONUS", 200, 334);
    ctx.font = "32px Jua, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(fmt(shown), 200, 372);
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cab = ctx.createLinearGradient(0, 0, 0, H);
    cab.addColorStop(0, "#2a0d46");
    cab.addColorStop(0.5, "#120818");
    cab.addColorStop(1, "#07040e");
    ctx.fillStyle = cab;
    ctx.fillRect(0, 0, W, H);
    const which = mode === "title" ? attract : state;
    renderWorld(which, mode === "title" ? 0.92 : 1);
    drawDmd(ctx, which);
  }

  function stepAttract(dt) {
    const b = Sim.botButtons(attract, attractBot, Sim.DT);
    Sim.step(attract, dt, b);
    attract.events.length = 0;
    if (attract.phase === "gameover") {
      attract = Sim.create((Math.random() * 1e9) | 0);
      attractBot = Sim.botCreate("random", (Math.random() * 1e9) | 0);
    }
  }

  function currentInput() {
    if (demoBot && mode === "play") return Sim.botButtons(state, demoBot, Sim.DT);
    return {
      left: keys.left || touch.left > 0 || buttons.left,
      right: keys.right || touch.right > 0 || buttons.right,
      plunge: keys.plunge || buttons.plunge,
      nudge: nudgeEdge || keys.nudge || buttons.nudge,
    };
  }

  function tick(dt) {
    if (mode === "title") {
      stepAttract(Math.min(dt, Sim.DT));
      return;
    }
    if (mode !== "play") return;
    const input = currentInput();
    nudgeEdge = false;
    Sim.step(state, dt, input);
    consume(state);
    chase += dt * (4 + state.combo * 3);
    for (const k of Object.keys(flashes)) flashes[k] = Math.max(0, flashes[k] - dt * 3.2);
    for (const p of particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
    }
    particles = particles.filter((p) => p.age < p.life);
    for (const c of callouts) c.life -= dt;
    callouts = callouts.filter((c) => c.life > 0);
    shake *= Math.pow(0.04, dt);
    shownScore += (state.score - shownScore) * Math.min(1, dt * 8);
    if (state.phase === "gameover") showOver();
    syncHud();
  }

  function syncHud() {
    const n = state.ballsLeft || 0;
    ui.pips.innerHTML = [0, 1, 2].map((i) => `<i class="${i < n ? "on" : ""}"></i>`).join("");
    ui.mult.textContent = "x" + (state.bonusMult || 1);
    ui.tilt.className = "tilt" + (state.tiltMeter > 0.7 ? " danger" : state.tiltMeter > 0.4 ? " hot" : state.tiltMeter > 0.15 ? " warn" : "");
  }

  function frame(now) {
    if (!last) last = now;
    let raw = (now - last) / 1000;
    last = now;
    if (raw > 0.05) raw = 0.05;
    if (raw < 0) raw = 0;
    fpsT += raw;
    fpsN += 1;
    if (fpsT >= 0.5) {
      fpsAvg = fpsN / fpsT;
      fpsN = 0;
      fpsT = 0;
    }
    if (mode === "play" && !document.hidden) {
      acc += raw;
      let steps = 0;
      while (acc >= Sim.DT && steps < 8) {
        tick(Sim.DT);
        acc -= Sim.DT;
        steps += 1;
      }
    } else if (mode === "title") {
      acc += raw;
      let steps = 0;
      while (acc >= Sim.DT && steps < 3) {
        stepAttract(Sim.DT);
        acc -= Sim.DT;
        steps += 1;
      }
    } else acc = 0;
    render();
    requestAnimationFrame(frame);
  }

  function show(el, on) { el.classList.toggle("hidden", !on); }

  function setMode(next) {
    mode = next;
    document.body.classList.toggle("playing", next === "play" || next === "pause");
    show(ui.title, next === "title");
    show(ui.hud, next === "play");
    show(ui.pause, next === "pause");
    show(ui.result, next === "over");
    show(ui.pauseBtn, next === "play" || next === "pause");
    if (next !== "play") acc = 0;
  }

  function startGame(seed) {
    armAudio();
    state = Sim.create(seed || ((Math.random() * 1e9) | 0));
    if (demoBot) demoBot = Sim.botCreate(params.get("bot"), seed || 11);
    shownScore = 0;
    particles = [];
    callouts = [];
    flashes = {};
    shake = 0;
    setMode("play");
    syncHud();
    blip();
  }

  function showOver() {
    if (mode === "over") return;
    const saved = saveBest(state.score);
    ui.resScore.textContent = fmt(state.score);
    ui.resBest.textContent = saved.isBest ? "최고 기록!" : "최고 " + fmt(saved.best);
    const lives = state.stats.lifetimes;
    const avg = lives.length ? lives.reduce((a, b) => a + b, 0) / lives.length : 0;
    const rows = [
      ["평균 볼", avg.toFixed(1) + "초"],
      ["멀티볼", String(state.stats.multiballs)],
      ["잭팟", String(state.stats.jackpots)],
      ["스킬샷", String(state.stats.skills)],
    ];
    ui.resStats.innerHTML = rows.map(([k, v]) => `<li>${k}<b>${v}</b></li>`).join("");
    setMode("over");
    ui.titleBest.textContent = fmt(best);
  }

  function pauseGame(fromHide) {
    if (mode !== "play") return;
    pausedByHide = !!fromHide;
    setMode("pause");
    acc = 0;
  }
  function resumeGame() {
    if (mode !== "pause") return;
    pausedByHide = false;
    last = performance.now();
    acc = 0;
    setMode("play");
  }

  function ensureAudio() {
    if (audio) return audio;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const actx = new Ctx();
    const master = actx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(actx.destination);
    audio = { ctx: actx, master };
    return audio;
  }
  function armAudio() {
    const eng = ensureAudio();
    if (eng && eng.ctx.state === "suspended") eng.ctx.resume();
    return eng;
  }
  function tone(freq, dur, type, peak, slide) {
    const eng = audio;
    if (!eng || muted) return;
    const t = eng.ctx.currentTime;
    const o = eng.ctx.createOscillator();
    const g = eng.ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(eng.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function chord(freqs, dur) { freqs.forEach((f, i) => tone(f, dur, i % 2 ? "triangle" : "sine", 0.05)); }
  function noise(dur, peak, freq) {
    const eng = audio;
    if (!eng || muted) return;
    const n = 1 + ((dur * eng.ctx.sampleRate) | 0);
    const buf = eng.ctx.createBuffer(1, n, eng.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = eng.ctx.createBufferSource();
    src.buffer = buf;
    const filter = eng.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq || 240;
    const g = eng.ctx.createGain();
    g.gain.setValueAtTime(peak, eng.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, eng.ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(eng.master);
    src.start();
  }
  function buzz() { tone(90, 0.28, "square", 0.08, 50); }
  function blip() { tone(660, 0.06, "triangle", 0.05, 880); }
  function flipSound(up) { noise(0.03, 0.05, up ? 240 : 140); tone(up ? 180 : 120, 0.04, "sine", 0.04); }

  function setMute(next) {
    muted = next;
    ui.mute.textContent = muted ? "🔇" : "🔊";
    ui.mute.setAttribute("aria-label", muted ? "소리 켜기" : "소리 끄기");
    if (audio) audio.master.gain.value = muted ? 0 : 0.8;
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (err) { /* ignore */ }
  }

  const LEFT_KEYS = new Set(["KeyZ", "ArrowLeft", "ShiftLeft"]);
  const RIGHT_KEYS = new Set(["Slash", "ArrowRight", "ShiftRight"]);

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (LEFT_KEYS.has(e.code) || RIGHT_KEYS.has(e.code) || e.code === "Space" || e.code === "ArrowDown" || e.code === "ArrowUp" || e.code === "KeyN") e.preventDefault();
    armAudio();
    if (e.code === "Enter" && mode === "title") startGame();
    if ((e.code === "Escape" || e.code === "KeyP") && (mode === "play" || mode === "pause")) {
      if (mode === "play") pauseGame(false);
      else resumeGame();
    }
    if (mode !== "play") return;
    if (LEFT_KEYS.has(e.code)) { if (!keys.left) flipSound(true); keys.left = true; }
    if (RIGHT_KEYS.has(e.code)) { if (!keys.right) flipSound(true); keys.right = true; }
    if (e.code === "Space" || e.code === "ArrowDown") keys.plunge = true;
    if (e.code === "ArrowUp" || e.code === "KeyN") { keys.nudge = true; nudgeEdge = true; }
  });
  window.addEventListener("keyup", (e) => {
    if (LEFT_KEYS.has(e.code)) { keys.left = false; flipSound(false); }
    if (RIGHT_KEYS.has(e.code)) { keys.right = false; flipSound(false); }
    if (e.code === "Space" || e.code === "ArrowDown") keys.plunge = false;
    if (e.code === "ArrowUp" || e.code === "KeyN") keys.nudge = false;
  });

  function inButton(target) {
    return target.closest && target.closest("#touch, .back, .icon-btn, .sheet, #hud");
  }
  function sideOf(x) { return x < window.innerWidth * 0.5 ? "left" : "right"; }

  document.addEventListener("touchstart", (e) => {
    armAudio();
    for (const t of e.changedTouches) {
      if (inButton(t.target)) continue;
      touch[sideOf(t.clientX)] += 1;
      flipSound(true);
    }
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    for (const t of e.changedTouches) {
      if (inButton(t.target)) continue;
      const side = sideOf(t.clientX);
      touch[side] = Math.max(0, touch[side] - 1);
    }
  }, { passive: true });
  document.addEventListener("touchcancel", () => { touch.left = 0; touch.right = 0; }, { passive: true });
  document.addEventListener("touchmove", (e) => { if (mode === "play") e.preventDefault(); }, { passive: false });
  document.addEventListener("gesturestart", (e) => e.preventDefault());

  document.getElementById("btn-start").addEventListener("click", () => startGame());
  document.getElementById("btn-retry").addEventListener("click", () => startGame());
  document.getElementById("btn-title").addEventListener("click", () => setMode("title"));
  document.getElementById("btn-resume").addEventListener("click", () => resumeGame());
  document.getElementById("btn-quit").addEventListener("click", () => setMode("title"));
  ui.pauseBtn.addEventListener("click", () => { if (mode === "play") pauseGame(false); else if (mode === "pause") resumeGame(); });
  ui.mute.addEventListener("click", () => { armAudio(); setMute(!muted); });

  const plungeBtn = document.getElementById("btn-plunge");
  const nudgeBtn = document.getElementById("btn-nudge");
  function holdPlunge(on) { buttons.plunge = on; if (on) armAudio(); }
  plungeBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); holdPlunge(true); });
  window.addEventListener("pointerup", () => { buttons.plunge = false; });
  nudgeBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    armAudio();
    nudgeEdge = true;
    buttons.nudge = true;
  });
  nudgeBtn.addEventListener("pointerup", () => { buttons.nudge = false; });
  nudgeBtn.addEventListener("pointerleave", () => { buttons.nudge = false; });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  window.addEventListener("blur", () => { if (mode === "play") pauseGame(true); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && mode === "play") pauseGame(true);
  });

  const coarse = window.matchMedia("(pointer: coarse)");
  function syncCoarse() { document.body.classList.toggle("coarse", coarse.matches); }
  coarse.addEventListener?.("change", syncCoarse);
  syncCoarse();

  window.__pin = {
    get mode() { return mode; },
    get state() { return state; },
    get fps() { return fpsAvg; },
    buttons,
    keys,
    touch,
    start: startGame,
    pause: () => pauseGame(false),
    resume: resumeGame,
    resize,
    reseedBot(seed) {
      demoBot = Sim.botCreate(params.get("bot") || "good", seed);
    },
    turbo(seconds) {
      const n = Math.max(1, Math.round(seconds / Sim.DT));
      for (let i = 0; i < n && state.phase !== "gameover"; i++) {
        const input = demoBot ? Sim.botButtons(state, demoBot, Sim.DT) : currentInput();
        Sim.step(state, Sim.DT, input);
        consume(state);
      }
      shownScore = state.score;
      if (state.phase === "gameover") showOver();
      syncHud();
      render();
    },
  };

  resize();
  setMode("title");
  requestAnimationFrame(frame);
})();
