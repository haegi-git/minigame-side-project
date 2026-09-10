const COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const ROWS = 16;
const PLAYER_MAX = 100;

const STAGES = [
  { name: "오류봇", file: "오류로그_정리.xlsx", hp: 84, atk: 7, hit: 28, heal: 14, interval: 10, tones: ["#9fd4b3", "#217346", "#163d28"] },
  { name: "결재골렘", file: "결재대기_명단.xlsx", hp: 105, atk: 8, hit: 30, heal: 13, interval: 9, tones: ["#9ec2e6", "#2b6cb0", "#1a365d"] },
  { name: "야근스펙터", file: "야근수당_초안.xlsx", hp: 128, atk: 9, hit: 32, heal: 13, interval: 8, tones: ["#cbb7e8", "#6b46c1", "#2d1b4e"] },
  { name: "예산드래곤", file: "예산안_검토.xlsx", hp: 150, atk: 11, hit: 34, heal: 12, interval: 7.5, tones: ["#f6d58b", "#c05621", "#7b341e"] },
  { name: "감사오크", file: "감사지적_대응.xlsx", hp: 175, atk: 12, hit: 36, heal: 12, interval: 7, tones: ["#b7d48a", "#3f6212", "#1a2e05"] },
  { name: "본부장", file: "최종보고_본부장.xlsx", hp: 200, atk: 14, hit: 40, heal: 12, interval: 6.5, tones: ["#d9d9d9", "#1f1f1f", "#9b1c1c"] },
];

const SHAPES = [
  ["000111111000", "001333333100", "011311113110", "013111111310", "011112211110", "001111111100", "000111111000", "000011110000", "000101101000", "001100001100"],
  ["000011110000", "000133331000", "001311113100", "013111111310", "011122221110", "001111111100", "000111111000", "001011110100", "011000000110", "110000000011"],
  ["000001100000", "000111111000", "001322223100", "013111111310", "001111111100", "000011110000", "000111111000", "001101101100", "011000000110", "000000000000"],
  ["000001100000", "000111111000", "001333333100", "013311113310", "011122221110", "111111111111", "011111111110", "001101101100", "011000000110", "110000000011"],
  ["001111111100", "011333333110", "111311113111", "011111111110", "001122221100", "000111111000", "001111111100", "011101101110", "110000000011", "000000000000"],
  ["000111111000", "001322223100", "013111111310", "111122221111", "011111111110", "001111111100", "000101101000", "001100001100", "011000000110", "110000000011"],
];

const els = {
  filename: document.getElementById("filename"),
  hpMe: document.getElementById("hp-me"),
  hpFoe: document.getElementById("hp-foe"),
  stageLabel: document.getElementById("stage-label"),
  atkTimer: document.getElementById("atk-timer"),
  prompt: document.getElementById("prompt"),
  input: document.getElementById("type-input"),
  send: document.getElementById("btn-send"),
  enter: document.getElementById("btn-enter"),
  clear: document.getElementById("btn-clear"),
  pause: document.getElementById("btn-pause"),
  cover: document.getElementById("cover"),
  gameStrip: document.getElementById("game-strip"),
  workStrip: document.getElementById("work-strip"),
  status: document.getElementById("status-left"),
  wpm: document.getElementById("wpm"),
  clears: document.getElementById("clears"),
  grid: document.getElementById("grid"),
  rowHeads: document.getElementById("row-heads"),
  colHeads: document.getElementById("col-heads"),
  start: document.getElementById("start"),
  stagePop: document.getElementById("stage-pop"),
  result: document.getElementById("result"),
};

let state = null;
let raf = 0;
const cellMap = [];

function interval() {
  return STAGES[state.stage].interval;
}

function dialogOpen() {
  return !els.start.classList.contains("hidden") || !els.stagePop.classList.contains("hidden") || !els.result.classList.contains("hidden");
}

function setPaused(on) {
  if (!state || !state.playing) return;
  if (state.paused === on) return;
  state.paused = on;
  if (on) {
    state.pauseAt = performance.now();
    showWorkCover(true);
    els.status.textContent = "준비됨";
    els.input.disabled = true;
  } else {
    state.lineStarted += performance.now() - state.pauseAt;
    state.last = performance.now();
    showWorkCover(false);
    els.status.textContent = "진행 중";
    els.input.disabled = false;
    els.input.focus();
  }
  syncButtons();
}

