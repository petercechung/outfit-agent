// 設計師: the loop back from consumers to design. What people ask for, where the catalog falls short, what they like
// and reject — each turned into a 開款 / 選款 / 備料 / 生產 decision. Data: GET /api/insights (src/signals/insights.ts).
import { api } from "../shared/api.js";
import { $, empty, esc, loading, notice, onTabOpen } from "../shared/ui.js";

const pct = (x) => `${Math.round(x * 100)}%`;
const sectionTitle = (title, note = "") =>
  `<div class="section-title"><h2 class="display">${title}</h2><span class="rule"></span></div>${note ? `<p class="muted">${note}</p>` : ""}`;

function countBars(rows) {
  if (!rows.length) return `<p class="muted">尚無資料</p>`;
  const max = Math.max(...rows.map((r) => r.count));
  return rows.map((r) => `<div class="hbar"><span>${esc(r.label)}</span>
    <div class="bar"><i style="width:${Math.round((r.count / max) * 100)}%"></i></div><span class="muted">${r.count}</span></div>`).join("");
}

function gapRows(gaps) {
  if (!gaps.length) return `<p class="muted">尚無指定顏色或品類的需求</p>`;
  const max = Math.max(...gaps.flatMap((g) => [g.demand_share, g.supply_share]));
  const width = (x) => `${Math.round((x / max) * 100)}%`;
  return `<div class="gap-legend"><span class="tone-ink"><i></i>需求佔比</span><span class="tone-muted"><i></i>商品佔比</span></div>
    ${gaps.map((g) => `<div class="gap-row">
      <span>${esc(g.label)}</span>
      <div class="gap-bars"><div class="bar"><i style="width:${width(g.demand_share)}"></i></div>
        <div class="bar supply"><i style="width:${width(g.supply_share)}"></i></div></div>
      <span class="muted">${g.index >= 99 ? "無貨" : `${g.index.toFixed(1)}×`}</span>
    </div>`).join("")}`;
}

function sentimentRows(rows, sign) {
  if (!rows.length) return `<p class="muted">尚無資料</p>`;
  const max = Math.max(...rows.map((r) => Math.abs(r.net)));
  return rows.map((r) => `<div class="hbar"><span>${esc(r.label)}</span>
    <div class="bar ${sign < 0 ? "neg" : ""}"><i style="width:${Math.round((Math.abs(r.net) / max) * 100)}%"></i></div>
    <span class="muted">${r.net > 0 ? "+" : ""}${r.net}</span></div>`).join("");
}

const KIND_ZH = { colour: "顏色", type: "品類", style: "風格" };

/** 即時流行趨勢: what public fashion media write about this week, and the AI's reading of it for 聚陽. */
function trendsHtml(snapshot) {
  if (!snapshot?.updated_at) {
    return `<p class="muted">還沒有趨勢資料。</p><div><button class="btn btn-sm" data-action="trends-refresh">立即收集</button></div>`;
  }
  const max = Math.max(...snapshot.rising.map((t) => t.mentions), 1);
  const when = new Date(snapshot.updated_at).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `<p class="muted">每小時自動收集 ${snapshot.sources.length} 個公開時尚媒體與 Google 搜尋趨勢，最近更新 ${esc(when)}。
      近 ${snapshot.window_days} 天有 ${snapshot.relevant_headlines} 則與服裝相關的報導。
      ${snapshot.history_days < 14 ? "（收集滿兩週後會顯示熱度成長率）" : ""}</p>
    <div><button class="btn btn-sm" data-action="trends-refresh">立即更新</button></div>
    ${snapshot.opinions.length ? `<div class="label">AI 趨勢觀點（交叉比對媒體趨勢與消費者需求）</div>
      <ul class="suggestions">${snapshot.opinions.map((o) => `<li><span class="badge badge-accent">${esc(o.decision)}</span>
        <div><div>${esc(o.text)}</div><div class="muted">${esc(o.evidence)}</div></div></li>`).join("")}</ul>` : ""}
    <div class="label">本週熱度（報導則數）</div>
    ${snapshot.rising.slice(0, 10).map((t) => `<div class="hbar"><span>${esc(t.label)} <span class="muted">${KIND_ZH[t.kind]}</span></span>
      <div class="bar"><i style="width:${Math.round((t.mentions / max) * 100)}%"></i></div>
      <span class="muted">${t.mentions}${t.momentum ? ` · ${t.momentum.toFixed(1)}×` : ""}</span></div>`).join("")}
    <div class="label">最新報導</div>
    <ul class="trend-latest">${snapshot.latest.map((h) => `<li><a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.title)}</a>
      <span class="muted">${esc(h.source)}</span></li>`).join("")}</ul>
    <p class="muted">來源：${snapshot.sources.map((s) => esc(s.name)).join("、")}。只保存標題與連結，點擊回到原文。</p>`;
}

