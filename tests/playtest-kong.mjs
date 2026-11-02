/* Headless balance report for 콩타워 and 콩비트 chart density.
   Run: node tests/playtest-kong.mjs
   콩비트 charts are measured by loading the game page when a browser is passed,
   and by a small in-process note counter duplicated from the shipped chart rules
   is not attempted here — the browser half prints density. This file always
   prints the tower profiles from the shared sim. */
import fs from "fs";
import vm from "vm";

const ctx = { console, Math };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../games/kong-tower/sim.js", import.meta.url), "utf8"), ctx);
const Sim = ctx.KongTowerSim;
const runs = Number(process.argv[2] || 24);
console.time("tower");
const table = Sim.benchmark(runs);
console.timeEnd("tower");
console.log(JSON.stringify(table, null, 2));
const drift = Sim.checkDrift();
console.log("driftCheck", drift);