function togglePause() {
  if (!state || !state.playing || dialogOpen()) return;
  setPaused(!state.paused);
}

function showWorkCover(on) {
  els.cover.classList.toggle("hidden", !on);
  els.gameStrip.classList.toggle("hidden", on);
  els.workStrip.classList.toggle("hidden", !on);
  els.pause.textContent = on ? "계속" : "일시 중지";
}

function beep(freq, dur, type = "square", vol = 0.05) {
  const ctx = beep.ctx || (beep.ctx = new AudioContext());
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur);
}

function buildSheet() {
  els.colHeads.innerHTML = COLS.map((c) => `<span>${c}</span>`).join("");
  els.rowHeads.innerHTML = `<span></span>` + Array.from({ length: ROWS }, (_, i) => `<span>${i + 1}</span>`).join("");
  els.rowHeads.style.gridTemplateRows = `22px repeat(${ROWS}, minmax(18px, auto))`;
  els.grid.innerHTML = "";
  cellMap.length = 0;
  for (let r = 0; r < ROWS; r++) {
    cellMap[r] = [];
    for (let c = 0; c < 12; c++) {
      const d = document.createElement("div");
      d.className = "cell";
      els.grid.appendChild(d);
      cellMap[r][c] = d;
    }
  }
}

function setCell(r, c, text, extra = "") {
  const d = cellMap[r][c];
  d.className = `cell ${extra}`.trim();
  d.textContent = text || "";
  d.style.background = "";
}

function floatText(text, good) {
  const n = document.createElement("div");
  n.className = `float-num ${good ? "good" : "bad"}`;
  n.textContent = text;
  const box = els.input.getBoundingClientRect();
  n.style.left = `${box.left + 24}px`;
  n.style.top = `${box.top - 8}px`;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 800);
}

function pickQuote() {
  const list = state.novel.stages[state.stage];
  let i = state.cursor[state.stage];
  if (i >= list.length) i = 0;
  state.cursor[state.stage] = i + 1;
  return list[i];
}

function pickNovel() {
  const last = sessionStorage.getItem("cell-novel") || "";
  const pool = NOVELS.filter((n) => n.title !== last);
  const list = pool.length ? pool : NOVELS;
  const novel = list[Math.floor(Math.random() * list.length)];
  sessionStorage.setItem("cell-novel", novel.title);
  return novel;
}

function paintMonster() {
  const shape = SHAPES[state.stage];
  const tones = STAGES[state.stage].tones;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 12; c++) {
      const d = cellMap[r + 6][c];
      const v = Number(shape[r][c]);
      d.className = "cell pix";
      d.textContent = "";
      d.style.background = v === 0 ? "#fff" : tones[v - 1];
    }
  }
}

function paintStats() {
  const st = STAGES[state.stage];
  const labels = [
    ["담당", "나", "체력", `${Math.max(0, Math.ceil(state.hp))}`, "다음차감", `${state.atkLeft.toFixed(1)}초`],
    ["대상", st.name, "체력", `${Math.max(0, Math.ceil(state.foe))}`, "단계", `${state.stage + 1}/6`],
    ["업무", "문장 입력 후 전송", "성공", `${state.clears}`, "문서", state.novel ? state.novel.title : "-"],
    ["비고", state.log, "", "", "", ""],
  ];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 12; c++) {
      const val = labels[r][c] ?? "";
      const extra = r === 0 && c === 3 && state.flashMe ? "hurt" : r === 1 && c === 3 && state.flashFoe ? "warn" : c % 2 === 0 ? "head" : "";
      setCell(r, c, val, extra);
    }
  }
  setCell(4, 0, "진행", "head");
  const meFill = Math.round((state.hp / PLAYER_MAX) * 5);
  const foeFill = Math.round((state.foe / st.hp) * 5);
  for (let c = 1; c <= 5; c++) setCell(4, c, c === 1 ? "나" : "", c <= meFill ? "head" : "");
  for (let c = 6; c <= 11; c++) setCell(4, c, c === 6 ? "대상" : "", c - 6 <= foeFill ? "warn" : "");
  setCell(5, 0, "도형", "head");
  setCell(5, 1, "조건부 서식으로 대상 표시", "");
  for (let c = 2; c < 12; c++) setCell(5, c, "", "");
}

