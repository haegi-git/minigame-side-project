/* Scripted chefs. Skill changes reaction, path waste, cook timing, and hazard sense. */
(function (root) {
  function Sim() {
    return root.BeanChefSim;
  }

  const PROFILES = {
    good: {
      id: "good",
      react: 0.04,
      takeAt: 0.22,
      fumble: 0.02,
      detour: 0,
      pauseEvery: 99,
      pauseFor: 0,
      compensate: 1,
      greaseCost: 5.5,
      beltCost: 4.2,
      brakeDist: 30,
      pipeline: true,
      linger: 0,
      salt: 11,
    },
    average: {
      id: "average",
      react: 0.36,
      takeAt: 0.4,
      fumble: 0.2,
      detour: 0.72,
      pauseEvery: 2.8,
      pauseFor: 0.26,
      compensate: 0.45,
      greaseCost: 1.8,
      beltCost: 1.45,
      brakeDist: 16,
      pipeline: false,
      linger: 0,
      salt: 29,
    },
    weak: {
      id: "weak",
      react: 0.78,
      takeAt: 0.16,
      fumble: 0.35,
      detour: 0.96,
      pauseEvery: 1.25,
      pauseFor: 0.5,
      compensate: 0,
      greaseCost: 1,
      beltCost: 1,
      brakeDist: 7,
      pipeline: false,
      linger: 3,
      salt: 47,
    },
  };

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

  function create(profile, seed) {
    const p = PROFILES[profile] || PROFILES.average;
    return {
      profile: p,
      rng: mulberry32(((seed || 1) ^ (p.salt * 997)) >>> 0),
      mode: "think",
      path: null,
      pathI: 0,
      face: 1,
      stationId: -1,
      then: "",
      post: 0,
      reactLeft: null,
      pauseLeft: 0,
      pauseAcc: 0,
      stuckT: 0,
      lastX: 0,
      lastY: 0,
      freakouts: 0,
      forceTrash: false,
      sig: "",
      sigT: 0,
      trace: [],
    };
  }

  function stationById(state, id) {
    for (let i = 0; i < state.stations.length; i++) {
      if (state.stations[i].id === id) return state.stations[i];
    }
    return null;
  }

  function stations(state, kind) {
    return state.stations.filter(function (s) {
      return s.kind === kind;
    });
  }

  function crate(state, id) {
    return state.stations.find(function (s) {
      return s.kind === "crate" && s.ing === id;
    });
  }

  function emptyBoard(state) {
    return state.stations.find(function (s) {
      return s.kind === "board" && !s.item;
    });
  }

  function enterCost(ch, profile) {
    if (ch === "~") return profile.greaseCost;
    if (ch === ">") return profile.beltCost;
    return 1;
  }

  function astar(state, start, goal, profile) {
    const S = Sim();
    if (!start || !goal) return null;
    if (start.c === goal.c && start.r === goal.r) return [start];
    const key = function (c, r) {
      return c + "," + r;
    };
    const open = [start];
    const g = {};
    const prev = {};
    g[key(start.c, start.r)] = 0;
    const seen = {};
    while (open.length) {
      let bi = 0;
      let best = 1e9;
      for (let i = 0; i < open.length; i++) {
        const n = open[i];
        const f = g[key(n.c, n.r)] + Math.abs(n.c - goal.c) + Math.abs(n.r - goal.r);
        if (f < best) {
          best = f;
          bi = i;
        }
      }
      const cur = open.splice(bi, 1)[0];
      const ck = key(cur.c, cur.r);
      if (seen[ck]) continue;
      seen[ck] = true;
      if (cur.c === goal.c && cur.r === goal.r) {
        const path = [cur];
        let k = ck;
        while (prev[k]) {
          const p = prev[k];
          path.push(p);
          k = key(p.c, p.r);
        }
        path.reverse();
        return path;
      }
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (let d = 0; d < 4; d++) {
        const nc = cur.c + dirs[d][0];
        const nr = cur.r + dirs[d][1];
        const ch = S.tileChar(state, nc, nr);
        if (!S.walkableChar(ch)) continue;
        const nk = key(nc, nr);
        const ng = g[ck] + enterCost(ch, profile);
        if (g[nk] == null || ng < g[nk]) {
          g[nk] = ng;
          prev[nk] = cur;
          open.push({ c: nc, r: nr });
        }
      }
    }
    return null;
  }

  function maybeDetour(bot, state, path) {
    const profile = bot.profile;
    if (!path || path.length < 4 || profile.detour <= 0) return path;
    if (bot.rng() > profile.detour) return path;
    const S = Sim();
    const mid = path[Math.floor(path.length / 2)];
    const options = [];
    for (let r = 1; r < state.map.length - 1; r++) {
      for (let c = 1; c < state.map[0].length - 1; c++) {
        const man = Math.abs(c - mid.c) + Math.abs(r - mid.r);
        if (man < 2 || man > 3) continue;
        if (!S.walkableChar(S.tileChar(state, c, r))) continue;
        options.push({ c: c, r: r });
      }
    }
    if (!options.length) return path;
    const via = options[Math.floor(bot.rng() * options.length)];
    const a = astar(state, path[0], via, profile);
    const b = astar(state, via, path[path.length - 1], profile);
    if (!a || !b) return path;
    const merged = a.concat(b.slice(1));
    if (merged.length > path.length + 7) return path;
    return merged;
  }

  function chooseGoal(bot, state, station) {
    const S = Sim();
    const opts = S.interactOptions(state, station);
    const here = S.tileOf(state.chef.x, state.chef.y);
    let best = null;
    let bestScore = 1e9;
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i];
      const path = astar(state, here, o, bot.profile);
      if (!path) continue;
      let score = path.length * 2 + enterCost(o.ch, bot.profile) * 3;
      if (bot.profile.id === "weak") score += bot.rng() * 2.4;
      if (score < bestScore) {
        bestScore = score;
        best = { c: o.c, r: o.r, face: o.face, path: path, id: station.id };
      }
    }
    if (best) best.path = maybeDetour(bot, state, best.path);
    return best;
  }

  function go(station, then) {
    return { type: "goto", station: station, then: then };
  }

  function oldest(state) {
    return state.orders.length ? state.orders[0] : null;
  }

  function travelTiles(state, station) {
    const S = Sim();
    const here = S.tileOf(state.chef.x, state.chef.y);
    const opts = S.interactOptions(state, station);
    let best = 99;
    for (let i = 0; i < opts.length; i++) {
      best = Math.min(best, Math.abs(opts[i].c - here.c) + Math.abs(opts[i].r - here.r));
    }
    return best;
  }

  function eta(state, station) {
    return travelTiles(state, station) * 0.3;
  }

  function sideTask(bot, state, current, cooker, remain) {
    if (!bot.profile.pipeline || remain < 1.2) return null;
    const S = Sim();
    const next = state.orders.find(function (o) {
      return o.id !== current.id;
    });
    if (!next) return null;
    const rec = S.RECIPES[next.dish];
    const hold = state.chef.hold;
    const back = eta(state, cooker) + 0.45;
    for (let i = 0; i < rec.ings.length; i++) {
      const ing = rec.ings[i];
      if (!ing.chop) continue;
      const raw = state.stations.find(function (s) {
        return s.kind === "board" && s.item && s.item.id === ing.id && !s.item.chopped;
      });
      if (raw) {
        if (!hold && remain > S.CHOP_TIME + eta(state, raw) + back) return { type: "chop", station: raw };
        return null;
      }
      const done = state.stations.some(function (s) {
        return s.kind === "board" && s.item && s.item.id === ing.id && s.item.chopped;
      });
      if (done) continue;
      if (state.stations.some(function (s) { return s.recipe === next.dish && s.phase !== "idle"; })) continue;
      const board = emptyBoard(state);
      if (!board) return null;
      if (hold && hold.kind === "ing" && hold.id === ing.id && !hold.chopped) {
        if (remain > eta(state, board) + S.CHOP_TIME + back) return go(board, "drop");
        if (remain > eta(state, board) + 0.25) return go(board, "drop");
        return null;
      }
      if (hold) return null;
      const box = crate(state, ing.id);
      if (!box) return null;
      const cost = eta(state, box) + eta(state, board) + S.CHOP_TIME + back + 0.8;
      if (remain < cost) return null;
      return go(box, "take");
    }
    return null;
  }

  function plan(bot, state) {
    const S = Sim();
    const hold = state.chef.hold;
    if (bot.forceTrash) {
      bot.forceTrash = false;
      if (hold) return go(stations(state, "trash")[0], "drop");
      const junk = state.stations.find(function (s) {
        return s.kind === "board" && s.item;
      });
      if (junk) return go(junk, "take");
    }

    const order = oldest(state);
    const burnt = state.stations.find(function (s) {
      return (s.kind === "pot" || s.kind === "pan") && s.phase === "burnt";
    });
    if (burnt) {
      if (hold && hold.kind === "burnt") return go(stations(state, "trash")[0], "drop");
      if (hold && hold.kind === "plated") {
        if (state.orders.some(function (o) { return o.dish === hold.dish; })) return go(stations(state, "window")[0], "serve");
        return go(stations(state, "trash")[0], "drop");
      }
      if (hold && hold.kind === "cooked") {
        const plate = S.plate(state);
        if (!plate.done && plate.plateIngs.length === 0 && state.orders.some(function (o) { return o.dish === hold.dish; })) {
          return go(plate, "drop");
        }
        return go(stations(state, "trash")[0], "drop");
      }
      if (hold) return go(stations(state, "trash")[0], "drop");
      return go(burnt, "take");
    }

    if (hold && hold.kind === "plated") {
      if (state.orders.some(function (o) { return o.dish === hold.dish; })) return go(stations(state, "window")[0], "serve");
      return go(stations(state, "trash")[0], "drop");
    }

    if (hold && hold.kind === "cooked") {
      const plateNow = S.plate(state);
      const wanted = state.orders.some(function (o) { return o.dish === hold.dish; });
      if (wanted && !plateNow.done && plateNow.plateIngs.length === 0) return go(plateNow, "drop");
      if (!wanted) return go(stations(state, "trash")[0], "drop");
    }

    const plate = S.plate(state);
    if (!hold && plate.done && state.orders.some(function (o) { return o.dish === plate.done; })) {
      return go(plate, "take");
    }

    if (!order) {
      if (hold) return go(stations(state, "trash")[0], "drop");
      if (plate.done || plate.plateIngs.length) return go(plate, "take");
      return { type: "idle" };
    }

    const rec = S.RECIPES[order.dish];
    if (rec.station === "plate") return planAssembly(bot, state, order, rec);
    return planCook(bot, state, order, rec);
  }

  function planAssembly(bot, state, order, rec) {
    const S = Sim();
    const hold = state.chef.hold;
    const plate = S.plate(state);
    if (plate.done === order.dish && !hold) return go(plate, "take");
    if (!hold) {
      const raw = rawChopWaiting(state, rec, plate.plateIngs);
      if (raw) return { type: "chop", station: raw };
    }
    if (hold && hold.kind === "ing") {
      if (!plate.done && S.isSubset(plate.plateIngs.concat([hold]), rec.ings)) return go(plate, "drop");
      const need = S.nextNeed(rec, plate.plateIngs);
      if (need && hold.id === need.id && need.chop && !hold.chopped) {
        const board = emptyBoard(state);
        if (board) return go(board, "drop");
        const occ = state.stations.find(function (s) { return s.kind === "board" && s.item; });
        if (occ) return go(occ, "take");
      }
      if (!recipeUses(rec, hold)) return go(stations(state, "trash")[0], "drop");
      return go(stations(state, "trash")[0], "drop");
    }
    if (hold && hold.kind === "cooked") {
      if (!plate.done && plate.plateIngs.length === 0) return go(plate, "drop");
      return go(stations(state, "trash")[0], "drop");
    }
    if (hold) return go(stations(state, "trash")[0], "drop");

    if (plate.done && plate.done !== order.dish) return go(plate, "take");
    if (plate.plateIngs.length && !S.isSubset(plate.plateIngs, rec.ings)) return go(plate, "take");

    const need = S.nextNeed(rec, plate.plateIngs);
    if (!need) return plate.done ? go(plate, "take") : { type: "idle" };
    return fetchNeed(state, need);
  }

  function recipeUses(rec, hold) {
    if (!hold || hold.kind !== "ing") return false;
    return rec.ings.some(function (ing) {
      return ing.id === hold.id;
    });
  }

  function rawChopWaiting(state, rec, have) {
    const S = Sim();
    const bag = have.map(function (item) {
      return item.id + (item.chopped ? "*" : "");
    });
    for (let i = 0; i < rec.ings.length; i++) {
      const ing = rec.ings[i];
      const sig = ing.id + (ing.chop ? "*" : "");
      const k = bag.indexOf(sig);
      if (k >= 0) {
        bag.splice(k, 1);
        continue;
      }
      if (!ing.chop) continue;
      const raw = state.stations.find(function (s) {
        return s.kind === "board" && s.item && s.item.id === ing.id && !s.item.chopped;
      });
      if (raw) return raw;
    }
    return null;
  }

  function fetchNeed(state, need) {
    const ready = state.stations.find(function (s) {
      return s.kind === "board" && s.item && s.item.id === need.id && !!s.item.chopped === !!need.chop;
    });
    if (ready) return go(ready, "take");
    const raw = state.stations.find(function (s) {
      return s.kind === "board" && s.item && s.item.id === need.id && !s.item.chopped && need.chop;
    });
    if (raw) return { type: "chop", station: raw };
    const box = crate(state, need.id);
    if (!box) return { type: "idle" };
    return go(box, "take");
  }

  function findCooker(state, rec, dish) {
    const list = state.stations.filter(function (s) {
      return s.kind === rec.station;
    });
    return (
      list.find(function (s) {
        return s.recipe === dish && s.phase !== "idle";
      }) ||
      list.find(function (s) {
        return s.phase === "idle" && s.ings.length && Sim().isSubset(s.ings, rec.ings);
      }) ||
      list.find(function (s) {
        return s.phase === "idle" && s.ings.length === 0;
      }) ||
      null
    );
  }

  function planCook(bot, state, order, rec) {
    const S = Sim();
    const hold = state.chef.hold;
    const plate = S.plate(state);
    const cooker = findCooker(state, rec, order.dish);
    const foreign = state.stations.find(function (s) {
      return s.kind === rec.station && s.phase !== "idle" && s.recipe && s.recipe !== order.dish;
    });

    if (foreign && (!cooker || cooker === foreign || cooker.phase === "idle")) {
      if (!hold && (foreign.phase === "perfect" || (foreign.phase === "cook" && foreign.timer > S.timings(state, S.RECIPES[foreign.recipe]).cook * 0.7))) {
        return go(foreign, "take");
      }
      if (!hold && foreign.phase === "cook") return { type: "wait", station: foreign, dish: foreign.recipe };
    }

    if (hold && hold.kind === "cooked" && hold.dish === order.dish) {
      if (!plate.done && plate.plateIngs.length === 0) return go(plate, "drop");
      if (plate.done) return go(plate, "take");
      if (plate.plateIngs.length) return { type: "idle" };
    }

    if (cooker && (cooker.phase === "cook" || cooker.phase === "perfect")) {
      const tm = S.timings(state, rec);
      const remain = cooker.phase === "cook" ? tm.cook - cooker.timer : Math.max(0, tm.perfect - cooker.timer);
      if (!hold && (plate.done || plate.plateIngs.length) && cooker.phase === "cook" && remain > 2) {
        return go(plate, "take");
      }
      if (hold && hold.kind === "ing") {
        const board = emptyBoard(state);
        if (board) return go(board, "drop");
        return go(stations(state, "trash")[0], "drop");
      }
      if (hold && hold.kind === "cooked") {
        if (!plate.done && plate.plateIngs.length === 0) return go(plate, "drop");
        return go(stations(state, "trash")[0], "drop");
      }
      if (hold) return go(stations(state, "trash")[0], "drop");
      if (cooker.phase === "perfect" && cooker.timer >= tm.perfect * bot.profile.takeAt) return go(cooker, "take");
      if (cooker.phase === "cook" && bot.profile.linger > 0 && remain > 0.45) {
        return { type: "linger", station: cooker };
      }
      if (cooker.phase === "cook") {
        const side = sideTask(bot, state, order, cooker, remain);
        if (side) return side;
      }
      return { type: "wait", station: cooker, dish: order.dish };
    }

    const have = cooker && cooker.phase === "idle" ? cooker.ings : [];
    if (hold && hold.kind === "ing") {
      const need = S.nextNeed(rec, have);
      if (need && hold.id === need.id && !!hold.chopped === !!need.chop && cooker) return go(cooker, "drop");
      if (need && hold.id === need.id && need.chop && !hold.chopped) {
        const board = emptyBoard(state);
        if (board) return go(board, "drop");
        const occ = state.stations.find(function (s) { return s.kind === "board" && s.item; });
        if (occ) return go(occ, "take");
      }
      if (cooker && S.canAccept(cooker.kind, have, hold)) return go(cooker, "drop");
      return go(stations(state, "trash")[0], "drop");
    }
    if (hold) return go(stations(state, "trash")[0], "drop");

    if (plate.plateIngs.length || (plate.done && plate.done !== order.dish)) return go(plate, "take");
    const rawPrep = rawChopWaiting(state, rec, have);
    if (rawPrep) return { type: "chop", station: rawPrep };

    const need = S.nextNeed(rec, have);
    if (!need) return { type: "idle" };
    return fetchNeed(state, need);
  }

  function beginGoto(bot, state, decision) {
    const goal = chooseGoal(bot, state, decision.station);
    if (!goal) {
      bot.mode = "think";
      return;
    }
    bot.mode = "goto";
    bot.path = goal.path;
    bot.pathI = 0;
    bot.face = goal.face;
    bot.stationId = decision.station.id;
    bot.then = decision.then;
    bot.reactLeft = null;
    bot.stuckT = 0;
  }

  function beginChop(bot, state, decision) {
    const goal = chooseGoal(bot, state, decision.station);
    if (!goal) {
      bot.mode = "think";
      return;
    }
    bot.mode = "chop";
    bot.path = goal.path;
    bot.pathI = 0;
    bot.face = goal.face;
    bot.stationId = decision.station.id;
    bot.reactLeft = null;
    bot.stuckT = 0;
  }

  function beginWait(bot, state, decision) {
    const goal = chooseGoal(bot, state, decision.station);
    if (!goal) {
      bot.mode = "think";
      return;
    }
    bot.mode = "wait";
    bot.path = goal.path;
    bot.pathI = 0;
    bot.face = goal.face;
    bot.stationId = decision.station.id;
    bot.reactLeft = null;
    bot.stuckT = 0;
  }

  function note(bot, state, label) {
    bot.trace.push(state.time.toFixed(1) + " " + label);
    if (bot.trace.length > 80) bot.trace.shift();
    const S = Sim();
    const tile = S.tileOf(state.chef.x, state.chef.y);
    const cook = state.stations
      .map(function (s) {
        return (s.phase || "") + Math.floor(s.timer || 0) + (s.item ? "i" : "") + Math.floor((s.chop || 0) * 5);
      })
      .join("");
    const sig = state.served + "|" + Math.round(state.score) + "|" + tile.c + "," + tile.r + "|" + cook + "|" + (state.chef.hold ? state.chef.hold.kind : "");
    if (sig !== bot.sig) {
      bot.sig = sig;
      bot.sigT = state.time;
    } else if (state.time - bot.sigT > 11) {
      bot.freakouts += 1;
      bot.sigT = state.time;
      bot.forceTrash = true;
      bot.mode = "think";
    }
  }

  function steer(bot, state, c, r) {
    const S = Sim();
    const center = S.center(c, r);
    const chef = state.chef;
    let dx = center.x - chef.x;
    let dy = center.y - chef.y;
    const dist = Math.hypot(dx, dy) || 1;
    let ix = dx / dist;
    let iy = dy / dist;
    const under = S.tileChar(state, Math.floor(chef.x / S.TILE), Math.floor(chef.y / S.TILE));
    if (under === ">" && bot.profile.compensate && Math.abs(iy) > Math.abs(ix) && ix < 0.4) {
      ix -= bot.profile.compensate * 0.65;
    }
    const sp = Math.hypot(chef.vx, chef.vy);
    if (dist < bot.profile.brakeDist && sp > 70) {
      ix = -chef.vx / (sp || 1);
      iy = -chef.vy / (sp || 1);
      if (dist < 10) {
        ix = dx / dist;
        iy = dy / dist;
      }
    }
    const m = Math.hypot(ix, iy);
    if (m > 1) {
      ix /= m;
      iy /= m;
    }
    if (dist < 4 && sp < 40) return { x: 0, y: 0, dist: dist };
    return { x: ix, y: iy, dist: dist };
  }

  function advancePath(bot, state) {
    const S = Sim();
    const here = S.tileOf(state.chef.x, state.chef.y);
    while (bot.pathI < bot.path.length - 1 && bot.path[bot.pathI].c === here.c && bot.path[bot.pathI].r === here.r) {
      bot.pathI += 1;
    }
    return bot.path[Math.min(bot.pathI, bot.path.length - 1)];
  }

  function onGoal(bot, state) {
    if (!bot.path || !bot.path.length) return false;
    const S = Sim();
    const here = S.tileOf(state.chef.x, state.chef.y);
    const goal = bot.path[bot.path.length - 1];
    return here.c === goal.c && here.r === goal.r;
  }

  function faceOf(bot) {
    return bot.face;
  }

  function tickMove(bot, state, dt, andAction) {
    const goal = advancePath(bot, state);
    const arrived = onGoal(bot, state);
    const st = steer(bot, state, goal.c, goal.r);
    const moved = Math.hypot(state.chef.x - bot.lastX, state.chef.y - bot.lastY);
    if (moved < 0.35 && st.dist > 8) bot.stuckT += dt;
    else bot.stuckT = 0;
    bot.lastX = state.chef.x;
    bot.lastY = state.chef.y;
    if (bot.stuckT > 1.05) {
      bot.stuckT = 0;
      bot.freakouts += 1;
      bot.mode = "think";
      return { x: 0, y: 0, action: false, face: faceOf(bot) };
    }
    if (bot.profile.pauseFor > 0 && bot.mode === "goto") {
      bot.pauseAcc += dt;
      if (bot.pauseLeft > 0) {
        bot.pauseLeft -= dt;
        return { x: 0, y: 0, action: false, face: faceOf(bot) };
      }
      if (bot.pauseAcc >= bot.profile.pauseEvery) {
        bot.pauseAcc = 0;
        bot.pauseLeft = bot.profile.pauseFor;
      }
    }
    return {
      x: arrived ? st.x * 0.35 : st.x,
      y: arrived ? st.y * 0.35 : st.y,
      action: !!andAction,
      face: arrived ? faceOf(bot) : undefined,
    };
  }

  function tap(bot, face) {
    bot.mode = "think";
    bot.post = 0.05;
    bot.reactLeft = null;
    return { x: 0, y: 0, action: true, face: face };
  }

  function tickGoto(bot, state, dt) {
    if (!onGoal(bot, state)) return tickMove(bot, state, dt, false);
    const steerHold = steer(bot, state, bot.path[bot.path.length - 1].c, bot.path[bot.path.length - 1].r);
    if (bot.reactLeft == null) bot.reactLeft = bot.profile.react;
    if (bot.reactLeft > 0) {
      bot.reactLeft -= dt;
      return { x: steerHold.x, y: steerHold.y, action: false, face: faceOf(bot) };
    }
    return tap(bot, faceOf(bot));
  }

  function tickChop(bot, state, dt) {
    const st = stationById(state, bot.stationId);
    if (!st || !st.item || st.item.chopped) {
      bot.mode = "think";
      bot.post = 0.06;
      return { x: 0, y: 0, action: false, face: faceOf(bot) };
    }
    if (!onGoal(bot, state)) return tickMove(bot, state, dt, false);
    if (bot.reactLeft == null) bot.reactLeft = Math.min(0.16, bot.profile.react);
    if (bot.reactLeft > 0) {
      bot.reactLeft -= dt;
      return { x: 0, y: 0, action: false, face: faceOf(bot) };
    }
    return { x: 0, y: 0, action: true, face: faceOf(bot) };
  }

  function lingerTiles(state, station, dist) {
    const S = Sim();
    const base = S.interactOptions(state, station)[0];
    if (!base) return [];
    const out = [];
    for (let r = 1; r < state.map.length - 1; r++) {
      for (let c = 1; c < state.map[0].length - 1; c++) {
        if (Math.abs(c - base.c) + Math.abs(r - base.r) !== dist) continue;
        if (!S.walkableChar(S.tileChar(state, c, r))) continue;
        out.push({ c: c, r: r });
      }
    }
    return out;
  }

  function beginLinger(bot, state, decision) {
    const spots = lingerTiles(state, decision.station, bot.profile.linger);
    if (!spots.length) {
      beginWait(bot, state, decision);
      return;
    }
    const spot = spots[Math.floor(bot.rng() * spots.length)];
    const S = Sim();
    const here = S.tileOf(state.chef.x, state.chef.y);
    const path = astar(state, here, spot, bot.profile);
    if (!path) {
      beginWait(bot, state, decision);
      return;
    }
    bot.mode = "linger";
    bot.path = path;
    bot.pathI = 0;
    bot.stationId = decision.station.id;
    bot.face = state.chef.dir;
    bot.stuckT = 0;
    bot.reactLeft = null;
  }

  function tickLinger(bot, state, dt) {
    const S = Sim();
    const st = stationById(state, bot.stationId);
    if (!st || st.phase !== "cook") {
      bot.mode = "think";
      return { x: 0, y: 0, action: false, face: bot.face };
    }
    const rec = S.RECIPES[st.recipe];
    const remain = rec ? S.timings(state, rec).cook - st.timer : 0;
    if (remain <= 0.35) {
      bot.mode = "think";
      return { x: 0, y: 0, action: false, face: bot.face };
    }
    if (!bot.path || onGoal(bot, state)) {
      return { x: 0, y: 0, action: false, face: bot.face };
    }
    return tickMove(bot, state, dt, false);
  }

  function tickWait(bot, state, dt) {
    const S = Sim();
    const st = stationById(state, bot.stationId);
    if (!st || (st.phase !== "cook" && st.phase !== "perfect")) {
      bot.mode = "think";
      return { x: 0, y: 0, action: false, face: faceOf(bot) };
    }
    if (!onGoal(bot, state)) return tickMove(bot, state, dt, false);
    const rec = S.RECIPES[st.recipe];
    if (st.phase === "perfect" && rec) {
      const perfect = S.timings(state, rec).perfect;
      if (st.timer >= perfect * bot.profile.takeAt) {
        if (bot.reactLeft == null) bot.reactLeft = bot.profile.react + bot.rng() * bot.profile.fumble;
        if (bot.reactLeft > 0) {
          bot.reactLeft -= dt;
          return { x: 0, y: 0, action: false, face: faceOf(bot) };
        }
        return tap(bot, faceOf(bot));
      }
    }
    const hold = steer(bot, state, bot.path[bot.path.length - 1].c, bot.path[bot.path.length - 1].r);
    return { x: hold.x, y: hold.y, action: false, face: faceOf(bot) };
  }

  function update(bot, state, dt) {
    if (bot.post > 0) {
      bot.post -= dt;
      note(bot, state, "post");
      return { x: 0, y: 0, action: false, face: bot.face };
    }
    if (bot.mode === "chop") {
      note(bot, state, "chop");
      return tickChop(bot, state, dt);
    }
    if (bot.mode === "linger") {
      note(bot, state, "linger");
      return tickLinger(bot, state, dt);
    }
    if (bot.mode === "wait") {
      note(bot, state, "wait");
      return tickWait(bot, state, dt);
    }
    if (bot.mode === "goto") {
      note(bot, state, "goto");
      return tickGoto(bot, state, dt);
    }
    const decision = plan(bot, state);
    const label = decision.type + (decision.station ? ":" + decision.station.kind + ":" + (decision.then || "") : "");
    note(bot, state, label);
    if (bot.mode !== "think") {
      return { x: 0, y: 0, action: false, face: bot.face };
    }
    if (decision.type === "goto" && decision.station) beginGoto(bot, state, decision);
    else if (decision.type === "chop" && decision.station) beginChop(bot, state, decision);
    else if (decision.type === "wait" && decision.station) beginWait(bot, state, decision);
    else if (decision.type === "linger" && decision.station) beginLinger(bot, state, decision);
    else return { x: 0, y: 0, action: false, face: state.chef.dir };

    if (bot.mode === "chop") return tickChop(bot, state, 0);
    if (bot.mode === "linger") return tickLinger(bot, state, 0);
    if (bot.mode === "wait") return tickWait(bot, state, 0);
    if (bot.mode === "goto") return tickGoto(bot, state, 0);
    return { x: 0, y: 0, action: false, face: state.chef.dir };
  }

  function runMatch(day, profile, seed) {
    const S = Sim();
    const state = S.create(day, seed);
    const bot = create(profile, seed);
    const dt = 1 / 60;
    let n = 0;
    while (state.phase === "play" && n < 60000) {
      const input = update(bot, state, dt);
      S.step(state, input, dt);
      n++;
    }
    const m = S.metrics(state);
    m.profile = profile;
    m.seed = seed;
    m.freakouts = bot.freakouts;
    m.steps = n;
    m.trace = bot.trace.slice(-12);
    return m;
  }

  root.BeanChefBot = {
    PROFILES: PROFILES,
    create: create,
    update: update,
    runMatch: runMatch,
  };
})(typeof window !== "undefined" ? window : globalThis);
