/* Headless balance + input tests for 콩셰프 키친.
   Run: node tests/playtest-bean-chef.mjs
   Bots execute inside the real page (Playwright + system Chrome). */
import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ART = "/opt/cursor/artifacts";
const SEEDS = [1, 2, 3, 4, 8, 10, 15, 20];
const CHROME = "/usr/local/bin/google-chrome";

function starsFor(score, need) {
  let s = 0;
  for (const n of need) if (score >= n) s++;
  return s;
}

function startServer() {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
  };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = url === "/" ? "/index.html" : url;
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function overlap(a, b) {
  if (!a || !b || a.width < 2 || b.width < 2 || a.height < 2 || b.height < 2) return false;
  return a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2;
}

async function launch() {
  return chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
  });
}

function assertBand(row) {
  const problems = [];
  if (row.maxStep > 10) problems.push("teleport step " + row.maxStep.toFixed(2));
  if (row.profile === "good" && row.stars !== 3) problems.push("good stars " + row.stars);
  if (row.profile === "average" && row.day === 1 && row.stars !== 3) problems.push("average day1 stars " + row.stars);
  if (row.profile === "average" && row.day > 1 && (row.stars < 1 || row.stars > 2)) problems.push("average later stars " + row.stars);
  if (row.profile === "weak" && row.day === 1 && row.stars < 1) problems.push("weak day1 stars " + row.stars);
  return problems;
}

