// A · 手帳: 我的收藏 + 我的穿搭, with draggable cut-outs, notes, wear counts and optional publishing.
import { applyCutouts, cutout } from "../shared/cutout.js";
import { L } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { pickImageFile, resizeImage } from "../shared/images.js";
import { closeSheet, openSheet, updateSheet } from "../shared/sheet.js";
import { journal, recordFeedback, saveJournal } from "../shared/store.js";
import { $, $$, currentTab, empty, esc, notice, OCCASION_NAME, onTabOpen, options, toast } from "../shared/ui.js";
import { openComposer } from "./composer.js";

let section = "saved";

/**
 * Adds a look to 手帳. kind "saved" = 我的收藏 (liked, maybe later); "worn" = 我的穿搭 (chosen for today, with the
 * day's date, occasion and the AI's reasons, so the page can be finished later).
 */
export function addToJournal(title, items, { kind = "saved", theme = null, occasion = null, reasons = [] } = {}) {
  journal.unshift({
    id: Date.now().toString(36), ts: Date.now(), text: title, note: "", wear: kind === "worn" ? 1 : 0, layout: {}, kind, theme, occasion,
    reasons: reasons.filter((r) => r.group === "stylist").map(({ label, text }) => ({ label, text })),
    items: items.map(({ alternates, matches, ...item }) => item),
  });
  if (!saveJournal()) {
    journal.shift();
    return toast(L("這台裝置的儲存空間不足，存不進手帳", "This device is out of storage; couldn't save to the journal"));
  }
  recordFeedback(items, kind === "worn" ? "wear" : "save");
  toast(kind === "worn" ? L("已加入今天的手帳", "Added to today's journal") : L("已收藏到手帳", "Saved to your journal"));
}

const entryById = (id) => journal.find((e) => e.id === id);

function sticker(item, j, layout) {
  const spot = layout[item.article_id] ?? (item.whole_outfit
    ? { x: 90, y: 16, r: 0 }
    : { x: 12 + (j % 3) * 118, y: 20 + Math.floor(j / 3) * 150 + (j % 2) * 24, r: ((j % 3) - 1) * 5 });
  return `<img class="sticker ${item.whole_outfit ? "sticker-outfit" : ""}" data-cutout data-article="${esc(item.article_id)}" src="${esc(item.image)}" alt="${esc(item.name)}"
    style="left:${spot.x}px;top:${spot.y}px;transform:rotate(${spot.r}deg)">`;
}

function entryCard(entry, index) {
  const attrs = (action) => `data-action="${action}" data-entry="${entry.id}"`;
  const source = entry.kind !== "worn" ? (entry.items.some((item) => item.article_id?.startsWith("feed:")) ? L("穿搭牆收藏", "Saved from Explore") : L("今天收藏", "Saved from Today")) : null;
  return `<article class="entry">
    <div class="entry-meta"><h2 class="display" style="font-size: var(--text-xl)">Look ${String(journal.length - index).padStart(2, "0")}</h2>
      <span class="muted">${new Date(entry.ts).toLocaleDateString()}</span></div>
    <div class="board" data-entry="${entry.id}">${entry.items.map((item, j) => sticker(item, j, entry.layout)).join("")}</div>
    <p>${esc(entry.text)}</p>
    <div class="chips-static">${source ? `<span class="badge">${source}</span>` : ""}${entry.occasion ? `<span class="badge">${esc(OCCASION_NAME[entry.occasion] ?? entry.occasion)}</span>` : ""}</div>
    <textarea class="textarea" data-entry="${entry.id}" placeholder="心得、朋友的評價…">${esc(entry.note)}</textarea>
    <div class="button-row">
      <button class="btn" ${attrs("journal-wear")}>${icon("check")}今天穿了（${entry.wear}）</button>
      ${entry.kind === "worn" ? `<button class="btn" ${attrs("journal-post")}>${icon("upload")}發佈到穿搭牆</button>` : ""}
      <button class="icon-btn" ${attrs("journal-delete")} aria-label="刪除">${icon("trash")}</button>
    </div></article>`;
}

