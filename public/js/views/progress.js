// 我的 → 進步驗證: evidence that the system gets better for this person (可變強), in three ways.
//   1. Your curve: share of result rounds whose looks you liked or saved, round by round.
//   2. Leave-one-out: each item you liked is hidden, and we check whether your other feedback ranks it higher.
//   3. Simulation: shoppers with a hidden taste, with and without the feedback loop (live, and at scale).
import { api } from "../shared/api.js";
import { lineChart } from "../shared/chart.js";
import { PERSONAS, simulateShopper, summarize } from "../shared/simulate.js";
import { feedbackLog, rounds } from "../shared/store.js";
import { $, esc, loading, notice } from "../shared/ui.js";

const LIVE = { shoppers: 3, rounds: 5 };
const pct = (x) => `${Math.round(x * 100)}%`;

let verifyResult = null; // VerifyResponse
let study = null; // /eval/loop.json from scripts/eval-loop.mjs
let live = null; // { none: [curves], thompson: [curves], done }

function yourCurve() {
  const recent = rounds.slice(-10);
  if (recent.length < 2) return `<p class="muted">再搜尋並回饋幾次（按喜歡、存手帳），這裡會畫出你的命中率變化。</p>`;
  const rates = recent.map((r) => r.hits.length / r.looks.length);
  const firstHalf = rates.slice(0, Math.ceil(rates.length / 2));
  const secondHalf = rates.slice(Math.ceil(rates.length / 2));
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return `${lineChart([{ label: "你喜歡或存下的 Look 比例", values: rates, tone: "ink" }])}
    <p class="muted">前半 ${pct(mean(firstHalf))} → 後半 ${pct(mean(secondHalf))}（最近 ${recent.length} 輪搜尋）</p>`;
}

function verifyHtml() {
  if (!verifyResult) return "";
  const v = verifyResult;
  if (!v.enough) return notice(`再按喜歡或存下 ${v.needed} 件單品，就能驗證。`);
  return `<div class="notice notice-ok">把你喜歡的 ${v.held_out} 件單品逐一藏起來，只用你其他的回饋來排序：
    平均排名從前 ${pct(1 - v.baseline_pct)}（只看熱銷）提升到前 ${pct(1 - v.personalized_pct)}，
    ${pct(v.improved_share)} 的單品排名上升。</div>`;
}

/** The paired result: same shopper, same requests, with vs without the loop. */
function liftHtml(lift) {
  if (!lift?.thompson) return "";
  const pts = (x) => (x * 100).toFixed(1);
  const row = (label, l) => `<li>${label}：平均 <b>+${pts(l.mean)}</b> 個百分點（95% CI ${pts(l.mean - l.ci)} ~ ${pts(l.mean + l.ci)}）</li>`;
  return `<div class="notice notice-ok">和同一位顧客「沒有回饋」相比，最後 ${lift.late_rounds} 輪的命中率：
    <ul>${row("有回饋", lift.greedy)}${row("有回饋＋探索", lift.thompson)}</ul></div>`;
}

function studyHtml() {
  if (!study) return "";
  const s = study.policies;
  const last = (p) => s[p].mean.at(-1);
  return `${lineChart([
    { label: "沒有回饋", values: s.none.mean, band: s.none.ci, tone: "muted" },
    { label: "有回饋", values: s.greedy.mean, band: s.greedy.ci, tone: "ink" },
    { label: "有回饋＋探索", values: s.thompson.mean, band: s.thompson.ci, tone: "accent" },
  ])}
  ${liftHtml(study.lift)}
  <p class="muted">${study.shoppers} 位模擬顧客 × ${study.rounds} 輪（陰影 = 95% 信賴區間）。第 ${study.rounds} 輪命中率：
    沒有回饋 ${pct(last("none"))}、有回饋 ${pct(last("greedy"))}、有回饋＋探索 ${pct(last("thompson"))}。
    產生於 ${esc(study.generated_at)}，可用 <code>npm run eval:loop</code> 重跑。</p>`;
}

function liveHtml() {
  if (!live) return "";
  const none = summarize(live.none);
  const learning = summarize(live.thompson);
  return `${lineChart([
    { label: "沒有回饋", values: none.map((r) => r.mean), tone: "muted" },
    { label: "有回饋＋探索", values: learning.map((r) => r.mean), tone: "accent" },
  ])}
  <p class="muted">${live.done ? "完成" : "模擬中…"}：${live.thompson.length} 位顧客（${PERSONAS.slice(0, LIVE.shoppers).map((p) => p.name).join("、")}），
    每人 ${LIVE.rounds} 輪，每輪按喜歡符合口味的、按不喜歡要避開的顏色。</p>`;
}

export function progressSection() {
  return `<div class="stack">
    <div class="label">1 · 你的命中率</div>
    ${yourCurve()}
    <div class="label">2 · 用你的紀錄驗證</div>
    <p class="muted">把你喜歡過的單品藏起來，看系統只靠其他回饋能不能把它排到前面（leave-one-out）。</p>
    <div><button class="btn btn-sm" data-action="progress-verify">開始驗證</button></div>
    <div id="verifyResult">${verifyHtml()}</div>
    <div class="label">3 · 模擬顧客</div>
    <p class="muted">每位模擬顧客有隱藏的喜好，重複「推薦 → 回饋」。有沒有回饋迴圈，命中率差多少？</p>
    <div id="studyResult">${studyHtml()}</div>
    <div><button class="btn btn-sm" data-action="progress-simulate" ${live && !live.done ? "disabled" : ""}>現場模擬（約 20 秒）</button></div>
    <div id="liveResult">${liveHtml()}</div>
  </div>`;
}

/** Loads the offline study once; safe to call on every render. */
export async function loadStudy() {
  if (study) return;
  try {
    const response = await fetch("/eval/loop.json");
    if (response.ok) study = await response.json();
    const el = $("#studyResult");
    if (el) el.innerHTML = studyHtml();
  } catch {
    // the offline study is optional
  }
}

async function simulateLive() {
  live = { none: [], thompson: [], done: false };
  const redraw = () => {
    const el = $("#liveResult");
    if (el) el.innerHTML = liveHtml();
  };
  $("#liveResult").innerHTML = loading("模擬顧客正在逛…");
  const recommend = (body) => api.recommend(body);
  for (const [k, persona] of PERSONAS.slice(0, LIVE.shoppers).entries()) {
    const [none, thompson] = await Promise.all([
      simulateShopper(recommend, persona, { rounds: LIVE.rounds, policy: "none", seed: k + 1 }),
      simulateShopper(recommend, persona, { rounds: LIVE.rounds, policy: "thompson", seed: k + 1 }),
    ]);
    live.none.push(none);
    live.thompson.push(thompson);
    redraw();
  }
  live.done = true;
  redraw();
}

export const actions = {
  "progress-verify": async () => {
    $("#verifyResult").innerHTML = loading("驗證中…");
    try {
      verifyResult = await api.verify(feedbackLog);
      $("#verifyResult").innerHTML = verifyHtml();
    } catch (error) {
      $("#verifyResult").innerHTML = notice(error.message, "warn");
    }
  },
  "progress-simulate": () => simulateLive().catch((error) => ($("#liveResult").innerHTML = notice(error.message, "warn"))),
};
