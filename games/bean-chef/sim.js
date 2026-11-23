/* 콩셰프 키친 rules. No DOM. Shared by the game and the headless playtests. */
(function (root) {
  const TILE = 48;
  const CHEF_R = 12;
  const CHOP_TIME = 0.86;
  const SAVE_KEY = "simsim-bean-chef-v1";

  const SCORE = {
    base: 100,
    tip: 120,
    perfect: 80,
    plain: 28,
    comboStep: 0.14,
    comboCap: 6,
    onTime: 0.5,
    miss: 36,
    fire: 18,
  };

  const ING = {
    rice: { id: "rice", name: "밥" },
    sprout: { id: "sprout", name: "콩나물" },
    tofu: { id: "tofu", name: "두부" },
    egg: { id: "egg", name: "계란" },
    seaweed: { id: "seaweed", name: "김" },
    pepper: { id: "pepper", name: "고추" },
    tteok: { id: "tteok", name: "떡" },
  };

  const LETTER = {
    R: "rice",
    S: "sprout",
    T: "tofu",
    E: "egg",
    W: "seaweed",
    P: "pepper",
    K: "tteok",
  };

  const CHOPPABLE = { egg: true, sprout: true, tofu: true, pepper: true };

  const RECIPES = {
    kimbap: {
      id: "kimbap",
      name: "김밥",
      station: "plate",
      cook: 0,
      perfect: 0,
      burn: 0,
      ings: [{ id: "rice" }, { id: "seaweed" }, { id: "egg", chop: true }],
    },
    gyeran: {
      id: "gyeran",
      name: "계란말이",
      station: "pan",
      cook: 5.4,
      perfect: 2.8,
      burn: 3.2,
      ings: [{ id: "egg" }, { id: "egg" }],
    },
    dubu: {
      id: "dubu",
      name: "두부조림",
      station: "pot",
      cook: 7.2,
      perfect: 2.5,
      burn: 3.0,
      ings: [{ id: "tofu", chop: true }, { id: "pepper", chop: true }],
    },
    kong: {
      id: "kong",
      name: "콩나물국밥",
      station: "pot",
      cook: 7.0,
      perfect: 2.45,
      burn: 2.9,
      ings: [{ id: "sprout", chop: true }, { id: "rice" }],
    },
    tteok: {
      id: "tteok",
      name: "떡볶이",
      station: "pot",
      cook: 6.6,
      perfect: 2.3,
      burn: 2.8,
      ings: [{ id: "tteok" }, { id: "pepper", chop: true }],
    },
  };

  const DAYS = [
    {
      id: 1,
      name: "오픈 키친",
      blurb: "넓은 저녁 주방. 김밥과 계란말이로 손을 풀어요.",
      duration: 150,
      spawnEvery: 18,
      maxOrders: 3,
      patience: 50,
      perfectScale: 1.12,
      cookScale: 1,
      dishes: ["kimbap", "gyeran"],
      stars: [400, 1150, 1320],
      layout: "open",
    },
    {
      id: 2,
      name: "칸막이 키친",
      blurb: "재료와 불이 벽으로 갈라졌어요. 두부조림이 추가됩니다.",
      duration: 160,
      spawnEvery: 15.5,
      maxOrders: 3,
      patience: 58,
      perfectScale: 1.05,
      cookScale: 1,
      dishes: ["kimbap", "gyeran", "dubu"],
      stars: [160, 1150, 1650],
      layout: "split",
    },
    {
      id: 3,
      name: "벨트 키친",
      blurb: "가운데 벨트가 셰프를 밀어 냅니다. 콩나물국밥이 들어와요.",
      duration: 165,
      spawnEvery: 14,
      maxOrders: 4,
      patience: 58,
      perfectScale: 1,
      cookScale: 1,
      dishes: ["kimbap", "gyeran", "dubu", "kong"],
      stars: [200, 620, 1100],
      layout: "belt",
    },
    {
      id: 4,
      name: "미끄럼 키친",
      blurb: "기름이 질질. 떡볶이까지, 미끄러지지 말고 완벽에 끄세요.",
      duration: 170,
      spawnEvery: 12.6,
      maxOrders: 4,
      patience: 56,
      perfectScale: 0.88,
      cookScale: 1.02,
      dishes: ["kimbap", "gyeran", "dubu", "kong", "tteok"],
      stars: [120, 520, 1000],
      layout: "grease",
    },
  ];

  const DIRS = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function emptyMap(w, h) {
    const rows = [];
    for (let r = 0; r < h; r++) {
      const row = [];
      for (let c = 0; c < w; c++) {
        row.push(r === 0 || r === h - 1 || c === 0 || c === w - 1 ? "#" : ".");
      }
      rows.push(row);
    }
    return rows;
  }

  function mapRows(layout) {
    if (layout === "open") {
      const rows = emptyMap(12, 8);
      paint(rows, [
        [1, 1, "R"],
        [1, 3, "E"],
        [1, 5, "W"],
        [3, 4, "C"],
        [4, 4, "F"],
        [4, 7, "L"],
        [4, 9, "V"],
        [5, 10, "X"],
      ]);
      return { rows: join(rows), spawn: { c: 8, r: 2 } };
    }
    if (layout === "split") {
      const rows = emptyMap(14, 9);
      for (let r = 1; r <= 7; r++) if (r !== 4) rows[r][6] = "#";
      paint(rows, [
        [1, 1, "R"],
        [1, 2, "S"],
        [1, 3, "T"],
        [1, 4, "P"],
        [1, 5, "W"],
        [1, 8, "E"],
        [3, 2, "C"],
        [6, 2, "O"],
        [6, 4, "L"],
        [2, 10, "F"],
        [6, 11, "V"],
        [6, 12, "X"],
      ]);
      return { rows: join(rows), spawn: { c: 9, r: 4 } };
    }
    if (layout === "belt" || layout === "grease") {
      const rows = emptyMap(14, 9);
      for (let r = 1; r <= 7; r++) if (r !== 4) rows[r][6] = "#";
      const hazard = layout === "belt" ? ">" : "~";
      [1, 2, 3, 8, 9, 10, 11, 12].forEach(function (c) {
        rows[4][c] = hazard;
        rows[7][c] = hazard;
      });
      if (layout === "grease") rows[5][9] = "K";
      paint(rows, [
        [1, 1, "R"],
        [1, 2, "S"],
        [1, 3, "T"],
        [1, 4, "P"],
        [1, 5, "W"],
        [1, 8, "E"],
        [3, 2, "C"],
        [6, 2, "O"],
        [6, 4, "L"],
        [2, 10, "F"],
        [6, 11, "V"],
        [6, 12, "X"],
      ]);
      return { rows: join(rows), spawn: { c: 9, r: 3 } };
    }
    return { rows: join(emptyMap(12, 8)), spawn: { c: 2, r: 4 } };
  }

  function paint(rows, list) {
    list.forEach(function (p) {
      rows[p[0]][p[1]] = p[2];
    });
  }

  function join(rows) {
    return rows.map(function (r) {
      return r.join("");
    });
  }

  function walkableChar(ch) {
    return ch === "." || ch === ">" || ch === "~";
  }

  function stationKind(ch) {
    if (LETTER[ch]) return "crate";
    if (ch === "C") return "board";
    if (ch === "O") return "pot";
    if (ch === "F") return "pan";
    if (ch === "L") return "plate";
    if (ch === "V") return "window";
    if (ch === "X") return "trash";
    return null;
  }

  function validate(map, spawn, dishes) {
    const H = map.length;
    const W = map[0].length;
    for (let r = 0; r < H; r++) {
      if (map[r].length !== W) throw new Error("map width");
      for (let c = 0; c < W; c++) {
        const kind = stationKind(map[r][c]);
        if (!kind) continue;
        const ok = DIRS.some(function (d) {
          const rr = r + d.y;
          const cc = c + d.x;
          const ch = map[rr] && map[rr][cc];
          return walkableChar(ch);
        });
        if (!ok) throw new Error("isolated " + map[r][c] + " " + c + "," + r);
      }
    }
    const sc = map[spawn.r][spawn.c];
    if (!walkableChar(sc)) throw new Error("bad spawn");
    DIRS.forEach(function (d) {
      const ch = map[spawn.r + d.y][spawn.c + d.x];
      if (stationKind(ch)) throw new Error("spawn adjacent to station");
    });
    const letters = map.join("");
    dishes.forEach(function (id) {
      RECIPES[id].ings.forEach(function (ing) {
        const letter = Object.keys(LETTER).find(function (k) {
          return LETTER[k] === ing.id;
        });
        if (letters.indexOf(letter) < 0) throw new Error("missing " + ing.id);
      });
      if (RECIPES[id].station === "pot" && letters.indexOf("O") < 0) throw new Error("no pot");
      if (RECIPES[id].station === "pan" && letters.indexOf("F") < 0) throw new Error("no pan");
    });
    if (letters.indexOf("L") < 0 || letters.indexOf("V") < 0 || letters.indexOf("X") < 0 || letters.indexOf("C") < 0) {
      throw new Error("missing core station");
    }
    const probe = {
      map: map,
      chef: { x: (spawn.c + 0.5) * TILE, y: (spawn.r + 0.5) * TILE },
      stations: [],
    };
    for (let r = 0; r < map.length; r++) {
      for (let c = 0; c < map[r].length; c++) {
        if (!stationKind(map[r][c])) continue;
        const fake = { c: c, r: r };
        const opts = interactOptions(probe, fake);
        if (!opts.length) throw new Error("no interact tile " + c + "," + r);
        opts.forEach(function (opt) {
          if (!route(probe, opt.c, opt.r)) throw new Error("unreachable stand " + opt.c + "," + opt.r);
        });
      }
    }
  }

  function sigOf(item) {
    return item.id + (item.chopped ? "*" : "");
  }

  function recipeSig(ing) {
    return ing.id + (ing.chop ? "*" : "");
  }

  function isSubset(have, recipeIngs) {
    const bag = recipeIngs.map(recipeSig);
    for (let i = 0; i < have.length; i++) {
      const s = sigOf(have[i]);
      const k = bag.indexOf(s);
      if (k < 0) return false;
      bag.splice(k, 1);
    }
    return true;
  }

  function matches(have, recipeIngs) {
    return have.length === recipeIngs.length && isSubset(have, recipeIngs);
  }

  function matchRecipe(kind, ings) {
    const ids = Object.keys(RECIPES);
    for (let i = 0; i < ids.length; i++) {
      const rec = RECIPES[ids[i]];
      if (rec.station !== kind) continue;
      if (matches(ings, rec.ings)) return rec.id;
    }
    return null;
  }

  function canAccept(kind, ings, item) {
    if (!item || item.kind !== "ing") return false;
    const next = ings.concat([item]);
    const ids = Object.keys(RECIPES);
    for (let i = 0; i < ids.length; i++) {
      const rec = RECIPES[ids[i]];
      if (rec.station !== kind) continue;
      if (isSubset(next, rec.ings)) return true;
    }
    return false;
  }

  function nextNeed(rec, have) {
    const bag = have.map(sigOf);
    for (let i = 0; i < rec.ings.length; i++) {
      const s = recipeSig(rec.ings[i]);
      const k = bag.indexOf(s);
      if (k >= 0) bag.splice(k, 1);
      else return { id: rec.ings[i].id, chop: !!rec.ings[i].chop };
    }
    return null;
  }

  function timings(state, rec) {
    return {
      cook: rec.cook * state.cookScale,
      perfect: rec.perfect * state.perfectScale,
      burn: rec.burn,
    };
  }

  function starCount(score, need) {
    let s = 0;
    for (let i = 0; i < need.length; i++) if (score >= need[i]) s++;
    return s;
  }

  function create(dayId, seed) {
    const day = DAYS[(dayId | 0) - 1] || DAYS[0];
    const built = mapRows(day.layout);
    validate(built.rows, built.spawn, day.dishes);
    const map = built.rows;
    const stations = [];
    for (let r = 0; r < map.length; r++) {
      for (let c = 0; c < map[r].length; c++) {
        const ch = map[r][c];
        const kind = stationKind(ch);
        if (!kind) continue;
        stations.push({
          id: stations.length,
          kind: kind,
          ing: kind === "crate" ? LETTER[ch] : null,
          c: c,
          r: r,
          x: (c + 0.5) * TILE,
          y: (r + 0.5) * TILE,
          item: null,
          chop: 0,
          ings: [],
          phase: "idle",
          timer: 0,
          recipe: null,
          penalized: false,
          plateIngs: [],
          done: null,
          perfect: false,
        });
      }
    }
    const state = {
      day: day.id,
      dayName: day.name,
      duration: day.duration,
      spawnEvery: day.spawnEvery,
      maxOrders: day.maxOrders,
      patience: day.patience,
      perfectScale: day.perfectScale,
      cookScale: day.cookScale,
      starNeed: day.stars.slice(),
      dishPool: day.dishes.slice(),
      map: map,
      stations: stations,
      seed: seed >>> 0,
      rng: mulberry32((seed || 1) >>> 0),
      orderRng: mulberry32((day.id * 9176 + 11) >>> 0),
      time: 0,
      phase: "play",
      score: 0,
      stars: 0,
      combo: 0,
      maxCombo: 0,
      served: 0,
      missed: 0,
      burnt: 0,
      cooks: 0,
      perfects: 0,
      ticketSum: 0,
      spawned: 0,
      maxStep: 0,
      wobble: 0,
      spawnAcc: day.spawnEvery,
      nextId: 1,
      orders: [],
      events: [],
      facingId: -1,
      bag: [],
      chef: {
        x: (built.spawn.c + 0.5) * TILE,
        y: (built.spawn.r + 0.5) * TILE,
        vx: 0,
        vy: 0,
        dir: 1,
        hold: null,
        actionWas: false,
        chopping: false,
        phase: 0,
        wasGrease: false,
      },
    };
    spawnOrder(state, 1);
    spawnOrder(state, 0.88);
    return state;
  }

  function drawDish(state) {
    if (!state.bag.length) {
      const bag = state.dishPool.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(state.orderRng() * (i + 1));
        const swap = bag[i];
        bag[i] = bag[j];
        bag[j] = swap;
      }
      state.bag = bag;
    }
    return state.bag.pop();
  }

  function spawnOrder(state, scale) {
    if (state.orders.length >= state.maxOrders) return;
    const dish = drawDish(state);
    const maxP = state.patience * (scale || 1);
    state.orders.push({
      id: state.nextId++,
      dish: dish,
      patience: maxP,
      maxPatience: maxP,
      born: state.time,
    });
    state.spawned += 1;
    const st = state.stations.find(function (s) {
      return s.kind === "window";
    });
    state.events.push({
      type: "order",
      dish: dish,
      name: RECIPES[dish].name,
      x: st ? st.x : 0,
      y: st ? st.y : 0,
    });
  }

  function tileChar(state, c, r) {
    if (r < 0 || c < 0 || r >= state.map.length || c >= state.map[0].length) return "#";
    return state.map[r][c];
  }

  function blocked(state, x, y) {
    const rad = CHEF_R;
    const c0 = Math.floor((x - rad) / TILE);
    const c1 = Math.floor((x + rad) / TILE);
    const r0 = Math.floor((y - rad) / TILE);
    const r1 = Math.floor((y + rad) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (walkableChar(tileChar(state, c, r))) continue;
        const rx = c * TILE;
        const ry = r * TILE;
        const nx = clamp(x, rx, rx + TILE);
        const ny = clamp(y, ry, ry + TILE);
        const dx = x - nx;
        const dy = y - ny;
        if (dx * dx + dy * dy < rad * rad) return true;
      }
    }
    return false;
  }

  function moveChef(state, dx, dy) {
    const chef = state.chef;
    if (dx) {
      const nx = chef.x + dx;
      if (!blocked(state, nx, chef.y)) chef.x = nx;
      else chef.vx = 0;
    }
    if (dy) {
      const ny = chef.y + dy;
      if (!blocked(state, chef.x, ny)) chef.y = ny;
      else chef.vy = 0;
    }
  }

  function findFacing(state) {
    const chef = state.chef;
    const d = DIRS[chef.dir] || DIRS[1];
    const c = Math.floor(chef.x / TILE) + d.x;
    const r = Math.floor(chef.y / TILE) + d.y;
    const cc = Math.floor(chef.x / TILE);
    const cr = Math.floor(chef.y / TILE);
    if (Math.abs(cc - c) + Math.abs(cr - r) !== 1) return null;
    for (let i = 0; i < state.stations.length; i++) {
      const s = state.stations[i];
      if (s.c === c && s.r === r) return s;
    }
    return null;
  }

  function resetCooker(st) {
    st.ings = [];
    st.phase = "idle";
    st.timer = 0;
    st.recipe = null;
    st.penalized = false;
  }

  function pushEvent(state, type, x, y, extra) {
    const ev = { type: type, x: x || 0, y: y || 0, t: state.time };
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        ev[k] = extra[k];
      });
    }
    state.events.push(ev);
    if (state.events.length > 30) state.events.splice(0, state.events.length - 16);
  }

  function interact(state, st) {
    if (!st) return;
    const chef = state.chef;
    const hold = chef.hold;

    if (st.kind === "crate") {
      if (!hold) {
        chef.hold = { kind: "ing", id: st.ing, chopped: false };
        pushEvent(state, "pickup", st.x, st.y, { name: ING[st.ing].name });
      }
      return;
    }

    if (st.kind === "board") {
      if (hold && hold.kind === "ing" && CHOPPABLE[hold.id] && !hold.chopped && !st.item) {
        st.item = hold;
        st.chop = 0;
        chef.hold = null;
        pushEvent(state, "drop", st.x, st.y);
        return;
      }
      if (!hold && st.item) {
        chef.hold = st.item;
        st.item = null;
        st.chop = 0;
        pushEvent(state, "pickup", st.x, st.y, { name: itemName(chef.hold) });
      }
      return;
    }

    if (st.kind === "pot" || st.kind === "pan") {
      if (!hold && st.phase === "perfect" && st.recipe) {
        chef.hold = { kind: "cooked", dish: st.recipe, perfect: true };
        state.cooks += 1;
        pushEvent(state, "pickup", st.x, st.y, { name: RECIPES[st.recipe].name, perfect: true });
        resetCooker(st);
        return;
      }
      if (!hold && st.phase === "cook" && st.recipe) {
        const tm = timings(state, RECIPES[st.recipe]);
        if (st.timer >= tm.cook * 0.7) {
          chef.hold = { kind: "cooked", dish: st.recipe, perfect: false };
          state.cooks += 1;
          pushEvent(state, "pickup", st.x, st.y, { name: RECIPES[st.recipe].name, perfect: false });
          resetCooker(st);
        }
        return;
      }
      if (!hold && st.phase === "burnt") {
        chef.hold = { kind: "burnt" };
        resetCooker(st);
        pushEvent(state, "pickup", st.x, st.y, { name: "탄 요리" });
        return;
      }
      if (!hold && st.phase === "idle" && st.ings.length) {
        chef.hold = st.ings.pop();
        pushEvent(state, "pickup", st.x, st.y, { name: itemName(chef.hold) });
        return;
      }
      if (hold && hold.kind === "ing" && st.phase === "idle" && canAccept(st.kind, st.ings, hold)) {
        st.ings.push(hold);
        chef.hold = null;
        const recId = matchRecipe(st.kind, st.ings);
        if (recId) {
          st.phase = "cook";
          st.timer = 0;
          st.recipe = recId;
          pushEvent(state, "cook", st.x, st.y, { dish: recId, name: RECIPES[recId].name });
        } else {
          pushEvent(state, "drop", st.x, st.y);
        }
      }
      return;
    }

    if (st.kind === "plate") {
      if (hold && hold.kind === "cooked" && !st.done && st.plateIngs.length === 0) {
        st.done = hold.dish;
        st.perfect = !!hold.perfect;
        chef.hold = null;
        pushEvent(state, "drop", st.x, st.y, { name: RECIPES[st.done].name });
        return;
      }
      if (hold && hold.kind === "ing" && !st.done && isSubset(st.plateIngs.concat([hold]), RECIPES.kimbap.ings)) {
        st.plateIngs.push(hold);
        chef.hold = null;
        if (matches(st.plateIngs, RECIPES.kimbap.ings)) {
          st.done = "kimbap";
          st.perfect = true;
          st.plateIngs = [];
          pushEvent(state, "plated", st.x, st.y, { name: "김밥" });
        } else {
          pushEvent(state, "drop", st.x, st.y);
        }
        return;
      }
      if (!hold && st.done) {
        chef.hold = { kind: "plated", dish: st.done, perfect: !!st.perfect };
        pushEvent(state, "pickup", st.x, st.y, { name: RECIPES[st.done].name });
        st.done = null;
        st.perfect = false;
        st.plateIngs = [];
        return;
      }
      if (!hold && st.plateIngs.length) {
        chef.hold = st.plateIngs.pop();
        pushEvent(state, "pickup", st.x, st.y, { name: itemName(chef.hold) });
      }
      return;
    }

    if (st.kind === "window") {
      if (hold && hold.kind === "plated") {
        const idx = state.orders.findIndex(function (o) {
          return o.dish === hold.dish;
        });
        if (idx >= 0) {
          const order = state.orders[idx];
          state.orders.splice(idx, 1);
          award(state, order, !!hold.perfect, st);
          chef.hold = null;
        } else {
          pushEvent(state, "reject", st.x, st.y, { text: "주문 없음" });
          state.wobble = Math.max(state.wobble, 0.35);
        }
      }
      return;
    }

    if (st.kind === "trash") {
      if (hold) {
        pushEvent(state, hold.kind === "burnt" ? "extinguish" : "trash", st.x, st.y);
        chef.hold = null;
      }
    }
  }

  function award(state, order, perfect, st) {
    const ratio = clamp(order.patience / order.maxPatience, 0, 1);
    const onTime = ratio >= SCORE.onTime;
    if (onTime) state.combo += 1;
    else state.combo = 0;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    const mult = 1 + Math.min(SCORE.comboCap, Math.max(0, state.combo - 1)) * SCORE.comboStep;
    const gained = Math.round((SCORE.base + Math.round(SCORE.tip * ratio) + (perfect ? SCORE.perfect : SCORE.plain)) * mult);
    state.score += gained;
    state.served += 1;
    if (perfect) state.perfects += 1;
    state.ticketSum += state.time - order.born;
    state.stars = starCount(state.score, state.starNeed);
    pushEvent(state, "serve", st.x, st.y, {
      text: perfect ? "완벽!" : "+" + gained,
      perfect: perfect,
      gained: gained,
      name: RECIPES[order.dish].name,
      combo: state.combo,
    });
  }

  function updateCook(state, st, dt) {
    if (st.phase === "burnt") {
      st.timer += dt;
      if (!st.penalized && st.timer > 6.5) {
        st.penalized = true;
        state.score = Math.max(0, state.score - SCORE.fire);
        state.wobble = 1;
        pushEvent(state, "fire", st.x, st.y, { text: "불이야!" });
      }
      return;
    }
    if (st.phase !== "cook" && st.phase !== "perfect") return;
    const rec = RECIPES[st.recipe];
    if (!rec) return;
    const tm = timings(state, rec);
    st.timer += dt;
    if (st.phase === "cook" && st.timer >= tm.cook) {
      st.phase = "perfect";
      st.timer = 0;
      pushEvent(state, "ready", st.x, st.y, { text: "지금!", name: rec.name });
    } else if (st.phase === "perfect" && st.timer >= tm.perfect) {
      st.phase = "burnt";
      st.timer = 0;
      state.burnt += 1;
      state.combo = 0;
      state.wobble = 1;
      pushEvent(state, "burn", st.x, st.y, { text: "탔어요!", name: rec.name });
    }
  }

  function step(state, input, dt) {
    if (!state || state.phase !== "play") return state;
    dt = clamp(dt || 0, 0, 0.05);
    if (dt <= 0) return state;
    const chef = state.chef;
    const action = !!(input && input.action);
    const pressed = action && !chef.actionWas;
    chef.actionWas = action;

    let ix = clamp(Number(input && input.x) || 0, -1, 1);
    let iy = clamp(Number(input && input.y) || 0, -1, 1);
    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }

    const c0 = Math.floor(chef.x / TILE);
    const r0 = Math.floor(chef.y / TILE);
    const under = tileChar(state, c0, r0);
    const grease = under === "~";
    const belt = under === ">";

    let accel = 3200;
    let fric = 16;
    let maxV = 214;
    if (grease) {
      accel = 700;
      fric = 1.45;
      maxV = 270;
      if (!chef.wasGrease) {
        const sp = Math.hypot(chef.vx, chef.vy);
        if (sp > 50) {
          chef.vx *= 1.28;
          chef.vy *= 1.28;
        }
      }
    }
    chef.wasGrease = grease;

    chef.vx += ix * accel * dt;
    chef.vy += iy * accel * dt;
    const damp = Math.exp(-fric * dt);
    chef.vx *= damp;
    chef.vy *= damp;
    let sp = Math.hypot(chef.vx, chef.vy);
    if (sp > maxV) {
      chef.vx = (chef.vx / sp) * maxV;
      chef.vy = (chef.vy / sp) * maxV;
      sp = maxV;
    }

    const ox = chef.x;
    const oy = chef.y;
    moveChef(state, chef.vx * dt, chef.vy * dt);
    if (belt) chef.vx += 420 * dt;
    const stepped = Math.hypot(chef.x - ox, chef.y - oy);
    if (stepped > state.maxStep) state.maxStep = stepped;

    if (mag > 0.22) {
      if (Math.abs(ix) > Math.abs(iy)) chef.dir = ix > 0 ? 1 : 3;
      else chef.dir = iy > 0 ? 2 : 0;
    } else if (input && input.face != null && input.face >= 0 && input.face <= 3) {
      chef.dir = input.face | 0;
    }

    chef.phase += sp * dt * 0.085;
    const facing = findFacing(state);
    state.facingId = facing ? facing.id : -1;

    if (chef.chopping) {
      const board = facing && facing.kind === "board" ? facing : null;
      if (!action || !board || !board.item || board.item.chopped || chef.hold) {
        chef.chopping = false;
      } else {
        board.chop += dt / CHOP_TIME;
        if (board.chop >= 1) {
          board.chop = 1;
          board.item.chopped = true;
          chef.chopping = false;
          pushEvent(state, "chopped", board.x, board.y, { name: itemName(board.item) });
        }
      }
    }

    if (pressed) {
      if (facing && facing.kind === "board" && facing.item && !facing.item.chopped && !chef.hold) {
        chef.chopping = true;
      } else {
        interact(state, facing);
      }
    }

    for (let i = 0; i < state.stations.length; i++) {
      const st = state.stations[i];
      if (st.kind === "pot" || st.kind === "pan") updateCook(state, st, dt);
    }

    for (let i = state.orders.length - 1; i >= 0; i--) {
      const o = state.orders[i];
      o.patience -= dt;
      if (o.patience <= 0) {
        state.orders.splice(i, 1);
        state.missed += 1;
        state.combo = 0;
        state.score = Math.max(0, state.score - SCORE.miss);
        pushEvent(state, "miss", 0, 0, { name: RECIPES[o.dish].name, text: "시간 초과" });
      }
    }

    if (state.orders.length >= state.maxOrders) {
      if (state.spawnAcc > state.spawnEvery) state.spawnAcc = state.spawnEvery;
    } else {
      state.spawnAcc += dt;
      if (state.spawnAcc >= state.spawnEvery) {
        state.spawnAcc -= state.spawnEvery;
        spawnOrder(state, 1);
      }
    }

    state.wobble = Math.max(0, state.wobble - dt * 1.35);
    state.time += dt;
    state.stars = starCount(state.score, state.starNeed);
    if (state.time >= state.duration) {
      state.phase = "end";
      state.stars = starCount(state.score, state.starNeed);
      pushEvent(state, "end", 0, 0, { stars: state.stars });
    }
    return state;
  }

  function itemName(item) {
    if (!item) return "비어 있음";
    if (item.kind === "burnt") return "탄 요리";
    if (item.kind === "cooked" || item.kind === "plated") return RECIPES[item.dish].name;
    const base = ING[item.id] ? ING[item.id].name : "재료";
    return item.chopped ? "썬 " + base : base;
  }

  function metrics(state) {
    return {
      day: state.day,
      dayName: state.dayName,
      score: Math.round(state.score),
      stars: state.stars,
      served: state.served,
      missed: state.missed,
      burnt: state.burnt,
      cooks: state.cooks,
      perfects: state.perfects,
      burnRate: state.burnt / Math.max(1, state.burnt + state.cooks),
      avgTicket: state.served ? state.ticketSum / state.served : 0,
      maxCombo: state.maxCombo,
      maxStep: state.maxStep,
      time: state.time,
      phase: state.phase,
      ordersLeft: state.orders.length,
      spawned: state.spawned,
      starNeed: state.starNeed.slice(),
    };
  }

  function plateStation(state) {
    return state.stations.find(function (s) {
      return s.kind === "plate";
    });
  }

  function interactOptions(state, station) {
    const opts = [];
    for (let i = 0; i < DIRS.length; i++) {
      const d = DIRS[i];
      const c = station.c + d.x;
      const r = station.y === undefined ? station.r + d.y : station.r + d.y;
      const ch = tileChar(state, c, r);
      if (!walkableChar(ch)) continue;
      const face = dirFromDelta(-d.x, -d.y);
      opts.push({ c: c, r: r, face: face, ch: ch });
    }
    return opts;
  }

  function dirFromDelta(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3;
    return dy > 0 ? 2 : 0;
  }

  function center(c, r) {
    return { x: (c + 0.5) * TILE, y: (r + 0.5) * TILE };
  }

  function tileOf(x, y) {
    return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
  }

  function route(state, c, r) {
    const start = tileOf(state.chef.x, state.chef.y);
    const key = function (t) { return t.c + "," + t.r; };
    const q = [start];
    const prev = {};
    const seen = {};
    seen[key(start)] = true;
    let found = null;
    while (q.length) {
      const cur = q.shift();
      if (cur.c === c && cur.r === r) { found = cur; break; }
      for (let i = 0; i < DIRS.length; i++) {
        const n = { c: cur.c + DIRS[i].x, r: cur.r + DIRS[i].y };
        const k = key(n);
        if (seen[k] || !walkableChar(tileChar(state, n.c, n.r))) continue;
        seen[k] = true;
        prev[k] = cur;
        q.push(n);
      }
    }
    if (!found) return null;
    const path = [found];
    let k = key(found);
    while (prev[k]) {
      path.push(prev[k]);
      k = key(prev[k]);
    }
    path.reverse();
    return path;
  }

  const api = {
    TILE: TILE,
    CHEF_R: CHEF_R,
    CHOP_TIME: CHOP_TIME,
    SAVE_KEY: SAVE_KEY,
    SCORE: SCORE,
    ING: ING,
    RECIPES: RECIPES,
    DAYS: DAYS,
    create: create,
    step: step,
    metrics: metrics,
    itemName: itemName,
    isSubset: isSubset,
    matches: matches,
    canAccept: canAccept,
    nextNeed: nextNeed,
    plate: plateStation,
    interactOptions: interactOptions,
    tileChar: tileChar,
    walkableChar: walkableChar,
    center: center,
    tileOf: tileOf,
    route: route,
    starCount: starCount,
    timings: timings,
    mapRows: mapRows,
  };

  root.BeanChefSim = api;
})(typeof window !== "undefined" ? window : globalThis);
