/* Headless balance + physics checks for 콩핀볼.
   Run: node tests/playtest-bean-pinball.mjs [runs]
   Prints tunnel checks and bot profiles (random / reactive / good). */
import fs from "fs";
import vm from "vm";

const ctx = { console, Math };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../games/bean-pinball/sim.js", import.meta.url), "utf8"), ctx);
const Sim = ctx.BeanPinballSim;
const runs = Number(process.argv[2] || 8);

const tunnel = Sim.tunnelTest();
const flip = tunnel.find((r) => r.label === "flipper");
const gap = tunnel.find((r) => r.label === "center-gap");
const dt = tunnel.find((r) => r.label === "dt-cap");
const tilt = tunnel.find((r) => r.label === "tilt");
const walls = tunnel.filter((r) => r.label === "left-wall" || r.label === "top-wall");
const physicsOk = walls.every((r) => !r.escaped && r.tunnels === 0)
  && flip && flip.reversed && !flip.crossed && flip.tunnels === 0
  && gap && gap.drained && gap.tunnels === 0
  && dt && dt.ok
  && tilt && tilt.tilted;
console.log(JSON.stringify({ physicsOk, tunnel }, null, 2));
if (!physicsOk) process.exitCode = 1;

console.time("benchmark");
const table = {};
for (const name of ["random", "reactive", "good"]) {
  const rows = [];
  for (let i = 1; i <= runs; i++) rows.push(Sim.run(1000 + i * 41, name, 180));
  table[name] = Sim.aggregate(rows);
}
console.timeEnd("benchmark");
console.log(JSON.stringify(table, null, 2));

const good = table.good;
const random = table.random;
const balanceOk = random.avgLife < 20
  && random.tunnels === 0
  && random.stucks === 0
  && good.avgLife >= 28
  && good.avgLife <= 65
  && good.tunnels === 0
  && good.stucks === 0
  && good.mbPerBall < 0.85
  && good.mbGameRate > 20;
console.log(JSON.stringify({ balanceOk, randomLife: random.avgLife, goodLife: good.avgLife, goodMb: good.mbGameRate }, null, 2));
if (!balanceOk) process.exitCode = 1;
