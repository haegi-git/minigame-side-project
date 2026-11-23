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

  function floater(x, y, text, color) {
    floaters.push({ x: x, y: y, text: text, color: color || "#fff6df", life: 0.9 });
  }

  function shout(text, kind) {
    banner.textContent = text;
    banner.className = "show " + (kind || "");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { banner.className = ""; }, 850);
  }

  function onEvent(e) {
    if (e.type === "serve") {
      tone(e.perfect ? 880 : 660, 0.12, "triangle", 0.08);
      tone(e.perfect ? 1320 : 880, 0.18, "sine", 0.06);
      burst(e.x, e.y, "#ffd56a", 14);
      floater(e.x, e.y - 20, e.text, e.perfect ? "#ffe38a" : "#fff");
      shout(e.perfect ? "완벽!" : e.name, e.perfect ? "perfect" : "");
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (err) { /* ignore */ }
    } else if (e.type === "burn") {
      tone(140, 0.3, "sawtooth", 0.05, 70);
      shout("탔어요!", "bad");
      burst(e.x, e.y, "#ff6a3d", 16);
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
    paused = false;
    liveBot = null;
    document.getElementById("chrome-title").textContent = Sim.DAYS[day - 1].name;
    setMode("play");
    shout(day + "일차 · " + Sim.DAYS[day - 1].name, "");
    last = performance.now();
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
          return "<i class='pip " + ing.id + (ing.chop ? " chop" : "") + "'></i>";
        }).join("");
        node.innerHTML = "<header><b>" + rec.name + "</b></header><div class='pips'>" + pips + "</div><div class='bar'><i></i></div>";
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

  function drawMap(t) {
    const map = state.map;
    for (let r = 0; r < map.length; r++) {
      for (let c = 0; c < map[r].length; c++) {
        const ch = map[r][c];
        const x = c * TILE;
        const y = r * TILE;
        if (ch === "#") {
          const g = ctx.createLinearGradient(x, y, x, y + TILE);
          g.addColorStop(0, "#a86b45");
          g.addColorStop(0.45, "#dfb07a");
          g.addColorStop(1, "#7a4630");
          ctx.fillStyle = g;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = "rgba(255, 230, 190, 0.28)";
          ctx.fillRect(x + 4, y + 8, TILE - 8, 3);
          continue;
        }
        ctx.fillStyle = "#c9895c";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = (c + r) % 2 === 0 ? "#f6d3a4" : "#efc48e";
        roundRect(x + 2, y + 2, TILE - 4, TILE - 4, 7);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(x + 8, y + 7, 12, 3);
        if (ch === ">") {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x + 3, y + 3, TILE - 6, TILE - 6);
          ctx.clip();
          ctx.fillStyle = "rgba(70, 48, 32, 0.28)";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = "rgba(255, 214, 120, 0.85)";
          ctx.lineWidth = 3;
          const shift = (t * 46) % 16;
          for (let i = -1; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * 16 + shift, y + 10);
            ctx.lineTo(x + i * 16 + 8 + shift, y + 24);
            ctx.lineTo(x + i * 16 + shift, y + 38);
            ctx.stroke();
          }
          ctx.restore();
        }
        if (ch === "~") {
          ctx.fillStyle = "rgba(42, 28, 16, 0.45)";
          ctx.beginPath();
          ctx.ellipse(x + 24, y + 28, 18, 11, -0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.beginPath();
          ctx.ellipse(x + 16 + Math.sin(t + c) * 4, y + 22, 6, 2.2, 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawItem(item, x, y, s) {
    if (!item) return;
    if (item.kind === "burnt") {
      ctx.fillStyle = "#3a2418";
      roundRect(x - s, y - s * 0.6, s * 2, s * 1.2, 6);
      ctx.fill();
      return;
    }
    if (item.kind === "plated" || item.kind === "cooked") {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(x, y + 2, s * 1.15, s * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e7d3bc";
      ctx.stroke();
      const palette = { kimbap: "#2f6b52", gyeran: "#f0b429", dubu: "#e7d3b0", kong: "#d7e7a4", tteok: "#ef4b4b" };
      ctx.fillStyle = palette[item.dish] || "#ffb089";
      ctx.beginPath();
      ctx.arc(x, y - 2, s * 0.55, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const cols = ING_COLOR[item.id] || ["#fff", "#ccc"];
    const g = ctx.createRadialGradient(x - 2, y - 3, 1, x, y, s);
    g.addColorStop(0, cols[0]);
    g.addColorStop(1, cols[1]);
    ctx.fillStyle = g;
    ctx.beginPath();
    if (item.id === "seaweed") roundRect(x - s, y - s * 0.55, s * 2, s, 3);
    else if (item.id === "tteok") roundRect(x - s, y - s * 0.45, s * 2, s * 0.9, s);
    else ctx.ellipse(x, y, s * 0.85, item.id === "egg" ? s * 1.05 : s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(58,36,24,0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (item.chopped) {
      ctx.strokeStyle = "rgba(58,36,24,0.7)";
      ctx.beginPath();
      ctx.moveTo(x - s * 0.6, y);
      ctx.lineTo(x + s * 0.6, y);
      ctx.moveTo(x, y - s * 0.45);
      ctx.lineTo(x, y + s * 0.45);
      ctx.stroke();
    }
  }

  function drawStations(t) {
    state.stations.forEach(function (st) {
      const x = st.c * TILE;
      const y = st.r * TILE;
      ctx.fillStyle = "rgba(70, 32, 16, 0.18)";
      ctx.beginPath();
      ctx.ellipse(x + TILE / 2, y + TILE - 6, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      if (st.kind === "crate") {
        const g = ctx.createLinearGradient(x, y, x, y + TILE);
        g.addColorStop(0, "#e7b27a");
        g.addColorStop(1, "#a86a3c");
        ctx.fillStyle = g;
        roundRect(x + 6, y + 10, TILE - 12, TILE - 16, 6);
        ctx.fill();
        ctx.strokeStyle = "#3a2418";
        ctx.lineWidth = 2;
        ctx.stroke();
        drawItem({ kind: "ing", id: st.ing, chopped: false }, x + TILE / 2, y + 18, 8);
      } else if (st.kind === "board") {
        ctx.fillStyle = "#c9844a";
        roundRect(x + 6, y + 14, TILE - 12, TILE - 22, 8);
        ctx.fill();
        ctx.fillStyle = "#f0c08a";
        roundRect(x + 10, y + 18, TILE - 20, TILE - 30, 6);
        ctx.fill();
        if (st.item) drawItem(st.item, x + TILE / 2, y + TILE / 2, 9);
        if (st.item && !st.item.chopped) bar(x + 8, y + 6, TILE - 16, st.chop, "#7dce7a");
      } else if (st.kind === "pot" || st.kind === "pan") {
        ctx.fillStyle = "#5a4036";
        roundRect(x + 4, y + 16, TILE - 8, TILE - 20, 8);
        ctx.fill();
        if (st.phase === "cook" || st.phase === "perfect") {
          const glow = ctx.createRadialGradient(x + TILE / 2, y + TILE / 2, 2, x + TILE / 2, y + TILE / 2, 22);
          glow.addColorStop(0, st.phase === "perfect" ? "rgba(255,210,80,0.9)" : "rgba(255,120,40,0.8)");
          glow.addColorStop(1, "rgba(255,80,20,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x + TILE / 2, y + 30, 18, 0, Math.PI * 2);
          ctx.fill();
        }
        if (st.kind === "pot") {
          ctx.fillStyle = "#d7dde6";
          roundRect(x + 12, y + 12, TILE - 24, 22, 8);
          ctx.fill();
          ctx.fillStyle = "#8d97a6";
          ctx.fillRect(x + 20, y + 8, TILE - 40, 8);
        } else {
          ctx.fillStyle = "#2a2118";
          ctx.beginPath();
          ctx.ellipse(x + TILE / 2, y + 28, 16, 8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#6a4030";
          ctx.fillRect(x + TILE - 14, y + 24, 12, 4);
        }
        st.ings.forEach(function (ing, i) {
          drawItem(ing, x + 16 + i * 14, y + 30, 5);
        });
        if (st.phase === "cook" || st.phase === "perfect") {
          const rec = Sim.RECIPES[st.recipe];
          const tm = Sim.timings(state, rec);
          const p = st.phase === "cook" ? st.timer / tm.cook : st.timer / tm.perfect;
          bar(x + 8, y + 4, TILE - 16, Math.min(1, p), st.phase === "perfect" ? "#ffd56a" : "#ff8a5b");
          drawSteam(x + TILE / 2, y + 8, t, st.phase === "perfect" ? 1 : 0.7);
        }
        if (st.phase === "burnt") drawFire(x + TILE / 2, y + 20, t);
      } else if (st.kind === "plate") {
        ctx.fillStyle = "#f4efe8";
        roundRect(x + 6, y + 18, TILE - 12, TILE - 26, 10);
        ctx.fill();
        ctx.strokeStyle = "#d9cbb8";
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(x + TILE / 2, y + 28, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        if (st.done) drawItem({ kind: "plated", dish: st.done, perfect: st.perfect }, x + TILE / 2, y + 24, 8);
        st.plateIngs.forEach(function (ing, i) {
          drawItem(ing, x + 14 + (i % 3) * 12, y + 22 + Math.floor(i / 3) * 10, 5);
        });
      } else if (st.kind === "window") {
        const g = ctx.createLinearGradient(x, y, x, y + TILE);
        g.addColorStop(0, "#ffd7a8");
        g.addColorStop(1, "#e07a45");
        ctx.fillStyle = g;
        roundRect(x + 4, y + 6, TILE - 8, TILE - 12, 8);
        ctx.fill();
        ctx.fillStyle = "rgba(255,248,230,0.55)";
        roundRect(x + 10, y + 12, TILE - 20, 16, 4);
        ctx.fill();
      } else if (st.kind === "trash") {
        ctx.fillStyle = "#9bb7c9";
        roundRect(x + 8, y + 14, TILE - 16, TILE - 22, 8);
        ctx.fill();
        ctx.fillStyle = "#d5e4ee";
        ctx.fillRect(x + 12, y + 18, TILE - 24, 6);
        ctx.fillStyle = "#6d7c88";
        roundRect(x + 16, y + 28, TILE - 32, 12, 3);
        ctx.fill();
      }
      if (st.id === state.facingId) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 214, 90, 0.95)";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#ffe08a";
        ctx.shadowBlur = 12;
        roundRect(x + 3, y + 3, TILE - 6, TILE - 6, 10);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  function bar(x, y, w, p, color) {
    ctx.fillStyle = "rgba(255,248,239,0.85)";
    roundRect(x, y, w, 7, 4);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(x, y, Math.max(0, w * p), 7, 4);
    ctx.fill();
  }

  function drawSteam(x, y, t, amount) {
    for (let i = 0; i < 4; i++) {
      const f = (t * 0.6 + i * 0.22) % 1;
      ctx.globalAlpha = (1 - f) * 0.8 * amount;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(x + Math.sin(i * 2 + t * 2) * 8, y - 6 - f * 42, 4 + f * 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFire(x, y, t) {
    for (let i = 0; i < 6; i++) {
      const f = (t * 1.5 + i * 0.16) % 1;
      ctx.globalAlpha = 0.42 * (1 - f);
      ctx.fillStyle = i % 2 ? "#ffe0b0" : "#d5d8dc";
      ctx.beginPath();
      ctx.arc(x - 14 + i * 5, y - 18 - f * 46, 6 + f * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 4; i++) {
      const wob = Math.sin(t * 14 + i * 1.4) * 5;
      const h = 34 + (i % 2) * 10;
      const g = ctx.createLinearGradient(x, y + 12, x, y - h);
      g.addColorStop(0, "#fff1a8");
      g.addColorStop(0.35, "#ff6a2a");
      g.addColorStop(1, "rgba(180, 20, 0, 0)");
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 14 + i * 7 + wob, y + 12);
      ctx.quadraticCurveTo(x + wob, y - h, x + 12 + wob, y + 8);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawChef(t) {
    const chef = state.chef;
    const moving = Math.hypot(chef.vx, chef.vy) > 22;
    const walk = Math.sin((mode === "play" ? chef.phase : t * 3) * 2);
    const bob = moving ? Math.abs(walk) * -3 : Math.sin(t * 2.4) * 1.4;
    const sx = moving ? 1 + Math.abs(walk) * 0.08 : 1 + Math.sin(t * 2) * 0.02;
    const sy = moving ? 1 - Math.abs(walk) * 0.1 : 1 - Math.sin(t * 2) * 0.02;
    const left = chef.dir === 3;
    ctx.save();
    ctx.translate(chef.x, chef.y + 16 + bob * 0.2);
    ctx.fillStyle = "rgba(70, 36, 20, 0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 15 * sx, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(chef.x, chef.y + bob);
    ctx.scale((left ? -1 : 1) * sx, sy);
    ctx.fillStyle = "#f2c7a2";
    ctx.beginPath();
    ctx.ellipse(-7, 8, 4.5, 3.2, 0, 0, Math.PI * 2);
    ctx.ellipse(7, 8, 4.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    const body = ctx.createRadialGradient(-4, -6, 2, 0, 0, 18);
    body.addColorStop(0, "#ffd5e0");
    body.addColorStop(0.55, "#ff8fb3");
    body.addColorStop(1, "#e25b86");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fffaf3";
    roundRect(-8, 2, 16, 12, 5);
    ctx.fill();
    ctx.fillStyle = "#ffb7c8";
    ctx.fillRect(-8, 6, 16, 3);
    const arm = Math.sin(chef.phase * 2) * (moving ? 0.5 : 0.1);
    ctx.strokeStyle = "#f2b3c4";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-10, 1);
    ctx.quadraticCurveTo(-16, 6 + arm * 6, -12, 12);
    ctx.moveTo(10, 1);
    ctx.quadraticCurveTo(16, 6 - arm * 6, 12, 12);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(-4.5, -3, 3.1, 3.6, 0, 0, Math.PI * 2);
    ctx.ellipse(4.5, -3, 3.1, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    const look = chef.dir === 1 ? 1.1 : chef.dir === 0 ? 0 : 0.4;
    ctx.fillStyle = "#2a2118";
    ctx.beginPath();
    ctx.arc(-4.5 + look, -3, 1.5, 0, Math.PI * 2);
    ctx.arc(4.5 + look, -3, 1.5, 0, Math.PI * 2);
    ctx.fill();
    if (Math.sin(t * 1.7) > 0.97) {
      ctx.strokeStyle = "#2a2118";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-7, -3);
      ctx.lineTo(-2, -3);
      ctx.moveTo(2, -3);
      ctx.lineTo(7, -3);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255, 120, 140, 0.55)";
    ctx.beginPath();
    ctx.ellipse(-8, 1, 2.4, 1.5, 0, 0, Math.PI * 2);
    ctx.ellipse(8, 1, 2.4, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c4476a";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, 3, 3.2, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    roundRect(-11, -22, 22, 12, 7);
    ctx.fill();
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = "#e25b2a";
    ctx.fillRect(-11, -12, 22, 3);
    ctx.restore();
    if (chef.hold) drawItem(chef.hold, chef.x + (left ? -12 : 12), chef.y + bob - 2, 8);
  }

  function render() {
    if (!state) return;
    resize();
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mapW = state.map[0].length * TILE;
    const mapH = state.map.length * TILE;
    const scale = Math.min(rect.width / mapW, rect.height / mapH);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (rect.width - mapW * scale) / 2, dpr * (rect.height - mapH * scale) / 2);
    const t = performance.now() / 1000;
    const bg = ctx.createLinearGradient(0, 0, 0, mapH);
    bg.addColorStop(0, "#ffd7a8");
    bg.addColorStop(1, "#e7a06a");
    ctx.fillStyle = bg;
    ctx.fillRect(-40, -40, mapW + 80, mapH + 80);
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
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawChef(t);
    floaters.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.color;
      ctx.font = "700 16px Jua, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
    const light = ctx.createRadialGradient(mapW * 0.5, mapH * 0.32, 30, mapW * 0.5, mapH * 0.4, mapW * 0.72);
    light.addColorStop(0, "rgba(255, 236, 200, 0.22)");
    light.addColorStop(1, "rgba(90, 40, 20, 0.16)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, mapW, mapH);
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
      p.vy += 80 * dt;
    });
    particles = particles.filter(function (p) { return p.life > 0; });
    floaters.forEach(function (f) { f.life -= dt; f.y -= 18 * dt; });
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
