// Demo checkout: lists the items and records a "buy" (the strongest positive feedback).
import { L } from "./i18n.js";
import { icon } from "./icons.js";
import { openSheet } from "./sheet.js";
import { recordFeedback } from "./store.js";
import { esc, formatPrice } from "./ui.js";

export function openCart(items, note = "") {
  const purchasable = items.filter((item) => !item.owned);
  const total = purchasable.reduce((sum, item) => sum + item.price, 0);
  const lookalikes = purchasable.filter((item) => item.similar_owned);
  recordFeedback(purchasable, "buy");
  openSheet({
    title: L("購物車", "Cart"),
    html: `<ul class="buy-list">${purchasable.map((item) => `<li>
        <img src="${esc(item.image)}" alt=""><div><div class="product-name">${esc(item.name)}</div><div class="muted">${esc(item.colour)}</div></div>
        <span class="price">${formatPrice(item.price)}</span></li>`).join("")}</ul>
      <div class="total-row"><span class="label">Total</span><span class="price price-lg">${formatPrice(total)}</span></div>
      ${note ? `<div class="notice notice-ok">${esc(note)}</div>` : ""}
      ${lookalikes.length ? `<div class="notice notice-warn">${lookalikes.map((item) => L(`「${esc(item.name)}」和你衣櫃裡的「${esc(item.similar_owned.name)}」很像`, `"${esc(item.name)}" looks like your "${esc(item.similar_owned.name)}"`)).join(L("；", "; "))}${L("，確定都要買嗎？", ". Still buy everything?")}</div>` : ""}
      <p class="muted">${L("原型展示：每件都對應真實的 H&amp;M 商品編號，正式版可串接電商購物車。價格為估算的新台幣價位。",
        "Prototype: every item is a real H&amp;M article number; a real version would connect to a shop's cart. Prices are estimated in NT$.")}</p>
      <button class="btn btn-primary btn-block" data-action="sheet-close">${icon("check")}${L("完成", "Done")}</button>`,
  });
}
