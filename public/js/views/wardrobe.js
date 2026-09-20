// 我的衣櫃: the clothes I own, by category. Photograph one and AI fills in type and colour; open one to edit its
// details, see how often and with what it was worn, or ask AI to style it. Everything stays in this browser.
import { api } from "../shared/api.js";
import { applyCutouts } from "../shared/cutout.js";
import { L } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { pickImageFile, resizeImage } from "../shared/images.js";
import { productTile } from "../shared/outfit.js";
import { closeSheet, openSheet } from "../shared/sheet.js";
import { closet, journal, saveCloset, saveWardrobeLayout, wardrobeLayout } from "../shared/store.js";
import { $, $$, COLOUR_NAME, colourLabel, empty, esc, notice, OCCASION_NAME, options, SLOT_NAME } from "../shared/ui.js";

const CATEGORIES = ["top", "bottom", "onepiece", "outer", "shoes", "bag", "accessory"];
const SEASONS = L({ all: "四季", warm: "春夏", cool: "秋冬" }, { all: "All year", warm: "Spring / summer", cool: "Autumn / winter" });

let status = ""; // HTML of the latest add-photo message
let editingId = null; // garment whose sheet is open
let wearToday = () => {}; // set by today.js: put a garment on the mannequin in 今天 (optionally let AI fill the rest)

/** today.js hands over how to open a garment in 今天 (avoids an import cycle). */
export const setWearToday = (fn) => {
  wearToday = fn;
};

const byId = (id) => closet.find((c) => c.id === id);

/** Journal pages this garment appears on, newest first (as the person's own piece: "closet:<id>"). */
const pagesWith = (item) => journal.filter((entry) => entry.items.some((i) => i.article_id === `closet:${item.id}`));

function card(item) {
  const worn = pagesWith(item).reduce((sum, entry) => sum + (entry.wear || 0), 0);
  return `<div class="garment-card">
    <button class="product-image" data-action="wardrobe-open" data-id="${esc(item.id)}" aria-label="${esc(item.name)}">
      <img data-cutout src="${esc(item.image)}" alt="${esc(item.name)}"></button>
    <div class="product-name">${esc(item.name)}</div>
    <div class="muted">${esc(colourLabel(item.colour_master))}${item.brand ? ` · ${esc(item.brand)}` : ""}${worn ? ` · ${L(`穿過 ${worn} 次`, `worn ${worn}×`)}` : ""}</div>
    <div class="garment-actions">
      <button class="btn btn-sm" data-action="wardrobe-rescue" data-id="${esc(item.id)}" ${item.slot === "accessory" ? "disabled" : ""}>${icon("sparkle", 14)}${L("幫我搭這件", "Style this")}</button>
      <button class="btn btn-sm" data-action="wardrobe-wear" data-id="${esc(item.id)}" ${item.slot === "accessory" ? "disabled" : ""}>${L("今天想穿這件", "Wear today")}</button>
    </div></div>`;
}

function canvasPiece(item, index) {
  const saved = wardrobeLayout[item.id];
  const spot = saved ?? { x: 4 + (index % 3) * 33, y: 18 + Math.floor(index / 3) * 140 };
  return `<img class="wardrobe-piece" data-cutout data-wardrobe-piece="${esc(item.id)}" src="${esc(item.image)}" alt="${esc(item.name)}"
    style="left:${spot.x}${saved ? "px" : "%"};top:${spot.y}px">`;
}

function makeCanvasDraggable(board) {
  $$("[data-wardrobe-piece]", board).forEach((el) => {
    el.addEventListener("pointerdown", (down) => {
      down.preventDefault();
      el.setPointerCapture(down.pointerId);
      el.style.zIndex = String(Date.now() % 100000);
      const dx = down.clientX - el.offsetLeft;
      const dy = down.clientY - el.offsetTop;
      const move = (event) => {
        el.style.left = `${Math.max(0, Math.min(board.clientWidth - el.offsetWidth, event.clientX - dx))}px`;
        el.style.top = `${Math.max(0, Math.min(board.clientHeight - el.offsetHeight, event.clientY - dy))}px`;
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", () => {
        el.removeEventListener("pointermove", move);
        wardrobeLayout[el.dataset.wardrobePiece] = { x: Number.parseInt(el.style.left, 10), y: Number.parseInt(el.style.top, 10) };
        saveWardrobeLayout();
      }, { once: true });
    });
  });
}

