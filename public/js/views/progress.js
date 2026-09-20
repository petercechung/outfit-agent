// 我的 → 進步驗證: evidence that the system gets better for this person (可變強), in two ways.
//   1. Your curve: share of result rounds whose looks you liked or saved, round by round.
//   2. Simulated shoppers: the same shopper, same sentences, with and without the style memory the stylist keeps
//      (src/person.ts). Each round the shopper reacts to what it was shown; with memory on, those reactions go
//      back and the stylist rewrites what it remembers. Every round is a real recommendation from this site.
import { api } from "../shared/api.js";
import { lineChart } from "../shared/chart.js";
import { PERSONAS, SENTENCES } from "../shared/simulate.js";
import { rounds } from "../shared/store.js";
import { $, esc, loading, notice } from "../shared/ui.js";

const LIVE = { shoppers: 2, rounds: 3 }; // each round is a real recommendation (~15 s), so keep it small
const pct = (x) => `${Math.round(x * 100)}%`;

let live = null; // { withMemory: [[rate]], without: [[rate]], memories: [text], done }

function yourCurve() {
  const recent = rounds.slice(-10);
  if (recent.length < 2) return `<p class="muted">再搜尋並回饋幾次（按喜歡、存手帳），這裡會畫出你的命中率變化。</p>`;
  const rates = recent.map((r) => r.hits.length / r.looks.length);
  const matches = recent.map((r) => (typeof r.match === "number" ? r.match : null));
  const firstHalf = rates.slice(0, Math.ceil(rates.length / 2));
  const secondHalf = rates.slice(Math.ceil(rates.length / 2));
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return `${lineChart([
    { label: "你喜歡或存下的 Look 比例", values: rates, tone: "ink" },
    ...(matches.some((m) => m !== null) ? [{ label: "是你最常喜歡的顏色／款式的比例", values: matches.map((m) => m ?? 0), tone: "accent" }] : []),
  ])}
    <p class="muted">前半 ${pct(mean(firstHalf))} → 後半 ${pct(mean(secondHalf))}（最近 ${recent.length} 輪搜尋）</p>`;
}

/** Mean of each round across shoppers; [] while nothing has finished. */
const byRound = (curves) => {
  const n = Math.min(...curves.map((c) => c.length), LIVE.rounds);
  return Array.from({ length: Math.max(0, n) }, (_, r) => curves.reduce((s, c) => s + c[r], 0) / curves.length);
};

function liveHtml() {
  if (!live) return "";
  const names = PERSONAS.slice(0, LIVE.shoppers).map((p) => p.name).join("、");
  const withMemory = live.withMemory.length ? byRound(live.withMemory) : [];
  const without = live.without.length ? byRound(live.without) : [];
  const gain = withMemory.length && without.length ? withMemory.at(-1) - without.at(-1) : null;
  return `${withMemory.length ? lineChart([
    { label: "沒有記憶", values: without, tone: "muted" },
    { label: "造型師記得你", values: withMemory, tone: "accent" },
  ]) : ""}
  ${gain !== null ? `<div class="notice notice-ok">最後一輪：沒有記憶 ${pct(without.at(-1))} → 有記憶 ${pct(withMemory.at(-1))}
    （${gain >= 0 ? "+" : ""}${Math.round(gain * 100)} 個百分點）。</div>` : ""}
  ${live.memories.map((m) => `<p class="muted">造型師記下的：${esc(m)}</p>`).join("")}
  <p class="muted">${live.done ? "完成" : "模擬中…"}：${LIVE.shoppers} 位顧客（${names}）× ${LIVE.rounds} 輪，
    每輪都是真的推薦，顧客會對符合口味的按喜歡、對要避開的顏色按不喜歡。</p>`;
}

export function progressSection() {
  return `<div class="stack">
    <div class="label">1 · 你的命中率</div>
    ${yourCurve()}
    <div class="label">2 · 模擬顧客</div>
    <p class="muted">模擬顧客有隱藏的喜好，重複「推薦 → 回饋」。同一位顧客、同樣的句子，造型師記不記得他，命中率差多少？</p>
    <div><button class="btn btn-sm" data-action="progress-simulate" ${live && !live.done ? "disabled" : ""}>現場模擬（約 2 分鐘）</button></div>
    <div id="liveResult">${liveHtml()}</div>
  </div>`;
}

/** Kept so 我的 can call it; there is no offline study in v2. */
export function loadStudy() {}

/** What this shopper thinks of the items in one answer, and what it would press. */
function react(persona, result) {
  const items = result.outfits.flatMap((o) => o.items).filter((i) => !i.owned);
  const likes = (i) => persona.likes.colour.includes(i.colour_master) || persona.likes.type.includes(i.type);
  const avoids = (i) => persona.avoids.includes(i.colour_master);
  const reactions = [
    ...items.filter(likes).slice(0, 4).map((i) => `喜歡：${i.colour_master} ${i.type}「${i.name}」`),
    ...items.filter(avoids).slice(0, 4).map((i) => `不喜歡：${i.colour_master} ${i.type}「${i.name}」`),
  ];
  return { rate: items.length ? items.filter(likes).length / items.length : 0, reactions };
}

/** One shopper's rounds. With `remember` off, nothing is carried between rounds. */
async function shop(persona, remember, onRound) {
  const rates = [];
  let memory = "";
  let reactions = [];
  for (let r = 0; r < LIVE.rounds; r++) {
    const result = await api.recommend({ text: SENTENCES[r % SENTENCES.length], memory, reactions });
    const seen = react(persona, result);
    rates.push(seen.rate);
    if (remember) {
      reactions = seen.reactions;
      memory = result.memory_update ?? memory;
    }
    onRound();
  }
  return { rates, memory };
}

async function simulateLive() {
  live = { withMemory: [], without: [], memories: [], done: false };
  const redraw = () => {
    const el = $("#liveResult");
    if (el) el.innerHTML = liveHtml();
  };
  $("#liveResult").innerHTML = loading("模擬顧客正在逛…");
  for (const persona of PERSONAS.slice(0, LIVE.shoppers)) {
    const [remembered, plain] = await Promise.all([shop(persona, true, redraw), shop(persona, false, redraw)]);
    live.withMemory.push(remembered.rates);
    live.without.push(plain.rates);
    if (remembered.memory) live.memories.push(`${persona.name} → 「${remembered.memory}」`);
    redraw();
  }
  live.done = true;
  redraw();
}

export const actions = {
  "progress-simulate": () => simulateLive().catch((error) => ($("#liveResult").innerHTML = notice(error.message, "warn"))),
};
