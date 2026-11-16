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
  let backH = 104;
  let topPad = 6;
  let bottomPad = 8;
  let tableCssW = 400;
  let tableCssH = 720;
  let targetVis = {};
  const shotGlow = { orbit: 0, ramp: 0 };
  let wash = 0;
  let trails = new WeakMap();
  let visStamp = 0;
  let snapTargets = false;
  const BEAN_R = 13.6;
  const KONG_COLORS = ["#ff5fa2", "#7cf7d4", "#ffe56a", "#d2b0ff"];
  const ORBIT_ARROWS = [
    { x: 72, y: 518, rot: -0.08 },
    { x: 64, y: 446, rot: -0.04 },
    { x: 70, y: 368, rot: 0.06 },
  ];
  const RAMP_ARROWS = [
    { x: 278, y: 246, rot: 0.42 },
    { x: 292, y: 190, rot: 0.18 },
    { x: 274, y: 140, rot: -0.28 },
  ];
  const HALO = [
    [112, 468], [154, 430], [204, 410], [256, 430], [300, 470],
    [102, 536], [306, 536], [132, 598], [276, 598],
  ];

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

  function applyTableLayout(pad) {
    topPad = pad;
    const availH = Math.max(120, H - topPad - bottomPad - backH);
    const availW = Math.max(120, W - 8);
    scale = Math.min(availW / Sim.TABLE_W, availH / Sim.TABLE_H);
    tableCssW = Sim.TABLE_W * scale;
    tableCssH = Sim.TABLE_H * scale;
    ox = (W - tableCssW) / 2;
    oy = topPad + backH;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(280, r.width);
    H = Math.max(420, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const wantsTouch = W < 900 || window.matchMedia("(pointer: coarse)").matches;
    bottomPad = wantsTouch ? 84 : 8;
    backH = Math.round(Math.min(122, Math.max(100, H * 0.112)));
    applyTableLayout(6);
    const backEl = document.querySelector(".back");
    const backRight = backEl ? backEl.getBoundingClientRect().right : 140;
    const actionsLeft = W - 108;
    const backboxLeft = ox - 14;
    const backboxRight = ox + tableCssW + 14;
    const covered = backboxLeft < backRight + 4 || backboxRight > actionsLeft - 4;
    if (covered) {
      const mute = document.getElementById("mute");
      const row = Math.max(
        backEl ? backEl.getBoundingClientRect().bottom : 0,
        mute ? mute.getBoundingClientRect().bottom : 0,
        52
      );
      applyTableLayout(Math.ceil(row) + 8);
    }
    staticStamp = 0;
  }

  function visualDt() {
    const now = performance.now();
    const dt = visStamp ? Math.min(0.05, (now - visStamp) / 1000) : 0.016;
    visStamp = now;
    return dt;
  }

  function tickVisuals(which, dt) {
    for (const t of which.targets) {
      const goal = t.up ? 1 : 0;
      if (targetVis[t.id] == null || snapTargets) targetVis[t.id] = goal;
      else {
        const next = targetVis[t.id] + (goal - targetVis[t.id]) * Math.min(1, dt * 8);
        targetVis[t.id] = Math.abs(next - goal) < 0.02 ? goal : next;
      }
    }
    snapTargets = false;
    shotGlow.orbit = Math.max(0, shotGlow.orbit - dt * 0.42);
    shotGlow.ramp = Math.max(0, shotGlow.ramp - dt * 0.42);
    wash = Math.max(0, wash - dt * 1.05);
  }

  function ensureStatic() {
    const key = Math.round(scale * dpr * 100);
    if (staticCv && staticStamp === key) return;
    staticStamp = key;
    staticCv = document.createElement("canvas");
    staticCv.width = Math.max(2, Math.round(Sim.TABLE_W * scale * dpr));
    staticCv.height = Math.max(2, Math.round(Sim.TABLE_H * scale * dpr));
    const g = staticCv.getContext("2d");
    g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    drawTableArt(g);
  }

  function roundRect(g, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }

  function outwardNormal(w) {
    let nx = w.y1 - w.y2;
    let ny = w.x2 - w.x1;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const mx = (w.x1 + w.x2) / 2;
    const my = (w.y1 + w.y2) / 2;
    if (nx * (200 - mx) + ny * (400 - my) > 0) { nx = -nx; ny = -ny; }
    return { x: nx, y: ny };
  }

  function quad(g, pts) {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
  }

  function drawLeaf(g, x, y, rx, ry, rot, c0, c1) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    const grd = g.createLinearGradient(-rx, 0, rx, 0);
    grd.addColorStop(0, c0);
    grd.addColorStop(1, c1);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-rx, 0);
    g.quadraticCurveTo(0, -ry, rx, 0);
    g.quadraticCurveTo(0, ry, -rx, 0);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-rx * 0.55, 0);
    g.lineTo(rx * 0.7, 0);
    g.stroke();
    g.restore();
  }

  function drawIconBean(g, x, y, r, tilt) {
    g.save();
    g.translate(x, y);
    if (tilt) g.rotate(tilt);
    g.fillStyle = "rgba(70, 0, 36, 0.28)";
    g.beginPath();
    g.ellipse(r * 0.05, r * 0.18, r * 0.82, r * 0.62, 0, 0, Math.PI * 2);
    g.fill();
    const body = g.createRadialGradient(-r * 0.28, -r * 0.34, r * 0.08, 0, r * 0.04, r * 1.05);
    body.addColorStop(0, "#fff7fb");
    body.addColorStop(0.4, "#ff9ec6");
    body.addColorStop(0.76, "#ff4d88");
    body.addColorStop(1, "#b01458");
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 0, r * 0.88, r, -0.05, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = Math.max(1.4, r * 0.045);
    g.strokeStyle = "rgba(255,255,255,0.72)";
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.82)";
    g.beginPath();
    g.ellipse(-r * 0.28, -r * 0.32, r * 0.2, r * 0.28, -0.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#2c9a46";
    g.lineCap = "round";
    g.lineWidth = Math.max(2, r * 0.07);
    g.beginPath();
    g.moveTo(r * 0.02, -r * 0.9);
    g.quadraticCurveTo(r * 0.16, -r * 1.18, 0, -r * 1.36);
    g.stroke();
    drawLeaf(g, r * 0.24, -r * 1.26, r * 0.32, r * 0.15, 0.7, "#e7ffc4", "#2f9a45");
    drawLeaf(g, -r * 0.18, -r * 1.16, r * 0.26, r * 0.13, -0.85, "#c8ff9a", "#1d8840");
    const ey = -r * 0.04;
    g.fillStyle = "#fff";
    g.beginPath(); g.ellipse(-r * 0.28, ey, r * 0.17, r * 0.21, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(r * 0.28, ey, r * 0.17, r * 0.21, 0, 0, 7); g.fill();
    g.fillStyle = "#2a1244";
    g.beginPath(); g.ellipse(-r * 0.24, ey + r * 0.04, r * 0.075, r * 0.11, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(r * 0.33, ey + r * 0.04, r * 0.075, r * 0.11, 0, 0, 7); g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(-r * 0.28, ey - r * 0.03, Math.max(0.7, r * 0.035), 0, 7);
    g.arc(r * 0.29, ey - r * 0.03, Math.max(0.7, r * 0.035), 0, 7);
    g.fill();
    g.fillStyle = "rgba(255, 90, 130, 0.42)";
    g.beginPath(); g.ellipse(-r * 0.48, r * 0.2, r * 0.12, r * 0.065, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(r * 0.48, r * 0.2, r * 0.12, r * 0.065, 0, 0, 7); g.fill();
    g.strokeStyle = "#7a2048";
    g.lineWidth = Math.max(1.5, r * 0.05);
    g.beginPath();
    g.arc(0, r * 0.18, r * 0.22, 0.16 * Math.PI, 0.84 * Math.PI);
    g.stroke();
    g.restore();
  }

  function drawSolidWalls(g, walls) {
    g.save();
    g.lineJoin = "round";
    g.lineCap = "round";
    for (const w of walls) {
      if (!w || w.tag === "oneway" || w.tag === "sling") continue;
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (len < 2) continue;
      const n = outwardNormal(w);
      const thick = w.tag === "guide" ? 4 : 5;
      const lip = w.tag === "guide" ? 6 : 9;
      const ix1 = w.x1 - n.x * lip;
      const iy1 = w.y1 - n.y * lip;
      const ix2 = w.x2 - n.x * lip;
      const iy2 = w.y2 - n.y * lip;
      const ox1 = w.x1 + n.x * thick;
      const oy1 = w.y1 + n.y * thick;
      const ox2 = w.x2 + n.x * thick;
      const oy2 = w.y2 + n.y * thick;
      quad(g, [
        [ox1 + n.x * 3 + 1, oy1 + n.y * 3 + 2],
        [ox2 + n.x * 3 + 1, oy2 + n.y * 3 + 2],
        [ox2 + 1, oy2 + 2],
        [ox1 + 1, oy1 + 2],
      ]);
      g.fillStyle = "rgba(20, 0, 16, 0.35)";
      g.fill();
      const grd = g.createLinearGradient(ix1, iy1, ox1, oy1);
      if (w.tag === "guide") {
        grd.addColorStop(0, "#ffffff");
        grd.addColorStop(0.28, "#e4e7f2");
        grd.addColorStop(0.62, "#9aa1b8");
        grd.addColorStop(1, "#3c4258");
      } else {
        grd.addColorStop(0, "#fffdfb");
        grd.addColorStop(0.2, "#ffe4f2");
        grd.addColorStop(0.55, "#ff7aaa");
        grd.addColorStop(1, "#7a2458");
      }
      quad(g, [[ix1, iy1], [ix2, iy2], [ox2, oy2], [ox1, oy1]]);
      g.fillStyle = grd;
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.92)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(ix1, iy1);
      g.lineTo(ix2, iy2);
      g.stroke();
      g.strokeStyle = "rgba(40, 8, 24, 0.75)";
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(ox1, oy1);
      g.lineTo(ox2, oy2);
      g.stroke();
    }
    g.restore();
  }

  function drawWireRamp(g, path, opt) {
    const stroke = (color, width) => {
      g.beginPath();
      path.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.stroke();
    };
    stroke("rgba(10, 4, 16, 0.45)", 16);
    stroke(opt.core, 12);
    stroke(opt.edge, 3.2);
    stroke("rgba(255,255,255,0.55)", 1.3);
  }

  function drawTableArt(g) {
    g.clearRect(0, 0, Sim.TABLE_W, Sim.TABLE_H);
    const shell = g.createLinearGradient(0, 0, 40, 720);
    shell.addColorStop(0, "#5a2878");
    shell.addColorStop(1, "#24102e");
    roundRect(g, 2, 2, 396, 716, 32);
    g.fillStyle = shell;
    g.fill();
    const bg = g.createLinearGradient(40, 20, 80, 700);
    bg.addColorStop(0, "#6d1d86");
    bg.addColorStop(0.22, "#e4377c");
    bg.addColorStop(0.46, "#ff6b9c");
    bg.addColorStop(0.68, "#7a2ea8");
    bg.addColorStop(1, "#2a1658");
    roundRect(g, 14, 16, 336, 688, 26);
    g.fillStyle = bg;
    g.fill();
    const pool = g.createRadialGradient(200, 250, 20, 200, 340, 280);
    pool.addColorStop(0, "rgba(255,255,255,0.22)");
    pool.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = pool;
    g.fill();
    roundRect(g, 352, 104, 40, 598, 14);
    g.fillStyle = "#1a1022";
    g.fill();
    const laneShade = g.createLinearGradient(360, 120, 392, 680);
    laneShade.addColorStop(0, "#32243c");
    laneShade.addColorStop(1, "#120a18");
    roundRect(g, 358, 112, 30, 575, 12);
    g.fillStyle = laneShade;
    g.fill();
    g.save();
    roundRect(g, 16, 20, 330, 676, 24);
    g.clip();
    g.save();
    g.globalAlpha = 0.08;
    g.strokeStyle = "#fff";
    g.lineWidth = 1;
    for (let y = 46; y < 660; y += 24) {
      for (let x = 34; x < 340; x += 24) {
        g.beginPath();
        g.moveTo(x, y - 4);
        g.lineTo(x + 4, y);
        g.lineTo(x, y + 4);
        g.lineTo(x - 4, y);
        g.closePath();
        g.stroke();
      }
    }
    g.restore();
    g.fillStyle = "rgba(255, 70, 110, 0.16)";
    roundRect(g, 24, 560, 30, 120, 10);
    g.fill();
    g.fillStyle = "rgba(124, 247, 212, 0.13)";
    roundRect(g, 78, 500, 34, 100, 10);
    g.fill();
    g.fillStyle = "rgba(255, 70, 110, 0.16)";
    roundRect(g, 300, 560, 32, 120, 10);
    g.fill();
    g.fillStyle = "rgba(124, 247, 212, 0.13)";
    roundRect(g, 250, 500, 34, 100, 10);
    g.fill();
    const lower = g.createRadialGradient(202, 530, 16, 202, 530, 150);
    lower.addColorStop(0, "rgba(255,255,255,0.16)");
    lower.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = lower;
    g.beginPath();
    g.ellipse(202, 530, 120, 100, 0, 0, Math.PI * 2);
    g.fill();
    drawLeaf(g, 118, 360, 52, 22, -0.95, "#e9ffc8", "#2f9a48");
    drawLeaf(g, 286, 352, 54, 22, 0.85, "#d4ff9a", "#2a8a38");
    drawLeaf(g, 164, 300, 28, 13, -0.45, "#f2ffd8", "#3aaa50");
    drawLeaf(g, 242, 292, 30, 13, 0.5, "#e4ffb8", "#248838");
    g.strokeStyle = "#1f7a3c";
    g.lineWidth = 7;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(202, 468);
    g.quadraticCurveTo(140, 400, 116, 348);
    g.moveTo(202, 468);
    g.quadraticCurveTo(262, 392, 292, 340);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(200, 246);
    g.quadraticCurveTo(176, 190, 204, 156);
    g.stroke();
    drawLeaf(g, 168, 176, 30, 14, -0.7, "#e7ffc2", "#2f9a45");
    drawLeaf(g, 232, 166, 32, 14, 0.65, "#d2ff98", "#27883c");
    drawIconBean(g, 202, 548, 46);
    g.font = "16px Jua, sans-serif";
    g.textAlign = "left";
    g.fillStyle = "rgba(255,255,255,0.86)";
    g.fillText("오빗", 86, 498);
    g.textAlign = "right";
    g.fillText("램프", 270, 232);
    g.restore();
    drawWireRamp(g, Sim.LEFT_ORBIT, { core: "#14685c", edge: "#9dffea" });
    drawWireRamp(g, Sim.RIGHT_RAMP, { core: "#a86a12", edge: "#ffe28a" });
    drawWireRamp(g, Sim.SKILL_RAIL, { core: "#a02868", edge: "#ffc0dc" });
    drawSolidWalls(g, Sim.create(1).walls);
    g.save();
    g.font = "12px Jua, sans-serif";
    g.textAlign = "center";
    g.fillStyle = "#d8fff4";
    roundRect(g, 360, 132, 26, 42, 8);
    g.fillStyle = "rgba(124, 247, 212, 0.32)";
    g.fill();
    g.strokeStyle = "rgba(210, 255, 240, 0.8)";
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = "#f4fffb";
    g.fillText("스킬", 373, 158);
    g.restore();
    const gloss = g.createLinearGradient(0, 16, 0, 180);
    gloss.addColorStop(0, "rgba(255,255,255,0.2)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gloss;
    roundRect(g, 14, 16, 336, 150, 26);
    g.fill();
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
    const ang = Math.atan2(tip.y - flip.pivotY, tip.x - flip.pivotX);
    const len = flip.len;
    g.save();
    g.translate(flip.pivotX + 1.2, flip.pivotY + 2.4);
    g.rotate(ang);
    g.fillStyle = "rgba(30, 0, 20, 0.28)";
    g.beginPath();
    g.moveTo(6, -7);
    g.lineTo(len - 8, -4);
    g.quadraticCurveTo(len + 2, 0, len - 8, 4);
    g.lineTo(6, 7);
    g.quadraticCurveTo(-6, 0, 6, -7);
    g.fill();
    g.restore();
    g.save();
    g.translate(flip.pivotX, flip.pivotY);
    g.rotate(ang);
    const grd = g.createLinearGradient(0, -9, 0, 9);
    grd.addColorStop(0, "#ffffff");
    grd.addColorStop(0.38, "#ffd4e8");
    grd.addColorStop(0.72, "#ff4d8d");
    grd.addColorStop(1, "#8d1248");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(5, -8);
    g.lineTo(len - 10, -4.6);
    g.quadraticCurveTo(len + 3, 0, len - 10, 4.6);
    g.lineTo(5, 8);
    g.quadraticCurveTo(-7, 0, 5, -8);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.lineWidth = 1.4;
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.lineWidth = 2.3;
    g.beginPath();
    g.moveTo(12, -4.2);
    g.lineTo(len * 0.72, -2.4);
    g.stroke();
    const bolt = g.createRadialGradient(-1.5, -1.5, 1, 0, 0, 8);
    bolt.addColorStop(0, "#fff");
    bolt.addColorStop(0.5, "#ffe56a");
    bolt.addColorStop(1, "#b88620");
    g.fillStyle = bolt;
    g.beginPath();
    g.arc(0, 0, 7.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#6a4010";
    g.lineWidth = 1.3;
    g.stroke();
    g.restore();
  }

  function drawBumper(g, b, now) {
    const flash = flashes[b.id] || 0;
    const pop = 1 + Math.sin(now / 280 + b.x * 0.01) * 0.015 + flash * 0.36;
    const R = b.r * 1.3 * pop;
    const hue = b.id === "b1" ? "#3ef0c0" : b.id === "b2" ? "#ffe14a" : "#ff3355";
    const deep = b.id === "b1" ? "#075445" : b.id === "b2" ? "#8a5208" : "#8e1028";
    g.save();
    g.translate(b.x, b.y);
    g.fillStyle = "rgba(20, 0, 16, 0.4)";
    g.beginPath();
    g.ellipse(0, R * 0.22, R * 0.96, R * 0.36, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1a0c16";
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    const ring = g.createRadialGradient(-R * 0.2, -R * 0.25, R * 0.2, 0, 0, R * 0.96);
    ring.addColorStop(0, "#ffffff");
    ring.addColorStop(0.45, "#f3e4ff");
    ring.addColorStop(1, "#8d7aa0");
    g.fillStyle = ring;
    g.beginPath();
    g.arc(0, 0, R * 0.9, 0, Math.PI * 2);
    g.fill();
    const skirt = g.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.05, 0, 0, R * 0.74);
    skirt.addColorStop(0, "#fff");
    skirt.addColorStop(0.42, hue);
    skirt.addColorStop(1, deep);
    g.fillStyle = skirt;
    g.beginPath();
    g.arc(0, 0, R * 0.68, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.lineWidth = Math.max(2.4, R * 0.09);
    g.beginPath();
    g.arc(0, 0, R * 0.68, 0, Math.PI * 2);
    g.stroke();
    const cap = g.createRadialGradient(-R * 0.18, -R * 0.22, R * 0.02, 0, 0, R * 0.48);
    cap.addColorStop(0, "#ffffff");
    cap.addColorStop(0.55, hue);
    cap.addColorStop(1, deep);
    g.fillStyle = cap;
    g.beginPath();
    g.arc(-R * 0.02, -R * 0.04, R * 0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(-R * 0.16, -R * 0.18, R * 0.13, 0, Math.PI * 2);
    g.fill();
    if (flash > 0.04) {
      g.globalAlpha = Math.min(1, flash);
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.beginPath();
      g.arc(0, 0, R * 0.84, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = flash;
      g.strokeStyle = "#fff";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(0, 0, R * (1.02 + (1 - flash) * 0.62), 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  function drawBean(g, b) {
    const sp = Math.hypot(b.vx, b.vy);
    const ang = Math.atan2(b.vy || 0.001, b.vx || 0.001);
    const stretch = 1 + Math.min(0.22, sp / 3400);
    const impact = b.squash || 0;
    const R = BEAN_R;
    g.save();
    g.translate(b.x, b.y);
    g.rotate(ang);
    g.scale(stretch * (1 + impact * 0.16), (1 / Math.sqrt(stretch)) * (1 - impact * 0.14));
    g.rotate(-ang);
    g.fillStyle = "rgba(40, 0, 24, 0.28)";
    g.beginPath();
    g.ellipse(1.4, 3, R * 0.78, R * 0.55, 0, 0, Math.PI * 2);
    g.fill();
    const body = g.createRadialGradient(-R * 0.28, -R * 0.36, 1, R * 0.05, R * 0.08, R * 1.15);
    body.addColorStop(0, "#fff6fb");
    body.addColorStop(0.38, "#ffb3d0");
    body.addColorStop(0.72, "#ff4d8d");
    body.addColorStop(1, "#c21862");
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 0.4, R * 0.9, R, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#4a1028";
    g.lineWidth = 2.6;
    g.stroke();
    g.strokeStyle = "#fff";
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath();
    g.ellipse(-R * 0.26, -R * 0.34, R * 0.22, R * 0.3, -0.5, 0, Math.PI * 2);
    g.fill();
    const squint = Math.min(0.55, sp / 1600);
    const eyeH = R * 0.3 * (1 - squint * 0.55);
    g.fillStyle = "#fff";
    g.beginPath(); g.ellipse(-R * 0.28, -R * 0.02, R * 0.22, Math.max(R * 0.1, eyeH), 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(R * 0.28, -R * 0.02, R * 0.22, Math.max(R * 0.1, eyeH), 0, 0, 7); g.fill();
    g.fillStyle = "#2a1244";
    g.beginPath(); g.ellipse(-R * 0.22, R * 0.03, R * 0.1, Math.max(R * 0.07, eyeH * 0.62), 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(R * 0.34, R * 0.03, R * 0.1, Math.max(R * 0.07, eyeH * 0.62), 0, 0, 7); g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(-R * 0.28, -R * 0.08, R * 0.07, 0, 7);
    g.arc(R * 0.28, -R * 0.08, R * 0.07, 0, 7);
    g.fill();
    g.fillStyle = "rgba(255, 80, 120, 0.5)";
    g.beginPath(); g.ellipse(-R * 0.46, R * 0.2, R * 0.12, R * 0.07, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(R * 0.46, R * 0.2, R * 0.12, R * 0.07, 0, 0, 7); g.fill();
    g.strokeStyle = "#6a2048";
    g.lineWidth = 1.35;
    g.lineCap = "round";
    g.beginPath();
    if ((b.hitT || 0) > 0.02) g.arc(0, R * 0.28, R * 0.12, 0, Math.PI * 2);
    else g.arc(0, R * 0.12, R * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.strokeStyle = "#2f9a46";
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(0, -R * 0.92);
    g.quadraticCurveTo(R * 0.12, -R * 1.12, 0, -R * 1.22);
    g.stroke();
    g.fillStyle = "#b6f57a";
    g.beginPath();
    g.ellipse(R * 0.16, -R * 1.16, R * 0.16, R * 0.08, 0.7, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function rememberTrail(b) {
    let h = trails.get(b);
    if (!h) { h = []; trails.set(b, h); }
    const sp = Math.hypot(b.vx, b.vy);
    if (b.asleep || b.dead || sp < 150) { h.length = 0; return h; }
    const lastP = h[h.length - 1];
    if (lastP && Math.hypot(b.x - lastP.x, b.y - lastP.y) > 70) h.length = 0;
    else if (!lastP || Math.hypot(b.x - lastP.x, b.y - lastP.y) > 2.4) h.push({ x: b.x, y: b.y });
    if (h.length > 7) h.shift();
    return h;
  }

  function drawTrail(b) {
    const h = rememberTrail(b);
    if (h.length < 2) return;
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 1; i < h.length; i++) {
      const t = i / (h.length - 1);
      ctx.strokeStyle = `rgba(255, 214, 230, ${0.05 + t * 0.45})`;
      ctx.lineWidth = 2 + t * 5.5;
      ctx.beginPath();
      ctx.moveTo(h[i - 1].x, h[i - 1].y);
      ctx.lineTo(h[i].x, h[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGlyph(g, ch, x, y, dot) {
    const rows = GLYPH[ch] || GLYPH[" "];
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (rows[r][c] !== "1") continue;
        g.fillStyle = `rgba(255, ${210 - r * 14}, ${150 + r * 8}, 0.98)`;
        g.beginPath();
        g.arc(x + c * dot * 1.15, y + r * dot * 1.22, dot * 0.42, 0, 7);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.45)";
        g.beginPath();
        g.arc(x + c * dot * 1.15 - 0.3, y + r * dot * 1.22 - 0.3, dot * 0.15, 0, 7);
        g.fill();
      }
    }
  }

  function statusText(which) {
    if (which.phase === "gameover") return "게임 오버";
    if (which.tilted) return "틸트";
    if (which.phase === "plunge") return "길게 눌러 발사";
    if (which.phase === "bonus") return "보너스 정산";
    if (which.multiball) return which.superJack ? "슈퍼 잭팟" : "콩나물 프렌지";
    if (which.kongLit) return "램프 점등";
    if (which.ballSave > 0) return "볼 세이브";
    if (which.combo > 1) return "콤보 x" + which.combo;
    if (which.phase === "gameover") return "게임 오버";
    return "콩핀볼";
  }

  function statusColor(which) {
    if (which.tilted) return "#ff4d6a";
    if (which.multiball) return "#ffe56a";
    if (which.kongLit) return "#ffe08a";
    if (which.ballSave > 0) return "#7cf7d4";
    if (which.phase === "plunge") return "#ffd6ea";
    return "#d8fff6";
  }

  function spawnBurst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random());
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        life: 0.35 + Math.random() * 0.4, age: 0, color, r: 1.8 + Math.random() * 2.6,
      });
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }

  function addCallout(text, x, y, color, banner) {
    const life = banner ? 1.75 : 1.25;
    callouts.push({
      text, x, y: banner ? 455 : y, color, life, max: life, banner: !!banner,
    });
    if (callouts.length > 6) callouts.shift();
  }

  function consume(which) {
    for (const e of which.events) {
      if (e.type === "bumper") {
        flashes[e.x + "," + e.y] = 1;
        const id = which.bumpers.find((b) => Math.abs(b.x - e.x) < 2);
        if (id) flashes[id.id] = 1;
        spawnBurst(e.x, e.y, "#fff", 16, 200);
        shake = Math.max(shake, 8);
        tone(520, 0.08, "square", 0.07, 180);
      } else if (e.type === "sling") {
        flashes[e.x < 200 ? "slingL" : "slingR"] = 1;
        spawnBurst(e.x, e.y, "#7cf7d4", 8, 140);
        shake = Math.max(shake, 4);
        tone(320, 0.05, "triangle", 0.05, 180);
      } else if (e.type === "target") {
        spawnBurst(e.x, e.y, "#ffe56a", 10, 160);
        addCallout(e.letter, e.x, e.y - 18, "#ffe56a");
        tone(680, 0.07, "square", 0.06, 880);
      } else if (e.type === "kong") {
        addCallout("레터 완성!", 200, 318, "#ffe56a", true);
        shake = Math.max(shake, 8);
        chord([523, 659, 784], 0.22);
      } else if (e.type === "skill") {
        addCallout("스킬샷", 200, 318, "#c8fff0", true);
        wash = Math.max(wash, 0.65);
        chord([880, 1174, 1568], 0.28);
      } else if (e.type === "ramp") {
        shotGlow.ramp = 1;
        addCallout("램프!", e.x, e.y - 18, "#fff7d0");
        tone(640, 0.1, "sawtooth", 0.05, 980);
      } else if (e.type === "orbit") {
        shotGlow.orbit = 1;
        addCallout("오빗!", e.x, e.y - 18, "#7cf7d4");
        tone(520, 0.09, "triangle", 0.05, 760);
      } else if (e.type === "jackpot") {
        addCallout(e.super ? "슈퍼 잭팟" : "잭팟", 200, 318, "#ffe56a", true);
        wash = 1;
        spawnBurst(200, 250, "#ffe56a", 46, 280);
        shake = Math.max(shake, 16);
        chord([523, 659, 784, 1046], 0.4);
      } else if (e.type === "multiball") {
        addCallout("콩나물 프렌지", 200, 318, "#ffd0e8", true);
        wash = Math.max(wash, 0.85);
        shake = Math.max(shake, 12);
        chord([392, 523, 659], 0.35);
      } else if (e.type === "combo" && e.n >= 2) {
        addCallout("콤보 x" + e.n, e.x || 200, (e.y || 260) - 26, "#fff");
      } else if (e.type === "live") addCallout("라이브 캐치", e.x, e.y - 16, "#7cf7d4");
      else if (e.type === "post") addCallout("포스트 패스", e.x, e.y - 16, "#fff");
      else if (e.type === "save") addCallout("볼 세이브", 200, 560, "#7cf7d4");
      else if (e.type === "kickback") addCallout("킥백", e.x, e.y - 16, "#ffe56a");
      else if (e.type === "tilt") {
        addCallout("틸트", 200, 318, "#ff4d6a", true);
        buzz();
      } else if (e.type === "extraball") {
        addCallout("엑스트라 볼", 200, 318, "#ffe56a", true);
        chord([659, 880, 1318], 0.3);
      } else if (e.type === "laneset") addCallout("레인 x" + e.mult, 200, 126, "#7cf7d4");
      else if (e.type === "launch") noise(0.12, 0.08, 180);
      else if (e.type === "drain") tone(220, 0.2, "sawtooth", 0.05, 70);
      else if (e.type === "flip") { /* press handles the click */ }
    }
    which.events.length = 0;
  }

  function renderWorld(which) {
    ensureStatic();
    ctx.save();
    const jx = (Math.random() - 0.5) * shake;
    const jy = (Math.random() - 0.5) * shake;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(staticCv, ox + jx, oy + jy, Sim.TABLE_W * scale, Sim.TABLE_H * scale);
    ctx.translate(ox + jx, oy + jy);
    ctx.scale(scale, scale);
    drawInserts(which);
    drawSling(ctx, "L");
    drawSling(ctx, "R");
    drawRailsLive(which);
    for (const b of which.bumpers) drawBumper(ctx, b, performance.now());
    for (const t of which.targets) drawTarget(t);
    drawFlipper(ctx, which.flipL);
    drawFlipper(ctx, which.flipR);
    drawPlunger(which);
    for (const b of which.balls) if (!b.dead && b.mode !== "hidden") drawTrail(b);
    for (const b of which.balls) if (!b.dead && b.mode !== "hidden") drawBean(ctx, b);
    drawApron(ctx);
    for (const p of which.posts) drawPost(ctx, p);
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (wash > 0.02) {
      ctx.fillStyle = `rgba(255, 226, 150, ${wash * 0.16})`;
      ctx.fillRect(0, 0, 400, 720);
    }
    if (which.ballSave > 0) {
      const a = 0.28 + Math.sin(performance.now() / 110) * 0.18;
      ctx.strokeStyle = `rgba(124, 247, 212, ${a})`;
      ctx.lineWidth = 7;
      roundRect(ctx, 16, 20, 332, 668, 24);
      ctx.stroke();
    }
    if (which.multiball) {
      const a = 0.35 + Math.sin(performance.now() / 90) * 0.22;
      ctx.strokeStyle = `rgba(255, 229, 106, ${a})`;
      ctx.lineWidth = 7;
      roundRect(ctx, 16, 20, 332, 668, 24);
      ctx.stroke();
    }
    const floats = callouts.filter((c) => !c.banner);
    const banners = callouts.filter((c) => c.banner);
    for (const c of floats) drawCallout(c);
    if (banners.length) drawCallout(banners[banners.length - 1]);
    if (which.phase === "bonus") drawBonus(which);
    if (which.tilted) {
      ctx.fillStyle = "rgba(255, 40, 70, 0.16)";
      ctx.fillRect(0, 0, 400, 720);
    }
    const sweep = (performance.now() % 3600) / 3600;
    const sx = -80 + sweep * 520;
    const sheen = ctx.createLinearGradient(sx, 0, sx + 80, 180);
    sheen.addColorStop(0, "rgba(255,255,255,0)");
    sheen.addColorStop(0.5, "rgba(255,255,255,0.07)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(14, 16, 340, 680);
    ctx.restore();
  }

  function drawInserts(which) {
    const now = performance.now();
    which.lanes.forEach((lane, i) => {
      const lit = which.lanesLit[i];
      const x = lane.x - 15;
      const y = lane.y - 16;
      roundRect(ctx, x, y, 30, 22, 7);
      if (lit) {
        const grd = ctx.createLinearGradient(x, y, x, y + 22);
        grd.addColorStop(0, "#fff");
        grd.addColorStop(0.45, "#ffe56a");
        grd.addColorStop(1, "#e09820");
        ctx.fillStyle = grd;
      } else ctx.fillStyle = "rgba(18, 8, 28, 0.55)";
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = lit ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.22)";
      ctx.stroke();
      ctx.fillStyle = lit ? "#3a2410" : "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.moveTo(lane.x, y + 5);
      ctx.lineTo(lane.x + 5, y + 11);
      ctx.lineTo(lane.x + 2, y + 11);
      ctx.lineTo(lane.x + 2, y + 17);
      ctx.lineTo(lane.x - 2, y + 17);
      ctx.lineTo(lane.x - 2, y + 11);
      ctx.lineTo(lane.x - 5, y + 11);
      ctx.closePath();
      ctx.fill();
    });
    ORBIT_ARROWS.forEach((a, i) => {
      const hot = which.combo > 1 || shotGlow.orbit > 0.08;
      const chaseOn = Math.floor(now / 200) % 3 === i;
      drawArrowInsert(a.x, a.y, a.rot, hot || chaseOn, hot ? "#7cf7d4" : "rgba(180,255,230,0.85)");
    });
    RAMP_ARROWS.forEach((a, i) => {
      const hot = which.kongLit || which.multiball || shotGlow.ramp > 0.08;
      const chaseOn = Math.floor(now / 200 + 1) % 3 === i;
      drawArrowInsert(a.x, a.y, a.rot, hot || chaseOn, hot ? "#ffe56a" : "rgba(255, 220, 150, 0.8)");
    });
    HALO.forEach((p, i) => {
      const on = which.combo > 1 ? (i + Math.floor(now / 120)) % 3 !== 0 : (i + Math.floor(now / 260)) % 5 === 0;
      ctx.beginPath();
      ctx.fillStyle = on ? (which.combo > 1 ? "#7cf7d4" : "rgba(255,255,255,0.8)") : "rgba(255,255,255,0.16)";
      ctx.arc(p[0], p[1], on ? 4.2 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawArrowInsert(x, y, rot, lit, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    roundRect(ctx, -8, -13, 16, 26, 5);
    ctx.fillStyle = lit ? color : "rgba(10, 6, 18, 0.62)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = lit ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.22)";
    ctx.stroke();
    ctx.fillStyle = lit ? "#fff" : "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5.2, 1);
    ctx.lineTo(2.1, 1);
    ctx.lineTo(2.1, 8);
    ctx.lineTo(-2.1, 8);
    ctx.lineTo(-2.1, 1);
    ctx.lineTo(-5.2, 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawRailsLive(which) {
    const now = performance.now();
    const orbitHot = which.combo > 1 || shotGlow.orbit > 0.05;
    const rampHot = which.kongLit || which.multiball || shotGlow.ramp > 0.05;
    drawRail(ctx, Sim.LEFT_ORBIT, orbitHot ? `rgba(124,247,212,${0.45 + Math.sin(now / 140) * 0.25})` : "rgba(255,255,255,0.18)", orbitHot ? 5 : 2);
    drawRail(ctx, Sim.RIGHT_RAMP, rampHot ? `rgba(255,229,106,${0.5 + Math.sin(now / 120) * 0.3})` : "rgba(255,255,255,0.18)", rampHot ? 6 : 2);
    drawRail(ctx, Sim.SKILL_RAIL, "rgba(255,143,196,0.35)", 2);
  }

  function drawSling(g, side) {
    const left = side === "L";
    const flash = flashes[left ? "slingL" : "slingR"] || 0;
    const poly = left
      ? [[30, 374], [48, 390], [108, 462], [74, 496], [32, 468]]
      : [[326, 374], [308, 390], [248, 462], [282, 496], [324, 468]];
    const a = left ? [48, 390] : [308, 390];
    const b = left ? [108, 462] : [248, 462];
    g.beginPath();
    poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    const grd = g.createLinearGradient(poly[0][0], poly[0][1], b[0], b[1]);
    grd.addColorStop(0, left ? "#102820" : "#3a2810");
    grd.addColorStop(0.55, left ? "#1c6a54" : "#c48418");
    grd.addColorStop(1, left ? "#8dffe0" : "#ffe56a");
    g.fillStyle = grd;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.stroke();
    g.lineCap = "round";
    g.strokeStyle = flash > 0.08 ? "#fff" : "#f4fbff";
    g.lineWidth = 8 + flash * 4;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
    g.strokeStyle = left ? "#b8fff0" : "#ffe9a0";
    g.lineWidth = 3.2;
    g.stroke();
    g.fillStyle = "#efeaf6";
    for (const p of [poly[0], poly[3]]) {
      g.beginPath();
      g.arc(p[0], p[1], 3.4, 0, 7);
      g.fill();
      g.strokeStyle = "#6a6080";
      g.lineWidth = 1;
      g.stroke();
    }
  }

  function drawTarget(t) {
    const vis = targetVis[t.id] == null ? (t.up ? 1 : 0) : targetVis[t.id];
    const fullH = t.y2 - t.y1;
    const drop = (1 - vis) * (fullH + 18);
    const y = t.y1 + drop;
    const h = Math.max(8, fullH * (0.28 + 0.72 * vis));
    const color = KONG_COLORS[t.id] || "#ffe56a";
    ctx.fillStyle = "rgba(8, 4, 16, 0.72)";
    roundRect(ctx, t.x - 12, t.y1 - 2, 24, fullH + 10, 5);
    ctx.fill();
    ctx.fillStyle = "#d9d0e4";
    roundRect(ctx, t.x - 15, t.y1 - 4, 4.5, fullH + 14, 2);
    ctx.fill();
    roundRect(ctx, t.x + 10.5, t.y1 - 4, 4.5, fullH + 14, 2);
    ctx.fill();
    if (vis < 0.06) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, 0.25 + vis);
    const grd = ctx.createLinearGradient(t.x, y, t.x, y + h);
    grd.addColorStop(0, "#fffef8");
    grd.addColorStop(0.18, color);
    grd.addColorStop(0.55, "#ffe56a");
    grd.addColorStop(1, "#c98420");
    ctx.fillStyle = grd;
    roundRect(ctx, t.x - 9, y, 18, h, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    roundRect(ctx, t.x - 7, y + 2, 14, 4, 2);
    ctx.fill();
    ctx.fillStyle = "#2a1840";
    ctx.font = "16px Jua, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(t.letter, t.x, y + h * 0.72);
    ctx.restore();
  }

  function drawPlunger(which) {
    const charge = which.plunger || 0;
    const y = 640 + charge * 28;
    ctx.strokeStyle = "#b7bccb";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const sy = y + 10 + i * 7;
      ctx.moveTo(367, sy);
      ctx.lineTo(381, sy + 3);
    }
    ctx.stroke();
    ctx.fillStyle = "#d5d8e4";
    roundRect(ctx, 368, y, 12, 64, 5);
    ctx.fill();
    const cap = ctx.createLinearGradient(360, y, 390, y);
    cap.addColorStop(0, "#fff");
    cap.addColorStop(0.45, "#ffe56a");
    cap.addColorStop(1, "#d4921c");
    ctx.fillStyle = cap;
    roundRect(ctx, 360, y - 8, 28, 16, 6);
    ctx.fill();
    if (charge > 0.04) {
      const skill = charge > 0.55 && charge < 0.82;
      ctx.globalAlpha = 0.35 + charge * 0.55;
      ctx.fillStyle = skill ? "#7cf7d4" : "#ff5fa2";
      ctx.beginPath();
      ctx.arc(374, y - 20, 6 + charge * 14, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawApron(g) {
    g.save();
    roundRect(g, 16, 690, 332, 26, 8);
    const metal = g.createLinearGradient(0, 690, 0, 716);
    metal.addColorStop(0, "#f7f2fb");
    metal.addColorStop(0.45, "#c9bdd6");
    metal.addColorStop(1, "#6a5878");
    g.fillStyle = metal;
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.75)";
    g.lineWidth = 1.4;
    g.stroke();
    roundRect(g, 166, 694, 74, 18, 5);
    g.fillStyle = "#120810";
    g.fill();
    const plate = (x, y, w, h, text) => {
      roundRect(g, x, y, w, h, 5);
      const grd = g.createLinearGradient(x, y, x, y + h);
      grd.addColorStop(0, "#ffe9a0");
      grd.addColorStop(1, "#e0a020");
      g.fillStyle = grd;
      g.fill();
      g.fillStyle = "#3a2410";
      g.font = "13px Jua, sans-serif";
      g.textAlign = "center";
      g.fillText(text, x + w / 2, y + 14);
    };
    plate(28, 693, 124, 18, "콩핀볼");
    plate(250, 693, 86, 18, "심심타임");
    g.fillStyle = "#ffe56a";
    for (const x of [22, 158, 244, 340]) {
      g.beginPath();
      g.arc(x, 703, 2.1, 0, 7);
      g.fill();
    }
    g.restore();
  }

  function drawPost(g, p) {
    g.save();
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath();
    g.ellipse(p.x + 1, p.y + 2, p.r + 2, p.r * 0.8, 0, 0, 7);
    g.fill();
    const grd = g.createRadialGradient(p.x - 1.5, p.y - 2, 1, p.x, p.y, p.r + 2);
    grd.addColorStop(0, "#fff");
    grd.addColorStop(0.5, "#ffe56a");
    grd.addColorStop(1, "#a87420");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(p.x, p.y, p.r + 1.6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#fff";
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }

  function drawCallout(c) {
    const k = 1 - c.life / c.max;
    let pop = 1;
    if (k < 0.16) pop = 0.9 + (k / 0.16) * 0.32;
    else if (k < 0.3) pop = 1.22 - ((k - 0.16) / 0.14) * 0.22;
    const alpha = k > 0.72 ? Math.max(0, (1 - k) / 0.28) : 1;
    ctx.save();
    ctx.translate(c.x, c.y - (c.banner ? 0 : k * 42));
    ctx.scale(pop, pop);
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    if (c.banner) {
      ctx.font = (c.text.length > 6 ? 40 : 52) + "px Jua, sans-serif";
      const tw = Math.min(368, ctx.measureText(c.text).width + 54);
      const th = c.text.length > 6 ? 78 : 86;
      roundRect(ctx, -tw / 2, -th / 2, tw, th, 20);
      const plate = ctx.createLinearGradient(0, -th / 2, 0, th / 2);
      plate.addColorStop(0, "rgba(48, 16, 58, 0.94)");
      plate.addColorStop(1, "rgba(16, 6, 24, 0.9)");
      ctx.fillStyle = plate;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = c.color;
      ctx.stroke();
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#1a0a24";
      ctx.strokeText(c.text, 0, 4);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.strokeText(c.text, 0, 4);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, 0, 4);
    } else {
      ctx.font = "38px Jua, sans-serif";
      ctx.lineWidth = 7;
      ctx.strokeStyle = "#1a0a24";
      ctx.strokeText(c.text, 0, 0);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.88)";
      ctx.strokeText(c.text, 0, 0);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, 0, 0);
    }
    ctx.restore();
  }

  function drawBonus(which) {
    const shown = Math.round((which.bonusAward || 0) * Math.min(1, which.bonusT / 1.1));
    ctx.save();
    roundRect(ctx, 70, 286, 260, 112, 22);
    ctx.fillStyle = "rgba(12, 6, 24, 0.78)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffe56a";
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe56a";
    ctx.font = "22px Jua, sans-serif";
    ctx.fillText("보너스", 200, 326);
    ctx.font = "40px Jua, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(fmt(shown), 200, 372);
    ctx.restore();
  }

  function drawSide(side) {
    const frameLeft = ox - 14;
    const frameRight = ox + tableCssW + 14;
    const gap = side === "left" ? frameLeft : W - frameRight;
    if (gap < 26) return;
    const bladeW = Math.min(220, Math.max(40, gap - 18));
    const bladeX = side === "left" ? frameLeft - 10 - bladeW : frameRight + 10;
    const y = topPad;
    const h = Math.min(H - y - 8, backH + tableCssH + 8);
    ctx.save();
    roundRect(ctx, bladeX, y, bladeW, h, 22);
    const grd = ctx.createLinearGradient(bladeX, y, bladeX + bladeW, y);
    grd.addColorStop(0, side === "left" ? "#2a103c" : "#4a1848");
    grd.addColorStop(1, side === "left" ? "#4a1848" : "#2a103c");
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = side === "left" ? "rgba(255, 110, 170, 0.95)" : "rgba(124, 247, 212, 0.95)";
    ctx.stroke();
    const tubeX = side === "left" ? bladeX + bladeW - 12 : bladeX + 12;
    ctx.strokeStyle = side === "left" ? "#ff5fa2" : "#7cf7d4";
    ctx.lineWidth = 4;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(tubeX, y + 28);
    ctx.lineTo(tubeX, y + h - 28);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const lamps = Math.max(5, Math.floor(h / 78));
    for (let i = 0; i < lamps; i++) {
      const ly = y + 36 + i * ((h - 72) / lamps);
      const lx = side === "left" ? bladeX + 26 : bladeX + bladeW - 26;
      const on = (i + Math.floor(performance.now() / 150)) % 4 === 0;
      ctx.beginPath();
      ctx.fillStyle = on ? (side === "left" ? "#ff5fa2" : "#7cf7d4") : "rgba(255,255,255,0.14)";
      ctx.arc(lx, ly, on ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    roundRect(ctx, bladeX, y, bladeW, h, 22);
    ctx.clip();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 8;
    for (let i = -2; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(bladeX - 10, y + i * 48);
      ctx.lineTo(bladeX + bladeW + 10, y + 70 + i * 48);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (bladeW > 70) {
      ctx.font = "28px Jua, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ["콩", "핀", "볼"].forEach((ch, i) => ctx.fillText(ch, bladeX + bladeW * 0.62, y + 78 + i * 40));
      drawIconBean(ctx, bladeX + bladeW * 0.36, y + h * 0.72, Math.min(40, bladeW * 0.24));
    }
    ctx.restore();
    const outer = side === "left" ? bladeX - 8 : W - (bladeX + bladeW) - 8;
    if (outer > 130) {
      const cx = side === "left" ? Math.max(70, (bladeX - 8) * 0.48) : bladeX + bladeW + 8 + outer * 0.55;
      const cy = side === "left" ? H * 0.62 : H * 0.36;
      const br = Math.min(88, outer * 0.2);
      drawIconBean(ctx, cx, cy, br, side === "left" ? -0.08 : 0.1);
      ctx.font = "26px Jua, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = side === "left" ? "rgba(255,255,255,0.88)" : "rgba(255, 229, 106, 0.92)";
      ctx.fillText(side === "left" ? "심심타임" : "콩나물", cx, cy + br + 28);
      ctx.strokeStyle = side === "left" ? "rgba(255,120,170,0.45)" : "rgba(124,247,212,0.4)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - br, cy - br * 1.3);
      ctx.quadraticCurveTo(cx, cy - br * 2.1, cx + br * 0.8, cy - br * 1.5);
      ctx.stroke();
      if (outer > 220) {
        drawIconBean(ctx, side === "left" ? cx * 0.42 : cx + outer * 0.22, H * 0.22, 28, 0.2);
        drawIconBean(ctx, side === "left" ? 64 : W - 64, H * 0.82, 22, -0.15);
      }
    }
  }

  function drawBezel() {
    const x = ox - 14;
    const y = topPad;
    const w = tableCssW + 28;
    const h = backH + tableCssH + 8;
    ctx.save();
    roundRect(ctx, x + 5, y + 7, w, h, 30);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fill();
    roundRect(ctx, x, y, w, h, 28);
    const rim = ctx.createLinearGradient(x, y, x, y + h);
    rim.addColorStop(0, "#3a2048");
    rim.addColorStop(0.4, "#1a0c22");
    rim.addColorStop(1, "#120814");
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffd978";
    ctx.stroke();
    ctx.lineWidth = 9;
    ctx.strokeStyle = "rgba(255, 90, 160, 0.25)";
    ctx.stroke();
    ctx.fillStyle = "#ffe56a";
    for (const [sx, sy] of [[x + 16, y + 16], [x + w - 16, y + 16], [x + 16, y + h - 16], [x + w - 16, y + h - 16]]) {
      ctx.beginPath();
      ctx.arc(sx, sy, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBackbox(which) {
    const x = ox - 14;
    const y = topPad;
    const w = tableCssW + 28;
    const gx = x + 10;
    const gy = y + 8;
    const gw = Math.max(40, w - 20);
    const gh = Math.max(40, backH - 14);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    roundRect(ctx, gx, gy, gw, gh, 16);
    const glass = ctx.createLinearGradient(gx, gy, gx, gy + gh);
    glass.addColorStop(0, "#321444");
    glass.addColorStop(0.55, "#140816");
    glass.addColorStop(1, "#0c0612");
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 214, 120, 0.9)";
    ctx.stroke();
    const now = performance.now();
    const n = Math.max(8, Math.floor(gw / 16));
    for (let i = 0; i < n; i++) {
      const px = gx + 12 + (i / (n - 1)) * (gw - 24);
      const on = (i + Math.floor(now / 80)) % 5 === 0;
      ctx.beginPath();
      ctx.fillStyle = on ? "#ffe56a" : "rgba(255,255,255,0.16)";
      ctx.arc(px, gy + 8, on ? 2.5 : 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    const shine = ctx.createLinearGradient(gx, gy, gx, gy + gh * 0.42);
    shine.addColorStop(0, "rgba(255,255,255,0.14)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shine;
    roundRect(ctx, gx, gy, gw, gh, 16);
    ctx.fill();
    const row1 = gy + 22;
    const row2 = gy + Math.min(gh * 0.52, 48);
    const row3 = gy + gh - 14;
    ctx.font = "15px Jua, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffe56a";
    ctx.fillText("콩핀볼", gx + gw * 0.5, row1);
    const balls = which.ballsLeft || 0;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.fillStyle = i < balls ? "#ff8ec4" : "rgba(255,255,255,0.16)";
      ctx.ellipse(gx + 16 + i * 15, row1 - 4, 4.6, 6.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = "16px Jua, sans-serif";
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffe56a";
    ctx.fillText("x" + (which.bonusMult || 1), gx + gw - 12, row1);
    const meter = which.tiltMeter || 0;
    for (let i = 0; i < 3; i++) {
      const on = meter > 0.15 + i * 0.27;
      ctx.fillStyle = on ? "#ff4d6a" : "rgba(255,255,255,0.16)";
      roundRect(ctx, gx + gw - 86 + i * 16, row1 - 12, 12, 6, 3);
      ctx.fill();
    }
    const letters = ["K", "O", "N", "G"];
    const lampR = Math.max(8, Math.min(12, gw * 0.03));
    which.targets.forEach((t, i) => {
      const lx = gx + 20 + i * (lampR * 2 + 8);
      const ly = row2;
      const on = !t.up;
      const pulse = on ? 0.85 + Math.sin(now / 140 + i) * 0.15 : 1;
      ctx.beginPath();
      ctx.fillStyle = "#07040c";
      ctx.arc(lx, ly, lampR + 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      if (on) {
        const grd = ctx.createRadialGradient(lx - 2, ly - 3, 1, lx, ly, lampR);
        grd.addColorStop(0, "#fff");
        grd.addColorStop(0.5, KONG_COLORS[i]);
        grd.addColorStop(1, "#4a2060");
        ctx.fillStyle = grd;
      } else ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.arc(lx, ly, lampR * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 13px Jua, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = on ? "#2a1840" : "rgba(255,255,255,0.5)";
      ctx.fillText(letters[i], lx, ly + 4);
    });
    const score = mode === "title" ? which.score : shownScore;
    const text = String(Math.max(0, Math.round(score))).padStart(7, "0");
    const dot = Math.max(2.1, Math.min(3.4, (gh - 50) / 9));
    const cell = dot * 6.15;
    const scoreX = gx + gw - 14 - text.length * cell;
    const scoreY = row2 - dot * 4;
    for (let i = 0; i < text.length; i++) drawGlyph(ctx, text[i], scoreX + i * cell, scoreY, dot);
    const status = statusText(which);
    const fast = which.multiball || which.ballSave > 0 || which.tilted;
    ctx.globalAlpha = 0.72 + Math.sin(now / (fast ? 90 : 200)) * 0.28;
    ctx.font = Math.round(Math.max(16, Math.min(22, gw / 16))) + "px Jua, sans-serif";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(status, gx + gw / 2, row3);
    ctx.fillStyle = statusColor(which);
    ctx.fillText(status, gx + gw / 2, row3);
    ctx.restore();
  }

  function render() {
    const which = mode === "title" ? attract : state;
    tickVisuals(which, visualDt());
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#4c1868");
    bg.addColorStop(0.4, "#1a0a28");
    bg.addColorStop(1, "#07040e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(ox + tableCssW / 2, oy + 40, 20, ox + tableCssW / 2, oy + tableCssH * 0.35, Math.max(280, tableCssW));
    glow.addColorStop(0, "rgba(255, 70, 150, 0.32)");
    glow.addColorStop(1, "rgba(255, 70, 150, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    drawSide("left");
    drawSide("right");
    drawBezel();
    renderWorld(which);
    drawBackbox(which);
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
    targetVis = {};
    shotGlow.orbit = 0;
    shotGlow.ramp = 0;
    wash = 0;
    trails = new WeakMap();
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
        for (const k of Object.keys(flashes)) flashes[k] = Math.max(0, flashes[k] - Sim.DT * 3.2);
        shotGlow.orbit = Math.max(0, shotGlow.orbit - Sim.DT * 0.42);
        shotGlow.ramp = Math.max(0, shotGlow.ramp - Sim.DT * 0.42);
        wash = Math.max(0, wash - Sim.DT * 1.05);
      }
      snapTargets = true;
      for (const c of callouts) c.life = Math.min(c.life, c.max * 0.8);
      shownScore = state.score;
      if (state.phase === "gameover") showOver();
      syncHud();
      render();
    },
  };

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => resize());
  resize();
  setMode("title");
  requestAnimationFrame(frame);
})();