async function main() {
  fs.mkdirSync(ART, { recursive: true });
  const server = await startServer();
  const port = server.address().port;
  const base = "http://127.0.0.1:" + port;
  const browser = await launch();
  const failures = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(base + "/games/bean-chef/index.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    const table = await page.evaluate((seeds) => {
      const out = [];
      for (const profile of ["good", "average", "weak"]) {
        for (const day of [1, 2, 3, 4]) {
          for (const seed of seeds) out.push(BeanChef.runBot({ day, profile, seed }));
        }
      }
      return out;
    }, SEEDS);

    console.log("\n| profile | day | seed | stars | score | served | missed | burnt | perfects | burnRate | avgTicket | maxStep |");
    console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    const summary = {};
    for (const row of table) {
      console.log(
        `| ${row.profile} | ${row.day} | ${row.seed} | ${row.stars} | ${row.score} | ${row.served} | ${row.missed} | ${row.burnt} | ${row.perfects} | ${row.burnRate.toFixed(2)} | ${row.avgTicket.toFixed(1)} | ${row.maxStep.toFixed(2)} |`
      );
      const key = row.profile + " d" + row.day;
      if (!summary[key]) summary[key] = [];
      summary[key].push(row);
      const problems = assertBand(row);
      if (problems.length) failures.push(key + " seed " + row.seed + " " + problems.join(", ") + " score " + row.score);
    }
    console.log("\nSummary");
    for (const key of Object.keys(summary)) {
      const rows = summary[key];
      const scores = rows.map((r) => r.score);
      const served = rows.map((r) => r.served);
      const missed = rows.map((r) => r.missed);
      const burnt = rows.map((r) => r.burnt);
      const tickets = rows.map((r) => r.avgTicket);
      const burnRates = rows.map((r) => r.burnRate);
      const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      console.log(
        key,
        "score", Math.min(...scores) + "-" + Math.max(...scores),
        "avg", Math.round(avg(scores)),
        "served", Math.min(...served) + "-" + Math.max(...served),
        "miss", Math.min(...missed) + "-" + Math.max(...missed),
        "burn", Math.min(...burnt) + "-" + Math.max(...burnt),
        "burnRate", avg(burnRates).toFixed(2),
        "ticket", avg(tickets).toFixed(1) + "s",
        "stars", rows.map((r) => r.stars).join("")
      );
    }

    await page.evaluate(() => BeanChef.startDay(1, 1));
    const x0 = await page.evaluate(() => BeanChef.getState().chef.x);
    await page.keyboard.down("ArrowRight");
    await page.evaluate(() => BeanChef.pump(0.45));
    await page.keyboard.up("ArrowRight");
    const x1 = await page.evaluate(() => BeanChef.getState().chef.x);
    if (!(x1 > x0 + 30)) failures.push("arrow key did not walk " + x0 + " -> " + x1);

    await page.evaluate(() => {
      for (let i = 0; i < 50; i++) BeanChef.tick({ x: 0, y: 0, action: false }, 1 / 60);
    });
    const beforeClick = await page.evaluate(() => ({ x: BeanChef.getState().chef.x, y: BeanChef.getState().chef.y }));
    const box = await page.locator("#view").boundingBox();
    await page.mouse.click(box.x + 30, box.y + box.height - 30);
    await page.mouse.click(box.x + box.width * 0.8, box.y + 40);
    const afterClick = await page.evaluate(() => ({ x: BeanChef.getState().chef.x, y: BeanChef.getState().chef.y }));
    if (Math.hypot(afterClick.x - beforeClick.x, afterClick.y - beforeClick.y) > 1.5) {
      failures.push("click teleported chef");
    }

    const rapid = await page.evaluate(() => {
      BeanChef.startDay(1, 2);
      const S = BeanChefSim;
      const rice = BeanChef.getState().stations.find((s) => s.kind === "crate" && s.ing === "rice");
      const stand = S.interactOptions(BeanChef.getState(), rice)[0];
      const path = S.route(BeanChef.getState(), stand.c, stand.r);
      const dt = 1 / 60;
      path.forEach((tile) => {
        const goal = S.center(tile.c, tile.r);
        for (let i = 0; i < 80; i++) {
          const chef = BeanChef.getState().chef;
          const here = S.tileOf(chef.x, chef.y);
          if (here.c === tile.c && here.r === tile.r && Math.hypot(chef.vx, chef.vy) < 28) break;
          const dx = goal.x - chef.x;
          const dy = goal.y - chef.y;
          const dist = Math.hypot(dx, dy) || 1;
          BeanChef.tick({ x: dx / dist, y: dy / dist, action: false }, dt);
        }
      });
      for (let i = 0; i < 8; i++) BeanChef.tick({ x: 0, y: 0, action: false, face: stand.face }, dt);
      return { face: stand.face, tile: S.tileOf(BeanChef.getState().chef.x, BeanChef.getState().chef.y), dir: BeanChef.getState().chef.dir };
    });
    for (let i = 0; i < 25; i++) {
      await page.keyboard.down("Space");
      await page.evaluate(() => BeanChef.pump(0.04));
      await page.keyboard.up("Space");
      await page.evaluate(() => BeanChef.pump(0.05));
    }
    const afterRapid = await page.evaluate(() => {
      const st = BeanChef.getState();
      return {
        hold: st.chef.hold,
        items: st.stations.filter((s) => s.item || (s.ings && s.ings.length) || (s.plateIngs && s.plateIngs.length) || s.done).length,
      };
    });
    if (!afterRapid.hold || afterRapid.hold.kind !== "ing" || afterRapid.hold.id !== "rice") {
      failures.push("rapid tap hold " + JSON.stringify(afterRapid.hold));
    }

    const chopEdge = await page.evaluate(() => {
      BeanChef.startDay(1, 3);
      const S = BeanChefSim;
      const dt = 1 / 60;
      const st0 = BeanChef.getState();
      const egg = st0.stations.find((s) => s.kind === "crate" && s.ing === "egg");
      const board = st0.stations.find((s) => s.kind === "board");
      function go(station) {
        const opt = S.interactOptions(BeanChef.getState(), station)[0];
        const path = S.route(BeanChef.getState(), opt.c, opt.r);
        path.forEach((tile) => {
          const goal = S.center(tile.c, tile.r);
          for (let i = 0; i < 80; i++) {
            const chef = BeanChef.getState().chef;
            const here = S.tileOf(chef.x, chef.y);
            if (here.c === tile.c && here.r === tile.r && Math.hypot(chef.vx, chef.vy) < 28) break;
            const dx = goal.x - chef.x;
            const dy = goal.y - chef.y;
            const dist = Math.hypot(dx, dy) || 1;
            BeanChef.tick({ x: dx / dist, y: dy / dist, action: false }, dt);
          }
        });
        for (let i = 0; i < 8; i++) BeanChef.tick({ x: 0, y: 0, action: false, face: opt.face }, dt);
        BeanChef.tick({ x: 0, y: 0, action: true, face: opt.face }, dt);
        BeanChef.tick({ x: 0, y: 0, action: false, face: opt.face }, dt);
        return opt;
      }
      go(egg);
      BeanChef.tick({ x: 0, y: 0, action: true, face: BeanChef.getState().chef.dir }, 1 / 60);
      BeanChef.tick({ x: 0, y: 0, action: false }, 1 / 60);
      go(board);
      const face = BeanChef.getState().chef.dir;
      BeanChef.tick({ x: 0, y: 0, action: true, face }, 1 / 60);
      for (let i = 0; i < 20; i++) BeanChef.tick({ x: 0, y: 0, action: true, face }, 1 / 60);
      const mid = BeanChef.getState().stations.find((s) => s.kind === "board");
      const midChop = mid.chop;
      const rice = BeanChef.getState().stations.find((s) => s.kind === "crate" && s.ing === "rice");
      const opt = S.interactOptions(BeanChef.getState(), rice)[0];
      const path = S.route(BeanChef.getState(), opt.c, opt.r);
      path.forEach((tile) => {
        const goal = S.center(tile.c, tile.r);
        for (let i = 0; i < 80; i++) {
          const chef = BeanChef.getState().chef;
          const here = S.tileOf(chef.x, chef.y);
          if (here.c === tile.c && here.r === tile.r && Math.hypot(chef.vx, chef.vy) < 28) break;
          const dx = goal.x - chef.x;
          const dy = goal.y - chef.y;
          const dist = Math.hypot(dx, dy) || 1;
          BeanChef.tick({ x: dx / dist, y: dy / dist, action: true }, dt);
        }
      });
      for (let i = 0; i < 12; i++) BeanChef.tick({ x: 0, y: 0, action: true, face: opt.face }, dt);
      const left = BeanChef.getState().stations.find((s) => s.kind === "board");
      const whileHeld = BeanChef.getState().chef.hold;
      BeanChef.tick({ x: 0, y: 0, action: false, face: opt.face }, dt);
      BeanChef.tick({ x: 0, y: 0, action: true, face: opt.face }, dt);
      BeanChef.tick({ x: 0, y: 0, action: false, face: opt.face }, dt);
      return {
        midChop,
        chop: left.chop,
        chopped: !!(left.item && left.item.chopped),
        whileHeld,
        after: BeanChef.getState().chef.hold,
      };
    });
    if (!(chopEdge.midChop > 0.15 && chopEdge.midChop < 0.95)) failures.push("chop did not start " + JSON.stringify(chopEdge));
    if (chopEdge.chopped || chopEdge.chop >= 1) failures.push("chop completed after leaving the board " + JSON.stringify(chopEdge));
    if (chopEdge.whileHeld) failures.push("held action picked up across stations " + JSON.stringify(chopEdge.whileHeld));
    if (!chopEdge.after || chopEdge.after.id !== "rice") failures.push("fresh press should take rice " + JSON.stringify(chopEdge.after));

    const far = await page.evaluate(() => {
      BeanChef.startDay(1, 4);
      const before = JSON.stringify(BeanChef.getState().stations.map((s) => [s.phase, s.ings.length, s.item, s.done, s.plateIngs.length]));
      for (let i = 0; i < 10; i++) {
        BeanChef.tick({ x: 0, y: 0, action: true }, 1 / 60);
        BeanChef.tick({ x: 0, y: 0, action: false }, 1 / 60);
      }
      const after = JSON.stringify(BeanChef.getState().stations.map((s) => [s.phase, s.ings.length, s.item, s.done, s.plateIngs.length]));
      return { hold: BeanChef.getState().chef.hold, same: before === after };
    });
    if (far.hold || !far.same) failures.push("non-adjacent interact changed the kitchen");

    const big = await page.evaluate(() => {
      BeanChef.startDay(1, 5);
      const a = BeanChef.getState().chef.x;
      BeanChef.tick({ x: 1, y: 0, action: false }, 10);
      const b = BeanChef.getState().chef.x;
      return { dx: b - a, maxStep: BeanChef.getState().maxStep };
    });
    if (big.dx > 12 || big.maxStep > 10) failures.push("huge dt teleported " + JSON.stringify(big));

    await page.evaluate(() => BeanChef.startDay(1, 6));
    await page.evaluate(() => BeanChef.pump(0.2));
    const t1 = await page.evaluate(() => BeanChef.getState().time);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    const paused = await page.evaluate(() => BeanChef.isPaused());
    await page.evaluate(() => BeanChef.frame(0.6));
    const t2 = await page.evaluate(() => BeanChef.getState().time);
    if (!paused || t2 !== t1) failures.push("blur did not pause " + t1 + " " + t2 + " " + paused);
    await page.click("#btn-resume");
    await page.evaluate(() => BeanChef.frame(0.4));
    const t3 = await page.evaluate(() => BeanChef.getState().time);
    if (!(t3 > t2)) failures.push("resume did not advance");

    const posBeforeResize = await page.evaluate(() => ({ x: BeanChef.getState().chef.x, y: BeanChef.getState().chef.y }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.setViewportSize({ width: 1280, height: 720 });
    const posAfterResize = await page.evaluate(() => ({ x: BeanChef.getState().chef.x, y: BeanChef.getState().chef.y }));
    if (!Number.isFinite(posAfterResize.x) || posAfterResize.x !== posBeforeResize.x || posAfterResize.y !== posBeforeResize.y) {
      failures.push("resize moved chef");
    }

    await page.evaluate(() => {
      localStorage.removeItem("simsim-bean-chef-v1");
      BeanChef.runBot({ day: 1, profile: "good", seed: 1, present: true });
    });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("simsim-bean-chef-v1")));
    if (!saved || saved.unlocked < 2 || saved.bestStars[0] < 3) failures.push("save " + JSON.stringify(saved));
    await page.reload({ waitUntil: "domcontentloaded" });
    const still = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("simsim-bean-chef-v1"));
      const locked = document.querySelectorAll(".day-btn")[1].disabled;
      return { raw, locked };
    });
    if (!still.raw || still.raw.bestStars[0] < 3 || still.locked) failures.push("reload save " + JSON.stringify(still));

    await layoutPass(browser, base, { width: 390, height: 844, hasTouch: true, isMobile: true }, "portrait", failures);
    await layoutPass(browser, base, { width: 844, height: 390, hasTouch: true, isMobile: true }, "landscape", failures);

    if (failures.length) {
      console.error("\nFAILURES");
      failures.forEach((f) => console.error(" - " + f));
      process.exit(1);
    }
    await shoot(browser, base);
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length) {
    console.error("\nFAILURES");
    failures.forEach((f) => console.error(" - " + f));
    process.exit(1);
  }
  console.log("\nAll bean-chef playtests passed.");
}

