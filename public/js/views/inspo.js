// 照片找同款: an outfit photo -> each garment -> the most similar purchasable items.
import { api } from "../shared/api.js";
import { openCart } from "../shared/cart.js";
import { L } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { pickImageFile, resizeImage } from "../shared/images.js";
import { productTile } from "../shared/outfit.js";
import { recordFeedback } from "../shared/store.js";
import { $, esc, formatPrice, loading, notice, SLOT_NAME } from "../shared/ui.js";
import { addToJournal } from "./journal.js";
import { runSearch } from "./search.js";

let lookalikes = null; // {garments: [{...garment, matches}], style_keywords, preview, picks: [match index per garment]}

const chosenItems = () => lookalikes.garments.map((g, k) => g.matches[lookalikes.picks[k]]).filter(Boolean);

async function analyze(file) {
  $("#results").innerHTML = loading(L("拆解照片裡的穿搭，從上萬件單品裡找相似的…", "Breaking the photo into garments and searching thousands of items…"));
  try {
    const [image, preview] = await Promise.all([resizeImage(file, 768), resizeImage(file, 360, 0.8)]);
    const response = await api.analyzePhoto(image, "inspo");
    if (!response.garments.length) throw new Error(response.note);
    lookalikes = { ...response, preview, picks: response.garments.map(() => 0) };
    render();
  } catch (error) {
    $("#results").innerHTML = notice(`${L("無法辨識這張照片：", "Couldn't read this photo: ")}${error.message}`, "warn");
  }
}

function render() {
  const total = chosenItems().reduce((sum, item) => sum + item.price, 0);
  const garments = lookalikes.garments.map((garment, k) => `<div class="garment">
      <div class="section-title"><h3 class="display">${esc(garment.name_zh)}</h3><span class="rule"></span></div>
      <span class="muted">${esc(SLOT_NAME[garment.slot] || garment.slot)} · ${esc(garment.colour_zh)} · ${L("點選最像的一件", "tap the closest match")}</span>
      <div class="products products-4">${garment.matches.map((match, n) =>
        productTile({ ...match, slot_zh: L(`相似度 ${Math.round(match.similarity * 100)}%`, `${Math.round(match.similarity * 100)}% match`) },
          `data-action="inspo-match" data-garment="${k}" data-match="${n}"`, { pressed: lookalikes.picks[k] === n })).join("")}</div>
    </div>`).join("");
  $("#results").innerHTML = `<div class="stack">
    <div class="inspo-head"><img src="${lookalikes.preview}" alt="${L("你上傳的照片", "The photo you uploaded")}">
      <div class="stack">
        <h2 class="display" style="font-size: var(--text-xl)">${L(`辨識到 ${lookalikes.garments.length} 件`, `${lookalikes.garments.length} garments found`)}</h2>
        <div class="chips">${lookalikes.style_keywords.map((w) => `<span class="chip">${esc(w)}</span>`).join("")}</div>
        <p class="muted">${L("只分析照片中的衣服，不辨識人物；照片不會被儲存。", "Only the clothes are analysed, never the person, and the photo is not stored.")}</p>
      </div>
    </div>
    ${garments}
    <div class="total-row"><div class="amount"><span class="label">${L("平替整套", "Similar look, total")}</span><span class="price price-lg">${formatPrice(total)}</span></div></div>
    <div class="button-row">
      <button class="btn" data-action="inspo-save">${icon("bookmark")}${L("存進手帳", "Save to journal")}</button>
      <button class="btn" data-action="inspo-style">${icon("sparkle")}${L("用這個風格搭整套", "Style a full look like this")}</button>
      <button class="btn btn-primary" data-action="inspo-buy">${icon("bag")}${L("買整套", "Buy the look")}</button>
    </div></div>`;
}

export const actions = {
  "inspo-pick": async () => analyze(await pickImageFile()),
  "inspo-match": (data) => {
    lookalikes.picks[data.garment] = Number(data.match);
    recordFeedback([lookalikes.garments[data.garment].matches[data.match]], "like");
    render();
  },
  "inspo-save": () => addToJournal(L(`照片找同款：${lookalikes.style_keywords.join("、")}`, `Matched from a photo: ${lookalikes.style_keywords.join(", ")}`), chosenItems()),
  "inspo-buy": () => openCart(chosenItems()),
  "inspo-style": () => runSearch(L(`想要${lookalikes.style_keywords.join("、") || "照片裡"}風格的穿搭`, `An outfit in a ${lookalikes.style_keywords.join(", ") || "similar"} style`)),
};
