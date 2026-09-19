// DOM helpers, display labels, tab switching and small renderers shared by every view.
import { L, lang } from "./i18n.js";
import { icon } from "./icons.js";

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const esc = (value) => String(value ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const formatPrice = (amount) => `NT$${Number(amount).toLocaleString()}`;

// Display names in the current language (see i18n.js). Colour keys are the catalog's colour_master values.
const COLOUR_ZH_NAMES = { Black: "黑", White: "白", Grey: "灰", Beige: "米", Mole: "灰褐", Brown: "棕", Pink: "粉", Red: "紅",
  Orange: "橘", Yellow: "黃", Green: "綠", "Khaki green": "軍綠", Blue: "藍", Turquoise: "湖水綠", "Lilac Purple": "紫", Metal: "金屬" };
/** Short colour name: 米 / Beige. */
export const COLOUR_NAME = lang === "en" ? Object.fromEntries(Object.keys(COLOUR_ZH_NAMES).map((c) => [c, c])) : COLOUR_ZH_NAMES;
/** Colour as a word: 米色 / Beige. */
export const colourLabel = (c) => (lang === "en" ? c : `${COLOUR_ZH_NAMES[c] || c}色`);
export const SLOT_NAME = L(
  { top: "上衣", bottom: "下身", onepiece: "連身款", outer: "外套", shoes: "鞋子", bag: "包包", accessory: "配件" },
  { top: "Top", bottom: "Bottom", onepiece: "One-piece", outer: "Outerwear", shoes: "Shoes", bag: "Bag", accessory: "Accessory" },
);
export const OCCASION_NAME = L(
  { everyday: "日常", date: "約會", party: "聚會", concert: "演唱會", work: "上班", interview: "面試", wedding: "婚禮",
    formal: "正式場合", travel: "旅行", sport: "運動", school: "上課", beach: "海邊" },
  { everyday: "Everyday", date: "Date", party: "Party", concert: "Concert", work: "Work", interview: "Interview",
    wedding: "Wedding", formal: "Formal event", travel: "Travel", sport: "Sport", school: "Campus", beach: "Beach" },
);
export const BODY_TYPE_NAME = L(
  { hourglass: "沙漏型", athletic: "運動型", pear: "梨型", petite: "嬌小", "full bust": "上圍豐滿", "straight & narrow": "直筒型", apple: "蘋果型" },
  { hourglass: "Hourglass", athletic: "Athletic", pear: "Pear", petite: "Petite", "full bust": "Full bust",
    "straight & narrow": "Straight & narrow", apple: "Apple" },
);

export const notice = (message, kind = "") => `<div class="notice ${kind ? `notice-${kind}` : ""}">${esc(message)}</div>`;
export const loading = (message) => `<div class="loading">${esc(message)}</div>`;
export const empty = (message) => `<div class="empty">${esc(message)}</div>`;
export const options = (labels, selected) =>
  Object.entries(labels).map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`).join("");

/** Replaces <span data-icon="name"> placeholders in static HTML with SVG icons. */
export function hydrateIcons(root = document) {
  $$("[data-icon]", root).forEach((el) => {
    el.outerHTML = icon(el.dataset.icon);
  });
}

export function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el.hideTimer);
  el.hideTimer = setTimeout(() => el.classList.remove("show"), 2000);
}

const tabRenderers = {};

/** Registers the function that redraws a tab whenever it is opened. */
export function onTabOpen(tab, render) {
  tabRenderers[tab] = render;
}

export function showTab(tab) {
  $$("#tabs [data-tab]").forEach((b) => (b.dataset.tab === tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  $$("main > section").forEach((section) => (section.hidden = section.id !== `tab-${tab}`));
  window.scrollTo({ top: 0 });
  tabRenderers[tab]?.();
}

export const currentTab = () => $("#tabs [aria-current='page']")?.dataset.tab;
