// 今天 · 說一句話: a sentence -> three explained looks (最符合需求 / 最舒服 / 最省預算), then a dialogue: feedback on the
// looks refines them. The dialogue state is the intent of the results on screen; each feedback sends it back with the
// change (words, or a structured adjustment from a button), see src/intent/refine.ts.
import { api } from "../shared/api.js";
import { openCart } from "../shared/cart.js";
import { applyCutouts } from "../shared/cutout.js";
import { L } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { lookBoard } from "../shared/lookboard.js";
import { closetOptionsHtml } from "../shared/options.js";
import { intentTiles, openItemSheet, productTile, reasonList, swatchRow } from "../shared/outfit.js";
import {
  attachClosetPhotos, closetOptionFields, loopFields, prefs, profile, profileFields, recordFeedback, recordRound, settings,
  updateStyleProfile,
} from "../shared/store.js";
import { $, colourLabel, esc, formatPrice, notice, onTabOpen, toast } from "../shared/ui.js";
import { addToJournal } from "./journal.js";

const EXAMPLES = L(
  ["這週六跟朋友去台北看演唱會，想要韓系一點，晚上會走很多路，預算 2500", "下週一面試，想要簡約但不要太死板，不要黑色",
    "明天去花蓮海邊約會，梨形身材 158cm，想穿洋裝", "喜酒要穿什麼 不想穿裙子 兩千五以內 奶茶色系", "冬天去首爾旅行，街頭風，我是男生，不要帽T"],
  ["Concert in Taipei on Saturday with friends, K-style, lots of walking, budget NT$2,500",
    "Job interview next Monday, minimal but not stiff, no black", "Beach date in Hualien tomorrow, pear shape, 158 cm, want a dress",
    "Wedding guest outfit, no skirts, under NT$2,500, beige tones", "Winter trip to Seoul, streetwear, I'm a guy, no hoodies"],
);
/** 「哪裡想調整？」 quick answers, as structured adjustments so they work the same in both languages. */
const REFINE_CHIPS = [
  [L("再便宜一點", "Cheaper"), { budget: "lower" }],
  [L("正式一點", "More formal"), { formality: 1 }],
  [L("休閒一點", "More casual"), { formality: -1 }],
  [L("換個顏色", "Other colours"), { change_colour: true }],
  [L("不要花紋", "No pattern"), { pattern_max: 0 }],
  [L("不要裙子", "No skirts"), { types_avoid: ["Skirt", "Dress"] }],
  [L("想穿褲子", "Trousers please"), { types_prefer: ["Trousers"] }],
];
/** 可選標籤 the person can tap before searching: which of the three looks to put first. */
const PRIORITIES = [["brief", L("最符合需求", "Best match")], ["comfort", L("舒服", "Comfy")], ["budget", L("最省錢", "Lowest cost")]];

let result = null; // last /api/recommend response (its intent is the dialogue state)
let rating = null; // { look, action } while 「喜歡/不喜歡這套的哪裡？」 is open
let refining = false;
let unchangedByFeedback = false; // the refined looks are the same as before (the feedback was already satisfied)
let priority = null; // theme to put first, from the tapped tag
let chosenLook = null; // index of the look the person picked with 「用這套」

let thinking = null; // while waiting: {stage, understood, looks: [{title, idea, pieces: [{label, why}]}]}

const STAGES = {
  plan: L("造型師正在讀你的話、構思整套…", "The stylist is reading your words and planning looks…"),
  search: L("在上萬件商品照片裡找每一件…", "Finding each garment among thousands of product photos…"),
  judge: L("評審正在看照片，挑出最好的三套…", "The critic is looking at the photos and picking the best three…"),
  revise: L("評審要換掉一件，重新找…", "The critic asked to replace one piece…"),
};

/** The stylist's plan as it streams in, then which step is running. */
function thinkingView() {
  if (!thinking) return "";
  const looks = thinking.looks.map((look) => `<li class="thinking-look">
      <strong>${esc(look.title)}</strong>${look.idea ? ` <span class="muted">${esc(look.idea)}</span>` : ""}
      ${look.pieces.length ? `<ul>${look.pieces.map((p) => `<li>${esc(p.label)}${p.why ? `<span class="muted"> · ${esc(p.why)}</span>` : ""}</li>`).join("")}</ul>` : ""}
    </li>`).join("");
  return `<div class="thinking" aria-live="polite">
    ${thinking.understood ? `<p><span class="label">${L("我理解的是", "What I understood")}</span> ${esc(thinking.understood)}</p>` : ""}
    ${looks ? `<ol class="thinking-looks">${looks}</ol>` : ""}
    <p class="thinking-stage">${esc(STAGES[thinking.stage])}</p>
  </div>`;
}