function render() {
  const saved = journal.filter((entry) => entry.kind !== "worn");
  const worn = journal.filter((entry) => entry.kind === "worn");
  const shown = section === "saved" ? saved : worn;
  $("#journal").innerHTML = `<div class="stack">
    <div class="section-title"><h1 class="display page-title">${L("手帳", "Journal")}</h1></div>
    <p class="muted">${L("收藏整套搭配，或上傳自己的全身穿搭；每一頁都能拖曳排版、寫筆記並記錄實際穿著次數。", "Save complete looks or upload your own outfit. Drag, annotate and track every wear.")}</p>
    <div class="journal-head">
      <div class="segmented">
        <button data-action="journal-section" data-section="saved" aria-pressed="${section === "saved"}">${L("我的收藏", "Saved")}（${saved.length}）</button>
        <button data-action="journal-section" data-section="worn" aria-pressed="${section === "worn"}">${L("我的穿搭", "My outfits")}（${worn.length}）</button>
      </div>
      ${section === "worn" ? `<button class="btn btn-dark" data-action="journal-upload">${icon("camera")}${L("上傳穿搭", "Upload outfit")}</button>` : ""}
    </div>
    ${section === "saved"
      ? `<p class="muted">${L("來自「今天」與「穿搭牆」的收藏，整套服裝與配件會以去背貼紙保存。", "Looks saved from Today and Explore, kept as background-free stickers.")}</p>`
      : `<p class="muted">${L("上傳全身照後會嘗試移除單色背景並保留人物、包包與鞋子。白牆或灰牆前拍攝效果最好。", "We'll remove a plain background while keeping the person, bag and shoes. A white or grey wall works best.")}</p>`}
    ${shown.length ? `<div class="lookbook">${shown.map((entry) => entryCard(entry, journal.indexOf(entry))).join("")}</div>`
      : empty(section === "saved" ? L("還沒有收藏。在「今天」或「穿搭牆」按收藏。", "Nothing saved yet. Save a look from Today or Explore.")
        : L("還沒有自己的穿搭。上傳一張全身照開始記錄。", "No outfits yet. Upload a full-body photo to begin."))}
  </div>`;
  $$(".board", $("#journal")).forEach(makeStickersDraggable);
  applyCutouts($("#journal"));
}

const localDate = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

/** Uploads one complete outfit. Plain backgrounds are removed with the same local cut-out used for garments. */
function openOutfitUpload() {
  let original = null;
  let processed = null;
  let working = false;
  const draft = { date: localDate(), scene: "", occasion: "", publish: false };

  const rememberFields = () => {
    if (!$("#outfitDate")) return;
    draft.date = $("#outfitDate").value;
    draft.scene = $("#outfitScene").value;
    draft.occasion = $("#outfitOccasion").value;
    draft.publish = $("#outfitPublish").checked;
  };
  const uploadHtml = () => `<div class="outfit-upload-preview">
      ${processed ? `<img src="${esc(processed)}" alt="${L("穿搭去背預覽", "Outfit cut-out preview")}">`
        : `<button class="cropper-empty" data-action="sheet" data-handler="pick">${icon("camera", 28)}<strong>${L("選擇全身穿搭照", "Choose a full-body photo")}</strong><span class="muted">${L("建議站在單色牆前，並讓包包、鞋子完整入鏡", "Use a plain wall and keep your bag and shoes in frame")}</span></button>`}
    </div>
    ${working ? `<div class="loading">${L("正在移除背景…", "Removing the background…")}</div>` : ""}
    ${processed && processed === original ? notice(L("沒有辨識到單色背景，因此會保留原圖；若想要去背效果，請改用白牆或灰牆前拍攝的照片。",
      "No plain background was detected, so the original will be kept. Use a photo taken against a white or grey wall for cut-out."), "warn") : ""}
    ${processed && processed !== original ? notice(L("已移除單色背景，人物、包包與鞋子會一起保留。", "Plain background removed; the person, bag and shoes are kept."), "ok") : ""}
    ${processed ? `<button class="btn btn-sm" data-action="sheet" data-handler="pick">${icon("camera")}${L("換一張", "Choose another")}</button>` : ""}
    <label class="field"><span class="label">${L("日期", "Date")}</span><input class="input" id="outfitDate" type="date" value="${esc(draft.date)}"></label>
    <label class="field"><span class="label">${L("穿搭場景", "Outfit occasion")}</span>
      <input class="input" id="outfitScene" maxlength="80" value="${esc(draft.scene)}" placeholder="${L("例如：9/19 台北演唱會", "e.g. 9/19 Taipei concert")}">
      <span class="muted">${L("例如：9/19 台北演唱會、9/13 讀書會、8/24 面試", "For example: 9/19 Taipei concert, 9/13 study group, 8/24 interview")}</span></label>
    <label class="field"><span class="label">${L("場合（選填）", "Occasion (optional)")}</span>
      <select class="select" id="outfitOccasion"><option value="">${L("不指定", "Not specified")}</option>${options(OCCASION_NAME, draft.occasion)}</select></label>
    <label class="check"><input type="checkbox" id="outfitPublish" ${draft.publish ? "checked" : ""}>
      <span>${L("儲存後繼續發布到穿搭牆（發布前仍可裁切、遮臉並確認公開同意）", "Continue to publishing after saving; you can crop, cover your face and confirm consent first.")}</span></label>
    <button class="btn btn-primary btn-block" data-action="sheet" data-handler="save" ${!processed || working ? "disabled" : ""}>${icon("bookmark")}${L("加入我的穿搭", "Add to my outfits")}</button>`;

  openSheet({
    title: L("上傳自己的穿搭", "Upload my outfit"),
    html: uploadHtml(),
    handlers: {
      pick: async () => {
        const file = await pickImageFile();
        rememberFields();
        working = true;
        updateSheet(uploadHtml());
        try {
          original = await resizeImage(file, 900, 0.85);
          processed = await cutout(original);
        } catch (error) {
          toast(error.message);
        }
        working = false;
        updateSheet(uploadHtml());
      },
      save: () => {
        rememberFields();
        const scene = draft.scene.trim();
        if (!scene) return toast(L("請描述這套穿搭的場景", "Describe where you wore this outfit"));
        const id = Date.now().toString(36);
        const entry = {
          id, ts: new Date(`${draft.date || localDate()}T12:00:00`).getTime(), text: scene, note: "", wear: 1, layout: {},
          kind: "worn", occasion: draft.occasion || null, theme: null, reasons: [],
          items: [{ article_id: `outfit:${id}`, name: scene, image: processed, owned: true, whole_outfit: true }],
        };
        journal.unshift(entry);
        if (!saveJournal()) {
          journal.shift();
          return toast(L("這台裝置的儲存空間不足，請刪除一些照片後再試", "This device is out of storage. Remove some photos and try again."));
        }
        closeSheet();
        render();
        toast(L("已加入我的穿搭", "Added to my outfits"));
        if (draft.publish) openComposer({ initialImage: original, caption: scene, occasion: draft.occasion || null });
      },
    },
  });
}

