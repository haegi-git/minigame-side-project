(function () {
  const Sim = window.BeanAnglerSim;
  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const ui = {
    title: document.getElementById("title"),
    hud: document.getElementById("hud"),
    result: document.getElementById("result"),
    coins: document.getElementById("coins"),
    shop: document.getElementById("shop"),
    start: document.getElementById("btn-start"),
    retry: document.getElementById("btn-retry"),
    toTitle: document.getElementById("btn-title"),
    mute: document.getElementById("mute"),
    time: document.getElementById("time"),
    score: document.getElementById("score"),
    combo: document.getElementById("combo"),
    zone: document.getElementById("zone"),
    lives: document.getElementById("lives"),
    banner: document.getElementById("banner"),
    castBox: document.getElementById("cast-box"),
    castKicker: document.getElementById("cast-kicker"),
    castValue: document.getElementById("cast-value"),
    castFill: document.getElementById("cast-fill"),
    tenBox: document.getElementById("ten-box"),
    tenLabel: document.getElementById("ten-label"),
    tenFill: document.getElementById("ten-fill"),
    sweet: document.getElementById("sweet"),
    action: document.getElementById("action"),
    resKicker: document.getElementById("res-kicker"),
    resRank: document.getElementById("res-rank"),
    resScore: document.getElementById("res-score"),
    resSub: document.getElementById("res-sub"),
    resStats: document.getElementById("res-stats"),
    resFish: document.getElementById("res-fish"),
    resCoins: document.getElementById("res-coins"),
  };

  const SAVE_KEY = "simsim-bean-angler";
  const ZONE_NAME = { shallow: "얕은 물", deep: "심해", cave: "해저 동굴" };
  const RANK_COPY = {
    전설: "콩리비아탄이 당신의 이름을 기억합니다.",
    낚시왕: "수심을 읽고 줄을 지킨 한 판입니다.",
    실력자: "손에 감이 붙었습니다. 한 단계만 더.",
    견습: "입질과 장력, 둘 중 하나가 아직 흔들립니다.",
    빈그물: "챔질이 빠르거나, 줄을 너무 오래 당겼습니다.",
  };
  const COSTS = {
    rod: [140, 260, 420, 680, 980],
    reel: [140, 260, 420, 680, 980],
    bait: [120, 220, 380, 600, 900],
  };
  const SHOP = [
    ["rod", "낚싯대", "충격을 흡수하고 초록 구간이 조금 넓어집니다."],
    ["reel", "릴", "같은 힘으로 줄을 더 빨리 감습니다."],
    ["bait", "미끼", "희귀 물고기와 전설이 더 자주 물립니다."],
  ];
  const SIZE = {
    anchovy: 56,
    clown: 70,
    mackerel: 86,
    tuna: 118,
    squid: 100,
    lantern: 84,
    eel: 168,
    angler: 128,
    leviathan: 250,
  };

  const view = { w: 1, h: 1, dpr: 1 };
  const clock = { t: 0, cam: 0, shake: 0 };
  const pointers = new Set();
  let keyHold = false;
  let prevDown = false;
  let tapLatch = false;
  let releaseLatch = false;
  let biteCue = false;
  let screen = "title";
  let state = null;
  let save = loadSave();
  let awarded = false;
  let muted = false;
  const audio = { ctx: null };
  const particles = [];
  const floaters = [];
  const ambient = makeAmbient();

  function loadSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
      return {
        coins: Math.max(0, raw.coins | 0),
        rod: clamp(raw.rod | 0, 0, 5),
        reel: clamp(raw.reel | 0, 0, 5),
        bait: clamp(raw.bait | 0, 0, 5),
        best: Math.max(0, raw.best | 0),
      };
    } catch (err) {
      return { coins: 0, rod: 0, reel: 0, bait: 0, best: 0 };
    }
  }

  function writeSave() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(view.w * view.dpr));
    canvas.height = Math.max(1, Math.floor(view.h * view.dpr));
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  }

  function gear() {
    return { rod: save.rod, reel: save.reel, bait: save.bait };
  }

  function renderShop() {
    ui.coins.textContent = save.coins.toLocaleString("ko-KR");
    ui.shop.innerHTML = SHOP.map(([key, name, blurb]) => {
      const level = save[key];
      const maxed = level >= 5;
      const cost = maxed ? 0 : COSTS[key][level];
      const pips = Array.from({ length: 5 }, (_, i) => `<i class="${i < level ? "on" : ""}"></i>`).join("");
      return `<div class="upgrade">
        <strong>${name}</strong>
        <p>${blurb}</p>
        <div class="pips">${pips}</div>
        <button type="button" data-buy="${key}" ${maxed || save.coins < cost ? "disabled" : ""}>${maxed ? "최대" : cost + "콩"}</button>
      </div>`;
    }).join("");
  }

  function buy(key) {
    const level = save[key];
    if (level >= 5) return;
    const cost = COSTS[key][level];
    if (save.coins < cost) return;
    save.coins -= cost;
    save[key] += 1;
    writeSave();
    renderShop();
    blip(520, 0.08, "triangle", 0.05);
  }

  function show(which) {
    screen = which;
    ui.title.classList.toggle("hidden", which !== "title");
    ui.hud.classList.toggle("hidden", which !== "play");
    ui.result.classList.toggle("hidden", which !== "result");
    if (which === "title") renderShop();
  }

  function startRound() {
    state = Sim.create((Date.now() ^ (Math.random() * 1e9)) >>> 0, gear());
    awarded = false;
    tapLatch = false;
    releaseLatch = false;
    biteCue = false;
    prevDown = pointers.size > 0 || keyHold;
    show("play");
    ensureAudio();
    blip(340, 0.1, "sine", 0.05);
  }

  function finishRound() {
    if (awarded || !state) return;
    awarded = true;
    const gained = state.coins || 0;
    save.coins += gained;
    const best = Math.max(save.best, state.score);
    const record = state.score > save.best;
    save.best = best;
    writeSave();
    ui.resKicker.textContent = state.end === "lives" ? "LINE OUT" : "TIME";
    ui.resRank.textContent = state.rank || "빈그물";
    ui.resScore.textContent = state.score.toLocaleString("ko-KR");
    ui.resSub.textContent = `${RANK_COPY[state.rank] || ""} ${record ? "최고 기록을 고쳤습니다." : "최고 " + best.toLocaleString("ko-KR")}`;
    const rows = [
      ["포획", state.catches],
      ["놓침", state.misses + state.escapes],
      ["최대 콤보", state.maxCombo],
      ["완벽 챔질", state.perfects],
      ["끊긴 줄", state.snaps],
      ["시간", `${state.time.toFixed(0)}초`],
    ];
    ui.resStats.innerHTML = rows.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join("");
    ui.resFish.innerHTML = state.fishLog.length
      ? state.fishLog.map((fish) => `<li><span>${fish.perfect ? "✦ " : ""}${fish.name}</span><b>${fish.points.toLocaleString("ko-KR")}</b></li>`).join("")
      : "<li><span>빈 그물</span><b>0</b></li>";
    ui.resCoins.textContent = `+${gained.toLocaleString("ko-KR")}콩 · 보유 ${save.coins.toLocaleString("ko-KR")}`;
    show("result");
    blip(state.rank === "빈그물" ? 180 : 660, 0.18, "sine", 0.06);
  }

  function readInput() {
    const down = pointers.size > 0 || keyHold;
    const tap = tapLatch || (down && !prevDown);
    const release = releaseLatch || (!down && prevDown);
    tapLatch = false;
    releaseLatch = false;
    prevDown = down;
    return { hold: down, tap, release };
  }

  function notePress(alreadyDown) {
    if (!alreadyDown) tapLatch = true;
  }

  function noteRelease() {
    if (pointers.size === 0 && !keyHold) releaseLatch = true;
  }

  function ensureAudio() {
    if (muted) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audio.ctx) audio.ctx = new AC();
    if (audio.ctx.state === "suspended") audio.ctx.resume();
    return audio.ctx;
  }

  function blip(freq, dur, type, gain) {
    const ac = ensureAudio();
    if (!ac) return;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(gain || 0.04, ac.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(amp);
    amp.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur + 0.02);
  }

  function drain() {
    if (!state) return;
    const events = state.events.splice(0, state.events.length);
    for (const ev of events) {
      if (ev.type === "splash") burst(18, "#dff6ff");
      if (ev.type === "catch") {
        burst(28, "#ffe18a");
        floaters.push({ text: `+${ev.points}`, life: 1.15, x: view.w * 0.62, y: view.h * 0.42 });
        blip(ev.perfect ? 880 : 640, 0.14, "triangle", 0.06);
      }
      if (ev.type === "snap") {
        clock.shake = 1;
        blip(90, 0.2, "sawtooth", 0.05);
      }
      if (ev.type === "hook") blip(520, 0.07, "square", 0.03);
      if (ev.type === "yank") blip(180, 0.05, "sine", 0.03);
      if (ev.type === "gull") blip(740, 0.08, "square", 0.03);
    }
  }

  function burst(n, color) {
    const lure = lurePoint();
    const p = project(lure.x, Math.max(0, lure.y));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 120;
      particles.push({
        x: p.sx,
        y: p.sy,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 20,
        life: 0.5 + Math.random() * 0.5,
        max: 0.8,
        r: 1.5 + Math.random() * 2.5,
        color,
      });
    }
  }

  function project(wx, wy) {
    const scale = Math.min(view.w, view.h) / 760;
    return {
      sx: view.w * 0.46 + (wx - 420) * scale,
      sy: view.h * 0.34 + (wy - clock.cam) * scale,
      scale,
    };
  }

  function depth01() {
    return clamp(clock.cam / 860, 0, 1);
  }

  function surfaceBob() {
    return Math.sin(clock.t * 1.6) * 7 - 18;
  }

  function rodPose() {
    const hands = { x: 318, y: surfaceBob() - 24 };
    let ang = state && state.angle ? state.angle : 50;
    if (!state || state.phase === "ready") ang = 58 + Math.sin(clock.t * 0.8) * 6;
    if (state && state.phase === "charge") ang = 76 - state.power * 48;
    else if (state && state.phase === "angle") ang = state.angle;
    else if (state && state.phase === "reel") ang = clamp((state.angle || 48) - (state.tension || 0) * 0.16, 18, 80);
    const rad = (ang * Math.PI) / 180;
    const len = 108;
    return {
      hands,
      tip: { x: hands.x + Math.cos(rad) * len, y: hands.y - Math.sin(rad) * len },
      ang,
    };
  }

  function lurePoint() {
    if (!state || state.phase === "ready" || state.phase === "charge" || state.phase === "angle") {
      return rodPose().tip;
    }
    if (state.phase === "flight") {
      const dur = Sim.flightDur(state.power);
      const p = clamp(state.castT / dur, 0, 1);
      const tip = rodPose().tip;
      return {
        x: tip.x + (state.lureX - tip.x) * p,
        y: tip.y + (0 - tip.y) * p - Math.sin(p * Math.PI) * (70 + state.power * 150),
      };
    }
    if (state.phase === "sink") {
      const p = clamp(state.castT / Sim.sinkDur(state.depth), 0, 1);
      return { x: state.lureX, y: state.depth * 860 * p };
    }
    let y = state.depth * 860;
    if ((state.phase === "reel" || state.phase === "recover") && state.lineStart) {
      y = 36 + (state.depth * 860 - 36) * clamp(state.line / state.lineStart, 0, 1.15);
    }
    const wobble = state.phase === "reel" ? Math.sin(clock.t * 9) * (4 + (state.fishForce || 0.5) * 7) : Math.sin(clock.t * 2) * 3;
    return { x: state.lureX + wobble, y };
  }

  function camTarget() {
    if (!state || state.phase === "ready" || state.phase === "charge" || state.phase === "angle" || state.phase === "flight") return 0;
    const lure = lurePoint();
    return clamp(lure.y - 40, 0, 980);
  }

  function makeAmbient() {
    const kinds = ["anchovy", "clown", "mackerel", "tuna", "squid", "lantern", "eel", "angler"];
    const list = [];
    for (let i = 0; i < 16; i++) {
      list.push({
        kind: kinds[i % kinds.length],
        x: (i * 137) % 980,
        y: 70 + ((i * 97) % 860),
        dir: i % 2 ? 1 : -1,
        speed: 22 + (i % 5) * 9,
        scale: 0.55 + (i % 4) * 0.14,
        off: i,
      });
    }
    list.push({ kind: "leviathan", x: 200, y: 760, dir: 1, speed: 16, scale: 0.85, off: 3 });
    return list;
  }

  function zoneNow() {
    if (!state || state.phase === "ready" || state.phase === "charge") return "shallow";
    if (state.phase === "angle") return Sim.zoneOf(Sim.depthOf(state.power, state.angle, save.rod));
    return Sim.zoneOf(state.depth || 0.2);
  }

  function updateHud() {
    if (screen !== "play" || !state) return;
    const left = Math.max(0, Sim.ROUND - state.time);
    ui.time.textContent = left >= 10 ? left.toFixed(0) : left.toFixed(1);
    ui.score.textContent = state.score.toLocaleString("ko-KR");
    ui.combo.textContent = String(state.combo);
    ui.zone.textContent = ZONE_NAME[zoneNow()];
    ui.lives.innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < state.lives ? "on" : ""}"></i>`).join("");

    const phase = state.phase;
    const timing = Sim.biteTiming(state);
    const biting = phase === "wait" && state.hazard !== "gull" && timing && state.waitT >= timing.open && state.waitT <= timing.close;
    const telegraph = phase === "wait" && state.hazard !== "gull" && timing && state.waitT >= state.biteAt && state.waitT < timing.open;
    let banner = "바다를 읽고 캐스팅하세요";
    let hot = false;
    let warn = false;
    let action = "홀드";
    if (phase === "ready") banner = "눌러서 캐스팅 힘을 모으세요";
    if (phase === "charge") banner = "원하는 힘에서 손을 떼세요";
    if (phase === "angle") {
      banner = `다시 눌러 각도를 고정 · ${ZONE_NAME[zoneNow()]}`;
      action = "각도";
    }
    if (phase === "flight") banner = "미끼가 날아갑니다";
    if (phase === "sink") banner = `${ZONE_NAME[zoneNow()]}로 가라앉는 중`;
    if (phase === "wait" && state.hazard === "gull") {
      banner = `갈매기! 연타 ${state.gullHits}/4`;
      hot = true;
      action = "연타";
    } else if (telegraph) {
      banner = state.message === "아직" ? "아직! 기다렸다가 챔" : "아직 누르지 마세요";
      warn = true;
      action = "준비";
    } else if (biting) {
      const holding = pointers.size > 0 || keyHold;
      banner = holding ? "손을 떼고 다시 챔!" : "지금 챔!";
      hot = true;
      action = "챔질";
      if (!biteCue) {
        biteCue = true;
        blip(880, 0.07, "square", 0.04);
      }
    } else if (phase === "wait") {
      banner = state.catches === 0 && state.misses === 0 ? "첫 입질 · 흔들리면 기다리고, 빨간 글씨에 챔" : "입질을 기다리세요";
      action = "대기";
    }
    if (!biting) biteCue = false;
    if (phase === "reel" && state.fish) {
      banner = state.hazard === "puffer"
        ? "복어다! 줄을 늦춰 털어내세요"
        : state.hazard === "puffer-warn"
          ? "폭탄 복어가 다가옵니다"
          : state.windup
            ? `${state.fish.name}이 힘을 모읍니다. 줄을 늦추세요`
            : `${state.fish.name} · 초록 칸을 유지`;
      hot = state.hazard === "puffer" || !!state.windup;
      warn = state.hazard === "puffer-warn";
      action = state.hazard === "puffer" || state.windup ? "늦추기" : "릴링";
    }
    if (phase === "recover") banner = state.message || "다음 캐스팅";
    ui.banner.textContent = banner;
    ui.banner.classList.toggle("hot", hot);
    ui.banner.classList.toggle("warn", warn && !hot);
    ui.action.textContent = action;
    ui.action.classList.toggle("hot", hot);

    const casting = phase === "charge" || phase === "angle";
    ui.castBox.classList.toggle("hidden", !casting);
    ui.tenBox.classList.toggle("hidden", phase !== "reel");
    if (phase === "charge") {
      ui.castKicker.textContent = "파워";
      ui.castValue.textContent = `${Math.round(state.power * 100)}%`;
      ui.castFill.style.width = `${state.power * 100}%`;
    }
    if (phase === "angle") {
      ui.castKicker.textContent = "각도";
      ui.castValue.textContent = `${ZONE_NAME[zoneNow()]} · ${Math.round(state.angle)}°`;
      ui.castFill.style.width = `${((state.angle - 18) / 60) * 100}%`;
    }
    if (phase === "reel") {
      const ten = state.tension || 0;
      const lo = state.sweetLo || 40;
      const hi = state.sweetHi || 64;
      ui.sweet.style.left = `${lo}%`;
      ui.sweet.style.width = `${hi - lo}%`;
      ui.tenFill.style.width = `${ten}%`;
      ui.tenFill.className = ten >= 90 ? "danger" : ten > hi ? "hot" : ten >= lo ? "good" : "";
      ui.tenLabel.textContent = state.hazard === "puffer" ? "복어" : ten >= 90 ? "위험" : ten >= lo && ten <= hi ? "좋음" : ten < lo ? "느슨" : "팽팽";
    }
  }

  function spawnFoam(dt) {
    if (clock.cam > 40 && particles.length < 140 && Math.random() < dt * 22) {
      const bubble = project(80 + Math.random() * 760, clock.cam + 80 + Math.random() * 280);
      particles.push({
        x: bubble.sx,
        y: bubble.sy,
        vx: Math.sin(clock.t + bubble.sx) * 8,
        vy: -24 - Math.random() * 20,
        life: 1.5,
        max: 1.5,
        r: 1.4 + Math.random() * 2.2,
        color: "rgba(226, 248, 255, 0.75)",
      });
    }
    if (particles.length > 170) return;
    if (Math.random() > dt * 18) return;
    const y = project(420, 0).sy;
    if (y < -40 || y > view.h + 40) return;
    particles.push({
      x: Math.random() * view.w,
      y: y + Math.random() * 10,
      vx: -8 + Math.random() * 16,
      vy: -10 - Math.random() * 16,
      life: 0.8,
      max: 0.8,
      r: 1 + Math.random() * 2,
      color: "rgba(255,255,255,0.8)",
    });
  }

  function drawBackground(t) {
    const d = depth01();
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    if (d < 0.18) {
      g.addColorStop(0, "#79d4ff");
      g.addColorStop(0.28, "#ffe7ad");
      g.addColorStop(0.46, "#3ec4e0");
      g.addColorStop(1, "#0e7eae");
    } else if (d < 0.58) {
      g.addColorStop(0, "#0a4d78");
      g.addColorStop(0.45, "#063556");
      g.addColorStop(1, "#041e33");
    } else {
      g.addColorStop(0, "#2a1248");
      g.addColorStop(0.42, "#14081f");
      g.addColorStop(1, "#07030d");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    if (d > 0.58) {
      ctx.fillStyle = `rgba(48, 12, 82, ${Math.min(0.55, (d - 0.58) * 2.2)})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }

    if (d < 0.28) {
      const sun = project(760, -150);
      const glow = ctx.createRadialGradient(sun.sx, sun.sy, 8, sun.sx, sun.sy, 140);
      glow.addColorStop(0, "rgba(255,244,196,0.95)");
      glow.addColorStop(1, "rgba(255,244,196,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sun.sx, sun.sy, 140, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const cx = ((i * 280 + t * (8 + i * 4)) % (view.w + 200)) - 100;
        const cy = 40 + i * 28;
        ctx.fillStyle = "rgba(255,255,255,0.78)";
        ctx.beginPath();
        ctx.ellipse(cx, cy, 54, 16, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 24, cy - 10, 26, 18, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - 20, cy - 8, 22, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const isle = project(640, -8);
      ctx.fillStyle = "#7dbe73";
      ctx.beginPath();
      ctx.ellipse(isle.sx, isle.sy, 70 * isle.scale, 16 * isle.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5e9a62";
      ctx.beginPath();
      ctx.moveTo(isle.sx - 10, isle.sy);
      ctx.lineTo(isle.sx, isle.sy - 48 * isle.scale);
      ctx.lineTo(isle.sx + 16, isle.sy);
      ctx.fill();
    }

    drawRays(t, d);
    drawReef(t, d);
    if (d > 0.56) drawCave(t);
  }

  function drawRays(t, d) {
    const origin = project(460, 0);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const alpha = d > 0.75 ? 0.03 : 0.07 - d * 0.05;
    for (let i = 0; i < 6; i++) {
      const sway = Math.sin(t * 0.35 + i) * 30;
      const x = origin.sx + (i - 2.5) * 90;
      ctx.fillStyle = d > 0.7 ? `rgba(180,140,255,${alpha})` : `rgba(255,236,180,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x, origin.sy);
      ctx.lineTo(x + 40 + sway, view.h + 20);
      ctx.lineTo(x + 120 + sway * 0.4, view.h + 20);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawReef(t, d) {
    for (let i = 0; i < 7; i++) {
      const wx = 80 + i * 130;
      const wy = 90 + (i % 3) * 36;
      const p = project(wx, wy + Math.sin(t + i) * 4);
      if (p.sy < -80 || p.sy > view.h + 80) continue;
      const s = p.scale;
      ctx.fillStyle = i % 2 ? "rgba(255,122,168,0.85)" : "rgba(255,196,92,0.8)";
      ctx.beginPath();
      ctx.moveTo(p.sx, p.sy);
      ctx.bezierCurveTo(p.sx - 16 * s, p.sy - 30 * s, p.sx + 10 * s, p.sy - 50 * s, p.sx + 4 * s, p.sy - 64 * s);
      ctx.bezierCurveTo(p.sx + 28 * s, p.sy - 40 * s, p.sx + 24 * s, p.sy - 10 * s, p.sx, p.sy);
      ctx.fill();
      ctx.fillStyle = "rgba(244, 196, 122, 0.35)";
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy + 8 * s, 34 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (d > 0.25) {
      for (let i = 0; i < 5; i++) {
        const p = project(120 + i * 180, 280 + (i % 2) * 80);
        ctx.strokeStyle = "rgba(90, 200, 140, 0.45)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.sx, p.sy);
        for (let k = 1; k <= 6; k++) {
          ctx.lineTo(p.sx + Math.sin(t * 1.4 + i + k) * 10, p.sy - k * 14 * p.scale);
        }
        ctx.stroke();
      }
    }
  }

  function drawCave(t) {
    for (let i = 0; i < 8; i++) {
      const p = project(40 + i * 120, 640 + (i % 3) * 50);
      if (p.sy < -40 || p.sy > view.h + 60) continue;
      ctx.save();
      ctx.translate(p.sx, p.sy);
      ctx.rotate(Math.sin(i) * 0.3);
      const glow = ctx.createLinearGradient(0, 20, 0, -70);
      glow.addColorStop(0, "rgba(120, 70, 180, 0.2)");
      glow.addColorStop(1, "rgba(190, 140, 255, 0.85)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(-12, 16);
      ctx.lineTo(0, -54 - (i % 3) * 16);
      ctx.lineTo(12, 16);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 12; i++) {
      const p = project(80 + ((i * 90 + t * 12) % 860), 700 + Math.sin(t + i) * 30);
      ctx.fillStyle = "rgba(130,255,220,0.35)";
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWaves(t) {
    const surface = project(420, 0).sy;
    if (surface < -30 || surface > view.h + 30) return;
    const bands = [
      ["rgba(14, 92, 140, 0.45)", 16, 0.018, 1.3],
      ["rgba(36, 168, 196, 0.55)", 10, 0.03, 1.8],
      ["rgba(214, 246, 255, 0.38)", 6, 0.045, 2.4],
    ];
    bands.forEach(([color, amp, freq, speed], index) => {
      ctx.beginPath();
      const y0 = surface + index * 8;
      ctx.moveTo(0, view.h + 20);
      for (let x = 0; x <= view.w; x += 10) {
        const y = y0 + Math.sin(x * freq + t * speed + index) * amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(view.w, view.h + 20);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    });
    ctx.beginPath();
    for (let x = 0; x <= view.w; x += 8) {
      const y = surface + Math.sin(x * 0.04 + t * 2) * 5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawFish(kind, x, y, len, t, face, panic) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);
    if (kind === "eel") {
      drawEel(len, t);
      ctx.restore();
      return;
    }
    if (kind === "leviathan") {
      drawLeviathan(len, t);
      ctx.restore();
      return;
    }
    if (kind === "squid") {
      drawSquid(len, t);
      ctx.restore();
      return;
    }
    const wag = Math.sin(t * (panic ? 14 : 7)) * (panic ? 0.45 : 0.25);
    const pal = palette(kind);
    ctx.save();
    ctx.translate(-len * 0.42, 0);
    ctx.rotate(wag);
    ctx.fillStyle = pal.fin;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-len * 0.24, -len * 0.18, -len * 0.28, 0);
    ctx.quadraticCurveTo(-len * 0.24, len * 0.18, 0, 0);
    ctx.fill();
    ctx.restore();

    const body = ctx.createLinearGradient(-len * 0.4, -len * 0.2, len * 0.45, len * 0.2);
    body.addColorStop(0, pal.a);
    body.addColorStop(0.55, pal.b);
    body.addColorStop(1, pal.a);
    ctx.fillStyle = body;
    ctx.shadowColor = "rgba(4, 16, 32, 0.35)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(0, 0, len * 0.46, len * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(18, 28, 48, 0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.ellipse(-len * 0.02, -len * 0.08, len * 0.22, len * 0.06, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pal.fin;
    ctx.beginPath();
    ctx.moveTo(-len * 0.05, -len * 0.12);
    ctx.quadraticCurveTo(len * 0.02, -len * 0.32, len * 0.12, -len * 0.08);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(len * 0.02, len * 0.16, len * 0.08, len * 0.05, 0.4, 0, Math.PI * 2);
    ctx.fill();

    if (kind === "clown") {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      for (const px of [-0.12, 0.05, 0.2]) {
        ctx.fillRect(len * px, -len * 0.18, len * 0.06, len * 0.36);
      }
    }
    if (kind === "mackerel") {
      ctx.strokeStyle = "rgba(214,255,244,0.8)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-len * 0.2 + i * len * 0.1, -len * 0.12);
        ctx.quadraticCurveTo(-len * 0.12 + i * len * 0.1, 0, -len * 0.2 + i * len * 0.1, len * 0.12);
        ctx.stroke();
      }
    }
    if (kind === "tuna") {
      ctx.fillStyle = "#f0c14a";
      ctx.beginPath();
      ctx.moveTo(len * 0.02, -len * 0.02);
      ctx.lineTo(-len * 0.02, -len * 0.28);
      ctx.lineTo(len * 0.16, -len * 0.02);
      ctx.fill();
    }
    if (kind === "lantern") {
      ctx.fillStyle = "rgba(8,16,28,0.55)";
      ctx.beginPath();
      ctx.ellipse(0, 2, len * 0.42, len * 0.16, 0, 0, Math.PI);
      ctx.fill();
      const glow = ctx.createRadialGradient(len * 0.42, len * 0.16, 2, len * 0.42, len * 0.16, len * 0.22);
      glow.addColorStop(0, "rgba(190,255,220,0.95)");
      glow.addColorStop(1, "rgba(190,255,220,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(len * 0.42, len * 0.16, len * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    if (kind === "angler") {
      ctx.fillStyle = "#1a1018";
      ctx.beginPath();
      ctx.ellipse(len * 0.18, len * 0.02, len * 0.16, len * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f2f2f2";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(len * 0.12, 0, len * 0.08, 0.2, Math.PI - 0.2);
      ctx.stroke();
      ctx.strokeStyle = "#ffcc66";
      ctx.beginPath();
      ctx.moveTo(len * 0.05, -len * 0.16);
      ctx.quadraticCurveTo(len * 0.28, -len * 0.36, len * 0.34, -len * 0.05);
      ctx.stroke();
      ctx.fillStyle = "#d6fff4";
      ctx.beginPath();
      ctx.arc(len * 0.34, -len * 0.05, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    eye(len * 0.24, -len * 0.04, len * 0.045, panic);
    ctx.restore();
  }

  function eye(x, y, r, panic) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.3, r * (panic ? 0.7 : 1.15), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1b1630";
    ctx.beginPath();
    ctx.arc(x + r * 0.2, y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + r * 0.35, y - r * 0.3, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  function palette(kind) {
    const map = {
      anchovy: { a: "#f4fbff", b: "#7eb4d4", fin: "#b7ddf2" },
      clown: { a: "#ffb15e", b: "#ff7a3a", fin: "#ffe0ae" },
      mackerel: { a: "#1f8f86", b: "#12384a", fin: "#8ee0c8" },
      tuna: { a: "#3d6fe0", b: "#142850", fin: "#8eb0ef" },
      lantern: { a: "#243044", b: "#101722", fin: "#6a7d96" },
      angler: { a: "#5a3d68", b: "#241628", fin: "#8a6aa0" },
    };
    return map[kind] || map.anchovy;
  }

  function spine(len, t, amp) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const p = i / 14;
      pts.push([-len * 0.48 + len * p, Math.sin(t * 3.2 + i * 0.55) * amp * (0.35 + p)]);
    }
    return pts;
  }

  function strokeSpine(pts, width, color) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function drawEel(len, t) {
    const pts = spine(len, t, 14);
    strokeSpine(pts, Math.max(10, len * 0.16), "#d6ff7a");
    strokeSpine(pts, Math.max(4, len * 0.06), "#3f7a24");
    const head = pts[pts.length - 1];
    ctx.fillStyle = "#e8ff9a";
    ctx.beginPath();
    ctx.ellipse(head[0], head[1], len * 0.08, len * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    eye(head[0] + 2, head[1] - 1, 3.2, true);
  }

  function drawLeviathan(len, t) {
    const pts = spine(len, t * 0.8, 18);
    strokeSpine(pts, Math.max(18, len * 0.14), "#1a1038");
    strokeSpine(pts, Math.max(10, len * 0.08), "#4d5bff");
    strokeSpine(pts, Math.max(3, len * 0.025), "rgba(255, 224, 140, 0.9)");
    for (let i = 2; i < pts.length; i += 2) {
      ctx.fillStyle = "rgba(255, 214, 106, 0.9)";
      ctx.beginPath();
      ctx.moveTo(pts[i][0], pts[i][1] - 4);
      ctx.lineTo(pts[i][0] - 8, pts[i][1] - 16);
      ctx.lineTo(pts[i][0] + 6, pts[i][1] - 2);
      ctx.fill();
    }
    const head = pts[pts.length - 1];
    const g = ctx.createRadialGradient(head[0] - 4, head[1] - 4, 2, head[0], head[1], len * 0.16);
    g.addColorStop(0, "#c9d2ff");
    g.addColorStop(1, "#2a1d78");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(head[0], head[1], len * 0.12, len * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    eye(head[0] + len * 0.03, head[1] - 2, 5, true);
    ctx.fillStyle = "#9af6ff";
    ctx.beginPath();
    ctx.moveTo(head[0] - 4, head[1] - len * 0.05);
    ctx.quadraticCurveTo(head[0] + 6, head[1] - len * 0.18, head[0] + len * 0.08, head[1] - 2);
    ctx.fill();
  }

  function drawSquid(len, t) {
    const g = ctx.createLinearGradient(0, -len * 0.3, 0, len * 0.2);
    g.addColorStop(0, "#ffd0f2");
    g.addColorStop(1, "#d946b0");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(8, -6, len * 0.28, len * 0.18, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    eye(len * 0.12, -len * 0.08, 4, false);
    ctx.strokeStyle = "#ff8ad4";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-4, 4);
      ctx.quadraticCurveTo(-len * 0.15, 10 + i * 4, -len * 0.34, Math.sin(t * 6 + i) * 12 + i * 3);
      ctx.stroke();
    }
  }

  function drawBoatAndBean(t) {
    const bob = surfaceBob();
    const hull = project(300, bob);
    if (hull.sy < -120 || hull.sy > view.h + 140) return;
    const s = hull.scale;
    ctx.save();
    ctx.translate(hull.sx, hull.sy);
    ctx.scale(s, s);
    ctx.fillStyle = "rgba(8, 30, 50, 0.25)";
    ctx.beginPath();
    ctx.ellipse(10, 28, 78, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    const wood = ctx.createLinearGradient(0, -20, 0, 24);
    wood.addColorStop(0, "#f0c48a");
    wood.addColorStop(0.5, "#d3924e");
    wood.addColorStop(1, "#8d4e22");
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.moveTo(-78, -4);
    ctx.quadraticCurveTo(-88, 20, -46, 24);
    ctx.lineTo(58, 24);
    ctx.quadraticCurveTo(92, 18, 70, -8);
    ctx.quadraticCurveTo(0, 8, -78, -4);
    ctx.fill();
    ctx.strokeStyle = "rgba(70, 32, 18, 0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 232, 180, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-40, 2);
    ctx.quadraticCurveTo(8, 8, 48, -2);
    ctx.stroke();
    ctx.fillStyle = "#ff8fb8";
    ctx.beginPath();
    ctx.arc(62, -2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.restore();

    const bean = project(304, bob - 30);
    drawBean(bean.sx, bean.sy, s, t);
    const pose = rodPose();
    const a = project(pose.hands.x, pose.hands.y);
    const b = project(pose.tip.x, pose.tip.y);
    ctx.strokeStyle = "#6b4428";
    ctx.lineWidth = 4 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.quadraticCurveTo((a.sx + b.sx) / 2, (a.sy + b.sy) / 2 - 8, b.sx, b.sy);
    ctx.stroke();
    ctx.fillStyle = "#d7dde6";
    ctx.beginPath();
    ctx.arc(a.sx + 8 * s, a.sy + 4 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBean(x, y, s, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.rotate(Math.sin(t * 1.6) * 0.05);
    ctx.fillStyle = "#f4c56a";
    ctx.beginPath();
    ctx.ellipse(0, -30, 20, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e4574d";
    ctx.fillRect(-16, -32, 32, 4);
    const g = ctx.createRadialGradient(-8, -18, 4, 0, -4, 28);
    g.addColorStop(0, "#ffe4ef");
    g.addColorStop(0.42, "#ff8fb8");
    g.addColorStop(1, "#e25b8c");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -2, 18, 23, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7ee0c3";
    ctx.beginPath();
    ctx.ellipse(0, 8, 14, 12, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.ellipse(-6, -12, 6, 8, -0.6, 0, Math.PI * 2);
    ctx.fill();
    eyeAt(-7, -6);
    eyeAt(6, -6);
    ctx.strokeStyle = "#6a3048";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 2, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,120,150,0.45)";
    ctx.beginPath();
    ctx.ellipse(-12, 1, 3.5, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(12, 1, 3.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function eyeAt(x, y) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(x, y, 4.2, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#241833";
    ctx.beginPath();
    ctx.arc(x + 0.8, y + 0.4, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + 1.4, y - 1, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLineAndLure(t) {
    if (!state || state.phase === "ready" || state.phase === "charge" || state.phase === "angle") return;
    const pose = rodPose();
    const tip = project(pose.tip.x, pose.tip.y);
    const lure = lurePoint();
    const end = project(lure.x, lure.y);
    const ten = state.tension || 30;
    const sag = (phaseNeedsSag() ? (110 - ten) * 0.9 : 36) * end.scale;
    ctx.strokeStyle = ten > 90 ? "#ff5d73" : ten > (state.sweetHi || 70) ? "#ffd76a" : "rgba(236,255,250,0.9)";
    ctx.lineWidth = Math.max(1.2, 2.2 * end.scale);
    ctx.beginPath();
    ctx.moveTo(tip.sx, tip.sy);
    ctx.quadraticCurveTo((tip.sx + end.sx) / 2, (tip.sy + end.sy) / 2 + sag, end.sx, end.sy);
    ctx.stroke();

    if (state.phase !== "flight") {
      const float = project(lure.x, Math.min(0, lure.y));
      const timing = state.phase === "wait" ? Sim.biteTiming(state) : null;
      const biting = timing && state.waitT >= timing.open && state.waitT <= timing.close;
      const telegraph = timing && state.waitT >= state.biteAt && state.waitT < timing.open;
      const dip = biting ? 24 : 0;
      const wobble = telegraph ? Math.sin(t * 38) * 6 * float.scale : 0;
      const bob = (biting ? 10 : 7) * float.scale;
      ctx.fillStyle = biting ? "#ff2f55" : "#ff5d73";
      ctx.beginPath();
      ctx.arc(float.sx + wobble, float.sy + dip, bob, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(float.sx + wobble - 2, float.sy - 16 * float.scale + dip, 4, 12 * float.scale);
    }

    const jig = ctx.createRadialGradient(end.sx - 2, end.sy - 2, 1, end.sx, end.sy, 8 * end.scale);
    jig.addColorStop(0, "#fff6c2");
    jig.addColorStop(1, "#e2a31a");
    ctx.fillStyle = jig;
    ctx.beginPath();
    ctx.ellipse(end.sx, end.sy, 7 * end.scale, 4 * end.scale, 0.6, 0, Math.PI * 2);
    ctx.fill();

    if (state.fish && (state.phase === "reel" || state.phase === "wait" || state.phase === "recover")) {
      const len = SIZE[state.fish.id] || 80;
      const face = -1;
      const fish = project(lure.x + 36, lure.y + Math.sin(t * 8) * 8);
      drawFish(state.fish.id, fish.sx, fish.sy, len * fish.scale, t, face, state.phase === "reel");
    }
  }

  function phaseNeedsSag() {
    return state && (state.phase === "reel" || state.phase === "wait" || state.phase === "sink");
  }

  function drawHazards(t) {
    if (!state) return;
    const lure = lurePoint();
    if (state.hazard === "gull") {
      const p = clamp(state.hazardT / 1.22, 0, 1);
      const g = project(lure.x + (1 - p) * 90, -70 + p * 60);
      drawGull(g.sx, g.sy, g.scale, t);
    } else if (depth01() < 0.25) {
      const g = project(560 + Math.sin(t * 0.7) * 80, -46);
      drawGull(g.sx, g.sy, g.scale * 0.7, t);
    }
    if (state.hazard === "puffer" || state.hazard === "puffer-warn") {
      const near = state.hazard === "puffer";
      const p = project(lure.x + (near ? 20 : 70), lure.y - 10);
      drawPuffer(p.sx, p.sy, p.scale * (near ? 1.3 : 1), t, near);
    }
    const showJelly = state.phase === "reel" && state.jellyDone && state.fightT - state.jellyAt < 0.8;
    if (showJelly || depth01() > 0.3) {
      const p = showJelly ? project(lure.x - 30, lure.y - 20) : project(180 + Math.sin(t) * 40, 340);
      if (p.sy > -40 && p.sy < view.h + 40) drawJelly(p.sx, p.sy, p.scale, t);
    }
  }

  function drawGull(x, y, s, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const flap = Math.sin(t * 12) * 0.6;
    ctx.fillStyle = "#f7f7fb";
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10, -2, 7, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffb703";
    ctx.beginPath();
    ctx.moveTo(16, -2);
    ctx.lineTo(26, 0);
    ctx.lineTo(16, 3);
    ctx.fill();
    ctx.strokeStyle = "#dfe7f2";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    ctx.quadraticCurveTo(-16, -18 - flap * 10, -28, -4);
    ctx.moveTo(-2, -2);
    ctx.quadraticCurveTo(8, -16 - flap * 8, 20, -2);
    ctx.stroke();
    ctx.restore();
  }

  function drawJelly(x, y, s, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const g = ctx.createRadialGradient(0, -6, 2, 0, 0, 28);
    g.addColorStop(0, "rgba(255,255,255,0.85)");
    g.addColorStop(0.4, "rgba(255,140,190,0.7)");
    g.addColorStop(1, "rgba(120,80,255,0.15)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 18, Math.PI, 0);
    ctx.quadraticCurveTo(16, 10, 0, 8);
    ctx.quadraticCurveTo(-16, 10, -18, 0);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 5, 6);
      ctx.quadraticCurveTo(i * 6 + Math.sin(t * 4 + i) * 4, 20, i * 4, 32 + Math.sin(t * 5 + i) * 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPuffer(x, y, s, t, angry) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const pulse = angry ? 1 + Math.sin(t * 16) * 0.08 : 1;
    ctx.fillStyle = angry ? "#ffd166" : "#ffe8a3";
    ctx.beginPath();
    ctx.ellipse(0, 0, 20 * pulse, 16 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ef8a2f";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 12);
      ctx.lineTo(Math.cos(a) * 24, Math.sin(a) * 20);
      ctx.stroke();
    }
    eyeAt(-6, -2);
    eyeAt(6, -2);
    if (angry) {
      ctx.fillStyle = "#ff5d73";
      ctx.font = "12px Jua, sans-serif";
      ctx.fillText("펑", 12, -16);
    }
    ctx.restore();
  }

  function drawAmbient(t) {
    for (const fish of ambient) {
      fish.x += fish.dir * fish.speed * 0.016;
      if (fish.x > 1100) fish.x = -80;
      if (fish.x < -120) fish.x = 1040;
      const p = project(fish.x, fish.y + Math.sin(t + fish.off) * 10);
      if (p.sy < -80 || p.sy > view.h + 80) continue;
      const zoneY = fish.y / 860;
      const cam = depth01();
      if (fish.kind === "leviathan" && cam < 0.5) continue;
      if (Math.abs(zoneY - cam) > 0.45 && fish.kind !== "leviathan") continue;
      drawFish(fish.kind, p.sx, p.sy, (SIZE[fish.kind] || 70) * fish.scale * p.scale, t + fish.off, fish.dir, false);
    }
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 20 * dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt;
      f.y -= 28 * dt;
      if (f.life <= 0) {
        floaters.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = "#fff6c8";
      ctx.font = "28px Jua, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    const t = clock.t;
    const shake = clock.shake * 8;
    clock.shake = Math.max(0, clock.shake - 0.03);
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawBackground(t);
    drawAmbient(t);
    drawWaves(t);
    drawBoatAndBean(t);
    drawLineAndLure(t);
    drawHazards(t);
    ctx.restore();
    drawParticles(1 / 60);
    const vignette = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.3, view.w / 2, view.h / 2, view.h * 0.75);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(4,10,24,0.28)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  function frame(ts) {
    if (!frame.last) frame.last = ts;
    const dt = clamp((ts - frame.last) / 1000, 0, 0.05);
    frame.last = ts;
    clock.t += dt;
    if (screen === "play" && state && state.phase !== "done") {
      Sim.step(state, dt, readInput());
      drain();
      const target = camTarget();
      clock.cam += (target - clock.cam) * Math.min(1, dt * 2.4);
      if (state.phase === "done") finishRound();
    } else {
      clock.cam += (0 - clock.cam) * Math.min(1, dt * 1.5);
      readInput();
    }
    spawnFoam(dt);
    if (screen === "play") updateHud();
    draw();
    requestAnimationFrame(frame);
  }

  function trackedPointer(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return false;
    const t = e.target;
    if (t && t.closest && t.closest("a, #mute, #title, #result")) return false;
    return true;
  }

  function pressPointer(id) {
    const wasDown = pointers.size > 0 || keyHold;
    pointers.add(id);
    notePress(wasDown);
  }

  function releasePointer(id) {
    if (!pointers.has(id)) return;
    pointers.delete(id);
    noteRelease();
  }

  window.addEventListener("pointerdown", (e) => {
    if (screen !== "play" || !trackedPointer(e)) return;
    e.preventDefault();
    pressPointer(e.pointerId);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
  });
  window.addEventListener("pointerup", (e) => releasePointer(e.pointerId));
  window.addEventListener("pointercancel", (e) => releasePointer(e.pointerId));

  ui.shop.addEventListener("click", (e) => {
    const key = e.target && e.target.dataset && e.target.dataset.buy;
    if (key) buy(key);
  });
  ui.start.addEventListener("click", startRound);
  ui.retry.addEventListener("click", startRound);
  ui.toTitle.addEventListener("click", () => show("title"));
  ui.mute.addEventListener("click", () => {
    muted = !muted;
    ui.mute.textContent = muted ? "🔇" : "🔊";
    ui.mute.setAttribute("aria-label", muted ? "소리 켜기" : "소리 끄기");
  });
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    if (e.repeat || screen !== "play") return;
    e.preventDefault();
    const wasDown = pointers.size > 0 || keyHold;
    keyHold = true;
    notePress(wasDown);
  });
  window.addEventListener("keyup", (e) => {
    if (e.code !== "Space" || !keyHold) return;
    keyHold = false;
    noteRelease();
  });
  window.addEventListener("blur", () => {
    const wasDown = pointers.size > 0 || keyHold;
    keyHold = false;
    pointers.clear();
    if (wasDown) releaseLatch = true;
  });
  window.addEventListener("resize", resize);
  resize();
  renderShop();
  show("title");
  requestAnimationFrame(frame);
})();