function onProgress(event) {
  if (event.type === "stage") thinking.stage = event.stage;
  else {
    const { key, value } = event.thought;
    const look = thinking.looks.at(-1);
    if (key === "understood") thinking.understood = value;
    else if (key === "title") thinking.looks.push({ title: value, idea: "", pieces: [] });
    else if (key === "idea" && look) look.idea = value;
    else if (key === "label" && look) look.pieces.push({ label: value, why: "" });
    else if (key === "why" && look?.pieces.length) look.pieces.at(-1).why = value;
  }
  const box = $("#thinking");
  if (box) box.innerHTML = thinkingView();
}

const startThinking = () => { thinking = { stage: "plan", understood: "", looks: [] }; };

const requestFields = () => ({ prefs, profile, ...profileFields(), ...closetOptionFields(), ...loopFields(), ...(priority ? { priority } : {}) });

export async function runSearch(text = $("#q").value.trim()) {
  if (!text) return;
  $("#q").value = text;
  rating = null;
  chosenLook = null;
  unchangedByFeedback = false;
  startThinking();
  $("#results").innerHTML = `<div id="thinking">${thinkingView()}</div>`;
  try {
    result = attachClosetPhotos(await api.recommendStream({ text, ...requestFields() }, onProgress));
    thinking = null;
    recordRound(result);
    render();
  } catch (error) {
    thinking = null;
    $("#results").innerHTML = notice(`${L("找不到穿搭：", "No outfits: ")}${error.message}`, "warn");
  }
}

