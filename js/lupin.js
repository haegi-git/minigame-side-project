const PAY_KEY = "simsim-lupin-pay";
const KIND_KEY = "simsim-lupin-kind";
const RUN_KEY = "simsim-lupin-run";
const HOURS_PER_MONTH = 160;

function loadPay() {
  const pay = Number(localStorage.getItem(PAY_KEY) || 0);
  const kind = localStorage.getItem(KIND_KEY) === "year" ? "year" : "month";
  return { pay: Number.isFinite(pay) && pay > 0 ? pay : 0, kind };
}

function monthlyWon(pay, kind) {
  return kind === "year" ? pay / 12 : pay;
}

function perSecond(pay, kind) {
  return monthlyWon(pay, kind) / (HOURS_PER_MONTH * 3600);
}

function ensureRun() {
  if (!sessionStorage.getItem(RUN_KEY)) sessionStorage.setItem(RUN_KEY, String(Date.now()));
}

function elapsedSec() {
  const run = Number(sessionStorage.getItem(RUN_KEY) || 0);
  if (!run) return 0;
  return Math.max(0, (Date.now() - run) / 1000);
}

function formatWon(n) {
  if (n >= 100) return `₩${Math.floor(n).toLocaleString("ko-KR")}`;
  if (n >= 10) return `₩${n.toFixed(1)}`;
  return `₩${n.toFixed(2)}`;
}

function isStealth() {
  return /cell-break/i.test(location.pathname);
}

function isGamePage() {
  return /\/games\//i.test(location.pathname);
}

function mountCute() {
  if (document.getElementById("lupin-widget")) return document.getElementById("lupin-widget");
  const el = document.createElement("aside");
  el.id = "lupin-widget";
  el.className = "lupin-widget" + (isGamePage() ? " game" : " hub");
  el.innerHTML = `
    <p class="lupin-kicker">월급루팡 중</p>
    <p class="lupin-amt" id="lupin-amt">₩0</p>
    <p class="lupin-sub">이 창을 연 뒤로</p>
  `;
  document.body.appendChild(el);
  return el;
}

function mountStealth() {
  const bar = document.querySelector(".statusbar");
  if (!bar || document.getElementById("lupin-stealth")) return document.getElementById("lupin-stealth");
  const el = document.createElement("span");
  el.id = "lupin-stealth";
  el.innerHTML = `기타 <b>0</b>`;
  const hub = bar.querySelector(".hub-link");
  if (hub) bar.insertBefore(el, hub);
  else bar.appendChild(el);
  return el;
}

function paint(pay, kind) {
  const earned = perSecond(pay, kind) * elapsedSec();
  const cute = document.getElementById("lupin-amt");
  if (cute) cute.textContent = formatWon(earned);
  const stealth = document.getElementById("lupin-stealth");
  if (stealth) stealth.innerHTML = `기타 <b>${Math.floor(earned).toLocaleString("ko-KR")}</b>`;
}

function showTicker(on) {
  const w = document.getElementById("lupin-widget");
  if (w) w.classList.toggle("on", on);
  const s = document.getElementById("lupin-stealth");
  if (s) s.hidden = !on;
}

function bootTicker() {
  const { pay, kind } = loadPay();
  if (pay > 0) ensureRun();
  if (isStealth()) mountStealth();
  else mountCute();
  showTicker(pay > 0);
  const tick = () => {
    const cur = loadPay();
    if (cur.pay > 0) paint(cur.pay, cur.kind);
  };
  tick();
  setInterval(tick, 80);
}

function bindHub() {
  const input = document.getElementById("lupin-pay");
  const save = document.getElementById("lupin-save");
  const clear = document.getElementById("lupin-clear");
  if (!input || !save) return;
  const { pay, kind } = loadPay();
  input.value = pay ? String(Math.round(pay)) : "";
  document.querySelectorAll("[data-lupin-kind]").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.lupinKind === kind);
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-lupin-kind]").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
    });
  });
  save.addEventListener("click", () => {
    const raw = Number(String(input.value).replace(/[^\d.]/g, ""));
    const nextKind = document.querySelector("[data-lupin-kind].on")?.dataset.lupinKind === "year" ? "year" : "month";
    if (!raw || raw <= 0) return;
    localStorage.setItem(PAY_KEY, String(raw));
    localStorage.setItem(KIND_KEY, nextKind);
    ensureRun();
    showTicker(true);
    paint(raw, nextKind);
    save.textContent = "저장됨!";
    setTimeout(() => {
      save.textContent = "저장";
    }, 900);
  });
  clear?.addEventListener("click", () => {
    localStorage.removeItem(PAY_KEY);
    sessionStorage.removeItem(RUN_KEY);
    input.value = "";
    showTicker(false);
  });
}

bootTicker();
bindHub();