function canon(s) {
  return s.normalize("NFC").replace(/\u00A0/g, " ");
}

function renderPrompt() {
  const t = state.target;
  const v = canon(els.input.value);
  let html = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i] === "<" ? "&lt;" : t[i] === "&" ? "&amp;" : t[i];
    if (i < v.length) html += `<span class="${v[i] === t[i] ? "ok" : "bad"}">${ch}</span>`;
    else html += `<span class="rest">${ch}</span>`;
  }
  els.prompt.innerHTML = html;
}

function perfect() {
  return canon(els.input.value) === canon(state.target);
}

function syncButtons() {
  const ok = state.playing && !state.paused && perfect();
  els.send.disabled = !ok;
  els.enter.disabled = !ok;
  els.pause.disabled = !state.playing;
}

function setQuote() {
  state.target = pickQuote();
  els.input.value = "";
  els.input.disabled = !state.playing || state.paused;
  state.lineStarted = performance.now();
  renderPrompt();
  syncButtons();
}

function updateHud() {
  const st = STAGES[state.stage];
  els.hpMe.textContent = Math.max(0, Math.ceil(state.hp));
  els.hpFoe.textContent = Math.max(0, Math.ceil(state.foe));
  els.stageLabel.textContent = `${state.stage + 1}/6`;
  els.atkTimer.textContent = state.atkLeft.toFixed(1);
  els.clears.textContent = String(state.clears);
  const mins = (performance.now() - state.t0) / 60000;
  els.wpm.textContent = mins > 0.02 ? String(Math.round(state.typed / mins)) : "0";
  els.filename.textContent = st.file;
  document.title = st.file;
  document.querySelectorAll(".tab").forEach((tab, i) => {
    tab.classList.toggle("on", i === state.stage);
    tab.classList.toggle("done", i < state.stage);
  });
  paintStats();
}

function monsterHit() {
  if (!state.playing || state.paused) return;
  const dmg = STAGES[state.stage].atk;
  state.hp = Math.max(0, state.hp - dmg);
  state.atkLeft = interval();
  state.flashMe = true;
  state.log = `대상 타격 -${dmg}`;
  els.status.textContent = "차감됨";
  beep(180, 0.12, "sawtooth", 0.04);
  floatText(`-${dmg}`, false);
  updateHud();
  setTimeout(() => {
    state.flashMe = false;
    paintStats();
  }, 180);
  if (state.hp <= 0) endGame(false);
}

function sendLine() {
  if (!state.playing || state.paused || !perfect()) {
    els.input.classList.remove("hurt");
    beep(140, 0.08, "square", 0.03);
    return;
  }
  const st = STAGES[state.stage];
  const took = (performance.now() - state.lineStarted) / 1000;
  const expected = state.target.length / 4.2;
  const fast = took < expected * 0.85;
  const hit = st.hit + (fast ? 6 : 0);
  const heal = st.heal + (fast ? 3 : 0);
  state.foe = Math.max(0, state.foe - hit);
  state.hp = Math.min(PLAYER_MAX, state.hp + heal);
  state.clears += 1;
  state.typed += state.target.length;
  state.flashFoe = true;
  state.log = `전송 성공  공격 ${hit} / 회복 ${heal}${fast ? " (빠른 입력)" : ""}`;
  els.status.textContent = "입력 완료";
  beep(fast ? 720 : 520, 0.09, "square", 0.045);
  floatText(`+${heal} / -${hit}`, true);
  updateHud();
  setTimeout(() => {
    state.flashFoe = false;
    paintStats();
  }, 180);
  if (state.foe <= 0) {
    stageClear();
    return;
  }
  setQuote();
}

function stageClear() {
  state.playing = false;
  state.paused = false;
  showWorkCover(false);
  els.input.disabled = true;
  syncButtons();
  if (state.stage >= 5) {
    endGame(true);
    return;
  }
  document.getElementById("pop-kicker").textContent = `${state.novel.title} · ${state.stage + 1}장 완료`;
  document.getElementById("pop-title").textContent = STAGES[state.stage + 1].name;
  document.getElementById("pop-sub").textContent = `같은 이야기가 이어집니다. 다음 대상은 더 자주 차감합니다.`;
  els.stagePop.classList.remove("hidden");
}

