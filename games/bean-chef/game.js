(function () {
  const Sim = window.BeanChefSim;
  const Bot = window.BeanChefBot;
  const TILE = Sim.TILE;

  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");
  const hud = document.getElementById("hud");
  const ordersEl = document.getElementById("orders");
  const titleEl = document.getElementById("title");
  const pauseEl = document.getElementById("pause");
  const resultEl = document.getElementById("result");
  const banner = document.getElementById("banner");
  const stick = document.getElementById("stick");
  const nub = document.getElementById("nub");
  const actBtn = document.getElementById("act");

  const ING_COLOR = {
    rice: ["#fff6df", "#e7c98a"],
    sprout: ["#e7f8c8", "#7dce6a"],
    tofu: ["#fffaf3", "#f0ddc0"],
    egg: ["#fff1b0", "#f0b429"],
    seaweed: ["#3d6b52", "#1d3328"],
    pepper: ["#ff6b6b", "#c4232c"],
    tteok: ["#fff", "#ffd0dc"],
  };

  let state = null;
  let mode = "title";
  let paused = false;
  let save = loadSave();
  let muted = false;
  let ac = null;
  let keys = new Set();
  let joy = { x: 0, y: 0 };
  let actHeld = false;
  let stickId = null;
  let particles = [];
  let floaters = [];
  let bannerTimer = 0;
  let last = performance.now();
  let liveBot = null;
  let externalDrive = false;
  let liveLimit = 0;
  let liveAcc = 0;
  let currentDay = 1;
  let orderNodes = new Map();
  let camXSmooth = null;

  try { muted = localStorage.getItem("simsim-bean-chef-mute") === "1"; } catch (err) { muted = false; }

  function loadSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(Sim.SAVE_KEY) || "");
      if (!raw || !Array.isArray(raw.bestStars)) throw new Error("empty");
      return {
        unlocked: Math.min(4, Math.max(1, raw.unlocked | 0 || 1)),
        bestStars: [0, 1, 2, 3].map(function (i) { return Math.max(0, Math.min(3, raw.bestStars[i] | 0)); }),
        bestScore: [0, 1, 2, 3].map(function (i) { return Math.max(0, raw.bestScore[i] | 0); }),
      };
    } catch (err) {
      return { unlocked: 1, bestStars: [0, 0, 0, 0], bestScore: [0, 0, 0, 0] };
    }
  }

  function writeSave() {
    try { localStorage.setItem(Sim.SAVE_KEY, JSON.stringify(save)); } catch (err) { /* ignore */ }
  }

  function starGlyph(n) {
    return "★★★☆☆☆".slice(3 - Math.max(0, Math.min(3, n)), 6 - Math.max(0, Math.min(3, n)));
  }

  function fmtTime(left) {
    const s = Math.max(0, Math.ceil(left));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function syncTouch() {
    const coarse = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    document.body.classList.toggle("touch", coarse);
  }

  function setMode(next) {
    mode = next;
    document.body.classList.toggle("playing", mode === "play");
    titleEl.classList.toggle("hidden", mode !== "title");
    pauseEl.classList.toggle("hidden", mode !== "pause");
    resultEl.classList.toggle("hidden", mode !== "result");
    hud.classList.toggle("hidden", mode !== "play" && mode !== "pause");
    if (mode === "title") renderDays();
  }

  function renderDays() {
    const host = document.getElementById("days");
    host.innerHTML = "";
    Sim.DAYS.forEach(function (day) {
      const locked = day.id > save.unlocked;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day-btn";
      btn.disabled = locked;
      const best = save.bestStars[day.id - 1] || 0;
      btn.innerHTML =
        "<em>" + day.id + "일차" + (locked ? " · 잠김" : "") + "</em>" +
        "<strong>" + day.name + "</strong>" +
        "<span class='stars'>" + starGlyph(best) + "</span>";
      btn.addEventListener("click", function () {
        if (!locked) startDay(day.id);
      });
      host.appendChild(btn);
    });
  }

  function ensureAudio() {
    if (muted) return null;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }

  function tone(freq, dur, type, vol, slide) {
    const audio = ensureAudio();
    if (!audio) return;
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(audio.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol) {
    const audio = ensureAudio();
    if (!audio) return;
    const len = Math.floor(audio.sampleRate * dur);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.createBufferSource();
    const g = audio.createGain();
    const f = audio.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900;
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(audio.destination);
    src.start();
  }

  function playMuteIcon() {
    document.getElementById("mute").textContent = muted ? "🔇" : "🔊";
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 90;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: 0.45 + Math.random() * 0.35,
        max: 0.8,
        size: 3 + Math.random() * 4,
        color: color,
      });
    }
  }

  function floater(x, y, text, color, life) {
    floaters.push({ x: x, y: y, text: text, color: color || "#fff6df", life: life || 1.05, max: life || 1.05 });
  }

  function coins(x, y) {
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const s = 50 + Math.random() * 90;
      particles.push({
        kind: "coin",
        x: x, y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 20,
        life: 0.75 + Math.random() * 0.35,
        max: 1.1,
        size: 6 + Math.random() * 3,
        color: "#ffd56a",
      });
    }
  }

  function smokeBurst(x, y) {
    for (let i = 0; i < 10; i++) {
      particles.push({
        kind: "smoke",
        x: x + (Math.random() - 0.5) * 16,
        y: y,
        vx: (Math.random() - 0.5) * 28,
        vy: -30 - Math.random() * 50,
        life: 0.8 + Math.random() * 0.5,
        max: 1.3,
        size: 6 + Math.random() * 6,
        color: "#8a847c",
      });
    }
  }

  function shout(text, kind) {
    banner.textContent = text;
    banner.className = "show " + (kind || "");
    clearTimeout(bannerTimer);
    const ms = kind === "bad" ? 1300 : kind === "perfect" || kind === "serve" ? 1200 : 900;
    bannerTimer = setTimeout(function () { banner.className = ""; }, ms);
  }

  function onEvent(e) {
    if (e.type === "serve") {
      tone(e.perfect ? 880 : 660, 0.12, "triangle", 0.08);
      tone(e.perfect ? 1320 : 880, 0.18, "sine", 0.06);
      burst(e.x, e.y, "#ffd56a", 16);
      coins(e.x, e.y - 8);
      floater(e.x, e.y - 26, "서빙 완료! +" + e.gained, "#ffe38a", 1.35);
      if (e.combo > 1) floater(e.x, e.y - 52, "콤보 x" + e.combo, "#ff8a5b", 1.2);
      shout("서빙 완료! +" + e.gained, e.perfect ? "perfect" : "serve");
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (err) { /* ignore */ }
    } else if (e.type === "burn") {
      tone(140, 0.3, "sawtooth", 0.05, 70);
      shout("탔어요!", "bad");
      burst(e.x, e.y, "#ff6a3d", 14);
      smokeBurst(e.x, e.y - 10);
    } else if (e.type === "fire") {
      tone(90, 0.4, "square", 0.04, 50);
      shout("불이야!", "bad");
    } else if (e.type === "ready") {
      tone(740, 0.1, "sine", 0.06);
      shout("지금!", "perfect");
    } else if (e.type === "miss") {
      tone(320, 0.2, "sine", 0.05, 120);
      shout("시간 초과", "bad");
    } else if (e.type === "chopped") {
      tone(520, 0.06, "square", 0.04);
      tone(780, 0.08, "triangle", 0.04);
    } else if (e.type === "pickup" || e.type === "drop") {
      tone(e.type === "pickup" ? 480 : 320, 0.05, "triangle", 0.03);
    } else if (e.type === "reject") {
      tone(180, 0.12, "square", 0.04);
    } else if (e.type === "cook") {
      noise(0.12, 0.04);
    }
  }

  function sampleInput() {
    const x = (keys.has("arrowright") || keys.has("keyd") ? 1 : 0) - (keys.has("arrowleft") || keys.has("keya") ? 1 : 0) + joy.x;
    const y = (keys.has("arrowdown") || keys.has("keys") ? 1 : 0) - (keys.has("arrowup") || keys.has("keyw") ? 1 : 0) + joy.y;
    return {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
      action: keys.has("space") || keys.has("keye") || actHeld,
    };
  }

  function playTick(input, dt) {
    if (!state || state.phase !== "play") return;
    Sim.step(state, input, dt);
    for (let i = 0; i < state.events.length; i++) onEvent(state.events[i]);
    state.events.length = 0;
    if (state.phase === "end") finish();
  }

  function persist(metrics) {
    const i = metrics.day - 1;
    const prev = save.bestScore[i];
    save.bestScore[i] = Math.max(prev, metrics.score);
    save.bestStars[i] = Math.max(save.bestStars[i], metrics.stars);
    if (metrics.stars >= 1 && metrics.day < 4) save.unlocked = Math.max(save.unlocked, metrics.day + 1);
    writeSave();
    return metrics.score > prev;
  }

  function finish() {
    const metrics = Sim.metrics(state);
    const improved = persist(metrics);
    showResult(metrics, improved);
    setMode("result");
  }

  function showResult(metrics, improved) {
    const day = Sim.DAYS[metrics.day - 1];
    document.getElementById("chrome-title").textContent = Sim.DAYS[metrics.day - 1].name;
    document.getElementById("res-kicker").textContent = metrics.stars >= 1 ? "클리어" : "하루 종료";
    document.getElementById("res-title").textContent = day.name;
    document.getElementById("res-stars").textContent = starGlyph(metrics.stars);
    document.getElementById("res-score").textContent = String(metrics.score);
    const next = metrics.stars >= 1 && metrics.day < 4;
    let sub = metrics.stars >= 3 ? "완벽한 서비스예요. 주방이 별 세 개로 빛나요." : metrics.stars >= 1 ? "하루를 버텼어요. 다음 날 주방이 열립니다." : "주문이 많이 빠졌어요. 한 접시라도 제때에 내 보세요.";
    if (improved) sub = "최고 점수 경신! " + sub;
    document.getElementById("res-sub").textContent = sub;
    const rows = [
      ["서빙", metrics.served],
      ["미스", metrics.missed],
      ["탄 요리", metrics.burnt],
      ["완벽", metrics.perfects],
      ["최고 콤보", metrics.maxCombo],
      ["평균 시간", metrics.avgTicket ? metrics.avgTicket.toFixed(1) + "초" : "-"],
    ];
    document.getElementById("res-stats").innerHTML = rows.map(function (r) {
      return "<li><span>" + r[0] + "</span><b>" + r[1] + "</b></li>";
    }).join("");
    document.getElementById("btn-next").classList.toggle("hidden", !next);
    resultEl.dataset.stars = String(metrics.stars);
    resultEl.dataset.score = String(metrics.score);
  }

  function startDay(day, seed) {
    currentDay = day;
    const useSeed = seed == null ? (Date.now() % 1000000000) >>> 0 : seed >>> 0;
    state = Sim.create(day, useSeed);
    particles = [];
    floaters = [];
    orderNodes = new Map();
    ordersEl.innerHTML = "";
    camXSmooth = null;
    paused = false;
    liveBot = null;
    document.getElementById("chrome-title").textContent = Sim.DAYS[day - 1].name;
    setMode("play");
    shout(day + "일차 · " + Sim.DAYS[day - 1].name, "");
    last = performance.now();
  }

  function ingSVG(id) {
    const art = {
      rice: "<svg viewBox='0 0 32 32'><path d='M5 14h22c.2 8-4.2 13-11 13S5 22 5 14z' fill='#fffaf2' stroke='#3a2418' stroke-width='2'/><circle cx='12' cy='17' r='1.5' fill='#e7d3a4'/><circle cx='16' cy='19' r='1.5' fill='#e7d3a4'/><circle cx='20' cy='16' r='1.5' fill='#e7d3a4'/><circle cx='15' cy='15' r='1.3' fill='#f3e6c8'/></svg>",
      sprout: "<svg viewBox='0 0 32 32'><path d='M16 28V13' stroke='#2c6b30' stroke-width='2.2' stroke-linecap='round'/><path d='M16 16c-7-1-9-8-5-10 2 5 4 8 5 10z' fill='#8ed36a' stroke='#245c28' stroke-width='1.6'/><path d='M16 14c6-1 9-7 5-9-3 4-4 7-5 9z' fill='#c6ee8a' stroke='#245c28' stroke-width='1.6'/></svg>",
      tofu: "<svg viewBox='0 0 32 32'><path d='M7 12l9-5 9 5-9 5z' fill='#fff' stroke='#3a2418' stroke-width='2'/><path d='M7 12v9l9 5V17z' fill='#f4efe6' stroke='#3a2418' stroke-width='2'/><path d='M25 12v9l-9 5V17z' fill='#e7d8c4' stroke='#3a2418' stroke-width='2'/></svg>",
      egg: "<svg viewBox='0 0 32 32'><ellipse cx='16' cy='18' rx='9' ry='11' fill='#fff6d4' stroke='#3a2418' stroke-width='2'/><ellipse cx='16' cy='19' rx='4.2' ry='5' fill='#f0b429'/></svg>",
      seaweed: "<svg viewBox='0 0 32 32'><path d='M6 10c4 2 6 2 10 0s6-2 10 0v12c-4-2-6-2-10 0s-6 2-10 0z' fill='#1f6b45' stroke='#143c28' stroke-width='2'/></svg>",
      pepper: "<svg viewBox='0 0 32 32'><path d='M18 7c2 3 1 5 0 6-4 1-9 5-8 11 1 5 8 6 11 2 3-4 1-10-1-12 2-1 4-4 3-7-2 1-4 1-5 0z' fill='#ef3b3b' stroke='#8d1a1a' stroke-width='1.7'/><path d='M17 6c1-3 4-4 5-3' stroke='#2f7a32' stroke-width='2' stroke-linecap='round'/></svg>",
      tteok: "<svg viewBox='0 0 32 32'><rect x='5' y='12' width='22' height='9' rx='4.5' fill='#ffd0dc' stroke='#3a2418' stroke-width='2'/><path d='M12 12v9M20 12v9' stroke='#e7a0b4' stroke-width='1.4'/></svg>",
    };
    return art[id] || art.rice;
  }

  function dishSVG(id) {
    const art = {
      kimbap: "<svg viewBox='0 0 64 64'><circle cx='32' cy='34' r='22' fill='#1e6b45' stroke='#3a2418' stroke-width='3'/><circle cx='32' cy='34' r='13' fill='#fff6e4' stroke='#3a2418' stroke-width='2'/><circle cx='32' cy='34' r='5' fill='#f0b429'/><circle cx='26' cy='31' r='1.7' fill='#ef5b5b'/><circle cx='37' cy='37' r='1.6' fill='#7dce6a'/></svg>",
      gyeran: "<svg viewBox='0 0 64 64'><rect x='12' y='16' width='40' height='34' rx='10' fill='#f6c445' stroke='#3a2418' stroke-width='3'/><path d='M16 28h32M16 38h32' stroke='#e09a1e' stroke-width='3' stroke-linecap='round'/><ellipse cx='32' cy='22' rx='10' ry='4' fill='#ffe28a'/></svg>",
      dubu: "<svg viewBox='0 0 64 64'><path d='M10 30h44c0 16-8 24-22 24S10 46 10 30z' fill='#fff' stroke='#3a2418' stroke-width='3'/><path d='M14 30c2 10 8 16 18 16s16-6 18-16' fill='#c47a3a'/><rect x='22' y='24' width='10' height='10' rx='2' fill='#fffaf2' stroke='#3a2418' stroke-width='2'/><rect x='34' y='27' width='9' height='9' rx='2' fill='#fff' stroke='#3a2418' stroke-width='2'/></svg>",
      kong: "<svg viewBox='0 0 64 64'><path d='M8 28h48c1 18-10 28-24 28S7 46 8 28z' fill='#f7f1e4' stroke='#3a2418' stroke-width='3'/><path d='M14 30c4 8 10 12 18 12s14-4 18-12' fill='#e7d3a4'/><path d='M24 18c0 8 4 12 8 14 4-2 8-6 8-14' fill='none' stroke='#3e8f3a' stroke-width='2'/><circle cx='24' cy='20' r='4' fill='#8ed36a'/><circle cx='40' cy='18' r='4' fill='#b6e38a'/></svg>",
      tteok: "<svg viewBox='0 0 64 64'><path d='M8 32h48c0 16-10 24-24 24S8 48 8 32z' fill='#fff' stroke='#3a2418' stroke-width='3'/><rect x='16' y='26' width='14' height='10' rx='5' fill='#ef4b4b' stroke='#3a2418' stroke-width='2'/><rect x='30' y='22' width='16' height='10' rx='5' fill='#ff7a6a' stroke='#3a2418' stroke-width='2'/><path d='M22 18c4 4 8 4 12 0' stroke='#3e8f3a' stroke-width='2' fill='none'/></svg>",
    };
    return "<div class='dish dish-" + id + "'>" + (art[id] || art.kimbap) + "</div>";
  }

  function updateHud() {
    if (!state) return;
    document.getElementById("time").textContent = fmtTime(state.duration - state.time);
    document.getElementById("score").textContent = String(Math.round(state.score));
    document.getElementById("live-stars").textContent = starGlyph(state.stars);
    document.getElementById("combo").textContent = String(state.combo);
    document.getElementById("held").textContent = "손: " + Sim.itemName(state.chef.hold);
    const seen = new Set();
    state.orders.forEach(function (order) {
      seen.add(order.id);
      let node = orderNodes.get(order.id);
      if (!node) {
        node = document.createElement("article");
        node.className = "ticket";
        const rec = Sim.RECIPES[order.dish];
        const pips = rec.ings.map(function (ing) {
          const name = Sim.ING[ing.id] ? Sim.ING[ing.id].name : ing.id;
          return "<i class='pip " + ing.id + (ing.chop ? " chop" : "") + "' title='" + name + "'>" + ingSVG(ing.id) + "<span>" + name + "</span></i>";
        }).join("");
        node.innerHTML =
          "<div class='ticket-main'>" + dishSVG(order.dish) +
          "<div class='ticket-copy'><b>" + rec.name + "</b><div class='pips'>" + pips + "</div></div></div>" +
          "<div class='bar'><i></i></div>";
        ordersEl.appendChild(node);
        orderNodes.set(order.id, node);
      }
      const ratio = Math.max(0, order.patience / order.maxPatience);
      node.querySelector(".bar i").style.width = (ratio * 100) + "%";
      node.classList.toggle("low", ratio < 0.28);
      node.classList.toggle("mid", ratio >= 0.28 && ratio < 0.55);
    });
    orderNodes.forEach(function (node, id) {
      if (!seen.has(id)) {
        node.remove();
        orderNodes.delete(id);
      }
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(2, Math.round(rect.width * dpr));
    canvas.height = Math.max(2, Math.round(rect.height * dpr));
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

  function softShadow(x, y, rx, ry) {
    ctx.fillStyle = "rgba(62, 30, 14, 0.24)";
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWood(x, y, w, h) {
    const plank = 18;
    const y0 = Math.floor(y / plank) * plank;
    for (let py = y0; py < y + h; py += plank) {
      const row = Math.floor(py / plank);
      const tone = row % 5;
      ctx.fillStyle = ["#e7bc84", "#d9a56c", "#e3b178", "#c99258", "#deb07a"][tone];
      ctx.fillRect(x, py, w, plank + 0.6);
      ctx.fillStyle = "rgba(255, 244, 224, 0.22)";
      ctx.fillRect(x, py + 1, w, 2);
      ctx.strokeStyle = "rgba(92, 48, 20, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, py + 7);
      ctx.bezierCurveTo(x + w * 0.3, py + 5, x + w * 0.6, py + 10, x + w, py + 6);
      ctx.stroke();
      ctx.strokeStyle = "rgba(70, 36, 16, 0.32)";
      const gap = 86;
      const off = ((row * 41) % gap + gap) % gap;
      for (let px = x + off; px < x + w; px += gap) {
        ctx.beginPath();
        ctx.moveTo(px, py + 1);
        ctx.lineTo(px + (row % 2 ? 2 : -1), py + plank - 1);
        ctx.stroke();
      }
      if (row % 4 === 1) {
        const kx = x + 24 + ((row * 97) % Math.max(30, Math.floor(w - 40)));
        ctx.fillStyle = "rgba(110, 62, 28, 0.22)";
        ctx.beginPath();
        ctx.ellipse(kx, py + 9, 8, 3.4, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 236, 210, 0.28)";
        ctx.beginPath();
        ctx.ellipse(kx - 2, py + 8, 2.2, 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawBackdrop(camX, camY, viewW, viewH) {
    const mapH = state.map.length * TILE;
    ctx.fillStyle = "#f6e7d4";
    ctx.fillRect(camX - 60, camY - 60, viewW + 120, viewH + 120);
    const top = Math.min(camY, 0) - 24;
    const wash = ctx.createLinearGradient(0, top, 0, TILE + 8);
    wash.addColorStop(0, "#fbf3e8");
    wash.addColorStop(1, "#e7c9a8");
    ctx.fillStyle = wash;
    ctx.fillRect(camX - 60, top, viewW + 120, TILE + 8 - top);
    drawWood(camX - 60, TILE - 4, viewW + 120, Math.max(mapH, camY + viewH) - TILE + 90);
  }

  function drawCounterBlock(x, y, w, h) {
    softShadow(x + w / 2, y + h - 2, w * 0.38, 5.5);
    ctx.fillStyle = "#a85a40";
    roundRect(x + 2, y + h * 0.42, w - 4, h * 0.52, 4);
    ctx.fill();
    ctx.fillStyle = "#7c3b2a";
    ctx.fillRect(x + 2, y + h * 0.42, w - 4, 4);
    const g = ctx.createLinearGradient(x, y, x, y + h * 0.5);
    g.addColorStop(0, "#fff8f0");
    g.addColorStop(1, "#f0d3b8");
    ctx.fillStyle = g;
    roundRect(x + 1, y + 3, w - 2, h * 0.46, 5);
    ctx.fill();
    ctx.strokeStyle = "#5c3424";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(x + 7, y + 7, w * 0.36, 3);
  }

  function drawWindowTile(x, y, t) {
    ctx.fillStyle = "#8a4e30";
    roundRect(x + 5, y + 4, TILE - 10, TILE - 16, 3);
    ctx.fill();
    const sky = ctx.createLinearGradient(x, y, x, y + 30);
    sky.addColorStop(0, "#8ecfff");
    sky.addColorStop(0.7, "#ffe0b0");
    sky.addColorStop(1, "#ffc48a");
    ctx.fillStyle = sky;
    roundRect(x + 8, y + 7, TILE - 16, TILE - 24, 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + TILE / 2, y + 8);
    ctx.lineTo(x + TILE / 2, y + TILE - 16);
    ctx.moveTo(x + 9, y + 18);
    ctx.lineTo(x + TILE - 9, y + 18);
    ctx.stroke();
    const sway = Math.sin(t * 1.4 + x) * 1.4;
    ctx.fillStyle = "#e07a45";
    roundRect(x + 16, y + TILE - 18, 16, 8, 2);
    ctx.fill();
    ctx.fillStyle = "#3e8f3a";
    ctx.beginPath();
    ctx.ellipse(x + 24 + sway, y + TILE - 20, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawShelf(x, y) {
    ctx.fillStyle = "#9a6236";
    ctx.fillRect(x + 5, y + 18, TILE - 10, 4);
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x + 5, y + 18, TILE - 10, 4);
    ["#ef4b4b", "#f0b429", "#7dce7a", "#fff"].forEach(function (color, i) {
      const jx = x + 7 + i * 10;
      ctx.fillStyle = color;
      roundRect(jx, y + 7, 8, 11, 2);
      ctx.fill();
      ctx.strokeStyle = "#3a2418";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(jx + 2, y + 9, 2, 4);
    });
  }

  function drawHangingPans(x, y, t) {
    [0, 1].forEach(function (i) {
      const swing = Math.sin(t * 1.5 + i) * 0.18;
      ctx.save();
      ctx.translate(x + 15 + i * 18, y + 5);
      ctx.rotate(swing);
      ctx.strokeStyle = "#6d584c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 7);
      ctx.stroke();
      ctx.fillStyle = i ? "#3d3834" : "#6a727a";
      ctx.beginPath();
      ctx.ellipse(0, 14, 8, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2a2118";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.ellipse(-2, 12, 2.5, 1.4, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawWallPlant(x, y, t) {
    const sway = Math.sin(t * 1.6 + y) * 1.6;
    ctx.fillStyle = "#c56b3e";
    roundRect(x + 15, y + TILE - 18, 18, 9, 3);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = "#2f7a32";
    ctx.beginPath();
    ctx.ellipse(x + 24 + sway, y + 14, 11, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7dce6a";
    ctx.beginPath();
    ctx.ellipse(x + 15 + sway, y + 18, 8, 6, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1d4a22";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(x + 24 + sway, y + 14, 11, 8, -0.3, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawMenuBoard(x, y) {
    ctx.fillStyle = "#234232";
    roundRect(x + 7, y + 5, TILE - 14, TILE - 16, 3);
    ctx.fill();
    ctx.strokeStyle = "#e7d3a4";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#f4ead4";
    ctx.fillRect(x + 12, y + 11, TILE - 26, 2.5);
    ctx.fillRect(x + 12, y + 17, TILE - 30, 2.5);
    ctx.fillRect(x + 12, y + 23, TILE - 28, 2.5);
    ctx.fillStyle = "#f0b429";
    ctx.beginPath();
    ctx.arc(x + TILE - 14, y + 12, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTopDecor(c, x, y, t) {
    if (c % 2 === 0) {
      ctx.fillStyle = "rgba(180, 120, 80, 0.18)";
      roundRect(x + 14, y + 10, TILE - 28, TILE - 26, 2);
      ctx.fill();
      return;
    }
    const kind = c % 5;
    if (kind === 1) drawWindowTile(x, y, t);
    else if (kind === 3) drawShelf(x, y);
    else if (kind === 0) drawHangingPans(x, y, t);
    else if (kind === 2) drawWallPlant(x, y, t);
    else drawMenuBoard(x, y);
  }

  function drawWallTile(c, r, x, y, map, t) {
    const H = map.length;
    const W = map[0].length;
    const edge = r === 0 || r === H - 1 || c === 0 || c === W - 1;
    if (!edge) {
      drawCounterBlock(x, y, TILE, TILE);
      return;
    }
    const g = ctx.createLinearGradient(x, y, x, y + TILE);
    g.addColorStop(0, "#fbf4ea");
    g.addColorStop(0.62, "#f0d8be");
    g.addColorStop(1, "#d9b48e");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(x, y + 5, TILE, 3);
    if ((c + r) % 4 === 0) {
      ctx.fillStyle = "rgba(190, 140, 100, 0.13)";
      ctx.fillRect(x + 4, y + 12, 8, 14);
    }
    ctx.fillStyle = "#6b3d2c";
    ctx.fillRect(x, y + TILE - 8, TILE, 8);
    ctx.fillStyle = "#c48962";
    ctx.fillRect(x, y + TILE - 8, TILE, 2.5);
    if (r === 0) drawTopDecor(c, x, y, t);
    else if ((c === 0 || c === W - 1) && r % 3 === 1) {
      ctx.strokeStyle = "#6d584c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + TILE / 2, y + 16, 5, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = "#d7dde4";
      ctx.beginPath();
      ctx.arc(x + TILE / 2, y + 26, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3a2418";
      ctx.stroke();
    }
  }

  function drawBelt(x, y, t) {
    ctx.fillStyle = "#4a4038";
    roundRect(x + 2, y + 8, TILE - 4, TILE - 14, 4);
    ctx.fill();
    ctx.fillStyle = "#2e2926";
    ctx.fillRect(x + 4, y + 14, TILE - 8, TILE - 28);
    ctx.strokeStyle = "#f0b429";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    const shift = (t * 42) % 16;
    for (let i = -1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 8 + i * 16 + shift, y + 18);
      ctx.lineTo(x + 16 + i * 16 + shift, y + 26);
      ctx.lineTo(x + 8 + i * 16 + shift, y + 34);
      ctx.stroke();
    }
    ctx.fillStyle = "#6a5c50";
    ctx.fillRect(x + 2, y + 8, TILE - 4, 4);
    ctx.fillRect(x + 2, y + TILE - 12, TILE - 4, 4);
  }

  function drawGrease(x, y, t) {
    ctx.fillStyle = "rgba(48, 32, 16, 0.55)";
    ctx.beginPath();
    ctx.ellipse(x + 24, y + 28, 18, 11, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(90, 60, 24, 0.45)";
    ctx.beginPath();
    ctx.ellipse(x + 22, y + 27, 12, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(x + 16 + Math.sin(t * 2) * 4, y + 23, 5, 2, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRug(map) {
    const H = map.length;
    const W = map[0].length;
    const c = Math.floor(W / 2);
    const r = Math.floor(H / 2) + 1;
    if (!map[r] || map[r][c] !== "." || map[r][c - 1] !== ".") return;
    const x = (c - 0.15) * TILE;
    const y = (r + 0.55) * TILE;
    ctx.fillStyle = "#b94a3c";
    ctx.beginPath();
    ctx.ellipse(x, y, TILE * 0.9, TILE * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f3d7a4";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = "rgba(90, 24, 18, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y, TILE * 0.62, TILE * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawFloorPlant(x, y, t) {
    const sway = Math.sin(t * 1.5 + x) * 2;
    softShadow(x, y + 22, 16, 5);
    ctx.fillStyle = "#c56b3e";
    roundRect(x - 11, y + 8, 22, 14, 4);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#2f7a32";
    ctx.beginPath();
    ctx.ellipse(x + sway, y - 4, 16, 14, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8ed36a";
    ctx.beginPath();
    ctx.ellipse(x - 8 + sway, y, 10, 8, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1d4a22";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(x + sway, y - 4, 16, 14, -0.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawSack(x, y) {
    softShadow(x, y + 20, 16, 5);
    ctx.fillStyle = "#e7d3b0";
    roundRect(x - 14, y - 8, 28, 28, 8);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 8);
    ctx.quadraticCurveTo(x, y - 16, x + 6, y - 8);
    ctx.stroke();
    ctx.save();
    ctx.fillStyle = "#6b3a2a";
    ctx.font = "700 11px Jua, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("쌀", x, y + 6);
    ctx.restore();
  }

  function drawBench(x, y) {
    softShadow(x, y + 16, 28, 5);
    ctx.fillStyle = "#8d5a32";
    roundRect(x - 26, y, 52, 8, 3);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillRect(x - 20, y + 8, 5, 12);
    ctx.fillRect(x + 15, y + 8, 5, 12);
  }

  function drawBasket(x, y) {
    softShadow(x, y + 16, 16, 5);
    ctx.fillStyle = "#c9844a";
    roundRect(x - 14, y - 4, 28, 18, 6);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "#8d4e2c";
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 4);
    ctx.quadraticCurveTo(x, y - 14, x + 8, y - 4);
    ctx.stroke();
    drawItem({ kind: "ing", id: "pepper", chopped: false }, x - 6, y + 4, 6);
    drawItem({ kind: "ing", id: "egg", chopped: false }, x + 6, y + 3, 6);
  }

  function drawMargins(t) {
    const mapW = state.map[0].length * TILE;
    const mapH = state.map.length * TILE;
    ctx.fillStyle = "#6b3d2c";
    ctx.fillRect(-420, TILE - 8, mapW + 840, 8);
    ctx.fillStyle = "#c48962";
    ctx.fillRect(-420, TILE - 8, mapW + 840, 2.5);
    drawWindowTile(-TILE * 1.15, 0, t);
    drawShelf(mapW + TILE * 0.2, 0);
    drawWallPlant(-TILE * 2.3, 0, t);
    drawHangingPans(mapW + TILE * 1.35, 0, t);
    drawFloorPlant(-48, mapH * 0.34, t);
    drawSack(-78, mapH * 0.52);
    drawBench(-130, mapH * 0.72);
    drawBasket(-150, mapH * 0.28);
    drawFloorPlant(mapW + 52, mapH * 0.3, t + 1);
    drawSack(mapW + 86, mapH * 0.55);
    drawBench(mapW + 140, mapH * 0.74);
    drawBasket(mapW + 48, mapH * 0.68);
  }

  function drawMap(t) {
    const map = state.map;
    for (let r = 0; r < map.length; r++) {
      for (let c = 0; c < map[r].length; c++) {
        const ch = map[r][c];
        const x = c * TILE;
        const y = r * TILE;
        if (ch === "#") drawWallTile(c, r, x, y, map, t);
        else if (ch === ">") drawBelt(x, y, t);
        else if (ch === "~") drawGrease(x, y, t);
      }
    }
    drawRug(map);
    drawMargins(t);
  }

  function paintIng(id, s) {
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1.5, s * 0.14);
    ctx.strokeStyle = "#3a2418";
    if (id === "rice") {
      ctx.fillStyle = "#fffaf2";
      ctx.beginPath();
      ctx.moveTo(-s, -s * 0.15);
      ctx.quadraticCurveTo(-s * 1.05, s, 0, s);
      ctx.quadraticCurveTo(s * 1.05, s, s, -s * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f0e0c0";
      [[-0.35, 0.05], [0.05, 0.2], [0.4, 0.02], [-0.1, -0.15], [0.25, 0.45]].forEach(function (p) {
        ctx.beginPath();
        ctx.ellipse(p[0] * s, p[1] * s, s * 0.16, s * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (id === "sprout") {
      ctx.strokeStyle = "#2c6b30";
      ctx.lineWidth = Math.max(1.6, s * 0.16);
      ctx.beginPath();
      ctx.moveTo(0, s * 0.8);
      ctx.lineTo(0, -s * 0.1);
      ctx.stroke();
      ctx.fillStyle = "#7dce6a";
      ctx.beginPath();
      ctx.ellipse(-s * 0.4, -s * 0.25, s * 0.48, s * 0.28, -0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#245c28";
      ctx.stroke();
      ctx.fillStyle = "#c6ee8a";
      ctx.beginPath();
      ctx.ellipse(s * 0.38, -s * 0.35, s * 0.42, s * 0.24, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (id === "tofu") {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85);
      ctx.lineTo(s * 0.9, -s * 0.35);
      ctx.lineTo(0, s * 0.15);
      ctx.lineTo(-s * 0.9, -s * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f4efe6";
      ctx.beginPath();
      ctx.moveTo(-s * 0.9, -s * 0.35);
      ctx.lineTo(0, s * 0.15);
      ctx.lineTo(0, s * 0.9);
      ctx.lineTo(-s * 0.9, s * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e6d5bf";
      ctx.beginPath();
      ctx.moveTo(s * 0.9, -s * 0.35);
      ctx.lineTo(0, s * 0.15);
      ctx.lineTo(0, s * 0.9);
      ctx.lineTo(s * 0.9, s * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (id === "egg") {
      const g = ctx.createRadialGradient(-s * 0.3, -s * 0.4, 1, 0, 0, s);
      g.addColorStop(0, "#fff");
      g.addColorStop(1, "#f3d56a");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.72, s * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f0b429";
      ctx.beginPath();
      ctx.ellipse(0, s * 0.08, s * 0.28, s * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === "seaweed") {
      ctx.fillStyle = "#1f6b45";
      roundRect(-s, -s * 0.55, s * 2, s * 1.1, 3);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, -s * 0.1);
      ctx.quadraticCurveTo(0, s * 0.25, s * 0.7, -s * 0.15);
      ctx.stroke();
    } else if (id === "pepper") {
      ctx.fillStyle = "#ef3b3b";
      ctx.beginPath();
      ctx.moveTo(-s * 0.1, -s * 0.2);
      ctx.bezierCurveTo(-s * 1.1, s * 0.1, -s * 0.7, s, s * 0.15, s * 0.85);
      ctx.bezierCurveTo(s * 0.9, s * 0.4, s * 0.7, -s * 0.2, s * 0.1, -s * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#8d1a1a";
      ctx.stroke();
      ctx.strokeStyle = "#2f7a32";
      ctx.lineWidth = Math.max(1.5, s * 0.14);
      ctx.beginPath();
      ctx.moveTo(s * 0.05, -s * 0.5);
      ctx.quadraticCurveTo(s * 0.4, -s * 0.9, s * 0.15, -s);
      ctx.stroke();
    } else if (id === "tteok") {
      ctx.fillStyle = "#ffd0dc";
      roundRect(-s, -s * 0.42, s * 2, s * 0.84, s * 0.4);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#e7a0b4";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * 0.42);
      ctx.lineTo(-s * 0.3, s * 0.42);
      ctx.moveTo(s * 0.35, -s * 0.42);
      ctx.lineTo(s * 0.35, s * 0.42);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function starShape(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const b = a + Math.PI / 5;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(b) * r * 0.42, y + Math.sin(b) * r * 0.42);
    }
    ctx.closePath();
  }

  function drawPlateFood(dish, s, perfect) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.38, s * 1.25, s * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e0d0c0";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.save();
    ctx.translate(0, -s * 0.12);
    ctx.lineWidth = Math.max(1.4, s * 0.12);
    ctx.strokeStyle = "#3a2418";
    if (dish === "kimbap") {
      ctx.fillStyle = "#1e6b45";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff6e4";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f0b429";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.13, 0, Math.PI * 2);
      ctx.fill();
    } else if (dish === "gyeran") {
      ctx.fillStyle = "#f6c445";
      roundRect(-s * 0.72, -s * 0.42, s * 1.44, s * 0.9, s * 0.18);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#c98416";
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.08);
      ctx.lineTo(s * 0.5, -s * 0.08);
      ctx.moveTo(-s * 0.5, s * 0.18);
      ctx.lineTo(s * 0.5, s * 0.18);
      ctx.stroke();
    } else if (dish === "dubu") {
      ctx.fillStyle = "#c47a3a";
      ctx.beginPath();
      ctx.ellipse(0, s * 0.12, s * 0.7, s * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      roundRect(-s * 0.48, -s * 0.32, s * 0.42, s * 0.42, 2);
      ctx.fill();
      ctx.stroke();
      roundRect(s * 0.02, -s * 0.12, s * 0.4, s * 0.4, 2);
      ctx.fill();
      ctx.stroke();
    } else if (dish === "kong") {
      ctx.fillStyle = "#f4ead2";
      ctx.beginPath();
      ctx.ellipse(0, s * 0.1, s * 0.7, s * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#7dce6a";
      ctx.beginPath();
      ctx.ellipse(-s * 0.2, -s * 0.25, s * 0.28, s * 0.16, -0.6, 0, Math.PI * 2);
      ctx.ellipse(s * 0.22, -s * 0.32, s * 0.26, s * 0.15, 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (dish === "tteok") {
      ctx.fillStyle = "#ef4b4b";
      roundRect(-s * 0.7, -s * 0.15, s * 0.7, s * 0.42, s * 0.2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ff7a6a";
      roundRect(-s * 0.1, -s * 0.4, s * 0.8, s * 0.42, s * 0.2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = "#ffb089";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (perfect) {
      ctx.fillStyle = "#f0b429";
      starShape(s * 0.85, -s * 0.55, s * 0.32);
      ctx.fill();
      ctx.strokeStyle = "#a86b12";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawItem(item, x, y, s) {
    if (!item) return;
    ctx.save();
    ctx.translate(x, y);
    if (item.kind === "burnt") {
      ctx.fillStyle = "#2a211c";
      ctx.beginPath();
      ctx.ellipse(0, 2, s * 1.15, s * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1a120e";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#ff6a2a";
      ctx.beginPath();
      ctx.ellipse(-s * 0.15, 0, s * 0.28, s * 0.14, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a2418";
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(-s * 0.4, s * 0.15, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (item.kind === "plated" || item.kind === "cooked") {
      drawPlateFood(item.dish, s, !!item.perfect);
    } else if (item.chopped) {
      ctx.save();
      ctx.translate(-s * 0.28, s * 0.06);
      paintIng(item.id, s * 0.78);
      ctx.restore();
      ctx.save();
      ctx.translate(s * 0.3, -s * 0.04);
      paintIng(item.id, s * 0.7);
      ctx.restore();
    } else {
      paintIng(item.id, s);
    }
    ctx.restore();
  }

  function drawLabel(text, x, y) {
    ctx.save();
    ctx.font = "700 12px Jua, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = Math.min(TILE - 10, ctx.measureText(text).width);
    const w = tw + 10;
    ctx.fillStyle = "#fff8ee";
    roundRect(x - w / 2, y - 8, w, 16, 5);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = "#3a2418";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawKnife(x, y, chopping) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.85);
    ctx.translate(0, chopping ? -3 : 0);
    ctx.fillStyle = "#e7edf2";
    roundRect(-2.2, -16, 4.4, 20, 1);
    ctx.fill();
    ctx.strokeStyle = "#8aa0b0";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#8d4a2a";
    roundRect(-3.2, 2, 6.4, 9, 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFlames(x, y, t, big) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const wob = Math.sin(t * 18 + i * 1.3) * 2.4;
      const h = (big ? 20 : 15) + Math.sin(t * 22 + i) * 3;
      const g = ctx.createLinearGradient(x, y, x, y - h);
      g.addColorStop(0, "#fff6c8");
      g.addColorStop(0.45, "#ff9a2a");
      g.addColorStop(1, "rgba(255, 50, 20, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 7 + i * 4, y);
      ctx.quadraticCurveTo(x - 4 + i * 4 + wob, y - h, x + i * 4, y);
      ctx.fill();
    }
  }

  function drawStations(t) {
    state.stations.forEach(function (st) {
      const x = st.c * TILE;
      const y = st.r * TILE;
      if (st.kind === "crate") {
        softShadow(x + TILE / 2, y + TILE - 3, 18, 5);
        const g = ctx.createLinearGradient(x, y + 20, x, y + TILE);
        g.addColorStop(0, "#e8b86a");
        g.addColorStop(1, "#b8743a");
        ctx.fillStyle = g;
        roundRect(x + 4, y + 18, TILE - 8, TILE - 22, 4);
        ctx.fill();
        ctx.strokeStyle = "#5c3418";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = "rgba(90, 48, 18, 0.45)";
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 28);
        ctx.lineTo(x + TILE - 8, y + 28);
        ctx.moveTo(x + 8, y + 36);
        ctx.lineTo(x + TILE - 8, y + 36);
        ctx.stroke();
        ctx.fillStyle = "#f3d092";
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 20);
        ctx.lineTo(x + TILE / 2, y + 8);
        ctx.lineTo(x + TILE - 8, y + 20);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#5c3418";
        ctx.stroke();
        drawItem({ kind: "ing", id: st.ing, chopped: false }, x + TILE / 2, y + 30, 13);
        drawLabel(Sim.ING[st.ing].name, x + TILE / 2, y + TILE - 10);
      } else if (st.kind === "board") {
        drawCounterBlock(x, y, TILE, TILE);
        ctx.fillStyle = "#c9844a";
        roundRect(x + 6, y + 16, TILE - 12, 22, 4);
        ctx.fill();
        ctx.fillStyle = "#e7b98a";
        roundRect(x + 9, y + 19, TILE - 18, 16, 3);
        ctx.fill();
        ctx.strokeStyle = "#6b3a22";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const chopping = state.chef.chopping && state.facingId === st.id;
        drawKnife(x + TILE - 12, y + 18, chopping);
        if (st.item) drawItem(st.item, x + TILE / 2 - 2, y + 28, 11);
      } else if (st.kind === "pot" || st.kind === "pan") {
        softShadow(x + TILE / 2, y + TILE - 3, 18, 5);
        ctx.fillStyle = "#2c2826";
        roundRect(x + 3, y + 20, TILE - 6, TILE - 26, 5);
        ctx.fill();
        ctx.fillStyle = "#3e3a36";
        roundRect(x + 5, y + 14, TILE - 10, 16, 4);
        ctx.fill();
        ctx.strokeStyle = "#1a1614";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 16, y + 22, 5, 0, Math.PI * 2);
        ctx.arc(x + TILE - 16, y + 22, 5, 0, Math.PI * 2);
        ctx.stroke();
        if (st.kind === "pot") {
          ctx.fillStyle = "#d5dee8";
          ctx.beginPath();
          ctx.ellipse(x + TILE / 2, y + 24, 15, 9, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#3a2418";
          ctx.lineWidth = 2;
          ctx.stroke();
          const soup = st.phase === "burnt" ? "#3a2a22" : st.recipe === "kong" ? "#e7d7b0" : "#c47a3a";
          ctx.fillStyle = soup;
          ctx.beginPath();
          ctx.ellipse(x + TILE / 2, y + 23, 10, 5.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#b7c2ce";
          roundRect(x + 14, y + 10, 8, 6, 2);
          ctx.fill();
          roundRect(x + TILE - 22, y + 10, 8, 6, 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "#2a2420";
          ctx.beginPath();
          ctx.ellipse(x + TILE / 2 - 2, y + 26, 15, 8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#1a1614";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "#8d4a2a";
          roundRect(x + TILE - 16, y + 23, 16, 5, 2);
          ctx.fill();
          ctx.strokeStyle = "#3a2418";
          ctx.stroke();
          if (st.phase === "cook" || st.phase === "perfect") {
            ctx.fillStyle = "#f6c445";
            ctx.beginPath();
            ctx.ellipse(x + TILE / 2 - 2, y + 25, 9, 4, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        st.ings.forEach(function (ing, i) {
          drawItem(ing, x + 16 + (i % 3) * 12, y + 24, 5);
        });
        const hot = st.phase === "cook" || st.phase === "perfect" || st.phase === "burnt";
        if (hot) {
          drawFlames(x + 18, y + 36, t, st.phase !== "cook");
          drawFlames(x + TILE - 18, y + 36, t, st.phase === "burnt");
        }
      } else if (st.kind === "plate") {
        drawCounterBlock(x, y, TILE, TILE);
        for (let i = 2; i >= 0; i--) {
          ctx.fillStyle = i === 0 ? "#fff" : "#f6efe6";
          ctx.beginPath();
          ctx.ellipse(x + TILE / 2, y + 30 - i * 3, 14, 5.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ddcfc0";
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        if (st.done) drawItem({ kind: "plated", dish: st.done, perfect: st.perfect }, x + TILE / 2, y + 18, 10);
        else {
          st.plateIngs.forEach(function (ing, i) {
            drawItem(ing, x + 14 + (i % 3) * 12, y + 24, 5.5);
          });
        }
      } else if (st.kind === "window") {
        softShadow(x + TILE / 2, y + TILE - 2, 18, 5);
        ctx.fillStyle = "#8d4e2c";
        roundRect(x + 2, y + 4, TILE - 4, TILE - 10, 6);
        ctx.fill();
        const glow = ctx.createLinearGradient(x, y, x, y + TILE);
        glow.addColorStop(0, "#fff6d4");
        glow.addColorStop(1, "#ffb15a");
        ctx.fillStyle = glow;
        roundRect(x + 7, y + 9, TILE - 14, TILE - 24, 4);
        ctx.fill();
        ctx.save();
        ctx.globalAlpha = 0.28 + Math.sin(t * 3) * 0.12;
        ctx.fillStyle = "#fff";
        ctx.fillRect(x + 10, y + 12, TILE - 20, 8);
        ctx.restore();
        ctx.save();
        ctx.fillStyle = "#6b3a22";
        ctx.font = "700 13px Jua, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("서빙", x + TILE / 2, y + 26);
        ctx.restore();
        ctx.fillStyle = "#f0b429";
        ctx.beginPath();
        ctx.arc(x + TILE - 12, y + 12, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#3a2418";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = "#f7e7d2";
        roundRect(x + 4, y + TILE - 16, TILE - 8, 8, 3);
        ctx.fill();
        ctx.strokeStyle = "#8d4e2c";
        ctx.stroke();
      } else if (st.kind === "trash") {
        drawCounterBlock(x, y, TILE, TILE);
        ctx.fillStyle = "#d7e9f4";
        ctx.beginPath();
        ctx.ellipse(x + TILE / 2, y + 30, 15, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#7eb8d6";
        ctx.beginPath();
        ctx.ellipse(x + TILE / 2, y + 30, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#e8eef3";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x + TILE / 2, y + 14);
        ctx.lineTo(x + TILE / 2, y + 24);
        ctx.quadraticCurveTo(x + TILE / 2 + 6, y + 24, x + TILE / 2 + 6, y + 28);
        ctx.stroke();
        ctx.fillStyle = "#f4f7fa";
        ctx.beginPath();
        ctx.arc(x + TILE / 2, y + 14, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#3a2418";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    });
  }

  function bar(x, y, w, p, color) {
    const h = 12;
    ctx.fillStyle = "rgba(255, 248, 239, 0.96)";
    roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (p > 0.02) {
      ctx.fillStyle = color;
      roundRect(x + 2, y + 2, Math.max(6, (w - 4) * Math.min(1, p)), h - 4, 4);
      ctx.fill();
    }
  }

  function drawSteam(x, y, t, amount) {
    for (let i = 0; i < 4; i++) {
      const f = (t * 0.55 + i * 0.23) % 1;
      ctx.globalAlpha = (1 - f) * 0.75 * amount;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(x + Math.sin(i * 2 + t * 2) * 8, y - f * 28, 3.5 + f * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSmoke(x, y, t) {
    for (let i = 0; i < 5; i++) {
      const f = (t * 0.4 + i * 0.18) % 1;
      ctx.globalAlpha = (1 - f) * 0.55;
      ctx.fillStyle = i % 2 ? "#6e6862" : "#b7b1aa";
      ctx.beginPath();
      ctx.arc(x + Math.sin(t * 2 + i) * 8, y - f * 34, 5 + f * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFire(x, y, t) {
    for (let i = 0; i < 4; i++) {
      const wob = Math.sin(t * 14 + i * 1.4) * 4;
      const h = 28 + (i % 2) * 8;
      const g = ctx.createLinearGradient(x, y + 8, x, y - h);
      g.addColorStop(0, "#fff1a8");
      g.addColorStop(0.4, "#ff6a2a");
      g.addColorStop(1, "rgba(180, 20, 0, 0)");
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 12 + i * 7 + wob, y + 8);
      ctx.quadraticCurveTo(x + wob, y - h, x + 10 + wob, y + 6);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawWarn(x, y, t, hot) {
    const bob = Math.sin(t * 8) * 3;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = hot ? "#ff3b30" : "#ffb703";
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(12, 9);
    ctx.lineTo(-12, 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillRect(-1.7, -5, 3.4, 7);
    ctx.beginPath();
    ctx.arc(0, 5, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawStationUI(t) {
    state.stations.forEach(function (st) {
      const x = st.c * TILE;
      const y = st.r * TILE;
      if (st.id === state.facingId) {
        ctx.save();
        const pulse = 0.85 + Math.sin(t * 5) * 0.15;
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = "#ffe08a";
        ctx.lineWidth = 4;
        ctx.shadowColor = "#ffe08a";
        ctx.shadowBlur = 14;
        roundRect(x + 1, y + 1, TILE - 2, TILE - 2, 8);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1.5;
        roundRect(x + 4, y + 4, TILE - 8, TILE - 8, 6);
        ctx.stroke();
        ctx.restore();
      }
      if (st.kind === "board" && st.item && !st.item.chopped) {
        bar(x + 4, y - 8, TILE - 8, st.chop, "#3cba6a");
      }
      if ((st.kind === "pot" || st.kind === "pan") && st.recipe && (st.phase === "cook" || st.phase === "perfect")) {
        const rec = Sim.RECIPES[st.recipe];
        const tm = Sim.timings(state, rec);
        const p = st.phase === "cook" ? st.timer / Math.max(0.01, tm.cook) : st.timer / Math.max(0.01, tm.perfect);
        bar(x + 4, y - 8, TILE - 8, Math.min(1, p), st.phase === "perfect" ? "#ffd56a" : "#ff8a3c");
        drawSteam(x + TILE / 2, y + 6, t, st.phase === "perfect" ? 1 : 0.75);
        if (st.phase === "perfect" && p > 0.55) drawWarn(x + TILE - 8, y - 24, t, false);
      }
      if (st.phase === "burnt") {
        drawSmoke(x + TILE / 2, y + 4, t);
        drawFire(x + TILE / 2, y + 18, t);
        drawWarn(x + TILE / 2, y - 22, t, true);
      }
    });
  }

  function drawChefBody(dir, t) {
    const side = dir === 1 || dir === 3;
    const look = side ? 1.4 : dir === 2 ? 0.15 : 0;
    const body = ctx.createRadialGradient(-4, -8, 2, 0, 2, 20);
    body.addColorStop(0, "#ffd5e0");
    body.addColorStop(0.55, "#ff8fb3");
    body.addColorStop(1, "#e25b86");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 1, 14, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fffaf3";
    roundRect(-9, 6, 18, 11, 5);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#ffb7c8";
    ctx.fillRect(-9, 9, 18, 3);
    ctx.fillStyle = "#f2c7a2";
    ctx.beginPath();
    ctx.ellipse(-15, 8, 4.4, 3.6, 0.3, 0, Math.PI * 2);
    ctx.ellipse(15, 8, 4.4, 3.6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = "#3a2418";
    roundRect(-12, 15, 9, 5, 2);
    ctx.fill();
    roundRect(3, 15, 9, 5, 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(-5, -2, 3.4, 3.8, 0, 0, Math.PI * 2);
    ctx.ellipse(5, -2, 3.4, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    const blink = Math.sin(t * 1.7) > 0.97;
    ctx.fillStyle = "#2a2118";
    if (blink) {
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-8, -2);
      ctx.lineTo(-2, -2);
      ctx.moveTo(2, -2);
      ctx.lineTo(8, -2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-5 + look, -1.6, 1.7, 0, Math.PI * 2);
      ctx.arc(5 + look, -1.6, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-4.4 + look, -2.2, 0.7, 0, Math.PI * 2);
      ctx.arc(5.6 + look, -2.2, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255, 120, 140, 0.7)";
    ctx.beginPath();
    ctx.ellipse(-8.5, 2.5, 2.6, 1.6, 0, 0, Math.PI * 2);
    ctx.ellipse(8.5, 2.5, 2.6, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c4476a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 3.2, 3.2, 0.15, Math.PI - 0.15);
    ctx.stroke();
    drawToque();
  }

  function drawToque() {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(-12, -11);
    ctx.lineTo(-12, -22);
    ctx.quadraticCurveTo(-13, -34, 0, -34);
    ctx.quadraticCurveTo(13, -34, 12, -22);
    ctx.lineTo(12, -11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#e25b2a";
    roundRect(-12, -16, 24, 5, 1);
    ctx.fill();
  }

  function drawChefBack() {
    ctx.fillStyle = "#ff8fb3";
    ctx.beginPath();
    ctx.ellipse(0, 1, 14, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fffaf3";
    roundRect(-9, -2, 18, 16, 6);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = "#ffb7c8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 12);
    ctx.stroke();
    ctx.fillStyle = "#3a2418";
    roundRect(-12, 14, 9, 5, 2);
    ctx.fill();
    roundRect(3, 14, 9, 5, 2);
    ctx.fill();
    drawToque();
  }

  function drawChef(t) {
    const chef = state.chef;
    const moving = Math.hypot(chef.vx, chef.vy) > 18;
    const step = Math.sin((mode === "play" ? chef.phase : t * 3) * 2);
    const bob = moving ? Math.abs(step) * -6 : Math.sin(t * 2.3) * 1.8;
    const sx = (moving ? 1 + Math.abs(step) * 0.1 : 1 + Math.sin(t * 2) * 0.02);
    const sy = (moving ? 1 - Math.abs(step) * 0.12 : 1 - Math.sin(t * 2) * 0.02);
    const dir = chef.dir;
    const left = dir === 3;
    const SCALE = 1.46;
    ctx.save();
    ctx.translate(chef.x, chef.y + 20);
    ctx.fillStyle = "rgba(62, 30, 14, 0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 16 * sx, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(chef.x, chef.y + bob);
    ctx.scale((left ? -1 : 1) * sx * SCALE, sy * SCALE);
    if (dir === 1 || dir === 3) ctx.scale(0.9, 1);
    if (moving) ctx.translate(0, Math.abs(step) * 1.2);
    if (dir === 0) drawChefBack();
    else drawChefBody(dir, t);
    ctx.restore();

    if (chef.hold) {
      const hx = chef.x + (dir === 3 ? -24 : 24);
      const hy = chef.y + bob - 34;
      ctx.save();
      ctx.fillStyle = "rgba(255, 250, 242, 0.95)";
      ctx.beginPath();
      ctx.arc(hx, hy, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = "#3a2418";
      ctx.stroke();
      drawItem(chef.hold, hx, hy, 13);
      ctx.restore();
    }
  }

  function drawFxParticle(p) {
    if (p.kind === "coin") {
      ctx.fillStyle = "#f0b429";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#a86b12";
      ctx.stroke();
      ctx.fillStyle = "#fff6d0";
      ctx.font = "700 " + Math.max(8, Math.round(p.size * 1.3)) + "px Jua, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("₩", p.x, p.y + 0.4);
      return;
    }
    if (p.kind === "smoke") {
      ctx.fillStyle = "rgba(90, 84, 78, 0.5)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLighting(camX, camY, viewW, viewH) {
    const mapW = state.map[0].length * TILE;
    const mapH = state.map.length * TILE;
    const light = ctx.createRadialGradient(mapW * 0.32, TILE * 0.4, 18, mapW * 0.45, mapH * 0.4, mapW * 0.7);
    light.addColorStop(0, "rgba(255, 236, 196, 0.32)");
    light.addColorStop(0.5, "rgba(255, 210, 150, 0.06)");
    light.addColorStop(1, "rgba(80, 30, 12, 0)");
    ctx.fillStyle = light;
    ctx.fillRect(camX - 8, camY - 8, viewW + 16, viewH + 16);
    const vig = ctx.createRadialGradient(camX + viewW / 2, camY + viewH * 0.45, Math.min(viewW, viewH) * 0.2, camX + viewW / 2, camY + viewH * 0.5, Math.max(viewW, viewH) * 0.68);
    vig.addColorStop(0, "rgba(40, 16, 8, 0)");
    vig.addColorStop(1, "rgba(42, 16, 8, 0.42)");
    ctx.fillStyle = vig;
    ctx.fillRect(camX - 12, camY - 12, viewW + 24, viewH + 24);
  }

  function render() {
    if (!state) return;
    resize();
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mapW = state.map[0].length * TILE;
    const mapH = state.map.length * TILE;
    const viewCssW = Math.max(rect.width, 2);
    const viewCssH = Math.max(rect.height, 2);
    const follow = (mode === "play" || mode === "pause") && viewCssH > viewCssW * 1.05;
    let scale;
    let camX;
    let camY;
    if (follow) {
      scale = viewCssH / mapH;
      const seenW = viewCssW / scale;
      const look = state.chef.dir === 1 ? TILE * 0.7 : state.chef.dir === 3 ? -TILE * 0.7 : 0;
      let target = state.chef.x + look - seenW / 2;
      if (seenW >= mapW) target = (mapW - seenW) / 2;
      else target = Math.max(0, Math.min(mapW - seenW, target));
      if (camXSmooth == null) camXSmooth = target;
      else camXSmooth += (target - camXSmooth) * 0.14;
      camX = camXSmooth;
      camY = 0;
    } else {
      scale = Math.min(viewCssW / mapW, viewCssH / mapH);
      camX = (mapW - viewCssW / scale) / 2;
      camY = (mapH - viewCssH / scale) / 2;
      camXSmooth = null;
    }
    if (!isFinite(scale) || scale <= 0) scale = 1;
    const viewW = viewCssW / scale;
    const viewH = viewCssH / scale;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * -camX * scale, dpr * -camY * scale);
    const t = performance.now() / 1000;
    drawBackdrop(camX, camY, viewW, viewH);
    ctx.save();
    if (state.wobble > 0.04 && mode === "play") {
      const mag = state.wobble * 5;
      ctx.translate(Math.sin(t * 40) * mag, Math.cos(t * 36) * mag);
    }
    drawMap(t);
    drawStations(t);
    if (mode !== "play") {
      const pot = state.stations.find(function (s) { return s.kind === "pot" || s.kind === "pan"; });
      if (pot) drawSteam(pot.x, pot.y - 10, t, 0.8);
    }
    particles.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      drawFxParticle(p);
    });
    ctx.globalAlpha = 1;
    drawChef(t);
    floaters.forEach(function (f) {
      const fade = Math.max(0, f.life / (f.max || 1));
      ctx.globalAlpha = Math.min(1, fade * 1.3);
      ctx.font = "700 22px Jua, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#3a2418";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
    drawStationUI(t);
    drawLighting(camX, camY, viewW, viewH);
    ctx.restore();
    if (mode === "play" || mode === "pause") updateHud();
  }

  function frame(dt) {
    if (mode === "play" && !paused && !externalDrive) {
      const input = liveBot ? Bot.update(liveBot.bot, state, dt) : sampleInput();
      playTick(input, dt);
      if (liveBot) {
        liveAcc += dt;
        if (liveAcc >= liveLimit || state.phase !== "play") liveBot = null;
      }
    }
    const now = performance.now() / 1000;
    particles.forEach(function (p) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "smoke") {
        p.vy -= 18 * dt;
        p.size += 16 * dt;
      } else {
        p.vy += 90 * dt;
      }
    });
    particles = particles.filter(function (p) { return p.life > 0; });
    floaters.forEach(function (f) { f.life -= dt; f.y -= 26 * dt; });
    floaters = floaters.filter(function (f) { return f.life > 0; });
    if (state && state.wobble > 0.02) {
      stage.style.transform = "translate(" + (Math.sin(now * 42) * state.wobble * 5).toFixed(2) + "px, 0)";
    } else stage.style.transform = "";
    render();
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt || 0);
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", function (e) {
    if (e.repeat) return;
    const code = e.code.toLowerCase();
    if (["space", "arrowup", "arrowdown", "arrowleft", "arrowright"].indexOf(code) >= 0) e.preventDefault();
    keys.add(code);
    if (code === "escape" && mode === "play") {
      paused = true;
      setMode("pause");
    }
  });
  window.addEventListener("keyup", function (e) {
    keys.delete(e.code.toLowerCase());
  });
  window.addEventListener("blur", function () {
    keys.clear();
    actHeld = false;
    joy.x = 0;
    joy.y = 0;
    if (mode === "play") {
      paused = true;
      setMode("pause");
    }
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && mode === "play") {
      paused = true;
      setMode("pause");
    }
  });

  document.getElementById("mute").addEventListener("click", function () {
    muted = !muted;
    playMuteIcon();
    try { localStorage.setItem("simsim-bean-chef-mute", muted ? "1" : "0"); } catch (err) { /* ignore */ }
  });
  document.getElementById("btn-resume").addEventListener("click", function () {
    if (mode !== "pause") return;
    paused = false;
    last = performance.now();
    setMode("play");
  });
  document.getElementById("btn-retry").addEventListener("click", function () { startDay(currentDay); });
  document.getElementById("btn-next").addEventListener("click", function () { startDay(Math.min(4, currentDay + 1)); });
  document.getElementById("btn-days").addEventListener("click", function () {
    state = Sim.create(1, 1);
    document.getElementById("chrome-title").textContent = "콩셰프 키친";
    setMode("title");
  });

  function joyVector(e) {
    const rect = stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = rect.width * 0.34;
    const mag = Math.hypot(dx, dy) || 1;
    const cl = Math.min(max, mag);
    dx = (dx / mag) * cl;
    dy = (dy / mag) * cl;
    nub.style.transform = "translate(" + dx + "px," + dy + "px)";
    joy.x = dx / max;
    joy.y = dy / max;
  }
  stick.addEventListener("pointerdown", function (e) {
    stick.setPointerCapture(e.pointerId);
    stickId = e.pointerId;
    joyVector(e);
    e.preventDefault();
  });
  stick.addEventListener("pointermove", function (e) {
    if (e.pointerId !== stickId) return;
    joyVector(e);
  });
  function endStick(e) {
    if (e.pointerId !== stickId) return;
    stickId = null;
    joy.x = 0;
    joy.y = 0;
    nub.style.transform = "translate(0,0)";
  }
  stick.addEventListener("pointerup", endStick);
  stick.addEventListener("pointercancel", endStick);
  actBtn.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    actBtn.setPointerCapture(e.pointerId);
    actHeld = true;
    actBtn.classList.add("down");
    ensureAudio();
  });
  function endAct(e) {
    actHeld = false;
    actBtn.classList.remove("down");
  }
  actBtn.addEventListener("pointerup", endAct);
  actBtn.addEventListener("pointercancel", endAct);
  window.addEventListener("pointerdown", function () { ensureAudio(); }, { once: true });
  window.addEventListener("resize", resize);
  syncTouch();
  window.matchMedia("(pointer: coarse)").addEventListener("change", syncTouch);

  state = Sim.create(1, 1);
  playMuteIcon();
  setMode("title");
  requestAnimationFrame(loop);

  window.BeanChef = {
    startDay: startDay,
    getState: function () { return state; },
    sampleInput: sampleInput,
    pump: function (seconds) {
      const dt = 1 / 60;
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n; i++) {
        if (paused || mode !== "play") break;
        playTick(sampleInput(), dt);
      }
      render();
    },
    frame: frame,
    tick: function (input, dt) {
      playTick(input, dt);
      render();
    },
    drive: function (on) { externalDrive = !!on; },
    runBot: function (opts) {
      const seed = (opts.seed || 1) >>> 0;
      state = Sim.create(opts.day, seed);
      currentDay = opts.day;
      const bot = Bot.create(opts.profile, seed);
      const dt = 1 / 60;
      let n = 0;
      while (state.phase === "play" && n < 60000) {
        Sim.step(state, Bot.update(bot, state, dt), dt);
        n++;
      }
      const metrics = Sim.metrics(state);
      metrics.profile = opts.profile;
      metrics.seed = seed;
      metrics.freakouts = bot.freakouts;
      metrics.steps = n;
      if (opts.present) {
        const improved = persist(metrics);
        showResult(metrics, improved);
        setMode("result");
        render();
      }
      return metrics;
    },
    watchBot: function (opts) {
      startDay(opts.day, opts.seed || 1);
      liveBot = { bot: Bot.create(opts.profile || "good", opts.seed || 1) };
      liveAcc = 0;
      liveLimit = opts.seconds || 40;
      return new Promise(function (resolve) {
        const timer = setInterval(function () {
          if (!liveBot) {
            clearInterval(timer);
            resolve(Sim.metrics(state));
          }
        }, 200);
      });
    },
    metrics: function () { return state ? Sim.metrics(state) : null; },
    isPaused: function () { return paused || mode === "pause"; },
  };
})();
