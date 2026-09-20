// Toggles for the optional closet features (說一句話, 人台搭配, 我的) and for anonymous sharing (我的).
// Each is one setting in localStorage, and every copy on the page stays in sync.
import { L } from "./i18n.js";
import { closet, saveSettings, settings } from "./store.js";
import { $$, esc, toast } from "./ui.js";

const OPTIONS = [
  { key: "useCloset", label: L("優先用我的衣櫃", "Use my closet first"), on: L("推薦時會先從你的衣櫃挑，缺的才推薦購買", "Looks now start from your closet; only missing pieces are suggested to buy") },
  { key: "warnSimilar", label: L("提醒衣櫃已有類似的", "Warn me if I own something similar"), on: L("要買的單品如果衣櫃裡有很像的，會提醒你", "You'll be warned before buying something like what you own") },
];
const SHARE = { key: "shareSignals", label: L("匿名分享我的需求給設計師", "Share my requests anonymously with designers"),
  on: L("謝謝！你的需求會匿名幫助設計師開發新款", "Thanks! Your requests help designers, anonymously"),
  off: L("這次之後的搜尋都不會進入設計師洞察", "From now on your requests stay out of the designer insights") };

/** The opt-out for anonymous signals (設計師洞察). On by default; nothing that identifies the person is sent. */
export const shareSignalsHtml = () =>
  `<label class="check"><input type="checkbox" data-setting="${SHARE.key}" ${settings.shareSignals ? "checked" : ""}>${esc(SHARE.label)}</label>`;

export function closetOptionsHtml() {
  const disabled = !closet.length;
  return `<div class="options">
    ${OPTIONS.map((o) => `<label class="check"><input type="checkbox" data-setting="${o.key}" ${settings[o.key] ? "checked" : ""} ${disabled ? "disabled" : ""}>${esc(o.label)}</label>`).join("")}
    ${disabled ? `<span class="muted">${L("到「我的」拍幾件衣服後就能使用", "Add a few clothes in Me to use these")}</span>` : ""}
  </div>`;
}

export function init() {
  document.addEventListener("change", (event) => {
    const key = event.target.dataset?.setting;
    if (!key) return;
    settings[key] = event.target.checked;
    saveSettings();
    $$(`[data-setting="${key}"]`).forEach((box) => (box.checked = settings[key]));
    const option = [...OPTIONS, SHARE].find((o) => o.key === key);
    toast(settings[key] ? option.on : (option.off ?? L(`已關閉「${option.label}」`, `Turned off: ${option.label}`)));
  });
}