function makeStickersDraggable(board) {
  const entry = entryById(board.dataset.entry);
  $$(".sticker", board).forEach((el) => {
    el.addEventListener("pointerdown", (down) => {
      down.preventDefault();
      el.setPointerCapture(down.pointerId);
      el.style.zIndex = String(Date.now() % 100000); // bring to front
      const dx = down.clientX - el.offsetLeft;
      const dy = down.clientY - el.offsetTop;
      const move = (e) => {
        el.style.left = `${e.clientX - dx}px`;
        el.style.top = `${e.clientY - dy}px`;
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", () => {
        el.removeEventListener("pointermove", move);
        const rotation = parseFloat((el.style.transform.match(/-?[\d.]+/) ?? [0])[0]);
        entry.layout[el.dataset.article] = { x: Number.parseInt(el.style.left, 10), y: Number.parseInt(el.style.top, 10), r: rotation };
        saveJournal();
      }, { once: true });
    });
  });
}

export const actions = {
  "journal-section": (data) => { section = data.section; render(); },
  "journal-upload": () => openOutfitUpload(),
  "journal-wear": (data, button) => {
    const entry = entryById(data.entry);
    entry.wear += 1;
    saveJournal();
    recordFeedback(entry.items, "wear");
    button.lastChild.textContent = `今天穿了（${entry.wear}）`;
    toast("穿搭紀錄 +1，偏好也更新了");
  },
  "journal-post": (data) => {
    const entry = entryById(data.entry);
    const outfitPhoto = entry.items.find((item) => item.whole_outfit && item.article_id?.startsWith("outfit:"));
    openComposer({
      items: outfitPhoto ? entry.items.filter((item) => !item.whole_outfit) : entry.items,
      occasion: entry.occasion,
      initialImage: outfitPhoto?.image ?? null,
      caption: entry.text,
    });
  },
  "journal-delete": (data) => {
    if (!confirm("確定刪除這套穿搭？")) return;
    journal.splice(journal.indexOf(entryById(data.entry)), 1);
    saveJournal();
    render();
  },
};

export function init() {
  onTabOpen("journal", render);
  $("#journal").addEventListener("focusout", (event) => {
    if (!event.target.matches("textarea[data-entry]")) return;
    entryById(event.target.dataset.entry).note = event.target.value;
    saveJournal();
  });
}

/** Redraws the journal if it is the visible tab. */
export const refresh = () => currentTab() === "journal" && render();