async function layoutPass(browser, base, opts, label, failures) {
  const context = await browser.newContext({ ...opts, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(base + "/games/bean-chef/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => BeanChef.startDay(1, 1));
  await page.waitForTimeout(100);
  const info = await page.evaluate(() => {
    const ids = ["stick", "act", "orders", "hud", "mute", "view"];
    const rects = {};
    ids.forEach((id) => {
      const el = document.getElementById(id);
      rects[id] = el ? el.getBoundingClientRect().toJSON() : null;
    });
    const back = document.querySelector(".back").getBoundingClientRect().toJSON();
    return {
      touch: document.body.classList.contains("touch"),
      playing: document.body.classList.contains("playing"),
      rects,
      back,
      vw: innerWidth,
      vh: innerHeight,
    };
  });
  if (!info.touch) failures.push(label + " touch controls hidden");
  const stick = info.rects.stick;
  const act = info.rects.act;
  const orders = info.rects.orders;
  const hud = info.rects.hud;
  if (overlap(stick, act)) failures.push(label + " joystick overlaps action");
  if (overlap(stick, orders) || overlap(act, orders)) failures.push(label + " controls overlap orders");
  if (overlap(stick, hud) || overlap(act, hud)) failures.push(label + " controls overlap hud");
  if (overlap(stick, info.back) || overlap(act, info.back)) failures.push(label + " controls overlap back");
  for (const el of [stick, act]) {
    if (!el || el.width < 44 || el.height < 44) failures.push(label + " control too small " + JSON.stringify(el));
    if (el.left < -1 || el.top < -1 || el.right > info.vw + 1 || el.bottom > info.vh + 1) {
      failures.push(label + " control offscreen " + JSON.stringify(el));
    }
  }
  await context.close();
}

async function shoot(browser, base) {
  const desk = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await desk.goto(base + "/games/bean-chef/index.html", { waitUntil: "domcontentloaded" });
  await desk.evaluate(() => document.fonts.ready);
  await desk.screenshot({ path: path.join(ART, "bean_chef_title.png") });

  await desk.evaluate(() => {
    BeanChef.startDay(4, 7);
    const dt = 1 / 60;
    for (let i = 0; i < 32 * 60; i++) BeanChefSim.step(BeanChef.getState(), { x: 0, y: 0, action: false }, dt);
    const S = BeanChefSim;
    const st = BeanChef.getState();
    const egg = st.stations.find((s) => s.ing === "egg");
    const pan = st.stations.find((s) => s.kind === "pan");
    function go(station) {
      const opt = S.interactOptions(BeanChef.getState(), station)[0];
      const path = S.route(BeanChef.getState(), opt.c, opt.r) || [];
      path.forEach((tile) => {
        const goal = S.center(tile.c, tile.r);
        for (let i = 0; i < 90; i++) {
          const chef = BeanChef.getState().chef;
          const here = S.tileOf(chef.x, chef.y);
          if (here.c === tile.c && here.r === tile.r && Math.hypot(chef.vx, chef.vy) < 24) break;
          const dx = goal.x - chef.x;
          const dy = goal.y - chef.y;
          const dist = Math.hypot(dx, dy) || 1;
          BeanChefSim.step(BeanChef.getState(), { x: dx / dist, y: dy / dist, action: false }, dt);
        }
      });
      for (let i = 0; i < 8; i++) BeanChefSim.step(BeanChef.getState(), { x: 0, y: 0, action: false, face: opt.face }, dt);
      BeanChefSim.step(BeanChef.getState(), { x: 0, y: 0, action: true, face: opt.face }, dt);
      BeanChefSim.step(BeanChef.getState(), { x: 0, y: 0, action: false, face: opt.face }, dt);
    }
    go(egg);
    go(pan);
    go(egg);
    go(pan);
    for (let i = 0; i < 20 * 60; i++) {
      const panNow = BeanChef.getState().stations.find((s) => s.kind === "pan");
      if (panNow.phase === "burnt") break;
      BeanChefSim.step(BeanChef.getState(), { x: 0, y: 0, action: false }, dt);
    }
    BeanChef.frame(0);
  });
  await desk.screenshot({ path: path.join(ART, "bean_chef_gameplay_desktop.png") });

  await desk.evaluate(() => BeanChef.runBot({ day: 1, profile: "good", seed: 1, present: true }));
  await desk.screenshot({ path: path.join(ART, "bean_chef_results.png") });
  await desk.close();

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const mobile = await phone.newPage();
  await mobile.goto(base + "/games/bean-chef/index.html", { waitUntil: "domcontentloaded" });
  await mobile.evaluate(() => {
    BeanChef.startDay(2, 4);
    const bot = BeanChefBot.create("good", 4);
    const dt = 1 / 60;
    for (let i = 0; i < 8 * 60; i++) {
      BeanChefSim.step(BeanChef.getState(), BeanChefBot.update(bot, BeanChef.getState(), dt), dt);
    }
    BeanChef.frame(0);
    document.getElementById("banner").className = "";
  });
  await mobile.screenshot({ path: path.join(ART, "bean_chef_mobile_portrait.png") });
  await phone.close();

  const hub = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await hub.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
  await hub.evaluate(() => document.fonts.ready);
  await hub.locator("a.card").first().screenshot({ path: path.join(ART, "bean_chef_hub_card.png") });
  await hub.close();

  const vp = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await vp.goto(base + "/games/bean-chef/index.html", { waitUntil: "domcontentloaded" });
  await vp.evaluate(() => document.fonts.ready);
  await vp.evaluate(() => {
    BeanChef.startDay(3, 2);
    BeanChef.drive(true);
    window.__bot = BeanChefBot.create("good", 2);
    document.getElementById("banner").className = "";
  });
  const dir = "/tmp/chef-frames";
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const fps = 20;
  const total = 36 * fps;
  for (let i = 0; i < total; i++) {
    await vp.evaluate(() => {
      const step = 1 / 20;
      if (BeanChef.getState().phase !== "play") return;
      const input = BeanChefBot.update(window.__bot, BeanChef.getState(), step);
      BeanChef.tick(input, step);
    });
    await vp.screenshot({
      path: path.join(dir, String(i).padStart(4, "0") + ".jpg"),
      type: "jpeg",
      quality: 62,
    });
  }
  const out = path.join(ART, "bean_chef_gameplay.mp4");
  await run("ffmpeg", [
    "-y", "-framerate", String(fps), "-i", path.join(dir, "%04d.jpg"),
    "-vf", "scale=1280:720",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "28", "-an",
    "-movflags", "+faststart", out,
  ]);
  let size = fs.statSync(out).size;
  if (size > 9 * 1024 * 1024) {
    await run("ffmpeg", [
      "-y", "-framerate", String(fps), "-i", path.join(dir, "%04d.jpg"),
      "-vf", "scale=1280:720",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "33", "-an",
      "-movflags", "+faststart", out,
    ]);
    size = fs.statSync(out).size;
  }
  console.log("video bytes", size, "frames", total);
  await vp.close();
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(cmd + " " + code))));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
