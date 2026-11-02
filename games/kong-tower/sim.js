/* 콩타워 physics. No DOM. Shared by the game and the headless playtests. */
(function (root) {
  const START_W = 104;
  const BLOCK_H = 36;
  const BASE_W = 176;
  const BASE_H = 24;
  const DROP = 168;
  const GRAV = 2500;
  const DRAG = 8.2;
  const AMP = 74;
  const DT = 1 / 120;
  const ATTACH = 0.46;
  const MOVE_NEED = 22;
  const COOLDOWN = 0.32;
  const LIVES = 3;

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

  function heightOf(state) {
    return Math.max(0, state.placed.length - 1);
  }

  function omega(state) {
    const n = heightOf(state);
    return 0.96 + n * 0.036 + Math.max(0, n - 32) * 0.016;
  }

  function fallCut(n) {
    return 0.56 - Math.min(0.16, n * 0.0022);
  }

  function perfectPx(n) {
    return 14 - Math.min(8, n * 0.055);
  }

  function massOf(kind) {
    if (kind === "iron") return 1.65;
    if (kind === "jelly") return 0.92;
    if (kind === "tiny") return 0.9;
    return 1;
  }

  function zoneAt(n) {
    if (n < 5) return "town";
    if (n < 11) return "cloud";
    if (n < 18) return "sunset";
    if (n < 30) return "night";
    return "space";
  }

  function topBlock(state) {
    return state.placed[state.placed.length - 1];
  }

  function topSurface(state) {
    const b = topBlock(state);
    return b.y + b.h / 2;
  }

  function fallDistance() {
    return DROP - BLOCK_H / 2;
  }

  function fallTime() {
    return Math.sqrt((2 * fallDistance()) / GRAV);
  }

  function driftOf(vx) {
    const k = DRAG;
    const T = fallTime();
    return (vx / k) * (1 - Math.exp(-k * T));
  }

  function overlap(a, b) {
    const aL = a.x - a.w / 2;
    const aR = a.x + a.w / 2;
    const bL = b.x - b.w / 2;
    const bR = b.x + b.w / 2;
    const l = Math.max(aL, bL);
    const r = Math.min(aR, bR);
    return { overlap: Math.max(0, r - l), l, r };
  }

  function sampleHook(state, dt) {
    const o = omega(state);
    const ph = state.phase + o * (dt || 0);
    const x = Math.sin(ph) * AMP;
    const vx = AMP * o * Math.cos(ph);
    return { x, vx, phase: ph };
  }

  function rollKind(rng, n) {
    if (n < 16) return "normal";
    const r = rng();
    const tiny = n < 48 ? 0 : 0.05 + Math.min(0.08, (n - 48) * 0.0015);
    const jelly = 0.045 + Math.min(0.05, Math.max(0, n - 18) * 0.0008);
    const iron = 0.04 + Math.min(0.045, Math.max(0, n - 18) * 0.0007);
    if (r < tiny) return "tiny";
    if (r < tiny + jelly) return "jelly";
    if (r < tiny + jelly + iron) return "iron";
    return "normal";
  }

  function widthFor(state, kind) {
    const top = topBlock(state);
    let w = top.foundation ? START_W : top.w;
    if (state.growBank > 0 && kind === "normal") {
      w = Math.min(START_W, w + state.growBank);
    }
    if (kind === "tiny") w *= 0.8;
    else if (kind === "iron") w = Math.min(START_W * 1.02, w * 1.08);
    else if (kind === "jelly") w *= 0.88;
    return Math.max(28, w);
  }

  function hueFor(kind, n) {
    if (kind === "iron") return "#aeb6c6";
    if (kind === "jelly") return "#9aefff";
    if (kind === "tiny") return "#ffe066";
    return ["#ff8fb8", "#7ce7c4", "#ffe066", "#d4b3ff"][n % 4];
  }

  function create(seed) {
    const rng = mulberry32(seed || 1);
    const state = {
      seed: seed || 1,
      rng,
      t: 0,
      phase: rng() * Math.PI * 2,
      placed: [{
        x: 0, y: BASE_H / 2, w: BASE_W, h: BASE_H,
        kind: "base", foundation: true, angle: 0, wobble: 0, color: "#efe6dc", squash: 0,
      }],
      debris: [],
      active: null,
      nextKind: "normal",
      lives: LIVES,
      combo: 0,
      maxCombo: 0,
      perfects: 0,
      attempts: 0,
      comboBonus: 0,
      score: 0,
      growBank: 0,
      over: false,
      endReason: "",
      wind: null,
      windMeter: 2.2,
      lastDrop: -10,
      events: [],
      shakes: 0,
    };
    spawn(state);
    return state;
  }

  function spawn(state) {
    if (state.over) return;
    const kind = state.nextKind;
    const w = widthFor(state, kind);
    if (kind === "normal" && state.growBank > 0) state.growBank = 0;
    const hook = sampleHook(state, 0);
    state.active = {
      x: hook.x,
      y: topSurface(state) + DROP,
      w,
      h: BLOCK_H,
      vx: hook.vx,
      vy: 0,
      angle: 0,
      spin: 0,
      mode: "hook",
      kind,
      color: hueFor(kind, heightOf(state)),
      born: state.t,
      bornX: hook.x,
      ready: false,
      squash: 0,
      wobble: 0,
    };
    state.nextKind = rollKind(state.rng, heightOf(state) + 1);
  }

  function loseLife(state, count) {
    state.lives -= count || 1;
    state.events.push({ type: "life", lives: state.lives });
    if (state.lives <= 0) {
      state.lives = 0;
      state.over = true;
      state.endReason = "lives";
      state.deathWidth = state.placed.length ? state.placed[state.placed.length - 1].w : 0;
      state.active = null;
    }
  }

  function addScore(state, perfect) {
    const h = heightOf(state);
    state.score += 100 + h;
    if (perfect) {
      state.combo += 1;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      const bonus = 40 + state.combo * 18;
      state.comboBonus += bonus;
      state.score += bonus;
      state.perfects += 1;
      if (state.combo > 0 && state.combo % 3 === 0) state.growBank += 9;
    } else {
      state.combo = 0;
    }
  }

  function cutDebris(state, block, side, width) {
    if (width < 6) return;
    const dir = side === "right" ? 1 : -1;
    state.debris.push({
      x: block.x + dir * (block.w / 2 + width / 2),
      y: block.y,
      w: width,
      h: block.h * 0.92,
      vx: dir * (80 + width * 2),
      vy: 90,
      angle: 0,
      spin: dir * 3.2,
      color: block.color,
      kind: block.kind,
      life: 2.4,
    });
  }

  function toppleFrom(state, index) {
    const falling = state.placed.splice(index);
    let n = 0;
    for (const b of falling) {
      if (b.foundation) continue;
      n += 1;
      state.debris.push({
        x: b.x, y: b.y, w: b.w, h: b.h,
        vx: (b.x >= 0 ? 1 : -1) * (120 + state.rng() * 40),
        vy: 60 + n * 20,
        angle: b.angle || 0,
        spin: (b.x >= 0 ? 1 : -1) * 2.4,
        color: b.color,
        kind: b.kind,
        life: 2.8,
      });
    }
    if (n > 0) {
      state.combo = 0;
      state.events.push({ type: "topple", n, x: 0, y: topSurface(state) });
      state.shakes = Math.min(1, 0.35 + n * 0.15);
      loseLife(state, n);
    }
  }

  function settle(state) {
    const block = state.active;
    const top = topBlock(state);
    block.y = top.y + top.h / 2 + block.h / 2;
    if (block.kind === "jelly") block.x += block.vx * 0.045;
    const hit = overlap(block, top);
    const unsup = 1 - (block.w > 0 ? hit.overlap / block.w : 1);
    const dx = block.x - top.x;
    const n = heightOf(state);
    if (Number.isFinite(block.aim)) {
      state.aimErr = (state.aimErr || 0) + Math.abs(block.aim - top.x);
      state.modelErr = (state.modelErr || 0) + Math.abs(block.x - block.aim);
      state.aimN = (state.aimN || 0) + 1;
    }
    state.lastDx = dx;
    state.dxSum = (state.dxSum || 0) + Math.abs(dx);
    state.dxN = (state.dxN || 0) + 1;
    state.dxMax = Math.max(state.dxMax || 0, Math.abs(dx));
    if (Math.abs(dx) > 16 && state.wind && state.wind.phase === "gust") state.windMiss = (state.windMiss || 0) + 1;
    if (Math.abs(dx) > 16) {
      state.bigMiss = (state.bigMiss || 0) + 1;
      (state.bigList = state.bigList || []).push({
        dx: Math.round(dx),
        n: n,
        wind: state.wind ? state.wind.phase : "",
        kind: block.kind,
        w: Math.round(block.w),
        top: Math.round(top.x),
        aim: Math.round(block.aim || 0),
        hx: Math.round(block.x),
        planTop: Math.round(block.planTop || 0),
        planErr: Math.round((block.planErr || 0) * 10) / 10,
        planWait: Math.round((block.planWait || 0) * 1000) / 1000,
      });
    }
    state.attempts += 1;
    if (hit.overlap < 8 || unsup > fallCut(n)) {
      block.spin = dx >= 0 ? 2.6 : -2.6;
      block.vy = 30;
      block.life = 2.6;
      state.debris.push(block);
      state.events.push({ type: "miss", x: block.x, y: block.y });
      state.combo = 0;
      state.shakes = 0.45;
      state.active = null;
      loseLife(state, 1);
      if (!state.over) spawn(state);
      return;
    }
    const perfect = Math.abs(dx) <= perfectPx(n) && block.kind !== "tiny";
    if (perfect) {
      block.x = top.x;
      block.angle = 0;
      block.squash = 1;
      state.placed.push(block);
      addScore(state, true);
      state.events.push({ type: "perfect", x: block.x, y: block.y, combo: state.combo });
      state.shakes = 0.12;
    } else {
      const leftCut = Math.max(0, hit.l - (block.x - block.w / 2));
      const rightCut = Math.max(0, (block.x + block.w / 2) - hit.r);
      cutDebris(state, block, "left", leftCut);
      cutDebris(state, block, "right", rightCut);
      block.w = hit.overlap;
      block.x = (hit.l + hit.r) / 2;
      block.wobble = Math.min(0.22, Math.abs(dx) / 180);
      block.squash = 1;
      state.placed.push(block);
      addScore(state, false);
      state.events.push({ type: "land", x: block.x, y: block.y, sliced: leftCut + rightCut > 8 });
      state.shakes = 0.28;
      if (block.kind === "iron" && Math.abs(dx) > 16 && state.placed.length >= 3) {
        const below = state.placed[state.placed.length - 2];
        if (!below.foundation) {
          below.x += Math.sign(dx) * 10;
          below.wobble = 0.16;
          const under = state.placed[state.placed.length - 3];
          const chk = overlap(below, under);
          if (chk.overlap < below.w * 0.48) toppleFrom(state, state.placed.length - 2);
        }
      }
    }
    state.active = null;
    if (!state.over) spawn(state);
  }

  function applyWindShove(state) {
    if (state.placed.length < 2 || !state.wind) return;
    const top = topBlock(state);
    if (top.foundation) return;
    const shove = state.wind.dir * state.wind.power / massOf(top.kind);
    top.x += shove;
    top.wobble = Math.min(0.28, 0.08 + Math.abs(shove) / 200);
    const below = state.placed[state.placed.length - 2];
    const hit = overlap(top, below);
    state.events.push({ type: "gust", dir: state.wind.dir, power: state.wind.power });
    if (hit.overlap < top.w * 0.36) toppleFrom(state, state.placed.length - 1);
  }

  function windAccel(state) {
    if (!state.wind || state.wind.phase !== "gust") return 0;
    return state.wind.dir * (90 + state.wind.power * 2.1);
  }

  function step(state, dt) {
    if (state.over) return;
    state.events.length = 0;
    state.t += dt;
    const n = heightOf(state);
    if (!state.wind && n >= 18) {
      state.windMeter += dt;
      const gap = Math.max(3.8, 10.5 - n * 0.055);
      if (state.windMeter >= gap) {
        state.windMeter = 0;
        state.wind = {
          phase: "warn",
          t: 0,
          dir: state.rng() < 0.5 ? -1 : 1,
          power: 12 + Math.min(78, Math.max(0, n - 18) * 0.72),
        };
        state.events.push({ type: "wind-warn", dir: state.wind.dir });
      }
    } else if (state.wind) {
      state.wind.t += dt;
      if (state.wind.phase === "warn" && state.wind.t >= 0.82) {
        state.wind.phase = "gust";
        state.wind.t = 0;
        applyWindShove(state);
      } else if (state.wind.phase === "gust" && state.wind.t >= 0.62) {
        state.wind = null;
      }
    }

    state.phase += omega(state) * dt;
    const hook = sampleHook(state, 0);

    if (state.active && state.active.mode === "hook") {
      const sway = state.wind && state.wind.phase === "gust" ? state.wind.dir * 8 : 0;
      state.active.x = hook.x + sway;
      state.active.vx = hook.vx;
      state.active.y = topSurface(state) + DROP;
      if (!state.active.ready && state.t - state.active.born >= ATTACH && Math.abs(state.active.x - state.active.bornX) >= MOVE_NEED) {
        state.active.ready = true;
        state.events.push({ type: "ready" });
      }
    } else if (state.active && state.active.mode === "fall") {
      state.active.vy -= GRAV * dt;
      state.active.vx *= Math.exp(-DRAG * dt);
      state.active.vx += windAccel(state) * dt;
      state.active.x += state.active.vx * dt;
      state.active.y += state.active.vy * dt;
      state.active.angle += state.active.vx * dt * 0.004;
      if (state.active.y - state.active.h / 2 <= topSurface(state)) settle(state);
      else if (state.active.y < topSurface(state) - 520) {
        state.debris.push(state.active);
        state.events.push({ type: "miss", x: state.active.x, y: state.active.y });
        state.combo = 0;
        state.active = null;
        loseLife(state, 1);
        if (!state.over) spawn(state);
      }
    } else if (!state.active && !state.over) spawn(state);

    for (const d of state.debris) {
      d.vy -= GRAV * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.angle += d.spin * dt;
      d.life -= dt;
    }
    state.debris = state.debris.filter((d) => d.life > 0 && d.y > -800);
    for (const b of state.placed) {
      if (b.squash > 0) b.squash = Math.max(0, b.squash - dt * 2.6);
      if (b.wobble > 0.001) {
        b.wobble *= Math.exp(-1.6 * dt);
        b.angle = Math.sin(state.t * 16) * b.wobble;
      } else b.angle = 0;
    }
    if (state.shakes > 0) state.shakes = Math.max(0, state.shakes - dt * 1.4);
  }

  function drop(state) {
    if (state.over || !state.active || state.active.mode !== "hook" || !state.active.ready) return false;
    if (state.t - state.lastDrop < COOLDOWN) return false;
    state.active.mode = "fall";
    state.active.vy = 0;
    state.active.aim = state.active.x + driftOf(state.active.vx);
    state.lastDrop = state.t;
    state.events.push({ type: "drop", x: state.active.x, y: state.active.y });
    return true;
  }

  function landingBias(state, dt) {
    let wind = 0;
    if (state.wind) {
      const untilGust = state.wind.phase === "warn" ? Math.max(0, 0.82 - state.wind.t) : 0;
      const gustLeft = state.wind.phase === "gust" ? Math.max(0, 0.62 - state.wind.t) : 0.62;
      const T = fallTime();
      const gustDuringFall = untilGust < dt + T * 0.5 && (state.wind.phase === "gust" || untilGust < T);
      if (gustDuringFall) {
        const accel = state.wind.dir * (90 + state.wind.power * 2.1);
        const overlapT = state.wind.phase === "gust" ? Math.min(T, gustLeft) : Math.max(0, T - untilGust);
        wind = accel * overlapT * overlapT * 0.35;
      }
    }
    return wind;
  }

  function botDelay(state, profile, rng) {
    const target = topBlock(state).x;
    const o = omega(state);
    const period = (Math.PI * 2) / o;
    let searchFrom = 0;
    if (profile.windSkill >= 0.55 && state.wind && state.wind.phase === "warn") {
      searchFrom = Math.max(0, 0.82 - state.wind.t + 0.66);
    }
    let bestT = searchFrom + 0.05;
    let bestErr = 1e9;
    let soonT = null;
    const steps = 72;
    const span = period * 1.05;
    const soonLimit = perfectPx(heightOf(state)) + 3;
    for (let i = 0; i <= steps; i++) {
      const dt = searchFrom + (span * i) / steps;
      const hook = sampleHook(state, dt);
      const lead = profile.lead;
      const predicted = hook.x + lead * driftOf(hook.vx) + lead * profile.windSkill * landingBias(state, dt);
      const err = Math.abs(predicted - target);
      if (err < bestErr) {
        bestErr = err;
        bestT = dt;
      }
      if (soonT == null && err <= soonLimit) soonT = dt;
    }
    if (profile.soonest && soonT != null) {
      bestT = soonT;
      bestErr = soonLimit;
    }
    state._bestErr = bestErr;
    state._bestT = bestT;
    let wait = bestT + gauss(rng) * profile.timingSd;
    if (rng() < profile.blunder) wait += (rng() < 0.5 ? -1 : 1) * profile.blunderMag;
    return Math.max(0.02, wait);
  }

  const PROFILES = {
    novice: { timingSd: 0.09, lead: 0.22, blunder: 0.12, blunderMag: 0.16, windSkill: 0.08 },
    average: { timingSd: 0.042, lead: 0.74, blunder: 0.04, blunderMag: 0.09, windSkill: 0.72 },
    skilled: { timingSd: 0.018, lead: 0.98, blunder: 0.008, blunderMag: 0.045, windSkill: 0.96 },
  };

  function run(seed, profile, limitSec) {
    const state = create(seed);
    const rng = mulberry32((seed * 997) ^ 0x85ebca6b);
    const spec = typeof profile === "string" ? PROFILES[profile] : profile;
    const limit = limitSec || 360;
    let plan = null;
    let guard = 0;
    while (!state.over && state.t < limit && guard < 80000) {
      guard += 1;
      if (state.active && state.active.mode === "hook" && state.active.ready) {
        const moved = plan != null && Math.abs(topBlock(state).x - state.active.planTop) > 3;
        if (plan == null || (moved && spec.lead >= 0.5)) {
          const wait = botDelay(state, spec, rng);
          plan = state.t + wait;
          state.active.planWait = wait;
          state.active.planErr = state._bestErr;
          state.active.planTop = topBlock(state).x;
        }
      }
      if (plan != null && state.t >= plan && state.active && state.active.mode === "hook") {
        drop(state);
        plan = null;
      }
      step(state, DT);
      if (!state.active || state.active.mode !== "hook" || !state.active.ready) {
        if (!(state.active && state.active.mode === "hook" && state.active.ready)) plan = null;
      }
    }
    if (!state.over && state.t >= limit) state.endReason = "time";
    const placed = heightOf(state);
    return {
      seed,
      profile: typeof profile === "string" ? profile : "custom",
      height: placed,
      score: Math.round(state.score),
      perfects: state.perfects,
      attempts: state.attempts,
      perfectRate: state.attempts ? Math.round((state.perfects / state.attempts) * 1000) / 10 : 0,
      maxCombo: state.maxCombo,
      duration: Math.round(state.t * 10) / 10,
      end: state.endReason || "time",
      zone: zoneAt(placed),
      lives: state.lives,
      meanAbsDx: state.dxN ? Math.round((state.dxSum / state.dxN) * 10) / 10 : 0,
      deathWidth: Math.round(state.deathWidth || 0),
      dxMax: Math.round(state.dxMax || 0),
      bigMiss: state.bigMiss || 0,
      windMiss: state.windMiss || 0,
      aimErr: state.aimN ? Math.round((state.aimErr / state.aimN) * 10) / 10 : 0,
      modelErr: state.aimN ? Math.round((state.modelErr / state.aimN) * 10) / 10 : 0,
      bigList: state.bigList || [],
    };
  }

  function aggregate(rows) {
    const nums = (key) => rows.map((r) => r[key]);
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
    const ends = {};
    const zones = {};
    for (const r of rows) {
      ends[r.end] = (ends[r.end] || 0) + 1;
      zones[r.zone] = (zones[r.zone] || 0) + 1;
    }
    const heights = nums("height").slice().sort((a, b) => a - b);
    const mid = heights[Math.floor(heights.length / 2)] || 0;
    return {
      runs: rows.length,
      height: Math.round(avg(nums("height")) * 10) / 10,
      heightP50: mid,
      heightMin: heights[0] || 0,
      heightMax: heights[heights.length - 1] || 0,
      perfectRate: Math.round(avg(nums("perfectRate")) * 10) / 10,
      duration: Math.round(avg(nums("duration")) * 10) / 10,
      score: Math.round(avg(nums("score"))),
      ends,
      zones,
      infinite: rows.filter((r) => r.end === "time").length,
    };
  }

  function benchmark(runs) {
    const n = runs || 24;
    const out = {};
    for (const name of Object.keys(PROFILES)) {
      const rows = [];
      for (let i = 1; i <= n; i++) rows.push(run(i * 17 + name.length * 13, name));
      out[name] = aggregate(rows);
    }
    return out;
  }

  function checkDrift() {
    const state = create(3);
    state.active.ready = true;
    state.active.mode = "hook";
    const hook = sampleHook(state, 0);
    state.active.x = hook.x;
    state.active.vx = hook.vx;
    drop(state);
    const predicted = hook.x + driftOf(hook.vx);
    let guard = 0;
    while (state.active && state.active.mode === "fall" && guard < 5000) {
      step(state, DT);
      guard += 1;
    }
    const contact = state.lastDx || 0;
    return {
      predicted: Math.round(predicted * 10) / 10,
      contact: Math.round(contact * 10) / 10,
      dx: Math.round((contact - predicted) * 10) / 10,
    };
  }

  root.KongTowerSim = {
    START_W, BLOCK_H, DROP, GRAV, AMP, DT, PROFILES,
    create, step, drop, run, benchmark, aggregate, botDelay, sampleHook,
    zoneAt, heightOf, checkDrift, perfectPx, fallCut, omega, driftOf,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