export function render() {
  const groups = CATEGORIES.map((slot) => [slot, closet.filter((c) => c.slot === slot)]).filter(([, items]) => items.length);
  $("#wardrobe").innerHTML = `<section class="stack">
    <div class="section-title"><h2 class="display">${L("我的衣櫃", "My closet")}</h2><span class="rule"></span></div>
    <div class="feed-toolbar">
      <p class="muted">${L("拍下自己的衣服，AI 會辨識品類和顏色，你可以再修改。照片只存在這台裝置。",
        "Photograph your clothes; AI fills in the type and colour, and you can edit them. Photos stay on this device.")}</p>
      <button class="btn btn-dark" data-action="wardrobe-add">${icon("camera")}${L("拍照加入", "Add a photo")}</button>
    </div>
    ${status}
    ${closet.length ? `<div class="stack">
      <div><div class="label">${L("自由搭配區", "Mix-and-match canvas")}</div>
        <p class="muted">${L("拖曳你真正擁有的衣服，直接嘗試不同組合；位置會保存在這台裝置。", "Drag clothes you actually own to try combinations. Positions stay on this device.")}</p></div>
      <div class="wardrobe-canvas-wrap"><div class="wardrobe-canvas" style="height:${Math.max(380, Math.ceil(closet.length / 3) * 140 + 30)}px">
        ${closet.map(canvasPiece).join("")}
      </div></div>
    </div>` : ""}
    ${groups.length ? groups.map(([slot, items]) => `<div class="stack">
        <div class="label">${esc(SLOT_NAME[slot])} · ${items.length}</div>
        <div class="wardrobe-grid">${items.map(card).join("")}</div></div>`).join("")
      : empty(L("衣櫃還是空的。拍一件你常穿的衣服試試。", "Your closet is empty. Try photographing something you wear often."))}
  </section>`;
  applyCutouts($("#wardrobe"));
  const canvas = $(".wardrobe-canvas", $("#wardrobe"));
  if (canvas) makeCanvasDraggable(canvas);
}

export async function addPhoto() {
  const file = await pickImageFile();
  status = notice(L("辨識衣服中…", "Recognising the garment…"));
  render();
  try {
    const [image, thumbnail] = await Promise.all([resizeImage(file, 768), resizeImage(file, 320, 0.8)]);
    const { garment: g, vec, note } = await api.analyzePhoto(image, "closet");
    if (!g) {
      status = notice(note, "warn");
    } else {
      closet.unshift({
        id: Date.now().toString(36), name: g.name_zh, slot: g.slot, type: g.type, colour_master: g.colour_master,
        colour: g.colour_zh, pattern: g.pattern, warmth: g.warmth, formality: g.formality, gender: g.gender,
        description: g.description_en, vec, image: thumbnail, ts: Date.now(),
      });
      if (saveCloset()) {
        status = notice(L(`已加入：${g.name_zh}（${SLOT_NAME[g.slot] || g.slot} · ${g.colour_zh}）。點照片可以修改細節。`,
          `Added: ${g.name_zh} (${SLOT_NAME[g.slot] || g.slot}, ${g.colour_master}). Tap the photo to edit details.`), "ok");
      } else {
        closet.shift();
        status = notice(L("這台裝置的儲存空間不足，請先刪除幾件衣服", "This device is out of storage; remove a few clothes first"), "warn");
      }
    }
  } catch (error) {
    status = notice(`${L("無法辨識：", "Couldn't recognise it: ")}${error.message}`, "warn");
  }
  render();
}

