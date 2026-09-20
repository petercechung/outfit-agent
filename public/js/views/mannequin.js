// C · 人台搭配: put your own clothes on a mannequin; AI fills the empty slots with purchasable items.
import { api } from "../shared/api.js";
import { openCart } from "../shared/cart.js";
import { applyCutouts } from "../shared/cutout.js";
import { icon } from "../shared/icons.js";
import { FIGURE } from "../shared/lookboard.js";
import { closetOptionsHtml } from "../shared/options.js";
import { openItemSheet, productTile, reasonList } from "../shared/outfit.js";
import { closeSheet, openSheet } from "../shared/sheet.js";
import {
  attachClosetPhotos, closet, closetItemPayload, closetOptionFields, loopFields, memoryFields, prefs, profile,
  profileFields, recordFeedback, recordRound, unrecordFeedback,
} from "../shared/store.js";
import { $, esc, formatPrice, SLOT_NAME, toast } from "../shared/ui.js";
import { openComposer } from "./composer.js";
import { addToJournal } from "./journal.js";

/** Where each slot sits on the mannequin, in % of the stage. Adjust here to rearrange the figure. */
const SLOT_LAYOUT = {
  outer: { left: 2, top: 18, width: 30, height: 32 },
  top: { left: 28, top: 16, width: 44, height: 32 },
  onepiece: { left: 25, top: 16, width: 50, height: 62 },
  bottom: { left: 30, top: 46, width: 40, height: 40 },
  bag: { left: 70, top: 40, width: 28, height: 22 },
  shoes: { left: 33, top: 85, width: 34, height: 13 },
};
/** Paint order: later slots are drawn on top. */
const PAINT_ORDER = ["bottom", "top", "onepiece", "outer", "bag", "shoes"];
const DEFAULT_TEXT = "日常穿搭";

const placed = {}; // slot -> closet item id
let text = "";
let result = null; // /api/recommend response for the current placement
let lookIndex = 0;
let busy = false;
let onAddGarment = () => {};

const closetItem = (id) => closet.find((c) => c.id === id);
const currentLook = () => result?.outfits[lookIndex] ?? null;

/** Puts one of the person's garments on the mannequin (one per slot; a dress replaces top and bottom). */
export function place(item) {
  if (item.slot === "onepiece") {
    delete placed.top;
    delete placed.bottom;
  }
  if (item.slot === "top" || item.slot === "bottom") delete placed.onepiece;
  placed[item.slot] = item.id;
  result = null;
}

function slotContent(slot) {
  const placedItem = placed[slot] && closetItem(placed[slot]);
  if (placedItem) return { image: placedItem.image, tag: "我的", owned: true };
  // From the AI look: a catalog item, or (with "優先用我的衣櫃") another garment from the closet.
  const item = currentLook()?.items.find((i) => i.slot === slot);
  if (!item) return null;
  return item.owned ? { image: item.image, tag: "我的", owned: true } : { image: item.image, tag: formatPrice(item.price) };
}

function visibleSlots() {
  const look = currentLook()?.items ?? [];
  const hasDress = Boolean(placed.onepiece) || look.some((i) => i.slot === "onepiece");
  return PAINT_ORDER.filter((slot) => {
    if (slot === "onepiece") return hasDress;
    if (slot === "top" || slot === "bottom") return !hasDress;
    return true;
  });
}

function slotButton(slot) {
  const { left, top, width, height } = SLOT_LAYOUT[slot];
  const content = slotContent(slot);
  return `<button class="slot ${content ? "filled" : ""}" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%"
      data-action="mannequin-slot" data-slot="${slot}" aria-label="${SLOT_NAME[slot]}">
    ${content
      ? `<img data-cutout src="${esc(content.image)}" alt=""><span class="slot-tag ${content.owned ? "owned" : ""}">${esc(content.tag)}</span>`
      : `${icon("plus", 14)}${SLOT_NAME[slot]}`}</button>`;
}

function resultPanel(look) {
  const toBuy = look.items.filter((i) => !i.owned);
  return `<div class="stack">
    <div class="segmented">${result.outfits.map((_, k) =>
      `<button data-action="mannequin-look" data-look="${k}" aria-pressed="${k === lookIndex}">Look ${k + 1}</button>`).join("")}</div>
    ${toBuy.length
      ? `<div><div class="label">需要購買</div><ul class="buy-list">${toBuy.map((item) => `<li>
          <img src="${esc(item.image)}" alt=""><button class="btn-text" data-action="mannequin-item" data-article="${esc(item.article_id)}">${esc(item.name)}</button>
          <span class="price">${formatPrice(item.price)}</span></li>`).join("")}</ul></div>`
      : `<div class="notice notice-ok">全部都是你衣櫃裡的衣服，不用再買</div>`}
    <div class="total-row"><div class="amount"><span class="label">Total</span><span class="price price-lg">${formatPrice(look.total_price)}</span></div></div>
    <div class="button-row">
      <button class="btn" data-action="mannequin-save">${icon("bookmark")}存進手帳</button>
      <button class="btn" data-action="mannequin-post">${icon("upload")}發佈</button>
      <button class="btn btn-primary" data-action="mannequin-buy" ${toBuy.length ? "" : "disabled"}>${icon("bag")}買缺的單品</button>
    </div>
    <details class="why"><summary class="label">為什麼這樣搭 ${icon("plus", 16)}</summary>${reasonList(look.reasons)}</details>
  </div>`;
}