function nextStage() {
  els.stagePop.classList.add("hidden");
  state.stage += 1;
  state.foe = STAGES[state.stage].hp;
  state.atkLeft = interval();
  state.playing = true;
  state.paused = false;
  state.log = `${STAGES[state.stage].name} 등장 · ${state.novel.title}`;
  paintMonster();
  setQuote();
  els.input.focus();
  updateHud();
}

function endGame(win) {
  state.playing = false;
  state.paused = false;
  showWorkCover(false);
  els.input.disabled = true;
  syncButtons();
  const elapsed = ((performance.now() - state.t0) / 1000).toFixed(1);
  document.getElementById("result-title").textContent = win ? "통합 문서 완료" : "수식 오류: 체력 0";
  document.getElementById("result-sub").textContent = win
    ? "6단계 대상을 모두 격파했습니다. 저장하지 않아도 기록은 남습니다."
    : `${STAGES[state.stage].name}에게 차감되어 작업이 중단되었습니다.`;
  document.getElementById("result-stats").innerHTML = `
    <li><span>이번 소설</span><b>${state.novel.title}</b></li>
    <li><span>도달 단계</span><b>${state.stage + 1}/6</b></li>
    <li><span>성공 문장</span><b>${state.clears}</b></li>
    <li><span>남은 체력</span><b>${Math.max(0, Math.ceil(state.hp))}</b></li>
    <li><span>소요 시간</span><b>${elapsed}초</b></li>
  `;
  els.result.classList.remove("hidden");
  beep(win ? 880 : 110, win ? 0.2 : 0.25, win ? "square" : "sawtooth", 0.05);
}

function tick(now) {
  if (!state) return;
  const dt = Math.min(0.05, (now - state.last) / 1000);
  state.last = now;
  if (state.playing && !state.paused) {
    state.atkLeft -= dt;
    if (state.atkLeft <= 0) monsterHit();
    if (state.playing && !state.paused) {
      els.atkTimer.textContent = Math.max(0, state.atkLeft).toFixed(1);
      const timerCell = cellMap[0][5];
      if (timerCell) timerCell.textContent = `${Math.max(0, state.atkLeft).toFixed(1)}초`;
    }
  }
  raf = requestAnimationFrame(tick);
}

function startGame() {
  els.start.classList.add("hidden");
  els.result.classList.add("hidden");
  els.stagePop.classList.add("hidden");
  state = {
    stage: 0,
    hp: PLAYER_MAX,
    foe: STAGES[0].hp,
    atkLeft: STAGES[0].interval,
    playing: true,
    paused: false,
    target: "",
    novel: pickNovel(),
    cursor: [0, 0, 0, 0, 0, 0],
    clears: 0,
    typed: 0,
    t0: performance.now(),
    last: performance.now(),
    lineStarted: performance.now(),
    log: "매크로 실행됨",
    flashMe: false,
    flashFoe: false,
  };
  paintMonster();
  setQuote();
  showWorkCover(false);
  updateHud();
  els.input.focus();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

els.input.addEventListener("input", () => {
  renderPrompt();
  syncButtons();
});

els.input.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  sendLine();
});

els.send.addEventListener("click", sendLine);
els.enter.addEventListener("click", sendLine);
els.clear.addEventListener("click", () => {
  els.input.value = "";
  renderPrompt();
  syncButtons();
  els.input.focus();
});
els.pause.addEventListener("click", togglePause);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  e.preventDefault();
  togglePause();
});
document.getElementById("btn-start").addEventListener("click", startGame);
document.getElementById("btn-retry").addEventListener("click", startGame);
document.getElementById("btn-next").addEventListener("click", nextStage);

buildSheet();
paintStatsDummy();

function paintStatsDummy() {
  state = {
    stage: 0,
    hp: PLAYER_MAX,
    foe: STAGES[0].hp,
    atkLeft: STAGES[0].interval,
    playing: false,
    paused: false,
    target: "",
    novel: NOVELS[0],
    cursor: [0, 0, 0, 0, 0, 0],
    clears: 0,
    typed: 0,
    t0: performance.now(),
    last: performance.now(),
    log: "실행 대기",
    flashMe: false,
    flashFoe: false,
  };
  paintMonster();
  updateHud();
  els.prompt.textContent = "매크로 실행 후 문장이 이 수식 표시줄에 나타납니다.";
}
