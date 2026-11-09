/* Headless balance report for 콩낚시왕.
   Run: node tests/playtest-bean-angler.mjs [runs] */
import fs from "fs";
import vm from "vm";

const ctx = { console, Math };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../games/bean-angler/sim.js", import.meta.url), "utf8"), ctx);
const Sim = ctx.BeanAnglerSim;
const runs = Number(process.argv[2] || 20);

function report(label, loadout) {
  console.time(label);
  const table = Sim.benchmark(runs, loadout);
  console.timeEnd(label);
  console.log(label, JSON.stringify(table, null, 2));
  return table;
}

const stock = report("stock", { rod: 0, reel: 0, bait: 0 });
const geared = report("geared", { rod: 3, reel: 3, bait: 3 });

const problems = [];
const newbie = stock.newbie;
const average = stock.average;
const skilled = stock.skilled;
if (newbie.clearRate > 0.15) problems.push(`newbie clear too high ${newbie.clearRate}`);
if (newbie.score > 1200) problems.push(`newbie score too high ${newbie.score}`);
if (newbie.hookRate > 0.25) problems.push(`newbie hooks too reliably ${newbie.hookRate}`);
if (average.clearRate < 0.05 || average.clearRate > 0.5) problems.push(`average clear ${average.clearRate}`);
if (average.duration < 75) problems.push(`average duration short ${average.duration}`);
if (average.score < 3000 || average.score > 10000) problems.push(`average score ${average.score}`);
if (skilled.clearRate < 0.65 || skilled.clearRate > 0.98) problems.push(`skilled clear ${skilled.clearRate}`);
if (skilled.score < average.score + 1500) problems.push("skilled score too close to average");
if (skilled.duration < 80) problems.push(`skilled duration short ${skilled.duration}`);
if (skilled.hookRate < 0.85) problems.push(`skilled hook rate ${skilled.hookRate}`);
if (skilled.catches < 4) problems.push(`skilled catches ${skilled.catches}`);
if (geared.skilled.score < skilled.score + 800) problems.push("upgrades did not raise skilled score");
if (stock.hunter.legendaryRate > 0.8) problems.push(`hunter legendary too easy ${stock.hunter.legendaryRate}`);

function driveToWait(seed) {
  const state = Sim.create(seed, { rod: 0, reel: 0, bait: 0 });
  const tap = { hold: false, tap: true, release: false };
  const hold = { hold: true, tap: false, release: false };
  const release = { hold: false, tap: false, release: true };
  const idle = { hold: false, tap: false, release: false };
  Sim.tick(state, 0.016, tap);
  for (let i = 0; i < 12; i++) Sim.tick(state, 0.016, hold);
  Sim.tick(state, 0.016, release);
  for (let i = 0; i < 8; i++) Sim.tick(state, 0.016, idle);
  Sim.tick(state, 0.016, tap);
  let guard = 0;
  while (state.phase !== "wait" && state.phase !== "done" && guard < 400) {
    Sim.tick(state, 0.016, idle);
    guard += 1;
  }
  return state;
}

let first = null;
for (let seed = 1; seed < 40 && !first; seed++) {
  const state = driveToWait(seed);
  if (state.phase === "wait" && state.hazard !== "gull" && state.fish && state.fish.rarity === "common") first = state;
}
if (!first) problems.push("could not reach a common first bite");
else {
  const base = Sim.hookWindow(first.fish, 0);
  const open = Sim.biteTiming(first).window;
  if (open < base + 0.13) problems.push(`first common window ${open} not extended`);
  const idle = { hold: false, tap: false, release: false };
  while (first.phase === "wait" && first.waitT < first.biteAt + 0.05) Sim.tick(first, 0.016, idle);
  Sim.tick(first, 0.016, { hold: false, tap: true, release: false });
  if (first.phase !== "wait" || first.misses !== 0) problems.push("first early tap was punished");
  const timing = Sim.biteTiming(first);
  while (first.phase === "wait" && first.waitT < timing.open + 0.02) Sim.tick(first, 0.016, idle);
  Sim.tick(first, 0.016, { hold: false, tap: true, release: false });
  if (first.phase !== "reel") problems.push("first bite did not hook after an early tap");
}

const later = Sim.create(11, { rod: 0, reel: 0, bait: 0 });
later.catches = 1;
later.fish = Sim.FISH.find((f) => f.rarity === "legendary");
later.phase = "wait";
later.waitT = later.biteAt + 0.05;
later.gear = { rod: 0, reel: 0, bait: 0 };
const legendWindow = Sim.biteTiming(later).window;
if (Math.abs(legendWindow - 0.2) > 0.001) problems.push(`legend window changed ${legendWindow}`);
Sim.tick(later, 0.016, { hold: false, tap: true, release: false });
if (later.phase !== "recover" || later.misses !== 1) problems.push("early tap after a catch was not punished");

const samples = [1, 2, 3].map((seed) => ({
  depthShallow: Math.round(Sim.depthOf(0.4, 46, 0) * 1000) / 1000,
  depthDeep: Math.round(Sim.depthOf(0.72, 50, 0) * 1000) / 1000,
  depthCave: Math.round(Sim.depthOf(0.94, 53, 0) * 1000) / 1000,
  seed,
}));
console.log("castSamples", samples[0]);
if (problems.length) {
  console.error("BALANCE", problems.join("; "));
  process.exitCode = 1;
} else {
  console.log("BALANCE ok");
}