export function render() {
  for (const slot of Object.keys(placed)) if (!closetItem(placed[slot])) delete placed[slot]; // deleted from closet
  const look = currentLook();
  $("#mannequin").innerHTML = `<div class="mannequin-layout">
    <div>
      <div class="mannequin">${FIGURE}${visibleSlots().map(slotButton).join("")}</div>
      <div class="slot-chips">${Object.keys(SLOT_LAYOUT).map((slot) =>
        `<button class="chip" data-action="mannequin-slot" data-slot="${slot}" aria-pressed="${Boolean(placed[slot])}">${SLOT_NAME[slot]}</button>`).join("")}</div>
    </div>
    <div class="mannequin-panel">
      <p class="muted">把衣櫃裡的衣服放上人台，AI 會用可購買的單品補齊其他位置。什麼都不放，AI 就幫你搭一整套。</p>
      <label class="field"><span class="label">要穿去哪裡？</span>
        <input class="input" id="mannequinText" value="${esc(text)}" placeholder="${DEFAULT_TEXT}"></label>
      ${closetOptionsHtml()}
      <button class="btn btn-primary btn-block" data-action="mannequin-fill" ${busy ? "disabled" : ""}>${icon("sparkle")}${busy ? "搭配中…" : "AI 幫我補齊"}</button>
      ${look ? resultPanel(look) : ""}
    </div></div>`;
  applyCutouts($("#mannequin"));
}

/** AI fills the empty slots around the garments on the mannequin (also used by 「救救這件」). */
export async function fill() {
  busy = true;
  render();
  try {
    const placedIds = Object.values(placed);
    const closetItems = placedIds.map(closetItem).filter(Boolean).map(closetItemPayload);
    result = attachClosetPhotos(await api.recommend({
      text: text.trim() || DEFAULT_TEXT, prefs, profile, closet_items: closetItems,
      ...closetOptionFields(placedIds), ...profileFields(), ...loopFields(), ...memoryFields(),
    }));
    recordRound(result);
    lookIndex = 0;
    if (!result.outfits.length) toast("找不到符合條件的搭配，換個說法試試");
  } catch (error) {
    toast(error.message);
  } finally {
    busy = false;
    render();
  }
}

function openRecommendedItem(item) {
  const look = currentLook();
  openItemSheet(item, {
    onLike: (already) => {
      if (already) {
        unrecordFeedback([item], "like");
        return toast("已取消");
      }
      recordFeedback([item], "like");
      toast("記下了");
    },
    onDislike: (already) => {
      if (already) {
        unrecordFeedback([item], "dislike");
        return toast("已取消");
      }
      recordFeedback([item], "dislike");
      toast("之後會少推這種");
    },
    onPickAlternate: (alternate) => {
      const j = look.items.indexOf(item);
      recordFeedback([item], "swap_out");
      recordFeedback([alternate], "like");
      const others = (item.alternates ?? []).filter((a) => a.article_id !== alternate.article_id);
      look.items[j] = { ...alternate, alternates: [item, ...others] };
      look.total_price = look.items.reduce((sum, i) => sum + i.price, 0);
      render();
    },
  });
}

function openSlotPicker(slot) {
  const options = closet.filter((c) => c.slot === slot);
  const recommended = currentLook()?.items.find((i) => i.slot === slot && !i.owned);
  const fromCloset = !placed[slot] && currentLook()?.items.find((i) => i.slot === slot && i.owned);
  openSheet({
    title: SLOT_NAME[slot],
    html: `<div class="label">我的衣服</div>
      ${options.length
        ? `<div class="products products-4">${options.map((c) => productTile({ image: c.image, name: c.name, slot_zh: c.colour, owned: true },
            `data-action="sheet" data-handler="place" data-id="${esc(c.id)}"`, { pressed: placed[slot] === c.id })).join("")}</div>`
        : `<div class="empty">衣櫃裡還沒有${SLOT_NAME[slot]}</div>`}
      <div class="button-row">
        ${placed[slot] ? `<button class="btn" data-action="sheet" data-handler="clear">從人台拿下</button>` : ""}
        <button class="btn" data-action="sheet" data-handler="add">${icon("camera")}拍一件加入衣櫃</button>
      </div>
      ${fromCloset ? `<div class="notice notice-ok">AI 從你的衣櫃挑了「${esc(fromCloset.name)}」放在這裡。</div>` : ""}
      ${recommended ? `<div class="label">AI 推薦的這件</div>
        <div class="products products-4">${productTile(recommended, `data-action="sheet" data-handler="recommended"`)}</div>` : ""}`,
    handlers: {
      place: (data) => { place(closetItem(data.id)); closeSheet(); render(); },
      clear: () => { delete placed[slot]; result = null; closeSheet(); render(); },
      add: () => { closeSheet(); onAddGarment(); },
      recommended: () => { closeSheet(); openRecommendedItem(recommended); },
    },
  });
}

export const actions = {
  "mannequin-slot": (data) => openSlotPicker(data.slot),
  "mannequin-fill": () => fill(),
  "mannequin-look": (data) => { lookIndex = Number(data.look); render(); },
  "mannequin-item": (data) => openRecommendedItem(currentLook().items.find((i) => i.article_id === data.article)),
  "mannequin-save": () => addToJournal(text.trim() || DEFAULT_TEXT, currentLook().items),
  "mannequin-post": () => openComposer({ items: currentLook().items, occasion: result.intent.occasion }),
  "mannequin-buy": () => {
    const owned = currentLook().items.filter((i) => i.owned);
    openCart(currentLook().items, owned.length ? `「${owned.map((i) => i.name).join("、")}」已經在你的衣櫃，不用再買。` : "");
  },
};

/** `onAddGarmentRequested` is called when the person wants to photograph a new garment from the picker. */
export function init({ onAddGarmentRequested }) {
  onAddGarment = onAddGarmentRequested;
  $("#mannequin").addEventListener("input", (event) => {
    if (event.target.id === "mannequinText") text = event.target.value;
  });
}
