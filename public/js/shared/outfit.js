// Renderers shared by every view that shows clothes: product tiles, intent tiles, reasons, item details.
import { L } from "./i18n.js";
import { icon } from "./icons.js";
import { closeSheet, openSheet } from "./sheet.js";
import { BODY_TYPE_NAME, COLOUR_NAME, colourLabel, esc, formatPrice, OCCASION_NAME, SLOT_NAME } from "./ui.js";

const REASON_ICONS = { closet: "hanger", intent: "sparkle", occasion: "calendar", weather: "thermometer", harmony: "palette",
  coherence: "check", budget: "tag", preference: "heart", relaxed: "info", feedback: "check", dresscode: "calendar",
  colour: "palette", silhouette: "ruler", body: "user", fabric: "sparkle", trend: "sparkle", explore: "sparkle" };

/** A clickable product tile. `attrs` carries the data-action attributes of the view that renders it. */
export function productTile(item, attrs = "", { pressed = false } = {}) {
  return `<button class="product" ${attrs} ${pressed ? 'aria-pressed="true"' : ""}>
    <span class="product-image"><img src="${esc(item.image)}" alt="" loading="lazy"></span>
    <span class="product-meta">
      <span class="label">${esc(SLOT_NAME[item.slot] ?? item.slot_zh)}</span>
      <span class="product-name">${esc(item.name)}</span>
      ${item.owned ? `<span class="product-owned">${L("我的衣櫃", "My closet")}</span>` : `<span class="product-price">${formatPrice(item.price)}</span>`}
      ${item.similar_owned ? `<span class="badge badge-accent">${L("衣櫃有類似的", "You own something similar")}</span>` : ""}
    </span></button>`;
}

export function intentTiles(intent, extra = []) {
  const tiles = [
    ["calendar", L("場合", "Occasion"), OCCASION_NAME[intent.occasion]],
    ["thermometer", L("天氣", "Weather"), intent.temperature_c != null ? `${Math.round(intent.temperature_c)}°C${intent.rainy ? L(" 有雨", ", rain") : ""}` : null],
    ["sparkle", L("風格", "Style"), intent.style_keywords.join(L("、", ", "))],
    ["tag", L("預算", "Budget"), intent.budget_max_twd ? `≤ ${formatPrice(intent.budget_max_twd)}` : null],
    ["palette", L("喜歡色", "Colours"), intent.colors_prefer.map((c) => COLOUR_NAME[c] || c).join(L("、", ", "))],
    ["close", L("避開", "Avoid"), [...intent.colors_avoid.map((c) => `${colourLabel(c)}`), ...intent.exclude_types,
      intent.pattern_max === 0 ? L("所有花紋", "any pattern") : intent.pattern_max === 1 ? L("明顯花紋", "bold patterns") : null]
      .filter(Boolean).join(L("、", ", "))],
    ["ruler", L("身形", "Body"), [intent.height_cm && `${intent.height_cm}cm`, BODY_TYPE_NAME[intent.body_type]].filter(Boolean).join(" · ")],
    ["user", L("同行", "With"), intent.companions],
    ...extra,
  ].filter(([, , value]) => value);
  return `<div class="tiles">${tiles.map(([name, label, value]) => `
    <div class="tile">${icon(name)}<div><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div></div>`).join("")}</div>`;
}

/** Swatch colours for catalog colour_master values. */
export const COLOUR_HEX = { Black: "#1c1c1c", White: "#f7f6f2", Grey: "#9b9b9b", Beige: "#d9c4a3", Mole: "#8a7c69",
  Brown: "#7a4b2e", Pink: "#f0a9bd", Red: "#c7342f", Orange: "#e8843b", Yellow: "#f1d04c", Green: "#4f9a5c",
  "Khaki green": "#6c6b3b", Blue: "#3f6fb4", Turquoise: "#3db6ad", "Lilac Purple": "#a78dca", Metal: "#b9b9c2" };

/** Colour circles, side by side, sized by each colour's share of the outfit. */
export function swatchRow(swatches) {
  return `<div class="swatches">${swatches.map(({ colour, share }) => {
    const size = Math.round(18 + 26 * share);
    return `<span class="swatch"><i style="width:${size}px;height:${size}px;background:${COLOUR_HEX[colour] ?? "#ccc"}"></i>
      <span>${esc(colourLabel(colour))} ${Math.round(share * 100)}%</span></span>`;
  }).join("")}</div>`;
}