/** One dialogue turn: feedback on the looks on screen, in words (`text`) and/or as a structured `adjust`. */
async function refine({ text = "", adjust, regenerate = false }) {
  if (!result || refining) return;
  refining = true;
  startThinking();
  render();
  try {
    const shownItems = result.outfits.flatMap((o) => o.items.filter((i) => !i.owned));
    const shown = { totals: result.outfits.map((o) => o.total_price), colours: shownItems.map((i) => i.colour_master) };
    const next = await api.recommendStream({
      refine: { previous_intent: result.intent, text, adjust, shown }, ...requestFields(),
      ...(regenerate ? { exclude_ids: shownItems.map((i) => i.article_id) } : {}),
    }, onProgress);
    if (next.profile_delta) {
      updateStyleProfile(next.profile_delta);
      toast(L("已記進你的個人風格檔案", "Saved to your style profile"));
    }
    const signature = (r) => r.outfits.map((o) => o.items.map((i) => i.article_id).join()).sort().join("|");
    unchangedByFeedback = !regenerate && signature(next) === signature(result);
    result = attachClosetPhotos(next);
    recordRound(result);
    rating = null;
    chosenLook = null;
  } catch (error) {
    toast(error.message);
  } finally {
    refining = false;
    thinking = null;
    render();
    $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/** 「喜歡/不喜歡這套的哪裡？」: the look's colours and types, plus price and formality for dislikes. */
function ratingPrompt(look, k) {
  if (rating?.look !== k) return "";
  const like = rating.action === "like";
  const items = look.items.filter((i) => !i.owned);
  const colours = [...new Set(items.map((i) => i.colour_master))];
  const types = [...new Set(items.map((i) => i.type))];
  const chip = (kind, value, label) =>
    `<button class="chip" data-action="rate-detail" data-look="${k}" data-kind="${kind}" data-value="${esc(value)}">${esc(label)}</button>`;
  return `<div class="rate-prompt">
    <div class="label">${like ? L("喜歡這套的哪裡？", "What do you like about it?") : L("不喜歡這套的哪裡？", "What don't you like?")}
      ${L("選一個，馬上重新推薦", "Pick one and we'll recommend again")}</div>
    <div class="chips">
      ${colours.map((c) => chip("colour", c, colourLabel(c))).join("")}
      ${types.map((t) => chip("type", t, t)).join("")}
      ${like ? "" : `${chip("price", "", L("太貴", "Too pricey"))}${chip("formality", "-1", L("太正式", "Too formal"))}${chip("formality", "1", L("太休閒", "Too casual"))}`}
      <button class="chip chip-quiet" data-action="rate-close">${L("略過", "Skip")}</button>
    </div>
  </div>`;
}

const stars = (fit) => {
  const n = Math.max(1, Math.min(5, Math.round((fit ?? 0) * 5)));
  return `<span class="stars" aria-label="${n}/5">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
};

/** 用了哪些自己的衣服 / 哪些單品需要購買 / 預估價格 / 場合適合度 */
function lookSummary(look) {
  const owned = look.items.filter((i) => i.owned);
  const toBuy = look.items.filter((i) => !i.owned);
  const cost = toBuy.reduce((s, i) => s + i.price, 0);
  return `<dl class="look-facts">
    ${owned.length ? `<div><dt>${L("用了你的衣服", "From your closet")}</dt><dd>${owned.map((i) => esc(i.name)).join(L("、", ", "))}</dd></div>` : ""}
    <div><dt>${L("需要購買", "To buy")}</dt><dd>${toBuy.length ? toBuy.map((i) => `${esc(i.name)} <span class="muted">${formatPrice(i.price)}</span>`).join(L("、", ", ")) : L("不用買，全部是你的衣服", "Nothing: it's all yours")}</dd></div>
    <div><dt>${L("預估價格", "Estimated cost")}</dt><dd class="price">${formatPrice(cost)}${owned.length ? ` <span class="muted">${L(`（整套 ${formatPrice(look.total_price)}）`, `(whole look ${formatPrice(look.total_price)})`)}</span>` : ""}</dd></div>
    ${look.occasion_fit != null ? `<div><dt>${L("場合適合度", "Occasion fit")}</dt><dd>${stars(look.occasion_fit)}</dd></div>` : ""}
  </dl>`;
}

function lookCard(look, k) {
  const attrs = (action) => `data-action="${action}" data-look="${k}"`;
  const pressed = (action) => String(rating?.look === k && rating.action === action);
  const swatches = look.reasons.find((r) => r.swatches)?.swatches;
  const chosen = chosenLook === k;
  return `<article class="look ${chosen ? "look-chosen" : ""}">
    <div class="section-title"><h2 class="display">Look ${String(k + 1).padStart(2, "0")}</h2>
      ${look.theme ? `<span class="look-theme">｜${esc(look.theme.label)}</span>` : ""}
      ${result.applied_feedback.length ? `<span class="badge badge-good">${L("依回饋調整", "Adjusted")}</span>` : ""}<span class="rule"></span></div>
    ${look.tags?.length ? `<div class="chips-static">${look.tags.map((t) => `<span class="badge badge-tag">${esc(t.label)}</span>`).join("")}</div>` : ""}
    <div class="look-visual">
      ${lookBoard(look.items)}
      <div class="products ${look.items.length > 3 ? "products-4" : ""}">
        ${look.items.map((item, j) => productTile(item, `${attrs("look-item")} data-item="${j}"`)).join("")}
      </div>
    </div>
    ${swatches ? swatchRow(swatches) : ""}
    ${lookSummary(look)}
    <div class="total-row">
      <div class="icon-actions">
        <button class="icon-btn" ${attrs("look-like")} aria-label="${L("喜歡這套", "Like")}" aria-pressed="${pressed("like")}">${icon("heart")}</button>
        <button class="icon-btn" ${attrs("look-dislike")} aria-label="${L("不喜歡這套", "Dislike")}" aria-pressed="${pressed("dislike")}">${icon("heartOff")}</button>
      </div>
      <span class="muted">${L("點單品可以換一件", "Tap a piece to swap it")}</span>
    </div>
    ${ratingPrompt(look, k)}
    <div class="why">${reasonList(look.reasons)}</div>
    <div class="button-row">
      <button class="btn btn-primary" ${attrs("look-use")}>${icon("check")}${chosen ? L("今天穿這套 ✓", "Wearing this ✓") : L("用這套", "Wear this")}</button>
      <button class="btn" ${attrs("look-today")}>${icon("bookmark")}${L("加入今天的手帳", "Add to today's journal")}</button>
      <button class="btn" ${attrs("look-save")}>${icon("heart")}${L("收藏", "Save")}</button>
      <button class="btn" ${attrs("look-buy")}>${icon("bag")}${look.items.some((i) => i.owned) ? L("買缺的單品", "Buy what's missing") : L("買整套", "Buy the look")}</button>
    </div>
  </article>`;
}

/** 「哪裡想調整？」 after the looks: the system asks for feedback instead of waiting for it. */
function refineCard() {
  const disabled = refining ? "disabled" : "";
  return `<section class="refine stack">
    <div class="section-title"><h2 class="display">${L("哪裡想調整？", "What should change?")}</h2><span class="rule"></span></div>
    <p class="muted">${L("說一句回饋，系統會保留你原本的需求，只改你說的地方。", "Say it in one line: your original request stays, only what you mention changes.")}</p>
    <div class="chips">${REFINE_CHIPS.map(([label], k) => `<button class="chip" data-action="refine-chip" data-chip="${k}" ${disabled}>${esc(label)}</button>`).join("")}
      <button class="chip" data-action="regenerate" ${disabled}>${icon("sparkle", 14)}${L("AI 再生成一批", "Show me different looks")}</button></div>
    <form class="search-bar" id="refineForm">
      <input id="refineText" placeholder="${L("例如：太正式了，不要黑色", "e.g. too formal, and no black")}" autocomplete="off" aria-label="${L("你的回饋", "Your feedback")}" ${disabled}>
      <button class="icon-btn icon-btn-dark" aria-label="${L("送出回饋", "Send feedback")}" ${disabled}>${icon("sparkle")}</button>
    </form>
    ${refining ? `<div id="thinking">${thinkingView()}</div>` : ""}
  </section>`;
}

function render() {
  const { intent } = result;
  const notes = [...intent.assumptions,
    `${intent.parser === "openai" ? L("由 AI 解析", "Parsed by AI") : L("由關鍵字規則解析", "Parsed by keyword rules")} · ${result.personalized ? L("已套用你的偏好", "Personalised") : L("還沒有你的偏好紀錄", "No preferences yet")}`];
  $("#results").innerHTML = `
    ${result.applied_feedback.length ? `<div class="notice notice-ok feedback-applied">
        <b>${L("根據你的回饋：", "Based on your feedback: ")}</b>${result.applied_feedback.map(esc).join(L("、", ", "))}
        ${unchangedByFeedback ? `<div class="muted">${L("原本的搭配已經符合這個條件，所以沒有變動。", "The looks already met this, so nothing changed.")}</div>` : ""}</div>` : ""}
    <div class="stack">
      <div class="section-title"><h2 class="display">${L("系統聽懂的", "What we understood")}</h2><span class="rule"></span></div>
      ${intentTiles(intent)}
      <div class="assumptions">${notes.map((n) => `<span class="muted">${esc(n)}</span>`).join("")}</div>
    </div>
    ${result.outfits.length
      ? `<div class="looks">${result.outfits.map(lookCard).join("")}</div>`
      : result.ask // v2: the stylist asks instead of recommending (off-topic or too vague)
        ? notice(esc(result.ask))
        : notice(L("找不到符合所有條件的組合。試著拿掉一個條件，例如預算或顏色。", "Nothing meets every condition. Try dropping one, like the budget or a colour."), "warn")}
    ${result.outfits.length ? refineCard() : ""}`;
  applyCutouts($("#results")); // the boards are collages: each garment needs its background removed first
}

function swapItem(look, j, alternate) {
  const old = look.items[j];
  recordFeedback([old], "swap_out");
  recordFeedback([alternate], "like");
  const others = (old.alternates ?? []).filter((a) => a.article_id !== alternate.article_id);
  look.items[j] = { ...alternate, intent_pct: old.intent_pct, fit_note: null, alternates: [old, ...others] };
  look.total_price = look.items.reduce((sum, item) => sum + item.price, 0);
  render();
  toast(L("已替換，也記下你的選擇", "Swapped, and noted your choice"));
}

function rateLook(data, action) {
  recordFeedback(result.outfits[data.look].items, action);
  rating = { look: Number(data.look), action };
  render();
}

/** A detail picked after 👍/👎: colours and types become lasting preferences; everything refines right away. */
function rateDetail(data) {
  const like = rating?.action === "like";
  if (data.kind === "colour") {
    updateStyleProfile(like ? { colors_prefer: [data.value] } : { colors_avoid: [data.value] });
    refine({ adjust: like ? { colors_prefer: [data.value] } : { colors_avoid: [data.value] } });
  } else if (data.kind === "type") {
    updateStyleProfile(like ? { types_prefer: [data.value] } : { types_avoid: [data.value] });
    refine({ adjust: like ? { types_prefer: [data.value] } : { types_avoid: [data.value] } });
  } else if (data.kind === "price") {
    refine({ adjust: { budget: "lower" } });
  } else if (data.kind === "formality") {
    refine({ adjust: { formality: Number(data.value) } });
  }
}

const journalExtras = (look) => ({ theme: look.theme?.label ?? null, occasion: result.intent.occasion, reasons: look.reasons });

export const actions = {
  "run-example": (_, el) => runSearch(el.textContent),
  "set-priority": (data) => {
    priority = priority === data.priority ? null : data.priority;
    renderOptions();
    if (result) runSearch(result.intent.raw_text);
  },
  "look-item": (data) => {
    const look = result.outfits[data.look];
    const item = look.items[data.item];
    openItemSheet(item, {
      onLike: () => { recordFeedback([item], "like"); toast(L("記下了", "Noted")); },
      onDislike: () => { recordFeedback([item], "dislike"); toast(L("之後會少推這種", "We'll show fewer like this")); },
      onPickAlternate: (alternate) => swapItem(look, Number(data.item), alternate),
    });
  },
  "look-like": (data) => rateLook(data, "like"),
  "look-dislike": (data) => rateLook(data, "dislike"),
  "rate-detail": (data) => rateDetail(data),
  "rate-close": () => { rating = null; render(); },
  "refine-chip": (data) => refine({ adjust: REFINE_CHIPS[Number(data.chip)][1] }),
  regenerate: () => refine({ adjust: {}, regenerate: true }),
  /** 用這套: pick it for today — the strongest positive signal — and start today's journal page with it. */
  "look-use": (data) => {
    const look = result.outfits[data.look];
    chosenLook = Number(data.look);
    addToJournal(result.intent.raw_text, look.items, { kind: "worn", ...journalExtras(look) });
    render();
  },
  "look-today": (data) => {
    const look = result.outfits[data.look];
    addToJournal(result.intent.raw_text, look.items, { kind: "worn", ...journalExtras(look) });
  },
  "look-save": (data) => {
    const look = result.outfits[data.look];
    addToJournal(result.intent.raw_text, look.items, { kind: "saved", ...journalExtras(look) });
  },
  "look-buy": (data) => openCart(result.outfits[data.look].items),
};

function renderOptions() {
  $("#searchOptions").innerHTML = `${closetOptionsHtml()}
    <div class="chips priority-chips"><span class="label">${L("優先給我", "Put first")}</span>
      ${PRIORITIES.map(([key, label]) => `<button class="chip" data-action="set-priority" data-priority="${key}" aria-pressed="${priority === key}">${esc(label)}</button>`).join("")}</div>`;
  $("#shareNote").textContent = settings.shareSignals
    ? L("你的需求會去識別化後匿名提供給設計師參考（不含帳號與照片），可在「我的」關閉。",
      "Your request is shared anonymously with designers (no account or photos), after removing personal details. Turn off in Me.")
    : "";
}

export function init() {
  renderOptions();
  onTabOpen("search", renderOptions); // the closet may have changed on another tab
  $("#searchExtras").innerHTML = `<div class="search-extras">
    <button class="btn btn-sm" data-action="inspo-pick">${icon("camera")}${L("照片找同款", "Match a photo")}</button></div>`;
  $("#examples").innerHTML = EXAMPLES.map((t) => `<button class="chip" data-action="run-example">${esc(t)}</button>`).join("");
  $("#searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch();
  });
  $("#results").addEventListener("submit", (event) => {
    if (event.target.id !== "refineForm") return;
    event.preventDefault();
    const text = $("#refineText").value.trim();
    if (text) refine({ text });
  });
}