function render(data, trends) {
  const t = data.totals;
  $("#insights").innerHTML = `<div class="stack">
    <div class="section-title"><h1 class="display page-title">設計師洞察</h1></div>
    <p class="muted">消費者用一句話說出的需求與回饋，匿名彙整成「開款・選款・備料・生產」的前端訊號，並對照即時流行趨勢。</p>

    <section class="stack">${sectionTitle("即時流行趨勢")}<div id="trendsBlock">${trendsHtml(trends)}</div></section>
    <div class="chips-static">
      <span class="badge">近 ${data.window_days} 天</span>
      <span class="badge badge-good">真實需求 ${t.real_requests}</span>
      <span class="badge">示範資料 ${t.sample_requests}</span>
      <span class="badge">回饋 ${t.events}（真實 ${t.real_events}）</span>
    </div>

    <section class="stack">${sectionTitle("建議", "每一條都附上背後的數字。")}
      ${data.suggestions.length ? `<ul class="suggestions">${data.suggestions.map((s) => `<li>
          <span class="badge badge-accent">${esc(s.decision)}</span>
          <div><div>${esc(s.text)}</div><div class="muted">${esc(s.evidence)}</div></div></li>`).join("")}</ul>`
        : empty("資料還不夠，先到「說一句話」搜尋幾次。")}
    </section>

    <section class="stack">${sectionTitle("開款機會：找不到的需求", "推薦時必須放寬條件（預算、正式度、天氣）或完全找不到的需求，依條件分組。")}
      ${data.unmet.length ? `<table class="data-table"><thead><tr><th>品類</th><th>需求條件</th><th>狀況</th><th>次數</th></tr></thead><tbody>
        ${data.unmet.map((u) => `<tr><td>${esc(u.slot_zh)}</td><td>${esc(u.conditions)}${u.examples.length ? `<div class="muted">「${u.examples.map(esc).join("」「")}」</div>` : ""}</td>
          <td>${esc(u.relaxed_zh)}</td><td>${u.count}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">目前的商品都接得住。</p>`}
    </section>

    <section class="stack">${sectionTitle("備料：需求 vs 現有商品", "指定顏色／品類的需求佔比，對照商品庫中的佔比；倍數越高越該提前備料。")}
      <div class="insight-columns">
        <div class="stack"><div class="label">顏色</div>${gapRows(data.colour_gaps)}</div>
        <div class="stack"><div class="label">品類</div>${gapRows(data.type_gaps)}</div>
      </div>
    </section>

    <section class="stack">${sectionTitle("選款：消費者的反應", "喜歡、存手帳、購買、穿過為正；不喜歡、換掉為負（權重同個人化）。")}
      <div class="insight-columns">
        <div class="stack"><div class="label">最受歡迎</div>${sentimentRows(data.loved, 1)}</div>
        <div class="stack"><div class="label">最常被拒絕</div>${sentimentRows(data.disliked, -1)}</div>
      </div>
      ${data.swapped_types.length ? `<p class="muted">最常被「換一件」的品類：${data.swapped_types.map((s) => `${esc(s.label)}（${s.count}）`).join("、")}</p>` : ""}
    </section>

    <section class="stack">${sectionTitle("需求輪廓")}
      <div class="insight-columns">
        <div class="stack"><div class="label">場合</div>${countBars(data.occasions)}</div>
        <div class="stack"><div class="label">風格關鍵字</div>${countBars(data.styles)}</div>
        <div class="stack"><div class="label">預算（NT$）${data.budget_median ? ` · 中位數 ${data.budget_median.toLocaleString()}` : ""}</div>${countBars(data.budgets)}</div>
      </div>
      ${data.hot_share !== null ? `<p class="muted">${pct(data.hot_share)} 的需求發生在 27°C 以上的天氣。</p>` : ""}
    </section>

    <section class="stack">${sectionTitle("消費者原話", "已去識別化（電話、email、名字、網址等會被移除）。")}
      ${data.quotes.length ? `<ul class="quotes">${data.quotes.map((q) => `<li>「${esc(q.text)}」
          <span class="muted">${esc(q.occasion ?? "")}${q.is_sample ? " · 示範" : ""}</span></li>`).join("")}</ul>` : `<p class="muted">尚無資料</p>`}
    </section>
  </div>`;
}

async function load() {
  $("#insights").innerHTML = loading("彙整消費者訊號與流行趨勢…");
  try {
    const [data, trends] = await Promise.all([api.insights(), api.trends().catch(() => null)]);
    render(data, trends);
  } catch (error) {
    $("#insights").innerHTML = notice(`讀不到洞察資料：${error.message}`, "warn");
  }
}

export const actions = {
  "trends-refresh": async () => {
    $("#trendsBlock").innerHTML = loading("收集時尚媒體報導、請 AI 解讀中（約 30 秒）…");
    try {
      $("#trendsBlock").innerHTML = trendsHtml(await api.refreshTrends());
    } catch (error) {
      $("#trendsBlock").innerHTML = notice(error.message, "warn");
    }
  },
};

export function init() {
  onTabOpen("insights", load);
}
