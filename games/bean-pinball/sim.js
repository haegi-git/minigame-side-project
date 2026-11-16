/* 콩핀볼 physics. No DOM. Shared by the game and the headless playtests.
   Coordinates: origin top-left, +y down, units are table pixels. Fixed timestep. */
(function (root) {
  const DT = 1 / 120;
  const SUB = 1 / 480;
  const MAX_DT = 0.05;
  const GRAV = 1180;
  const BALL_R = 8.6;
  const MAX_SPEED = 1450;
  const TABLE_W = 400;
  const TABLE_H = 720;
  const FLIP_LEN = 78;
  const FLIP_R = 7;
  const A_REST = 0.48;
  const A_UP = -0.22;
  const NOTCH = 0.66;
  const FLIP_UP_W = 28;
  const FLIP_DROP_W = 20;
  const CHARGE_TIME = 0.9;
  const EXTRA_AT = 380000;
  const BALLS = 3;

  const SCORE = {
    bumper: 650,
    sling: 100,
    target: 2200,
    kong: 18000,
    laneLit: 1600,
    laneDim: 220,
    laneSet: 10000,
    orbit: 4200,
    ramp: 6500,
    spinner: 90,
    skill: 25000,
    jackpot: 55000,
    live: 3500,
    post: 5500,
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

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hypot(x, y) { return Math.hypot(x, y); }

  const LEFT_ORBIT = [[44, 545], [36, 300], [46, 160], [104, 74], [172, 52], [240, 88], [214, 150]];
  const RIGHT_RAMP = [[312, 220], [328, 150], [300, 78], [230, 58], [168, 96], [156, 150]];
  const SKILL_RAIL = [[370, 178], [336, 118], [276, 66], [206, 60], [164, 118]];

  function wall(x1, y1, x2, y2, opt) {
    return {
      x1, y1, x2, y2,
      r: opt.r == null ? 3 : opt.r,
      e: opt.e == null ? 0.58 : opt.e,
      tag: opt.tag || "wall",
      kick: opt.kick || 0,
      cool: 0,
    };
  }

  function buildWalls() {
    return [
      wall(22, 128, 22, 714, { e: 0.62, r: 4 }),
      wall(348, 268, 348, 714, { e: 0.58, r: 4 }),
      wall(22, 128, 78, 46, { e: 0.5, r: 4 }),
      wall(78, 46, 200, 30, { e: 0.46, r: 4 }),
      wall(200, 30, 300, 46, { e: 0.46, r: 4 }),
      wall(300, 46, 360, 110, { e: 0.5, r: 4 }),
      wall(360, 150, 394, 96, { e: 0.4, r: 3, tag: "roof" }),
      wall(394, 96, 394, 710, { e: 0.4, r: 4 }),
      wall(348, 702, 394, 702, { e: 0.06, r: 3, tag: "seat" }),
      wall(54, 468, 70, 590, { e: 0.34, r: 3, tag: "guide" }),
      wall(302, 468, 286, 590, { e: 0.34, r: 3, tag: "guide" }),
      wall(46, 390, 108, 462, { e: 0.16, r: 4.2, tag: "sling", kick: 480 }),
      wall(310, 390, 248, 462, { e: 0.16, r: 4.2, tag: "sling", kick: 480 }),
    ];
  }

  function buildBumpers() {
    return [
      { id: "b0", x: 200, y: 340, r: 20, tag: "bumper", cool: 0 },
      { id: "b1", x: 96, y: 400, r: 16, tag: "bumper", cool: 0 },
      { id: "b2", x: 300, y: 392, r: 16, tag: "bumper", cool: 0 },
    ];
  }

  function buildTargets() {
    const letters = ["K", "O", "N", "G"];
    const spec = [
      { x: 150, y1: 142, y2: 178 },
      { x: 196, y1: 188, y2: 226 },
      { x: 242, y1: 142, y2: 178 },
      { x: 286, y1: 188, y2: 226 },
    ];
    return spec.map((s, i) => ({
      id: i, letter: letters[i], x: s.x, y1: s.y1, y2: s.y2, r: 8, up: true, e: 0.2, tag: "target", cool: 0,
    }));
  }

  function buildLanes() {
    return [
      { i: 0, x: 118, y: 104, w: 40 },
      { i: 1, x: 176, y: 104, w: 40 },
      { i: 2, x: 234, y: 104, w: 40 },
    ];
  }

  function makeFlip(side) {
    const left = side === "L";
    return {
      side,
      pivotX: left ? 98 : 302,
      pivotY: 626,
      len: FLIP_LEN,
      radius: FLIP_R,
      rest: left ? A_REST : Math.PI - A_REST,
      up: left ? A_UP : Math.PI - A_UP,
      angle: left ? A_REST : Math.PI - A_REST,
      omega: 0,
      held: false,
    };
  }

  function makeBall(x, y) {
    return {
      x, y, px: x, py: y, vx: 0, vy: 0, r: BALL_R,
      asleep: false, cradle: null, mode: "free", rail: null,
      spin: 0, squash: 0, hitT: 0, slowT: 0, dead: false,
      liveT: -1, postT: -1, lastSensor: "",
    };
  }

  function emit(state, e) {
    e.t = state.t;
    state.events.push(e);
    if (state.events.length > 64) state.events.shift();
  }

  function create(seed) {
    const s = seed || 1;
    const state = {
      seed: s,
      rng: mulberry32(s),
      t: 0,
      phase: "plunge",
      score: 0,
      ballsLeft: BALLS,
      extraGiven: false,
      extraAt: EXTRA_AT,
      bonusMult: 1,
      bonusBase: 0,
      bonusT: 0,
      bonusAward: 0,
      tilted: false,
      tiltedBall: false,
      tiltMeter: 0,
      combo: 1,
      comboT: 0,
      comboBest: 1,
      ballSave: 0,
      kickbackL: false,
      kickbackR: false,
      saves: 0,
      plunger: 0,
      plunging: false,
      plungerArmed: true,
      launchPending: false,
      ballInPlay: false,
      launchedAt: 0,
      scoreAtServe: 0,
      multiball: false,
      superJack: false,
      jackStreak: 0,
      pendingSpawns: [],
      kongLit: false,
      lanesLit: [true, false, true],
      lanesGot: [false, false, false],
      prevLeft: false,
      prevRight: false,
      prevNudge: false,
      flipL: makeFlip("L"),
      flipR: makeFlip("R"),
      walls: buildWalls(),
      bumpers: buildBumpers(),
      targets: buildTargets(),
      lanes: buildLanes(),
      posts: [
        { id: "post", x: 214, y: 694, r: 5, tag: "post", e: 0.62, cool: 0 },
      ],
      balls: [],
      events: [],
      bumpCount: 0,
      bumpWindow: 0,
      spinWindow: 0,
      spinCount: 0,
      sensorCool: {},
      stats: emptyStats(),
    };
    serveBall(state, true);
    return state;
  }

  function emptyStats() {
    return {
      lifetimes: [],
      perBallScore: [],
      drains: { center: 0, outL: 0, outR: 0, other: 0 },
      stucks: 0,
      tunnels: 0,
      multiballs: 0,
      mbTimes: [],
      jackpots: 0,
      extraBalls: 0,
      skills: 0,
      maxSpeed: 0,
      bumperHits: 0,
      targetHits: 0,
      rampShots: 0,
      orbitShots: 0,
      liveCatches: 0,
      postPasses: 0,
      tilts: 0,
      nudges: 0,
      end: "",
    };
  }

  function serveBall(state, first) {
    state.phase = "plunge";
    state.balls = [makeBall(374, 684)];
    state.balls[0].asleep = true;
    state.plungerArmed = true;
    state.plunger = 0;
    state.plunging = false;
    state.tilted = false;
    state.tiltedBall = false;
    state.tiltMeter = 0;
    state.ballSave = 0;
    state.kickbackL = false;
    state.kickbackR = false;
    state.saves = 0;
    state.launchPending = false;
    state.ballInPlay = false;
    state.launchedAt = 0;
    state.multiball = false;
    state.superJack = false;
    state.jackStreak = 0;
    state.pendingSpawns = [];
    state.combo = 1;
    state.comboT = 0;
    state.bonusBase = 0;
    state.bonusAward = 0;
    if (!first) state.scoreAtServe = state.score;
    state.bumpCount = 0;
    state.bumpWindow = state.t;
    state.flipL.held = false;
    state.flipR.held = false;
    state.flipL.angle = state.flipL.rest;
    state.flipR.angle = state.flipR.rest;
    state.flipL.omega = 0;
    state.flipR.omega = 0;
    emit(state, { type: "serve" });
  }

  function addScore(state, pts, reason, x, y) {
    if (state.tiltedBall) pts = 0;
    pts = Math.max(0, Math.round(pts));
    if (pts > 0) {
      state.score += pts;
      if (!state.extraGiven && state.score >= state.extraAt) {
        state.extraGiven = true;
        state.ballsLeft += 1;
        state.stats.extraBalls += 1;
        emit(state, { type: "extraball", x: x || 200, y: y || 300 });
      }
    }
    if (pts > 0 || reason === "bonus") emit(state, { type: "score", pts, reason, x: x || 0, y: y || 0 });
    return pts;
  }

  function bumpCombo(state, x, y) {
    state.combo = Math.min(6, state.combo + 1);
    state.comboT = 2.45;
    if (state.combo > state.comboBest) state.comboBest = state.combo;
    if (state.combo >= 2) emit(state, { type: "combo", n: state.combo, x, y });
  }

  function addBonus(state, n) {
    state.bonusBase = Math.min(90000, state.bonusBase + n);
  }

  function surfVel(flip, sDist) {
    const a = flip.angle;
    const w = flip.omega;
    return { x: -Math.sin(a) * sDist * w, y: Math.cos(a) * sDist * w };
  }

  function flipTip(flip) {
    return {
      x: flip.pivotX + Math.cos(flip.angle) * flip.len,
      y: flip.pivotY + Math.sin(flip.angle) * flip.len,
    };
  }

  function upperNormal(flip) {
    let nx = -Math.sin(flip.angle);
    let ny = Math.cos(flip.angle);
    if (ny > 0) { nx = -nx; ny = -ny; }
    return { x: nx, y: ny };
  }

  function placeOnFlipper(ball, flip, s) {
    const a = flip.angle;
    const cx = flip.pivotX + Math.cos(a) * s;
    const cy = flip.pivotY + Math.sin(a) * s;
    const n = upperNormal(flip);
    const gap = ball.r + flip.radius + 0.4;
    ball.x = cx + n.x * gap;
    ball.y = cy + n.y * gap;
    ball.px = ball.x;
    ball.py = ball.y;
  }

  function updateFlippers(state, h) {
    for (const flip of [state.flipL, state.flipR]) {
      const target = flip.held ? flip.up : flip.rest;
      const maxW = flip.held ? FLIP_UP_W : FLIP_DROP_W;
      let delta = target - flip.angle;
      const maxStep = maxW * h;
      if (Math.abs(delta) > maxStep) delta = Math.sign(delta) * maxStep;
      flip.omega = h > 0 ? delta / h : 0;
      flip.angle += delta;
    }
  }

  function sweepCircle(px, py, dx, dy, rad, cx, cy) {
    const mx = px - cx;
    const my = py - cy;
    const c = mx * mx + my * my - rad * rad;
    if (c <= 0) {
      const len = Math.hypot(mx, my);
      const nx = len > 1e-6 ? mx / len : 0;
      const ny = len > 1e-6 ? my / len : -1;
      return { t: 0, nx, ny, pen: rad - len };
    }
    const a = dx * dx + dy * dy;
    if (a < 1e-10) return null;
    const b = mx * dx + my * dy;
    const disc = b * b - a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / a;
    if (t < 0 || t > 1) return null;
    const hx = px + dx * t - cx;
    const hy = py + dy * t - cy;
    const hl = Math.hypot(hx, hy) || 1;
    return { t, nx: hx / hl, ny: hy / hl, pen: 0 };
  }

  function sweepSegment(px, py, dx, dy, rad, seg) {
    const ax = seg.x1;
    const ay = seg.y1;
    const bx = seg.x2;
    const by = seg.y2;
    const ex = bx - ax;
    const ey = by - ay;
    const el2 = ex * ex + ey * ey || 1;
    const el = Math.sqrt(el2);
    let best = null;
    function take(hit, s) {
      if (!hit || hit.t < -1e-4 || hit.t > 1) return;
      hit.s = s;
      if (!best || hit.t < best.t) best = hit;
    }
    const capR = rad;
    const h1 = sweepCircle(px, py, dx, dy, capR, ax, ay);
    if (h1) take(h1, 0);
    const h2 = sweepCircle(px, py, dx, dy, capR, bx, by);
    if (h2) take(h2, el);
    let nx = -ey / el;
    let ny = ex / el;
    let sd = (px - ax) * nx + (py - ay) * ny;
    if (sd < 0) { nx = -nx; ny = -ny; sd = -sd; }
    const vd = dx * nx + dy * ny;
    const tx0 = ((px - ax) * ex + (py - ay) * ey) / el2;
    if (sd < rad - 1e-4 && tx0 >= 0 && tx0 <= 1) {
      take({ t: 0, nx, ny, pen: rad - sd }, tx0 * el);
    } else if (vd < -1e-8) {
      const t = (rad - sd) / vd;
      if (t >= 0 && t <= 1) {
        const hx = px + dx * t;
        const hy = py + dy * t;
        const tt = ((hx - ax) * ex + (hy - ay) * ey) / el2;
        if (tt >= -0.001 && tt <= 1.001) take({ t, nx, ny, pen: 0 }, clamp(tt, 0, 1) * el);
      }
    }
    return best;
  }

  function bodyOfWall(seg) { return seg; }

  function respond(ball, hit, state) {
    const body = hit.body;
    const tag = body.tag || "wall";
    const nx = hit.nx;
    const ny = hit.ny;
    let svx = 0;
    let svy = 0;
    let s = hit.s || 0;
    if (body.flip) {
      s = clamp(s, 0, body.flip.len);
      const sv = surfVel(body.flip, s);
      svx = sv.x;
      svy = sv.y;
    }
    const rvx = ball.vx - svx;
    const rvy = ball.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      let e = body.e == null ? 0.55 : body.e;
      let targetN = -e * vn;
      if (tag === "bumper") {
        const kick = 520 + Math.min(260, -vn * 0.22);
        targetN = Math.max(targetN, kick);
        const ang = (state.rng() - 0.5) * 0.55;
        const tx = -ny;
        const ty = nx;
        scoreBumper(state, body, ball);
        ball._jtx = tx * ang * 220;
        ball._jty = ty * ang * 220;
      } else if (tag === "sling") {
        targetN = Math.max(targetN, body.kick || 500);
        scoreSling(state, body, ball);
      } else if (tag === "target") {
        targetN = Math.max(30, -vn * 0.22);
        dropTarget(state, body, ball);
      } else if (tag === "flipper") {
        const rising = body.flip.held && Math.abs(body.flip.omega) > 6;
        e = rising ? 0.18 : (body.flip.held ? 0.1 : 0.32);
        targetN = -e * vn;
        if (rising) targetN = Math.max(targetN, -vn * 0.18);
        ball.liveT = rising ? state.t : ball.liveT;
        ball._impact = -vn;
        if (-vn > 680 && Math.abs(body.flip.omega) > 4) ball.noCradleUntil = state.t + 0.45;
        if (s > body.flip.len * 0.78) ball.postT = state.t;
        ball._flipS = s;
        ball._flipSide = body.flip.side;
      }
      const jn = targetN - vn;
      ball.vx += jn * nx;
      ball.vy += jn * ny;
      if (ball._jtx) {
        ball.vx += ball._jtx;
        ball.vy += ball._jty;
        ball._jtx = 0;
        ball._jty = 0;
      }
      ball.squash = Math.min(1, ball.squash + 0.55 + Math.min(0.45, -vn / 1600));
      ball.hitT = 0.16;
    }
    if (tag === "flipper") maybeCradle(state, ball, body.flip, s);
    else if (tag === "wall" || tag === "guide" || tag === "plane" || tag === "roof") {
      const tx = -ny;
      const ty = nx;
      const vt = ball.vx * tx + ball.vy * ty;
      ball.vx -= vt * 0.08 * tx;
      ball.vy -= vt * 0.08 * ty;
    }
  }

  function maybeCradle(state, ball, flip, s) {
    if (!flip.held) return;
    if (state.t < (ball.noCradleUntil || 0)) return;
    if ((ball._impact || 0) > 1100) return;
    if (Math.abs(flip.angle - flip.up) > 0.09) return;
    if (Math.abs(flip.omega) > 3.2) return;
    const speed = hypot(ball.vx, ball.vy);
    if (speed > 780) return;
    const n = upperNormal(flip);
    const glide = Math.abs(ball.vx * -n.y + ball.vy * n.x);
    if (glide > 520 && glide > speed * 0.72) return;
    const notch = flip.len * NOTCH;
    const tx = Math.cos(flip.angle);
    const ty = Math.sin(flip.angle);
    ball.vx *= 0.35;
    ball.vy *= 0.35;
    if (Math.abs(s - notch) > 8) {
      const dir = Math.sign(notch - s);
      ball.vx += tx * dir * 70;
      ball.vy += ty * dir * 70;
    }
    const sp2 = hypot(ball.vx, ball.vy);
    if (sp2 < 150 && Math.abs(s - notch) < 16) {
      placeOnFlipper(ball, flip, notch);
      ball.vx = 0;
      ball.vy = 0;
      ball.asleep = true;
      ball.cradle = flip.side;
      ball.slowT = 0;
      const live = ball.liveT > 0 && state.t - ball.liveT < 0.28;
      if (live) {
        state.stats.liveCatches += 1;
        addScore(state, SCORE.live, "live", ball.x, ball.y);
        emit(state, { type: "live", x: ball.x, y: ball.y });
      }
      if (ball.postT > 0 && state.t - ball.postT < 0.6 && ball._flipSide && ball._flipSide !== flip.side) {
        state.stats.postPasses += 1;
        addScore(state, SCORE.post, "post", ball.x, ball.y);
        emit(state, { type: "post", x: ball.x, y: ball.y });
      }
      ball.liveT = -1;
      emit(state, { type: "cradle", side: flip.side, x: ball.x, y: ball.y });
    }
  }

  function scoreBumper(state, body, ball) {
    if (state.t < body.cool) return;
    body.cool = state.t + 0.085;
    state.stats.bumperHits += 1;
    if (state.t - state.bumpWindow > 3.2) {
      state.bumpWindow = state.t;
      state.bumpCount = 0;
    }
    state.bumpCount += 1;
    let factor = 1;
    if (state.bumpCount > 9) factor = Math.max(0.12, 1 - (state.bumpCount - 9) * 0.1);
    const pts = SCORE.bumper * factor * state.combo;
    addScore(state, pts, "bumper", body.x, body.y);
    addBonus(state, 40);
    emit(state, { type: "bumper", x: body.x, y: body.y, pts: Math.round(pts) });
  }

  function scoreSling(state, body, ball) {
    if (state.t < body.cool) return;
    body.cool = state.t + 0.09;
    addScore(state, SCORE.sling, "sling", ball.x, ball.y);
    emit(state, { type: "sling", x: ball.x, y: ball.y });
  }

  function dropTarget(state, body, ball) {
    if (!body.up) return;
    if (state.t < body.cool) return;
    body.cool = state.t + 0.12;
    body.up = false;
    state.stats.targetHits += 1;
    addBonus(state, 1000);
    const pts = SCORE.target * state.combo;
    addScore(state, pts, "target", body.x, (body.y1 + body.y2) / 2);
    bumpCombo(state, body.x, body.y1);
    emit(state, { type: "target", letter: body.letter, x: body.x, y: body.y1 });
    if (state.targets.every((t) => !t.up)) {
      state.kongLit = true;
      addScore(state, SCORE.kong, "kong", 200, 180);
      addBonus(state, 4000);
      emit(state, { type: "kong", x: 210, y: 190 });
      state.kongReset = state.t + 7.5;
    }
  }

  function moveBall(ball, state, h) {
    let left = h;
    for (let iter = 0; iter < 5 && left > 1e-5; iter++) {
      const dx = ball.vx * left;
      const dy = ball.vy * left;
      let best = null;
      function take(hit, body) {
        if (!hit) return;
        hit.body = body;
        if (!best || hit.t < best.t - 1e-6) best = hit;
      }
      for (const seg of state.walls) {
        if (seg.tag === "oneway" && ball.x > seg.x1 + 6) continue;
        const hit = sweepSegment(ball.x, ball.y, dx, dy, ball.r + seg.r, seg);
        if (hit) take(hit, seg);
      }
      for (const c of state.bumpers) {
        const hit = sweepCircle(ball.x, ball.y, dx, dy, ball.r + c.r, c.x, c.y);
        if (hit) take(hit, c);
      }
      for (const c of state.posts) {
        const hit = sweepCircle(ball.x, ball.y, dx, dy, ball.r + c.r, c.x, c.y);
        if (hit) take(hit, c);
      }
      for (const target of state.targets) {
        if (!target.up) continue;
        if (ball.vy > -160) continue;
        const seg = { x1: target.x, y1: target.y1, x2: target.x, y2: target.y2, r: target.r };
        const hit = sweepSegment(ball.x, ball.y, dx, dy, ball.r + target.r, seg);
        if (hit) take(hit, target);
      }
      for (const flip of [state.flipL, state.flipR]) {
        const tip = flipTip(flip);
        const seg = {
          x1: flip.pivotX, y1: flip.pivotY, x2: tip.x, y2: tip.y, r: flip.radius,
        };
        const hit = sweepSegment(ball.x, ball.y, dx, dy, ball.r + flip.radius, seg);
        if (hit) {
          hit.body = { tag: "flipper", flip, e: 0.15, x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 };
          if (!best || hit.t < best.t - 1e-6) best = hit;
        }
      }
      if (!best || best.t >= 1) {
        ball.x += dx;
        ball.y += dy;
        break;
      }
      const tHit = clamp(best.t, 0, 1);
      ball.x += dx * tHit;
      ball.y += dy * tHit;
      if (best.pen > 0) {
        ball.x += best.nx * (best.pen + 0.15);
        ball.y += best.ny * (best.pen + 0.15);
      } else {
        ball.x += best.nx * 0.04;
        ball.y += best.ny * 0.04;
      }
      respond(ball, best, state);
      const remain = 1 - tHit;
      left *= remain > 0.02 ? remain : 0;
      if (tHit <= 0) left *= 0.65;
    }
    let sp = hypot(ball.vx, ball.vy);
    if (sp > MAX_SPEED) {
      const k = MAX_SPEED / sp;
      ball.vx *= k;
      ball.vy *= k;
      sp = MAX_SPEED;
    }
    if (sp > state.stats.maxSpeed) state.stats.maxSpeed = sp;
    if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y)) {
      ball.x = 200;
      ball.y = 400;
      ball.vx = 0;
      ball.vy = -200;
      state.stats.tunnels += 1;
    }
  }

  function collideBalls(state) {
    const balls = state.balls;
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i];
        const b = balls[j];
        if (a.mode !== "free" || b.mode !== "free" || a.asleep || b.asleep) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = hypot(dx, dy);
        const min = a.r + b.r;
        if (d < 1e-4) { dx = 1; dy = 0; d = 1; }
        if (d >= min) continue;
        const nx = dx / d;
        const ny = dy / d;
        const pen = min - d;
        a.x -= nx * pen * 0.5;
        a.y -= ny * pen * 0.5;
        b.x += nx * pen * 0.5;
        b.y += ny * pen * 0.5;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const j = -(1 + 0.82) * rv / 2;
          a.vx -= j * nx;
          a.vy -= j * ny;
          b.vx += j * nx;
          b.vy += j * ny;
        }
      }
    }
  }

  function pathLen(path) {
    let n = 0;
    for (let i = 0; i < path.length - 1; i++) n += hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    return n;
  }

  function enterRail(ball, state, path, speed, kind) {
    const segLen = hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]) || 1;
    ball.mode = "rail";
    ball.asleep = false;
    ball.cradle = null;
    ball.rail = {
      path, i: 0, s: 0, segLen, speed: clamp(speed, 320, 980), kind,
      spinner: kind === "orbit", spinAcc: 0,
    };
    ball.x = path[0][0];
    ball.y = path[0][1];
    ball.vx = 0;
    ball.vy = 0;
  }

  function advanceRail(ball, state, h) {
    const rail = ball.rail;
    let dist = rail.speed * h;
    rail.speed = Math.max(260, rail.speed - 40 * h);
    if (rail.spinner) {
      rail.spinAcc += dist;
      while (rail.spinAcc > 18) {
        rail.spinAcc -= 18;
        scoreSpin(state, ball);
      }
    }
    while (dist > 0) {
      const room = rail.segLen - rail.s;
      if (dist < room) {
        rail.s += dist;
        dist = 0;
      } else {
        dist -= room;
        rail.i += 1;
        rail.s = 0;
        if (rail.i >= rail.path.length - 1) {
          const a = rail.path[rail.path.length - 2];
          const b = rail.path[rail.path.length - 1];
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const len = hypot(dx, dy) || 1;
          ball.mode = "free";
          ball.x = b[0];
          ball.y = b[1];
          ball.vx = (dx / len) * rail.speed;
          ball.vy = (dy / len) * rail.speed;
          ball.rail = null;
          ball.px = ball.x;
          ball.py = ball.y;
          return;
        }
        const a = rail.path[rail.i];
        const b = rail.path[rail.i + 1];
        rail.segLen = hypot(b[0] - a[0], b[1] - a[1]) || 1;
      }
    }
    const a = rail.path[rail.i];
    const b = rail.path[rail.i + 1];
    const u = rail.s / rail.segLen;
    ball.x = a[0] + (b[0] - a[0]) * u;
    ball.y = a[1] + (b[1] - a[1]) * u;
  }

  function scoreSpin(state, ball) {
    if (state.t - state.spinWindow > 0.45) {
      state.spinWindow = state.t;
      state.spinCount = 0;
    }
    state.spinCount += 1;
    if (state.spinCount > 10) return;
    addScore(state, SCORE.spinner, "spin", ball.x, ball.y);
    emit(state, { type: "spin", x: ball.x, y: ball.y });
  }

  function cooled(state, key, sec) {
    const until = state.sensorCool[key] || 0;
    if (state.t < until) return false;
    state.sensorCool[key] = state.t + sec;
    return true;
  }

  function tryRails(ball, state) {
    if (ball.mode !== "free" || ball.asleep) return;
    const sp = hypot(ball.vx, ball.vy);
    if (state.launchPending && ball.x > 360 && ball.y < 172 && ball.y > 132 && ball.vy < -540 && ball.vy > -760) {
      if (cooled(state, "skill", 0.4)) {
        enterRail(ball, state, SKILL_RAIL, Math.min(860, -ball.vy), "skill");
        state.launchPending = false;
        state.stats.skills += 1;
        addScore(state, SCORE.skill, "skill", ball.x, ball.y);
        addBonus(state, 2500);
        bumpCombo(state, 220, 80);
        emit(state, { type: "skill", x: 240, y: 80 });
        return;
      }
    }
    if (ball.x < 52 && ball.y > 500 && ball.y < 575 && ball.vy < -220 && sp > 260) {
      const dirx = LEFT_ORBIT[1][0] - LEFT_ORBIT[0][0];
      const diry = LEFT_ORBIT[1][1] - LEFT_ORBIT[0][1];
      const dl = hypot(dirx, diry) || 1;
      const align = (ball.vx * dirx + ball.vy * diry) / (sp * dl);
      if (align > 0.45 && cooled(state, "orbit", 0.35)) {
        enterRail(ball, state, LEFT_ORBIT, sp, "orbit");
        state.stats.orbitShots += 1;
        const pts = SCORE.orbit * state.combo;
        addScore(state, pts, "orbit", ball.x, ball.y);
        addBonus(state, 1500);
        bumpCombo(state, ball.x, ball.y);
        emit(state, { type: "orbit", x: ball.x, y: ball.y, pts });
        return;
      }
    }
    if (ball.fromPlunger && state.t - (ball.plungerT || 0) < 1.35) {
      /* plunger exit is not a ramp */
    } else if (ball.x > 292 && ball.y > 168 && ball.y < 250 && ball.vy < -160 && sp > 260) {
      const dirx = RIGHT_RAMP[1][0] - RIGHT_RAMP[0][0];
      const diry = RIGHT_RAMP[1][1] - RIGHT_RAMP[0][1];
      const dl = hypot(dirx, diry) || 1;
      const align = (ball.vx * dirx + ball.vy * diry) / (sp * dl);
      if (align > 0.2 && cooled(state, "ramp", 0.35)) {
        enterRail(ball, state, RIGHT_RAMP, sp, "ramp");
        onRamp(state, ball);
      }
    }
  }

  function onRamp(state, ball) {
    state.stats.rampShots += 1;
    if (state.multiball) {
      state.jackStreak = Math.min(4, state.jackStreak + 1);
      const mult = state.superJack ? 2 : 1;
      const pts = SCORE.jackpot * state.jackStreak * mult;
      addScore(state, pts, "jackpot", ball.x, ball.y);
      state.stats.jackpots += 1;
      emit(state, { type: "jackpot", pts, x: 220, y: 150, super: state.superJack });
      addBonus(state, 3000);
    } else {
      const pts = SCORE.ramp * state.combo;
      addScore(state, pts, "ramp", ball.x, ball.y);
      addBonus(state, 2000);
      bumpCombo(state, ball.x, ball.y);
      emit(state, { type: "ramp", x: ball.x, y: ball.y, pts });
      if (state.kongLit) startMultiball(state);
    }
  }

  function startMultiball(state) {
    if (state.multiball) return;
    state.multiball = true;
    state.kongLit = false;
    state.superJack = false;
    state.jackStreak = 0;
    state.stats.multiballs += 1;
    state.stats.mbTimes.push(Math.round(state.t * 10) / 10);
    state.ballSave = Math.max(state.ballSave, 8);
    state.kickbackL = true;
    state.kickbackR = true;
    for (const target of state.targets) target.up = true;
    state.pendingSpawns.push({ t: state.t + 0.28, x: 196, y: 410, vx: 70, vy: -780 });
    state.pendingSpawns.push({ t: state.t + 0.85, x: 210, y: 424, vx: -50, vy: -720 });
    emit(state, { type: "multiball", x: 200, y: 340 });
  }

  function checkLanes(ball, state) {
    for (const lane of state.lanes) {
      const half = lane.w / 2;
      if (Math.abs(ball.x - lane.x) > half + ball.r * 0.2) continue;
      const y0 = ball.py;
      const y1 = ball.y;
      if ((y0 - lane.y) * (y1 - lane.y) > 0) continue;
      if (!cooled(state, "lane" + lane.i, 0.25)) continue;
      if (state.lanesLit[lane.i]) {
        state.lanesLit[lane.i] = false;
        state.lanesGot[lane.i] = true;
        addScore(state, SCORE.laneLit * state.bonusMult, "lane", lane.x, lane.y);
        addBonus(state, 400);
        emit(state, { type: "lane", i: lane.i, lit: true, x: lane.x, y: lane.y });
        if (state.lanesGot.every(Boolean)) {
          state.bonusMult = Math.min(6, state.bonusMult + 1);
          state.lanesGot = [false, false, false];
          state.lanesLit = [true, false, true];
          addScore(state, SCORE.laneSet, "laneset", 200, 90);
          emit(state, { type: "laneset", mult: state.bonusMult, x: 200, y: 90 });
        }
      } else {
        addScore(state, SCORE.laneDim, "lane", lane.x, lane.y);
        emit(state, { type: "lane", i: lane.i, lit: false, x: lane.x, y: lane.y });
      }
    }
  }

  function classifyDrain(ball) {
    if (ball.x < 108) return "outL";
    if (ball.x > 286 && ball.x < 350) return "outR";
    if (ball.x >= 350) return "other";
    return "center";
  }

  function kickUp(ball, vx, vy) {
    ball.y = Math.min(ball.y, 688);
    ball.vy = vy;
    ball.vx = vx;
    ball.asleep = false;
    ball.cradle = null;
    ball.mode = "free";
    ball.slowT = 0;
  }

  function checkDrain(ball, state) {
    if (ball.y < 708 || ball.mode !== "free") return false;
    if (ball.x > 350) return false;
    const kind = classifyDrain(ball);
    if (kind === "outL" && state.kickbackL && state.ballSave <= 0) {
      state.kickbackL = false;
      kickUp(ball, 110, -860);
      emit(state, { type: "kickback", side: "L", x: ball.x, y: ball.y });
      return false;
    }
    if (kind === "outR" && state.kickbackR && state.ballSave <= 0) {
      state.kickbackR = false;
      kickUp(ball, -110, -860);
      emit(state, { type: "kickback", side: "R", x: ball.x, y: ball.y });
      return false;
    }
    if (state.ballSave > 0 && state.saves < 3) {
      state.saves += 1;
      const toward = ball.x < 200 ? 80 : -80;
      kickUp(ball, toward, -900);
      emit(state, { type: "save", x: ball.x, y: 660 });
      return false;
    }
    ball.dead = true;
    state.stats.drains[kind] = (state.stats.drains[kind] || 0) + 1;
    emit(state, { type: "drain", kind, x: ball.x, y: ball.y });
    return true;
  }

  function checkBounds(ball, state) {
    if (ball.mode !== "free") return;
    if (ball.x < 16 || ball.x > TABLE_W - 4 || ball.y < 8 || ball.y > TABLE_H + 30) {
      const outside = ball.x < 18 || ball.x > 394 || (ball.y < 16 && ball.vy < 0);
      if (outside && ball.y < 710) {
        state.stats.tunnels += 1;
        ball.x = clamp(ball.x, 36, 386);
        ball.y = clamp(ball.y, 40, 680);
        ball.vx *= -0.2;
        ball.vy = Math.abs(ball.vy) * 0.2 + 40;
      }
    }
  }

  function nearFlipper(ball, state) {
    for (const flip of [state.flipL, state.flipR]) {
      const tip = flipTip(flip);
      const ex = tip.x - flip.pivotX;
      const ey = tip.y - flip.pivotY;
      const el2 = ex * ex + ey * ey || 1;
      let t = ((ball.x - flip.pivotX) * ex + (ball.y - flip.pivotY) * ey) / el2;
      t = clamp(t, 0, 1);
      const cx = flip.pivotX + ex * t;
      const cy = flip.pivotY + ey * t;
      if (hypot(ball.x - cx, ball.y - cy) < ball.r + flip.radius + 22) return true;
    }
    return false;
  }

  function checkStuck(ball, state, h) {
    if (ball.mode !== "free" || ball.asleep || ball.dead) {
      ball.slowT = 0;
      ball.anchorT = 0;
      return;
    }
    if (ball.x > 352 && ball.y > 560) {
      ball.slowT = 0;
      ball.anchorT = 0;
      return;
    }
    const sp = hypot(ball.vx, ball.vy);
    if (sp < 28) ball.slowT += h;
    else ball.slowT = 0;
    if (!ball.anchorT) {
      ball.anchorT = state.t;
      ball.anchorX = ball.x;
      ball.anchorY = ball.y;
    } else if (hypot(ball.x - ball.anchorX, ball.y - ball.anchorY) > 42) {
      ball.anchorT = state.t;
      ball.anchorX = ball.x;
      ball.anchorY = ball.y;
    }
    const trapped = ball.anchorT && state.t - ball.anchorT > 1.35 && sp < 210 && !nearFlipper(ball, state);
    if ((ball.slowT > 1.15 && !nearFlipper(ball, state)) || trapped) {
      ball.slowT = 0;
      ball.anchorT = state.t;
      ball.anchorX = ball.x;
      ball.anchorY = ball.y;
      state.stats.stucks += 1;
      ball.vy = -420;
      ball.vx += ball.x < 200 ? 90 : -90;
      emit(state, { type: "stuck", x: ball.x, y: ball.y });
    }
  }

  function settlePlunger(ball, state) {
    if (ball.mode !== "free" || ball.dead) return;
    if (ball.x > 358 && ball.x < 392 && ball.y > 640 && hypot(ball.vx, ball.vy) < 90 && ball.vy >= -20) {
      ball.asleep = true;
      ball.vx = 0;
      ball.vy = 0;
      ball.x = 374;
      ball.y = 684 + state.plunger * 12;
      state.plungerArmed = true;
      if (state.launchPending) state.launchPending = false;
    }
  }

  function wakeBalls(state) {
    for (const ball of state.balls) {
      if (!ball.asleep || !ball.cradle) continue;
      const flip = ball.cradle === "L" ? state.flipL : state.flipR;
      if (!flip.held || Math.abs(flip.angle - flip.up) > 0.1) {
        ball.asleep = false;
        ball.cradle = null;
      }
    }
  }

  function physicsSubstep(state, h) {
    if (state.phase === "gameover") return;
    state.t += h;
    if (state.phase === "bonus") {
      state.bonusT += h;
      if (state.bonusT >= 1.6) finishBonus(state);
      return;
    }
    if (state.tiltMeter > 0 && !state.tilted) state.tiltMeter = Math.max(0, state.tiltMeter - 0.11 * h);
    if (state.comboT > 0) {
      state.comboT -= h;
      if (state.comboT <= 0) state.combo = 1;
    }
    if (state.ballSave > 0) {
      state.ballSave = Math.max(0, state.ballSave - h);
      if (state.ballSave === 0) {
        state.kickbackL = false;
        state.kickbackR = false;
      }
    }
    if (state.kongLit && state.kongReset && state.t > state.kongReset && !state.multiball) {
      let anyDown = false;
      for (const target of state.targets) if (!target.up) anyDown = true;
      if (anyDown && state.targets.every((t) => !t.up)) {
        for (const target of state.targets) target.up = true;
      }
      state.kongReset = 0;
    }
    if (state.multiball && state.targets.every((t) => !t.up)) state.superJack = true;
    updateFlippers(state, h);
    wakeBalls(state);
    for (const ball of state.balls) {
      if (ball.dead) continue;
      ball.hitT = Math.max(0, ball.hitT - h);
      ball.squash = Math.max(0, ball.squash - h * 2.8);
      if (ball.asleep && ball.cradle) {
        const flip = ball.cradle === "L" ? state.flipL : state.flipR;
        placeOnFlipper(ball, flip, flip.len * NOTCH);
        continue;
      }
      if (ball.mode === "rail") {
        advanceRail(ball, state, h);
        checkLanes(ball, state);
        ball.px = ball.x;
        ball.py = ball.y;
        continue;
      }
      if (ball.asleep && ball.x > 360) {
        ball.y = 684 + state.plunger * 12;
        continue;
      }
      ball.vy += GRAV * h;
      const drag = Math.exp(-0.12 * h);
      ball.vx *= drag;
      ball.vy *= drag;
      ball.px = ball.x;
      ball.py = ball.y;
      moveBall(ball, state, h);
      ball.spin += (ball.vx / ball.r) * h * 0.9;
      tryRails(ball, state);
      if (ball.mode === "free" && ball.x > 350 && ball.y < 262 && ball.y > 150 && ball.vy > -80) {
        ball.vx = Math.min(ball.vx, -320);
      }
      if (ball.mode === "free") {
        checkLanes(ball, state);
        checkBounds(ball, state);
        const drained = checkDrain(ball, state);
        if (!drained) {
          checkStuck(ball, state, h);
          settlePlunger(ball, state);
        }
      }
      if (state.launchPending && ball.mode === "free" && ball.x < 330 && ball.y > 240) state.launchPending = false;
      if (ball.fromPlunger && ball.y > 340 && ball.x < 320) ball.fromPlunger = false;
    }
    collideBalls(state);
    if (state.pendingSpawns.length) {
      const keep = [];
      for (const sp of state.pendingSpawns) {
        if (state.t >= sp.t) {
          const b = makeBall(sp.x, sp.y);
          b.vx = sp.vx;
          b.vy = sp.vy;
          state.balls.push(b);
          emit(state, { type: "spawn", x: sp.x, y: sp.y });
        } else keep.push(sp);
      }
      state.pendingSpawns = keep;
    }
    state.balls = state.balls.filter((b) => !b.dead);
    if ((state.phase === "play" || state.phase === "plunge") && state.ballInPlay && state.balls.length === 0 && state.pendingSpawns.length === 0) {
      endBall(state);
    } else if (state.multiball && state.balls.length <= 1 && state.pendingSpawns.length === 0) {
      state.multiball = false;
      state.superJack = false;
      emit(state, { type: "multiballend" });
    }
  }

  function endBall(state) {
    if (state.phase === "bonus" || state.phase === "gameover") return;
    const life = state.launchedAt ? state.t - state.launchedAt : 0;
    state.stats.lifetimes.push(Math.round(life * 100) / 100);
    state.stats.perBallScore.push(Math.round(state.score - state.scoreAtServe));
    state.phase = "bonus";
    state.bonusT = 0;
    state.bonusAward = state.tiltedBall ? 0 : Math.round(state.bonusBase * state.bonusMult);
    state.balls = [];
    emit(state, { type: "ballover", life, bonus: state.bonusAward, mult: state.tiltedBall ? 0 : state.bonusMult });
  }

  function finishBonus(state) {
    addScore(state, state.bonusAward, "bonus", 200, 400);
    state.bonusBase = 0;
    state.tiltedBall = false;
    if (state.ballsLeft > 1) {
      state.ballsLeft -= 1;
      serveBall(state, false);
    } else {
      state.ballsLeft = 0;
      state.phase = "gameover";
      state.stats.end = "balls";
      emit(state, { type: "gameover", score: state.score });
    }
  }

  function releasePlunger(state) {
    const power = clamp(state.plunger, 0, 1);
    state.plunger = 0;
    state.plunging = false;
    if (!state.plungerArmed) return;
    const ball = state.balls.find((b) => b.x > 352 && b.y > 540 && !b.dead);
    if (!ball) { state.plungerArmed = false; return; }
    state.plungerArmed = false;
    ball.asleep = false;
    ball.cradle = null;
    ball.mode = "free";
    const v0 = 500 + Math.max(power, 0.08) * 1040;
    ball.vy = -v0;
    ball.vx = 10;
    ball.y = Math.min(ball.y, 636);
    ball.fromPlunger = true;
    ball.plungerT = state.t;
    state.phase = "play";
    if (!state.ballInPlay) {
      state.ballInPlay = true;
      state.launchedAt = state.t;
      state.ballSave = 10;
      state.kickbackL = true;
      state.kickbackR = true;
      state.saves = 0;
      state.launchPending = true;
      state.scoreAtServe = state.score;
    } else if (!state.launchedAt) state.launchedAt = state.t;
    emit(state, { type: "launch", power, x: ball.x, y: ball.y });
  }

  function doNudge(state) {
    if (state.tilted || state.phase !== "play") return;
    state.stats.nudges += 1;
    state.tiltMeter = Math.min(1.35, state.tiltMeter + 0.34);
    const dir = state.stats.nudges % 2 === 0 ? 1 : -1;
    for (const ball of state.balls) {
      if (ball.asleep && ball.cradle) {
        ball.asleep = false;
        ball.cradle = null;
      }
      if (ball.mode === "rail") continue;
      ball.vx += dir * 150;
      ball.vy -= 60;
    }
    emit(state, { type: "nudge", power: state.tiltMeter });
    if (state.tiltMeter >= 1) {
      state.tilted = true;
      state.tiltedBall = true;
      state.bonusAward = 0;
      state.bonusBase = 0;
      state.flipL.held = false;
      state.flipR.held = false;
      state.stats.tilts += 1;
      emit(state, { type: "tilt" });
    }
  }

  function rotateLanes(state, dir) {
    const a = state.lanesLit;
    if (dir < 0) a.push(a.shift());
    else a.unshift(a.pop());
    emit(state, { type: "lanechange" });
  }

  function applyInput(state, buttons, dt) {
    const b = buttons || { left: false, right: false, plunge: false, nudge: false };
    if (state.phase === "play" || state.phase === "plunge") {
      if (!state.tilted) {
        state.flipL.held = !!b.left;
        state.flipR.held = !!b.right;
      } else {
        state.flipL.held = false;
        state.flipR.held = false;
      }
      if (b.left && !state.prevLeft) rotateLanes(state, -1);
      if (b.right && !state.prevRight) rotateLanes(state, 1);
      if (b.plunge && state.plungerArmed && !state.tilted) {
        state.plunging = true;
        state.plunger = Math.min(1, state.plunger + dt / CHARGE_TIME);
      } else if (state.plunging) releasePlunger(state);
      if (b.nudge && !state.prevNudge) doNudge(state);
    } else if (state.plunging) state.plunging = false;
    state.prevLeft = !!b.left;
    state.prevRight = !!b.right;
    state.prevNudge = !!b.nudge;
    state.lastButtons = { left: !!b.left, right: !!b.right, plunge: !!b.plunge, nudge: !!b.nudge };
  }

  function step(state, dt, buttons) {
    if (!(dt > 0)) return;
    if (dt > MAX_DT) dt = MAX_DT;
    applyInput(state, buttons || state.lastButtons, dt);
    let left = dt;
    let guard = 0;
    while (left > 1e-6 && guard < 40) {
      const h = Math.min(SUB, left);
      physicsSubstep(state, h);
      left -= h;
      guard += 1;
      if (state.phase === "gameover") break;
    }
  }

  function predictLanding(ball, yLine) {
    if (ball.vy < 20 || ball.y > yLine) return null;
    const a = 0.5 * GRAV;
    const b = ball.vy;
    const c = ball.y - yLine;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b + Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > 2.2) return null;
    let x = ball.x + ball.vx * t;
    const left = 48;
    const right = 336;
    const span = right - left;
    let u = x - left;
    const period = span * 2;
    u = ((u % period) + period) % period;
    if (u > span) u = period - u;
    return { t, x: left + u };
  }

  const PROFILES = {
    random: { name: "random" },
    reactive: { name: "reactive" },
    good: { name: "good", timingSd: 0.014, blunder: 0.05 },
  };

  function botCreate(profile, seed) {
    const name = typeof profile === "string" ? profile : profile.name;
    return { profile: name, rng: mulberry32((seed || 1) ^ 0x9e3779b9), mem: {} };
  }

  function handlePlunge(state, bot, input, powerTarget) {
    const m = bot.mem;
    const rng = bot.rng;
    const armed = state.plungerArmed && state.balls.some((b) => b.x > 350 && (b.asleep || b.y > 600));
    if (!armed) { m.plunging = false; return; }
    if (!m.plunging) {
      if (state.t < (m.plungeWait || 0)) return;
      m.plunging = true;
      const power = clamp(powerTarget + (rng() - 0.5) * (m.powerJitter || 0.08), 0.12, 0.98);
      m.releaseAt = state.t + power * CHARGE_TIME;
    }
    if (state.t < m.releaseAt) input.plunge = true;
    else {
      input.plunge = false;
      m.plunging = false;
      m.plungeWait = state.t + 0.35;
    }
  }

  function randomButtons(state, bot) {
    const m = bot.mem;
    const rng = bot.rng;
    if (m.nextFlip == null) m.nextFlip = 0;
    if (state.t >= m.nextFlip) {
      m.left = rng() < 0.5;
      m.right = rng() < 0.5;
      m.nextFlip = state.t + 0.03 + rng() * 0.16;
    }
    const input = { left: !!m.left, right: !!m.right, plunge: false, nudge: false };
    m.powerJitter = 0.35;
    handlePlunge(state, bot, input, 0.25 + rng() * 0.6);
    return input;
  }

  function reactiveButtons(state, bot) {
    const input = { left: false, right: false, plunge: false, nudge: false };
    bot.mem.powerJitter = 0.06;
    handlePlunge(state, bot, input, 0.48);
    let threat = null;
    for (const ball of state.balls) {
      if (ball.dead || ball.mode !== "free" || ball.asleep) continue;
      if (ball.vy > 30 && ball.y > 500 && ball.y < 680) {
        if (!threat || ball.y > threat.y) threat = ball;
      }
    }
    if (threat) {
      if (threat.x < 196 && threat.x > 55 && threat.y > 530) input.left = true;
      if (threat.x >= 196 && threat.x < 340 && threat.y > 530) input.right = true;
    }
    return input;
  }

  function shotDelay(state, bot, side) {
    const down = state.targets.filter((t) => !t.up).length;
    let goal = "orbit";
    if (!state.kongLit && down < 4) goal = "targets";
    else if (state.kongLit || state.multiball) goal = "ramp";
    let base = side === "R" ? 0.18 : (goal === "ramp" ? 0.2 : 0.24);
    if (side !== "R" && goal === "orbit") base = 0.22;
    const sd = 0.01;
    let d = base + (bot.rng() - 0.5) * sd * 2;
    if (bot.rng() < 0.05) d += (bot.rng() < 0.5 ? -1 : 1) * 0.02;
    return { delay: clamp(d, 0.12, 0.36), goal };
  }

  function goodButtons(state, bot, dt) {
    const m = bot.mem;
    const input = { left: false, right: false, plunge: false, nudge: false };
    m.powerJitter = 0.035;
    const aimSkill = !state.ballInPlay && state.stats.skills < 1;
    handlePlunge(state, bot, input, aimSkill ? 0.75 : 0.56);

    const cradled = state.balls.find((b) => b.asleep && b.cradle);
    const shooting = m.shot && (m.shot.phase !== "flip" || m.shot.t < 0.18);
    if (!shooting) {
      let threat = null;
      let threatT = 99;
      for (const ball of state.balls) {
        if (ball.dead || ball.asleep || ball.mode !== "free") continue;
        if (ball.vy < 40 || ball.y > 660 || ball.y < 280) continue;
        if (ball.x > 350) continue;
        const pred = predictLanding(ball, 600);
        const t = pred ? pred.t : (600 - ball.y) / Math.max(40, ball.vy);
        if (t < threatT) { threatT = t; threat = { ball, pred, t }; }
      }
      if (threat && threat.t < 0.7) {
        m.shot = null;
        const x = threat.pred ? threat.pred.x : threat.ball.x;
        const side = x < 198 ? "left" : "right";
        input[side] = true;
        if (x >= 170 && x <= 230) {
          input.left = true;
          input.right = true;
        }
        m.catchSide = side;
        m.catchUntil = state.t + Math.max(0.4, threat.t + 0.22);
        return input;
      }
      if (m.catchUntil && state.t < m.catchUntil && !cradled) {
        input[m.catchSide || "left"] = true;
        return input;
      }
    }
    if (cradled || m.shot) {
      if (!m.shot) {
        const plan = shotDelay(state, bot, cradled.cradle);
        m.shot = { phase: "wait", t: 0, delay: plan.delay, side: cradled.cradle, goal: plan.goal };
      }
      const side = m.shot.side === "L" ? "left" : "right";
      m.shot.t += dt;
      if (m.shot.phase === "wait") {
        input[side] = true;
        if (m.shot.t > 0.16) { m.shot.phase = "drop"; m.shot.t = 0; }
      } else if (m.shot.phase === "drop") {
        input[side] = false;
        if (m.shot.t > m.shot.delay) { m.shot.phase = "flip"; m.shot.t = 0; }
      } else {
        input[side] = true;
        if (m.shot.t > 0.26) m.shot = null;
      }
      return input;
    }
    m.shot = null;
    return input;
  }

  function botButtons(state, bot, dt) {
    if (!bot) return { left: false, right: false, plunge: false, nudge: false };
    if (bot.profile === "random") return randomButtons(state, bot);
    if (bot.profile === "reactive") return reactiveButtons(state, bot);
    return goodButtons(state, bot, dt || DT);
  }

  function summarize(state, profile, seed) {
    const lives = state.stats.lifetimes;
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
    const drains = state.stats.drains;
    const drainN = drains.center + drains.outL + drains.outR + drains.other;
    return {
      seed,
      profile,
      score: Math.round(state.score),
      phase: state.phase,
      ballsLeft: state.ballsLeft,
      lifetimes: lives.map((n) => Math.round(n * 10) / 10),
      avgLife: Math.round(avg(lives) * 10) / 10,
      perBallScore: state.stats.perBallScore.slice(),
      avgBallScore: Math.round(avg(state.stats.perBallScore)),
      drains,
      drainN,
      outlaneRate: drainN ? Math.round(((drains.outL + drains.outR) / drainN) * 1000) / 10 : 0,
      centerRate: drainN ? Math.round((drains.center / drainN) * 1000) / 10 : 0,
      stucks: state.stats.stucks,
      tunnels: state.stats.tunnels,
      multiballs: state.stats.multiballs,
      mbTimes: state.stats.mbTimes.slice(),
      firstMb: state.stats.mbTimes.length ? state.stats.mbTimes[0] : null,
      jackpots: state.stats.jackpots,
      extraBalls: state.stats.extraBalls,
      skills: state.stats.skills,
      maxSpeed: Math.round(state.stats.maxSpeed),
      bumperHits: state.stats.bumperHits,
      targetHits: state.stats.targetHits,
      rampShots: state.stats.rampShots,
      orbitShots: state.stats.orbitShots,
      liveCatches: state.stats.liveCatches,
      postPasses: state.stats.postPasses,
      tilts: state.stats.tilts,
      duration: Math.round(state.t * 10) / 10,
      end: state.stats.end || state.phase,
      bonusMult: state.bonusMult,
      comboBest: state.comboBest,
    };
  }

  function run(seed, profile, limitSec) {
    const state = create(seed);
    const bot = botCreate(profile, seed * 13 + 7);
    const limit = limitSec || 210;
    let guard = 0;
    while (state.phase !== "gameover" && state.t < limit && guard < 280000) {
      const buttons = botButtons(state, bot, DT);
      step(state, DT, buttons);
      guard += 1;
    }
    if (state.phase !== "gameover") {
      state.stats.end = "time";
      if (state.ballInPlay && state.launchedAt) {
        state.stats.lifetimes.push(Math.round((state.t - state.launchedAt) * 100) / 100);
        state.stats.perBallScore.push(Math.round(state.score - state.scoreAtServe));
      }
    }
    return summarize(state, profile, seed);
  }

  function aggregate(rows) {
    const avg = (key) => rows.reduce((a, r) => a + (r[key] || 0), 0) / (rows.length || 1);
    const lives = rows.reduce((a, r) => a.concat(r.lifetimes), []);
    const lifeAvg = lives.reduce((a, b) => a + b, 0) / (lives.length || 1);
    const mbGames = rows.filter((r) => r.multiballs > 0).length;
    const extraGames = rows.filter((r) => r.extraBalls > 0).length;
    const mbTimeVals = rows.map((r) => r.firstMb).filter((n) => n != null);
    const drains = { center: 0, outL: 0, outR: 0, other: 0 };
    for (const r of rows) {
      drains.center += r.drains.center;
      drains.outL += r.drains.outL;
      drains.outR += r.drains.outR;
      drains.other += r.drains.other;
    }
    const drainN = drains.center + drains.outL + drains.outR + drains.other;
    return {
      runs: rows.length,
      avgLife: Math.round(lifeAvg * 10) / 10,
      lifeN: lives.length,
      avgScore: Math.round(avg("score")),
      avgBallScore: Math.round(avg("avgBallScore")),
      stucksPerBall: lives.length ? Math.round((rows.reduce((a, r) => a + r.stucks, 0) / lives.length) * 1000) / 1000 : 0,
      stucks: rows.reduce((a, r) => a + r.stucks, 0),
      tunnels: rows.reduce((a, r) => a + r.tunnels, 0),
      outlaneRate: drainN ? Math.round(((drains.outL + drains.outR) / drainN) * 1000) / 10 : 0,
      centerRate: drainN ? Math.round((drains.center / drainN) * 1000) / 10 : 0,
      drains,
      mbGameRate: Math.round((mbGames / rows.length) * 1000) / 10,
      mbPerBall: lives.length ? Math.round((rows.reduce((a, r) => a + r.multiballs, 0) / lives.length) * 1000) / 1000 : 0,
      avgFirstMb: mbTimeVals.length ? Math.round(mbTimeVals.reduce((a, b) => a + b, 0) / mbTimeVals.length) : null,
      extraGameRate: Math.round((extraGames / rows.length) * 1000) / 10,
      jackpots: rows.reduce((a, r) => a + r.jackpots, 0),
      skills: rows.reduce((a, r) => a + r.skills, 0),
      timedOut: rows.filter((r) => r.end === "time").length,
      avgDuration: Math.round(avg("duration") * 10) / 10,
      avgTargets: Math.round(avg("targetHits") * 10) / 10,
      avgRamps: Math.round(avg("rampShots") * 10) / 10,
      avgOrbits: Math.round(avg("orbitShots") * 10) / 10,
      avgLive: Math.round(avg("liveCatches") * 10) / 10,
      maxSpeed: Math.round(Math.max(...rows.map((r) => r.maxSpeed))),
    };
  }

  function benchmark(runs) {
    const n = runs || 8;
    const out = {};
    for (const name of ["random", "reactive", "good"]) {
      const rows = [];
      for (let i = 1; i <= n; i++) rows.push(run(i * 17 + name.length * 11, name, 180));
      out[name] = aggregate(rows);
    }
    return out;
  }

  function tunnelTest() {
    const results = [];
    function watch(ball, label) {
      let escaped = false;
      let minX = ball.x;
      let maxX = ball.x;
      let maxY = ball.y;
      const start = { x: ball.x, y: ball.y };
      return {
        label,
        sample() {
          if (ball.x < 20 || ball.x > 394 || ball.y < 10) escaped = true;
          minX = Math.min(minX, ball.x);
          maxX = Math.max(maxX, ball.x);
          maxY = Math.max(maxY, ball.y);
        },
        report(extra) {
          results.push(Object.assign({
            label, escaped, minX: Math.round(minX), maxX: Math.round(maxX),
            endX: Math.round(ball.x), endY: Math.round(ball.y),
            vx: Math.round(ball.vx), vy: Math.round(ball.vy),
            startX: Math.round(start.x), startY: Math.round(start.y),
          }, extra || {}));
        },
      };
    }

    {
      const state = create(3);
      state.phase = "play";
      state.ballInPlay = true;
      state.balls = [makeBall(80, 300)];
      const ball = state.balls[0];
      ball.vx = -MAX_SPEED;
      ball.vy = 0;
      const w = watch(ball, "left-wall");
      for (let i = 0; i < 30; i++) { step(state, DT, { left: false, right: false, plunge: false, nudge: false }); w.sample(); }
      w.report({ bounced: ball.vx > 0, tunnels: state.stats.tunnels });
    }
    {
      const state = create(4);
      state.phase = "play";
      state.ballInPlay = true;
      state.balls = [makeBall(200, 80)];
      const ball = state.balls[0];
      ball.vy = -MAX_SPEED;
      const w = watch(ball, "top-wall");
      for (let i = 0; i < 30; i++) { step(state, DT, emptyInput()); w.sample(); }
      w.report({ bounced: ball.vy > 0, tunnels: state.stats.tunnels });
    }
    {
      const state = create(5);
      state.phase = "play";
      state.ballInPlay = true;
      state.flipL.held = true;
      state.flipL.angle = state.flipL.up;
      const flip = state.flipL;
      const s = flip.len * 0.55;
      const cx = flip.pivotX + Math.cos(flip.angle) * s;
      const n = upperNormal(flip);
      const ball = makeBall(cx + n.x * 28, flip.pivotY + Math.sin(flip.angle) * s + n.y * 28);
      ball.vx = -n.x * MAX_SPEED;
      ball.vy = -n.y * MAX_SPEED;
      state.balls = [ball];
      const w = watch(ball, "flipper");
      let reversed = false;
      let crossed = false;
      const midS = flip.len * 0.5;
      const mx = flip.pivotX + Math.cos(flip.angle) * midS;
      const my = flip.pivotY + Math.sin(flip.angle) * midS;
      for (let i = 0; i < 36; i++) {
        step(state, DT, { left: true, right: false, plunge: false, nudge: false });
        w.sample();
        const side = (ball.x - mx) * n.x + (ball.y - my) * n.y;
        if (side < -ball.r) crossed = true;
        if (ball.vx * n.x + ball.vy * n.y > 120) reversed = true;
      }
      w.report({ reversed, crossed, below: ball.y > 700, tunnels: state.stats.tunnels });
    }
    {
      const state = create(6);
      state.phase = "play";
      state.ballInPlay = true;
      state.balls = [makeBall(200, 520)];
      const ball = state.balls[0];
      ball.vy = MAX_SPEED;
      const w = watch(ball, "center-gap");
      for (let i = 0; i < 50; i++) { step(state, DT, emptyInput()); w.sample(); }
      w.report({ drained: ball.dead || ball.y > 700 || state.stats.drains.center > 0, tunnels: state.stats.tunnels });
    }
    {
      const state = create(7);
      state.phase = "play";
      state.ballInPlay = true;
      state.plungerArmed = false;
      const ball = makeBall(180, 300);
      state.balls = [ball];
      step(state, 0.5, emptyInput());
      const dy = ball.y - 300;
      const open = 0.5 * GRAV * 0.05 * 0.05;
      results.push({
        label: "dt-cap",
        dy: Math.round(dy * 10) / 10,
        openAir: Math.round(open * 10) / 10,
        ok: dy > 0 && dy < open * 4 + 8,
      });
    }
    {
      const state = create(8);
      state.phase = "play";
      state.ballInPlay = true;
      doNudge(state); doNudge(state); doNudge(state);
      results.push({ label: "tilt", tilted: state.tilted, meter: Math.round(state.tiltMeter * 100) / 100, flipsDead: !state.flipL.held });
    }
    return results;
  }

  function emptyInput() {
    return { left: false, right: false, plunge: false, nudge: false };
  }

  function parkCradle(state, side) {
    state.phase = "play";
    state.ballInPlay = true;
    state.launchedAt = state.t;
    const flip = side === "R" ? state.flipR : state.flipL;
    flip.held = true;
    flip.angle = flip.up;
    flip.omega = 0;
    const ball = makeBall(200, 400);
    placeOnFlipper(ball, flip, flip.len * NOTCH);
    ball.asleep = true;
    ball.cradle = flip.side;
    ball.vx = 0;
    ball.vy = 0;
    state.balls = [ball];
    state.plungerArmed = false;
    return ball;
  }

  function calibrateShots(seed) {
    const delays = [];
    for (let i = 30; i <= 62; i += 2) delays.push(i / 100);
    const rows = [];
    for (const side of ["L", "R"]) {
      for (const delay of delays) {
        const state = create(seed || 11);
        parkCradle(state, side);
        const events = [];
        const orig = state.events;
        state.events = orig;
        let phase = "hold";
        let pt = 0;
        const buttons = { left: side === "L", right: side === "R", plunge: false, nudge: false };
        let guard = 0;
        const seen = {};
        while (guard < 2400 && state.phase === "play") {
          pt += DT;
          if (phase === "hold" && pt > 0.12) { phase = "drop"; pt = 0; }
          if (phase === "drop") {
            buttons.left = false; buttons.right = false;
            if (pt > delay) { phase = "flip"; pt = 0; }
          }
          if (phase === "flip") {
            buttons.left = side === "L";
            buttons.right = side === "R";
          }
          state.events.length = 0;
          step(state, DT, buttons);
          for (const e of state.events) {
            if (e.type === "target" || e.type === "ramp" || e.type === "orbit" || e.type === "drain" || e.type === "bumper" || e.type === "sling") {
              const key = e.type + (e.letter || "");
              if (!seen[key]) { seen[key] = Math.round(pt * 100) / 100; }
            }
          }
          guard += 1;
          if (phase === "flip" && pt > 1.5) break;
        }
        rows.push({ side, delay, seen, y: Math.round((state.balls[0] ? state.balls[0].y : 999)), asleep: state.balls[0] ? state.balls[0].asleep : false });
      }
    }
    return rows;
  }

  function cradleTest() {
    const state = create(21);
    state.phase = "play";
    state.ballInPlay = true;
    state.launchedAt = state.t;
    state.flipL.held = true;
    state.flipL.angle = state.flipL.up;
    const flip = state.flipL;
    const s = flip.len * NOTCH;
    const cx = flip.pivotX + Math.cos(flip.angle) * s;
    const cy = flip.pivotY + Math.sin(flip.angle) * s;
    const n = upperNormal(flip);
    const ball = makeBall(cx + n.x * 36, cy + n.y * 36);
    ball.vy = 260;
    ball.vx = 10;
    state.balls = [ball];
    state.plungerArmed = false;
    for (let i = 0; i < 180; i++) step(state, DT, { left: true, right: false, plunge: false, nudge: false });
    return {
      asleep: !!(state.balls[0] && state.balls[0].asleep),
      x: state.balls[0] ? Math.round(state.balls[0].x) : null,
      y: state.balls[0] ? Math.round(state.balls[0].y) : null,
      drained: state.stats.drains.center + state.stats.drains.outL,
      speed: state.balls[0] ? Math.round(hypot(state.balls[0].vx, state.balls[0].vy)) : null,
    };
  }

  root.BeanPinballSim = {
    DT, SUB, GRAV, BALL_R, MAX_SPEED, TABLE_W, TABLE_H, SCORE, PROFILES, EXTRA_AT,
    LEFT_ORBIT, RIGHT_RAMP, SKILL_RAIL,
    create, step, run, benchmark, aggregate, summarize,
    botCreate, botButtons, tunnelTest, calibrateShots, cradleTest, parkCradle,
    flipTip, upperNormal, pathLen,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