/** The garment's page: big photo, editable details (AI filled some), wear history and past looks. */
function openGarment(item) {
  const pages = pagesWith(item);
  const worn = pages.reduce((sum, entry) => sum + (entry.wear || 0), 0);
  const lastWorn = pages.find((entry) => entry.wear)?.ts;
  const field = (label, input) => `<label class="field"><span class="label">${label}</span>${input}</label>`;
  const text = (key, type = "text") => `<input class="input" data-garment-field="${key}" type="${type}" value="${esc(item[key] ?? "")}">`;
  const occasions = item.occasions ?? [];
  editingId = item.id;
  openSheet({
    title: item.name,
    html: `<div class="product-image"><img data-cutout src="${esc(item.image)}" alt="${esc(item.name)}"></div>
      <div class="stack">
        <div class="chips-static">
          <span class="badge">${L(`穿過 ${worn} 次`, `Worn ${worn}×`)}</span>
          <span class="badge">${lastWorn ? L(`最近一次 ${new Date(lastWorn).toLocaleDateString()}`, `Last worn ${new Date(lastWorn).toLocaleDateString()}`) : L("還沒穿過", "Not worn yet")}</span>
          <span class="badge">${L(`出現在 ${pages.length} 頁手帳`, `In ${pages.length} journal page(s)`)}</span>
        </div>
        <div class="form-grid">
          ${field(L("名稱", "Name"), text("name"))}
          ${field(L("類別", "Category"), `<select class="select" data-garment-field="slot">${options(SLOT_NAME, item.slot)}</select>`)}
          ${field(L("顏色", "Colour"), `<select class="select" data-garment-field="colour_master">${options(COLOUR_NAME, item.colour_master)}</select>`)}
          ${field(L("品牌", "Brand"), text("brand"))}
          ${field(L("尺寸", "Size"), text("size"))}
          ${field(L("季節", "Season"), `<select class="select" data-garment-field="season"><option value=""></option>${options(SEASONS, item.season)}</select>`)}
          ${field(L("購買價格 (NT$)", "Price paid (NT$)"), text("price", "number"))}
          ${field(L("購買時間", "Bought on"), text("bought", "date"))}
        </div>
        <div class="field"><span class="label">${L("適合場合", "Good for")}</span>
          <div class="chips">${Object.entries(OCCASION_NAME).map(([key, label]) =>
            `<button class="chip" data-action="sheet" data-handler="occasion" data-occasion="${key}" aria-pressed="${occasions.includes(key)}">${esc(label)}</button>`).join("")}</div></div>
        ${pages.length ? `<div class="label">${L("過去怎麼搭過", "How you've worn it")}</div>
          ${pages.slice(0, 4).map((entry) => `<div class="past-look"><span class="muted">${new Date(entry.ts).toLocaleDateString()} · ${esc(entry.text)}</span>
            <div class="products products-4">${entry.items.map((i) => productTile(i)).join("")}</div></div>`).join("")}` : ""}
        <div class="button-row">
          <button class="btn btn-primary" data-action="sheet" data-handler="rescue">${icon("sparkle")}${L("幫我搭這件", "Style this")}</button>
          <button class="btn" data-action="sheet" data-handler="wear">${L("今天想穿這件", "Wear today")}</button>
          <button class="icon-btn" data-action="sheet" data-handler="remove" aria-label="${L("刪除", "Delete")}">${icon("trash")}</button>
        </div>
      </div>`,
    onOpen: (body) => applyCutouts(body),
    handlers: {
      occasion: (data, el) => {
        item.occasions = occasions.includes(data.occasion) ? occasions.filter((o) => o !== data.occasion) : [...occasions, data.occasion];
        saveCloset();
        el.setAttribute("aria-pressed", String(item.occasions.includes(data.occasion)));
        occasions.splice(0, occasions.length, ...item.occasions);
      },
      rescue: () => { closeSheet(); wearToday(item.id, { fill: true }); },
      wear: () => { closeSheet(); wearToday(item.id); },
      remove: () => {
        if (!confirm(L(`從衣櫃刪除「${item.name}」？`, `Remove "${item.name}" from your closet?`))) return;
        closet.splice(closet.indexOf(item), 1);
        delete wardrobeLayout[item.id];
        saveWardrobeLayout();
        saveCloset();
        closeSheet();
        render();
      },
    },
  });
}

export const actions = {
  "wardrobe-add": () => addPhoto(),
  "wardrobe-open": (data) => openGarment(byId(data.id)),
  "wardrobe-rescue": (data) => wearToday(data.id, { fill: true }),
  "wardrobe-wear": (data) => wearToday(data.id),
};

export function init() {
  // Edits in the garment sheet save as you type; the list refreshes when the sheet closes.
  $("#sheet").addEventListener("change", (event) => {
    const key = event.target.dataset?.garmentField;
    const item = key && byId(editingId);
    if (!item) return;
    item[key] = event.target.type === "number" ? Number(event.target.value) || null : event.target.value;
    saveCloset();
    render();
  });
}