const REASON_GROUPS = [
  ["context", ""],
  ["stylist", L("造型師觀點", "Stylist's view")],
  ["system", L("系統依據（可驗證的分數與條件）", "Under the hood (measurable scores and rules)")],
];

/** Reasons in three groups: about you, the stylist's view, and the measurable scores behind the ranking. */
export function reasonList(reasons) {
  const item = (r) => `<li>${icon(REASON_ICONS[r.key] ?? "info")}<div>
      <span class="label">${esc(r.label)}</span>${r.swatches ? swatchRow(r.swatches) : ""}${esc(r.text)}
      ${r.value != null ? `<div class="bar"><i style="width:${Math.round(Math.max(0, Math.min(1, r.value)) * 100)}%"></i></div>` : ""}
    </div></li>`;
  return REASON_GROUPS.map(([group, title]) => {
    const rows = reasons.filter((r) => (r.group ?? "system") === group);
    if (!rows.length) return "";
    const list = `<ul class="reasons">${rows.map(item).join("")}</ul>`;
    // The measurable scores are there for checking, not reading first: folded by default.
    if (group === "system") return `<details class="reason-details"><summary class="reason-group">${esc(title)}</summary>${list}</details>`;
    return `${title ? `<div class="reason-group">${esc(title)}</div>` : ""}${list}`;
  }).join("");
}

/** Details of one catalog item with like/dislike and, when available, alternatives to swap in. */
export function openItemSheet(item, { onLike, onDislike, onPickAlternate } = {}) {
  if (item.owned) {
    openSheet({
      title: SLOT_NAME[item.slot] ?? item.slot_zh,
      html: `<div class="product-image"><img src="${esc(item.image)}" alt="${esc(item.name)}"></div>
        <div class="notice notice-ok">${L(`這件是你衣櫃裡的「${esc(item.name)}」，不用再買。`, `This is your own "${esc(item.name)}": nothing to buy.`)}</div>`,
    });
    return;
  }
  const alternates = item.alternates ?? [];
  openSheet({
    title: SLOT_NAME[item.slot] ?? item.slot_zh,
    html: `<div class="product-image"><img src="${esc(item.image)}" alt="${esc(item.name)}"></div>
      <div class="stack">
        <div><h3 class="display" style="font-size: var(--text-xl)">${esc(item.name)}</h3>
          <div class="muted">${esc(item.colour)} · ${esc(item.type)}</div></div>
        <div class="price price-lg">${formatPrice(item.price)}</div>
        ${item.similar_owned ? `<div class="notice notice-warn">${L(`你的衣櫃已經有很像的「${esc(item.similar_owned.name)}」（相似度 ${Math.round(item.similar_owned.similarity * 100)}%），確定還要買嗎？`,
          `You already own a similar "${esc(item.similar_owned.name)}" (${Math.round(item.similar_owned.similarity * 100)}% alike). Still want it?`)}</div>` : ""}
        ${item.fit_note ? `<div class="notice notice-warn">${esc(item.fit_note)}</div>` : ""}
        ${item.desc ? `<p class="muted">${esc(item.desc)}</p>` : ""}
        ${onLike ? `<div class="button-row">
          <button class="btn" data-action="sheet" data-handler="like">${icon("heart")}${L("喜歡", "Like")}</button>
          <button class="btn" data-action="sheet" data-handler="dislike">${icon("heartOff")}${L("不喜歡", "Dislike")}</button></div>` : ""}
      </div>
      ${onPickAlternate && alternates.length ? `<div class="section-title"><h3 class="display">${L("換一件", "Swap for")}</h3><span class="rule"></span></div>
        <div class="products products-4">${alternates.map((a, n) => productTile(a, `data-action="sheet" data-handler="pick" data-index="${n}"`)).join("")}</div>` : ""}`,
    handlers: {
      like: () => { onLike(); closeSheet(); },
      dislike: () => { onDislike(); closeSheet(); },
      pick: (data) => { onPickAlternate(alternates[Number(data.index)]); closeSheet(); },
    },
  });
}
