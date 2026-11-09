/* 콩낚시왕 rules. No DOM. Shared by the game and the headless playtests. */
(function (root) {
  const ROUND = 90;
  const OVERTIME = 8;
  const LIVES = 3;
  const CLEAR_SCORE = 7200;
  const CLEAR_CATCHES = 4;

  const FISH = [
    { id: "anchovy", name: "콩멸치", zone: "shallow", rarity: "common", value: 110, power: 0.46, pattern: "steady", line: 100, weight: 42 },
    { id: "clown", name: "줄무늬콩어", zone: "shallow", rarity: "common", value: 170, power: 0.58, pattern: "zigzag", line: 118, weight: 30 },
    { id: "mackerel", name: "콩고등어", zone: "shallow", rarity: "uncommon", value: 280, power: 0.7, pattern: "burst", line: 132, weight: 16 },
    { id: "tuna", name: "참콩치", zone: "deep", rarity: "uncommon", value: 480, power: 0.86, pattern: "burst", line: 156, weight: 26 },
    { id: "squid", name: "오징어콩", zone: "deep", rarity: "rare", value: 700, power: 0.98, pattern: "zigzag", line: 168, weight: 15 },
    { id: "lantern", name: "등불콩어", zone: "deep", rarity: "rare", value: 860, power: 1.05, pattern: "dive", line: 176, weight: 11 },
    { id: "eel", name: "동굴장어", zone: "cave", rarity: "epic", value: 1240, power: 1.16, pattern: "dive", line: 198, weight: 18 },
    { id: "angler", name: "유령아귀콩", zone: "cave", rarity: "epic", value: 1640, power: 1.28, pattern: "erratic", line: 210, weight: 10 },
    { id: "leviathan", name: "콩리비아탄", zone: "cave", rarity: "legendary", value: 4600, power: 1.5, pattern: "boss", line: 248, weight: 6 },
  ];

  const ZONE_CAST = {
    shallow: { power: 0.4, angle: 46 },
    deep: { power: 0.72, angle: 50 },
    cave: { power: 0.94, angle: 53 },
  };

  const HOOK_WINDOW = {
    common: 0.38,
    uncommon: 0.31,
    rare: 0.26,
    epic: 0.22,
    legendary: 0.2,
  };

  const PROFILES = {
    newbie: {
      zone: [0.74, 0.22, 0.04],
      powerErr: 0.11,
      angleErr: 9,
      react: 0.2,
      hookSigma: 0.15,
      mash: 0.62,
      hiPad: 14,
      loPad: -2,
      reelReact: 0.2,
      yankReact: 0.42,
      gullGap: 0.42,
      pufferReact: 0.55,
    },
    average: {
      zone: [0.42, 0.46, 0.12],
      powerErr: 0.06,
      angleErr: 5.2,
      react: 0.13,
      hookSigma: 0.072,
      mash: 0.2,
      hiPad: 3,
      loPad: 8,
      reelReact: 0.12,
      yankReact: 0.16,
      gullGap: 0.22,
      pufferReact: 0.28,
    },
    skilled: {
      zone: [0.12, 0.6, 0.28],
      powerErr: 0.03,
      angleErr: 2.4,
      react: 0.08,
      hookSigma: 0.036,
      mash: 0.04,
      hiPad: 0,
      loPad: 12,
      reelReact: 0.06,
      yankReact: 0.05,
      gullGap: 0.15,
      pufferReact: 0.11,
    },
    hunter: {
      zone: [0.04, 0.2, 0.76],
      powerErr: 0.028,
      angleErr: 2.2,
      react: 0.075,
      hookSigma: 0.038,
      mash: 0.05,
      hiPad: 1,
      loPad: 12,
      reelReact: 0.06,
      yankReact: 0.055,
      gullGap: 0.15,
      pufferReact: 0.1,
    },
  };

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

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function angleEff(deg) {
    const s = Math.sin((deg * Math.PI) / 180);
    let e = s;
    if (deg > 64) e *= 0.8;
    if (deg < 30) e *= 0.68;
    return e;
  }

  function depthOf(power, angle, rod) {
    const rodM = 1 + (rod || 0) * 0.028;
    return clamp(power * angleEff(angle) * 1.12 * rodM, 0.05, 0.99);
  }

  function zoneOf(depth) {
    if (depth < 0.4) return "shallow";
    if (depth < 0.72) return "deep";
    return "cave";
  }

  function powerAt(t) {
    const period = 1.42;
    const u = (t % period) / period;
    return Math.sin(u * Math.PI);
  }

  function angleAt(t) {
    const period = 1.22;
    const u = (t % period) / period;
    return 18 + Math.sin(u * Math.PI) * 60;
  }

  function sweetOf(rod) {
    return { lo: 40 - rod * 0.7, hi: 64 + rod * 0.85 };
  }

  function spikePattern(t, period, spike, peakForce) {
    const warn = 0.2;
    const cyc = t % period;
    const start = period - spike;
    const active = cyc >= start;
    return {
      force: active ? peakForce : 0.48 + (cyc / Math.max(0.25, start)) * 0.22,
      windup: !active && cyc >= start - warn,
      kick: active && cyc < start + 0.03,
    };
  }

  function hookWindow(fish, bait) {
    return HOOK_WINDOW[fish.rarity] + bait * 0.01;
  }

  function openingWindow(state) {
    const base = hookWindow(state.fish, state.gear.bait);
    if (state.catches === 0 && state.misses === 0 && state.fish.rarity === "common") return base + 0.14;
    return base;
  }

  function flightDur(power) {
    return 0.48 + power * 0.28;
  }

  function sinkDur(depth) {
    return 0.42 + depth * 1.35;
  }

  function biteTiming(state) {
    if (!state.fish) return null;
    const telegraph = 0.24;
    const window = openingWindow(state);
    return { telegraph, window, open: state.biteAt + telegraph, close: state.biteAt + telegraph + window };
  }

  function forceOf(pattern, t, lineRatio) {
    if (pattern === "steady") return { force: 0.72 + Math.sin(t * 1.6) * 0.08, windup: false, kick: false };
    if (pattern === "zigzag") return spikePattern(t, 1.45, 0.22, 1.22);
    if (pattern === "burst") return spikePattern(t, 1.78, 0.28, 1.48);
    if (pattern === "dive") return spikePattern(t, 2.15, 0.3, 1.58);
    if (pattern === "erratic") return spikePattern(t, 1.32, 0.22, 1.42);
    if (lineRatio > 0.64) return spikePattern(t, 1.58, 0.28, 1.55);
    if (lineRatio > 0.32) return spikePattern(t, 1.28, 0.24, 1.52);
    return spikePattern(t, 1.08, 0.24, 1.7);
  }

  function loadoutOf(raw) {
    const src = raw || {};
    return {
      rod: clamp(src.rod | 0, 0, 5),
      reel: clamp(src.reel | 0, 0, 5),
      bait: clamp(src.bait | 0, 0, 5),
    };
  }

  function create(seed, loadout) {
    return {
      seed: seed >>> 0,
      rng: mulberry32(seed || 1),
      gear: loadoutOf(loadout),
      phase: "ready",
      time: 0,
      overtime: false,
      lives: LIVES,
      score: 0,
      combo: 0,
      maxCombo: 0,
      catches: 0,
      misses: 0,
      snaps: 0,
      escapes: 0,
      gullFails: 0,
      pufferSnaps: 0,
      legendary: false,
      fishLog: [],
      zoneCounts: { shallow: 0, deep: 0, cave: 0 },
      depth: 0,
      power: 0,
      angle: 18,
      castT: 0,
      lureX: 180,
      fish: null,
      line: 0,
      lineStart: 0,
      tension: 42,
      fightT: 0,
      waitT: 0,
      biteAt: 1,
      hazard: null,
      hazardT: 0,
      gullHits: 0,
      jellyDone: false,
      jellyAt: -1,
      pufferAt: -1,
      shake: 0,
      recoverT: 0,
      recoverKind: null,
      perfects: 0,
      message: "",
      end: null,
      events: [],
      bot: null,
    };
  }

  function pushEvent(state, type, extra) {
    state.events.push(Object.assign({ type, t: state.time }, extra || {}));
    if (state.events.length > 12) state.events.shift();
  }

  function pickZone(rng, weights) {
    const r = rng();
    if (r < weights[0]) return "shallow";
    if (r < weights[0] + weights[1]) return "deep";
    return "cave";
  }

  function pickFish(state) {
    const zone = zoneOf(state.depth);
    const bait = state.gear.bait;
    const pool = FISH.filter((f) => f.zone === zone && !(state.legendary && f.id === "leviathan"));
    let total = 0;
    const weights = pool.map((f) => {
      let w = f.weight;
      if (f.rarity === "uncommon") w *= 1 + bait * 0.08;
      if (f.rarity === "rare") w *= 1 + bait * 0.14;
      if (f.rarity === "epic") w *= 1 + bait * 0.18;
      if (f.rarity === "legendary") w *= 0.42 + bait * 0.2;
      total += w;
      return w;
    });
    let r = state.rng() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function beginRecover(state, kind) {
    state.phase = "recover";
    state.recoverT = 0;
    state.recoverKind = kind;
    state.hazard = null;
  }

  function missFish(state, reason) {
    state.misses += 1;
    state.combo = 0;
    state.message = reason;
    pushEvent(state, "miss", { reason });
    beginRecover(state, "miss");
  }

  function snapLine(state, reason) {
    state.snaps += 1;
    state.lives -= 1;
    state.combo = 0;
    state.message = reason;
    if (reason === "puffer") state.pufferSnaps += 1;
    pushEvent(state, "snap", { reason });
    if (state.lives <= 0) {
      finish(state, "lives");
      return;
    }
    beginRecover(state, "snap");
  }

  function escapeFish(state) {
    state.escapes += 1;
    state.combo = 0;
    state.message = "놓쳤다";
    pushEvent(state, "escape");
    beginRecover(state, "escape");
  }

  function catchFish(state) {
    const fish = state.fish;
    const perfect = !!state.hookPerfect;
    const mult = 1 + Math.min(state.combo, 12) * 0.12;
    const perfectM = perfect ? 1.18 : 1;
    const points = Math.round(fish.value * mult * perfectM);
    state.score += points;
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.catches += 1;
    if (perfect) state.perfects += 1;
    if (fish.id === "leviathan") state.legendary = true;
    state.fishLog.push({
      id: fish.id,
      name: fish.name,
      zone: fish.zone,
      rarity: fish.rarity,
      points,
      perfect,
    });
    state.message = perfect ? "완벽 포획" : "포획";
    pushEvent(state, "catch", { id: fish.id, points, perfect });
    beginRecover(state, "catch");
  }

  function finish(state, end) {
    state.phase = "done";
    state.end = end;
    state.rank = rankOf(state);
    state.clear = isClear(state);
    state.coins = 36 + Math.floor(state.score / 18);
    pushEvent(state, "done", { end });
  }

  function rankOf(state) {
    if (state.legendary) return "전설";
    if (state.score >= CLEAR_SCORE && state.catches >= CLEAR_CATCHES && state.lives > 0) return "낚시왕";
    if (state.score >= 1500) return "실력자";
    if (state.score >= 650) return "견습";
    return "빈그물";
  }

  function isClear(state) {
    return state.legendary || (state.lives > 0 && state.score >= CLEAR_SCORE && state.catches >= CLEAR_CATCHES);
  }

  function startCast(state) {
    state.phase = "charge";
    state.castT = 0;
    state.power = 0;
    state.angle = 18;
    state.fish = null;
    state.hazard = null;
    state.message = "";
  }

  function lockPower(state) {
    state.power = clamp(powerAt(state.castT), 0.04, 1);
    state.phase = "angle";
    state.castT = 0;
  }

  function lockAngle(state) {
    state.angle = angleAt(state.castT);
    state.depth = depthOf(state.power, state.angle, state.gear.rod);
    state.zoneCounts[zoneOf(state.depth)] += 1;
    state.phase = "flight";
    state.castT = 0;
    state.lureX = 210 + state.power * 250 + Math.sin((state.angle * Math.PI) / 180) * 40;
    pushEvent(state, "cast", { depth: state.depth, zone: zoneOf(state.depth) });
  }

  function beginWait(state) {
    const zone = zoneOf(state.depth);
    state.fish = pickFish(state);
    state.phase = "wait";
    state.waitT = 0;
    state.biteAt = 0.95 + state.rng() * 1.25 - state.gear.bait * 0.07;
    state.hazard = null;
    state.hazardT = 0;
    state.gullHits = 0;
    if (zone === "shallow" && state.rng() < 0.24) {
      state.hazard = "gull";
      state.biteAt += 1.55;
    }
  }

  function beginFight(state, perfect) {
    const fish = state.fish;
    const gear = state.gear;
    state.phase = "reel";
    state.fightT = 0;
    state.lineStart = fish.line * (1 - gear.reel * 0.006);
    state.line = state.lineStart;
    state.tension = 40 + state.rng() * 6;
    state.hookPerfect = !!perfect;
    state.hazard = null;
    state.hazardT = 0;
    state.shake = 0;
    state.jellyDone = false;
    state.jellyAt = -1;
    state.pufferAt = -1;
    const zone = fish.zone;
    const jellyP = zone === "cave" ? 0.36 : zone === "deep" ? 0.28 : 0.06;
    const pufferP = zone === "cave" ? 0.26 : zone === "deep" ? 0.13 : 0.02;
    if (state.rng() < jellyP) state.jellyAt = 0.55 + state.rng() * 1.6;
    if (fish.id !== "leviathan" && state.rng() < pufferP) state.pufferAt = 0.9 + state.rng() * 0.55;
    pushEvent(state, "hook", { id: fish.id, perfect: !!perfect });
  }

  function tensionGain(state, force) {
    const fish = state.fish;
    const damp = 1 - state.gear.rod * 0.02;
    return (20 + fish.power * 16) * force * damp;
  }

  function tickReel(state, dt, input) {
    const fish = state.fish;
    const gear = state.gear;
    state.fightT += dt;
    const ratio = clamp(state.line / state.lineStart, 0, 1.4);
    const sample = forceOf(fish.pattern, state.fightT, ratio);
    const force = sample.force;
    if (sample.windup && !state.windup) state.windupId = (state.windupId || 0) + 1;
    state.windup = !!sample.windup;
    state.fishForce = force;
    const sweet = sweetOf(gear.rod);
    state.sweetLo = sweet.lo;
    state.sweetHi = sweet.hi;
    const latched = state.hazard === "puffer";
    if (sample.kick && !state.kickLatch) {
      state.kickLatch = true;
      state.tension = clamp(state.tension + 8 + fish.power * 5, 0, 100);
      pushEvent(state, "yank");
    } else if (!sample.kick) {
      state.kickLatch = false;
    }

    if (!state.jellyDone && state.jellyAt > 0 && state.fightT >= state.jellyAt) {
      state.jellyDone = true;
      state.tension = clamp(state.tension + (fish.zone === "cave" ? 27 : 22), 0, 100);
      pushEvent(state, "jelly");
    }

    if (state.pufferAt > 0 && state.hazard !== "puffer" && state.hazard !== "puffer-warn") {
      if (state.fightT >= state.pufferAt - 0.38) state.hazard = "puffer-warn";
    }
    if (state.pufferAt > 0 && state.hazard === "puffer-warn" && state.fightT >= state.pufferAt) {
      state.hazard = "puffer";
      state.hazardT = 0;
      state.shake = 0;
      pushEvent(state, "puffer");
    }

    if (latched) {
      state.hazardT += dt;
      state.tension = clamp(state.tension - (32 + gear.reel * 2) * dt, 0, 100);
      if (!input.hold && state.tension < 52) state.shake += dt;
      else state.shake = Math.max(0, state.shake - dt * 0.25);
      if (state.shake >= 0.4) {
        state.hazard = null;
        state.pufferAt = -1;
        state.message = "복어를 털었다";
        pushEvent(state, "shake");
      } else if (state.hazardT >= 2.15) {
        snapLine(state, "puffer");
      }
      return;
    }

    if (input.hold) {
      state.tension = clamp(state.tension + tensionGain(state, force) * dt, 0, 100);
      let eff = 0.34;
      if (state.tension >= sweet.lo && state.tension <= sweet.hi) eff = 1;
      else if (state.tension > sweet.hi && state.tension < 90) eff = 0.62;
      else if (state.tension >= 90) eff = 0.28;
      const reelSpeed = 36 + gear.reel * 1.2;
      state.line -= reelSpeed * eff * dt;
    } else {
      const drop = 48 + gear.reel * 1.5;
      const yankPull = force > 1.15 ? (force - 0.75) * 26 : fish.power * force * 2.4;
      state.tension = clamp(state.tension + (yankPull - drop) * dt, 0, 100);
      const slack = clamp((sweet.lo - state.tension) / Math.max(10, sweet.lo), 0, 1);
      const run = (2.4 + fish.power * 7.2) * (0.08 + 0.92 * slack) * (0.55 + 0.45 * force);
      state.line += run * dt;
    }

    if (state.tension >= 100) {
      state.overTension = (state.overTension || 0) + dt;
      if (state.overTension >= 0.07) snapLine(state, "tension");
    } else {
      state.overTension = 0;
    }
    if (state.phase !== "reel") return;

    if (state.line <= 0) {
      catchFish(state);
      return;
    }
    if (state.line > state.lineStart * 1.55) {
      escapeFish(state);
      return;
    }
    const limit = fish.pattern === "boss" ? 17.4 : 14.2;
    if (state.fightT > limit) escapeFish(state);
  }

  function tick(state, dt, input) {
    if (state.phase === "done") return;
    const inp = input || { hold: false, tap: false, release: false };
    state.time += dt;
    if (!state.overtime && state.time >= ROUND) state.overtime = true;
    if (state.overtime && (state.phase === "ready" || state.phase === "charge" || state.phase === "angle")) {
      finish(state, "time");
      return;
    }
    if (state.time >= ROUND + OVERTIME) {
      finish(state, "time");
      return;
    }

    if (state.phase === "ready") {
      if (inp.tap) startCast(state);
      return;
    }

    if (state.phase === "charge") {
      state.castT += dt;
      state.power = powerAt(state.castT);
      if (inp.release || (state.castT > 0.08 && !inp.hold && !inp.tap)) lockPower(state);
      else if (state.castT > 4.4) lockPower(state);
      return;
    }

    if (state.phase === "angle") {
      state.castT += dt;
      state.angle = angleAt(state.castT);
      if (inp.tap) lockAngle(state);
      else if (state.castT > 3.2) lockAngle(state);
      return;
    }

    if (state.phase === "flight") {
      state.castT += dt;
      const dur = 0.48 + state.power * 0.28;
      if (state.castT >= dur) {
        state.phase = "sink";
        state.castT = 0;
        pushEvent(state, "splash", { depth: state.depth });
      }
      return;
    }

    if (state.phase === "sink") {
      state.castT += dt;
      const dur = 0.42 + state.depth * 1.35;
      if (state.castT >= dur) beginWait(state);
      return;
    }

    if (state.phase === "wait") {
      state.waitT += dt;
      if (state.hazard === "gull") {
        state.hazardT += dt;
        if (inp.tap) state.gullHits += 1;
        if (state.gullHits >= 4) {
          state.hazard = null;
          state.biteAt = state.waitT + 0.48 + state.rng() * 0.35;
          state.message = "갈매기를 쫓았다";
          pushEvent(state, "gull-off");
        } else if (state.hazardT > 1.22) {
          state.gullFails += 1;
          state.combo = 0;
          state.message = "미끼를 뺏겼다";
          pushEvent(state, "gull");
          beginRecover(state, "gull");
        }
        return;
      }

      const fish = state.fish;
      const timing = biteTiming(state);
      const window = timing.window;
      const open = timing.open;
      const close = timing.close;
      const firstBite = state.catches === 0 && state.misses === 0;
      if (state.waitT >= state.biteAt && state.waitT < open && state.message !== "아직") state.message = "곧 물어요";
      if (state.waitT >= open && state.waitT <= close) state.message = "챔";
      if (inp.tap) {
        if (state.waitT >= state.biteAt && state.waitT < open) {
          if (firstBite) {
            state.message = "아직";
            return;
          }
          missFish(state, "너무 일렀다");
          return;
        }
        if (state.waitT >= open && state.waitT <= close) {
          const mid = open + window * 0.5;
          const perfect = Math.abs(state.waitT - mid) <= window * 0.22;
          beginFight(state, perfect);
          return;
        }
      }
      if (state.waitT > close) missFish(state, "입질을 놓쳤다");
      return;
    }

    if (state.phase === "reel") {
      tickReel(state, dt, inp);
      return;
    }

    if (state.phase === "recover") {
      state.recoverT += dt;
      const wait = state.recoverKind === "catch" ? 0.72 : 0.58;
      if (state.recoverT >= wait) {
        if (state.lives <= 0) finish(state, "lives");
        else state.phase = "ready";
      }
    }
  }

  function step(state, dt, input) {
    const frame = 1 / 60;
    let left = Math.min(Math.max(dt, 0), 0.05);
    let first = true;
    while (left > 1e-6) {
      const d = Math.min(frame, left);
      const inp = first ? input : { hold: input.hold, tap: false, release: false };
      tick(state, d, inp);
      first = false;
      left -= d;
      if (state.phase === "done") break;
    }
  }

  function schedule(bot, delay, fn) {
    bot.queue.push({ at: bot.clock + Math.max(0, delay), fn });
  }

  function flush(bot) {
    const due = [];
    bot.queue = bot.queue.filter((item) => {
      if (item.at <= bot.clock) {
        due.push(item);
        return false;
      }
      return true;
    });
    for (const item of due) item.fn();
  }

  function ensureBot(state, profile) {
    if (state.bot && state.bot.profile === profile) return state.bot;
    const want = pickZone(state.rng, profile.zone);
    const cast = ZONE_CAST[want];
    state.bot = {
      profile,
      queue: [],
      clock: 0,
      hold: false,
      tap: false,
      release: false,
      wantZone: want,
      targetPower: clamp(cast.power + gauss(state.rng) * profile.powerErr, 0.12, 0.98),
      targetAngle: clamp(cast.angle + gauss(state.rng) * profile.angleErr, 20, 76),
      armedCast: false,
      armedAngle: false,
      seenBite: false,
      hookPlan: null,
      gullNext: 0,
      wantReel: false,
      reelArmed: false,
      pufferArmed: false,
    };
    return state.bot;
  }

  function decide(state, profile) {
    const bot = ensureBot(state, profile);
    bot.clock = state.time;
    bot.tap = false;
    bot.release = false;
    flush(bot);

    if (state.phase === "ready") {
      bot.seenBite = false;
      bot.hookPlan = null;
      bot.armedCast = false;
      bot.armedAngle = false;
      bot.pufferArmed = false;
      bot.reelArmed = false;
      const want = pickZone(state.rng, profile.zone);
      const cast = ZONE_CAST[want];
      bot.wantZone = want;
      bot.targetPower = clamp(cast.power + gauss(state.rng) * profile.powerErr, 0.12, 0.98);
      bot.targetAngle = clamp(cast.angle + gauss(state.rng) * profile.angleErr, 20, 76);
      if (!bot.queue.length) {
        schedule(bot, 0.12 + state.rng() * 0.18, () => {
          bot.tap = true;
          bot.hold = true;
        });
      }
    }

    if (state.phase === "charge" && !bot.armedCast) {
      const p = powerAt(state.castT);
      const rising = Math.cos((state.castT % 1.42) / 1.42 * Math.PI) > 0;
      const nearPeak = p > 0.93 && !rising;
      if ((rising && p >= bot.targetPower) || nearPeak || state.castT > 3.6) {
        bot.armedCast = true;
        schedule(bot, profile.react, () => {
          bot.hold = false;
          bot.release = true;
        });
      }
    }

    if (state.phase === "angle" && !bot.armedAngle) {
      const a = angleAt(state.castT);
      const rising = Math.cos((state.castT % 1.22) / 1.22 * Math.PI) > 0;
      if ((rising && a >= bot.targetAngle) || state.castT > 2.6) {
        bot.armedAngle = true;
        schedule(bot, profile.react * 0.85, () => {
          bot.tap = true;
        });
      }
    }

    if (state.phase === "wait" && state.hazard === "gull") {
      if (state.time >= bot.gullNext) {
        bot.tap = true;
        bot.gullNext = state.time + profile.gullGap * (0.75 + state.rng() * 0.5);
      }
    }

    if (state.phase === "wait" && state.hazard !== "gull" && !bot.seenBite && state.waitT >= state.biteAt) {
      bot.seenBite = true;
      const fish = state.fish;
      const telegraph = 0.24;
      const window = hookWindow(fish, state.gear.bait);
      if (state.rng() < profile.mash) {
        bot.hookPlan = state.time + 0.04 + state.rng() * 0.05;
      } else {
        const offset = gauss(state.rng) * profile.hookSigma;
        bot.hookPlan = state.time + telegraph + window * 0.5 + offset;
      }
    }
    if (state.phase === "wait" && bot.hookPlan != null && state.time >= bot.hookPlan) {
      bot.tap = true;
      bot.hookPlan = null;
    }

    if (state.phase === "reel") {
      const sweet = sweetOf(state.gear.rod);
      const hi = sweet.hi + profile.hiPad;
      const lo = sweet.lo + profile.loPad;
      if (state.windup && bot.yankId !== state.windupId) {
        bot.yankId = state.windupId;
        bot.yankStart = state.fightT;
      }
      let desired = bot.wantReel;
      const spiking = state.fishForce > 1.2;
      if (spiking) desired = false;
      else {
        if (state.tension >= hi) desired = false;
        if (state.tension <= lo) desired = true;
      }
      if (state.windup && bot.yankStart != null && state.fightT >= bot.yankStart + profile.yankReact) desired = false;
      if (state.hazard === "puffer") desired = false;
      if (desired !== bot.wantReel && !bot.reelArmed) {
        bot.reelArmed = true;
        const next = desired;
        const delay = state.hazard === "puffer" ? profile.pufferReact : state.windup ? 0.02 : profile.reelReact;
        schedule(bot, delay, () => {
          bot.wantReel = next;
          bot.hold = next;
          bot.reelArmed = false;
        });
      }
      bot.hold = bot.wantReel;
    } else if (state.phase !== "charge") {
      bot.wantReel = false;
    }

    return { hold: bot.hold, tap: bot.tap, release: bot.release };
  }

  function summarize(state) {
    return {
      score: state.score,
      coins: state.coins || 0,
      duration: Math.round(state.time * 10) / 10,
      catches: state.catches,
      misses: state.misses,
      snaps: state.snaps,
      escapes: state.escapes,
      gullFails: state.gullFails,
      pufferSnaps: state.pufferSnaps,
      legendary: state.legendary,
      maxCombo: state.maxCombo,
      perfects: state.perfects,
      end: state.end,
      clear: !!state.clear,
      rank: state.rank,
      lives: state.lives,
      zones: state.zoneCounts,
      hookRate: state.catches + state.misses > 0 ? state.catches / (state.catches + state.misses) : 0,
      fish: state.fishLog.map((f) => f.id),
    };
  }

  function run(seed, profileName, loadout) {
    const profile = PROFILES[profileName] || PROFILES.average;
    const state = create(seed, loadout);
    let guard = 0;
    while (state.phase !== "done" && guard < 12000) {
      const input = decide(state, profile);
      step(state, 1 / 60, input);
      guard += 1;
    }
    if (state.phase !== "done") finish(state, "time");
    return summarize(state);
  }

  function average(rows, key) {
    if (!rows.length) return 0;
    let s = 0;
    for (const row of rows) s += row[key] || 0;
    return s / rows.length;
  }

  function aggregate(rows) {
    const scores = rows.map((r) => r.score).sort((a, b) => a - b);
    const durations = rows.map((r) => r.duration).sort((a, b) => a - b);
    const mid = (arr) => arr[Math.floor(arr.length / 2)] || 0;
    const ends = {};
    const ranks = {};
    for (const row of rows) {
      ends[row.end] = (ends[row.end] || 0) + 1;
      ranks[row.rank] = (ranks[row.rank] || 0) + 1;
    }
    return {
      runs: rows.length,
      score: Math.round(average(rows, "score")),
      scoreP50: mid(scores),
      scoreMin: scores[0] || 0,
      scoreMax: scores[scores.length - 1] || 0,
      duration: Math.round(average(rows, "duration") * 10) / 10,
      durationP50: mid(durations),
      catches: Math.round(average(rows, "catches") * 10) / 10,
      misses: Math.round(average(rows, "misses") * 10) / 10,
      snaps: Math.round(average(rows, "snaps") * 10) / 10,
      escapes: Math.round(average(rows, "escapes") * 10) / 10,
      clearRate: Math.round((rows.filter((r) => r.clear).length / rows.length) * 1000) / 1000,
      failRate: Math.round((rows.filter((r) => !r.clear).length / rows.length) * 1000) / 1000,
      legendaryRate: Math.round((rows.filter((r) => r.legendary).length / rows.length) * 1000) / 1000,
      hookRate: Math.round(average(rows, "hookRate") * 1000) / 1000,
      ends,
      ranks,
    };
  }

  function benchmark(runs, loadout) {
    const n = runs || 24;
    const out = {};
    for (const name of Object.keys(PROFILES)) {
      const rows = [];
      for (let i = 1; i <= n; i++) rows.push(run(i * 19 + name.length * 11, name, loadout));
      out[name] = aggregate(rows);
    }
    return out;
  }

  root.BeanAnglerSim = {
    ROUND,
    LIVES,
    FISH,
    PROFILES,
    CLEAR_SCORE,
    CLEAR_CATCHES,
    create,
    step,
    tick,
    run,
    benchmark,
    aggregate,
    summarize,
    decide,
    depthOf,
    zoneOf,
    powerAt,
    angleAt,
    sweetOf,
    forceOf,
    hookWindow,
    flightDur,
    sinkDur,
    biteTiming,
    rankOf,
    loadoutOf,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
