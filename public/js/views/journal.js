// A · 手帳 (Lookbook): saved outfits as draggable stickers, with notes, a wear counter and posting to 穿搭牆.
import { applyCutouts } from "../shared/cutout.js";
import { L } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { journal, recordFeedback, saveJournal } from "../shared/store.js";
import { $, $$, currentTab, empty, esc, onTabOpen, toast } from "../shared/ui.js";
import { openComposer } from "./composer.js";

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
  const spot = layout[item.article_id] ?? { x: 12 + (j % 3) * 118, y: 20 + Math.floor(j / 3) * 150 + (j % 2) * 24, r: ((j % 3) - 1) * 5 };
  return `<img class="sticker" data-cutout data-article="${esc(item.article_id)}" src="${esc(item.image)}" alt="${esc(item.name)}"
    style="left:${spot.x}px;top:${spot.y}px;transform:rotate(${spot.r}deg)">`;
}

function entryCard(entry, index) {
  const attrs = (action) => `data-action="${action}" data-entry="${entry.id}"`;
  return `<article class="entry">
    <div class="entry-meta"><h2 class="display" style="font-size: var(--text-xl)">Look ${String(journal.length - index).padStart(2, "0")}</h2>
      <span class="muted">${new Date(entry.ts).toLocaleDateString()}</span></div>
    <div class="board" data-entry="${entry.id}">${entry.items.map((item, j) => sticker(item, j, entry.layout)).join("")}</div>
    <p>${esc(entry.text)}</p>
    <textarea class="textarea" data-entry="${entry.id}" placeholder="心得、朋友的評價…">${esc(entry.note)}</textarea>
    <div class="button-row">
      <button class="btn" ${attrs("journal-wear")}>${icon("check")}今天穿了（${entry.wear}）</button>
      <button class="btn" ${attrs("journal-post")}>${icon("upload")}發佈到穿搭牆</button>
      <button class="icon-btn" ${attrs("journal-delete")} aria-label="刪除">${icon("trash")}</button>
    </div></article>`;
}

function render() {
  $("#journal").innerHTML = `<div class="stack">
    <div class="section-title"><h1 class="display page-title">Lookbook</h1></div>
    <p class="muted">存下來的穿搭。拖曳貼紙排版、記錄穿過幾次，也可以發佈到穿搭牆。</p>
    ${journal.length ? `<div class="lookbook">${journal.map(entryCard).join("")}</div>` : empty("手帳還是空的。在「說一句話」或「衣櫃」按「存進手帳」。")}
  </div>`;
  $$(".board", $("#journal")).forEach(makeStickersDraggable);
  applyCutouts($("#journal"));
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
  "journal-wear": (data, button) => {
    const entry = entryById(data.entry);
    entry.wear += 1;
    saveJournal();
    recordFeedback(entry.items, "wear");
    button.lastChild.textContent = `今天穿了（${entry.wear}）`;
    toast("穿搭紀錄 +1，偏好也更新了");
  },
  "journal-post": (data) => openComposer({ items: entryById(data.entry).items }),
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
