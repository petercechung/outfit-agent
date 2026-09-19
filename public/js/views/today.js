// 今天 tab: two ways to decide today's outfit — say a sentence (search.js), or start from your own clothes on the
// mannequin (mannequin.js). The clothes list itself lives in 我的 (wardrobe.js); 「今天想穿這件」 there jumps back here.
import { L } from "../shared/i18n.js";
import { closet } from "../shared/store.js";
import { $, $$, onTabOpen, showTab, toast } from "../shared/ui.js";
import * as mannequin from "./mannequin.js";
import * as wardrobe from "./wardrobe.js";

let mode = "sentence";

export function showTodayMode(next) {
  mode = next;
  $$("#todayModes [data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  $("#sentencePane").hidden = mode !== "sentence";
  $("#mannequin").hidden = mode !== "mannequin";
  if (mode === "mannequin") mannequin.render();
}

/** Puts a garment from 我的 on the mannequin and opens 今天 (「今天想穿這件」, 「救救這件」). */
export function wearToday(id, { fill = false } = {}) {
  const item = closet.find((c) => c.id === id);
  if (!item) return;
  mannequin.place(item);
  showTab("search");
  showTodayMode("mannequin");
  if (fill) mannequin.fill();
  else toast(L(`已把「${item.name}」放上人台`, `Placed "${item.name}" on the mannequin`));
}

export const actions = {
  ...mannequin.actions,
  "today-mode": (data) => showTodayMode(data.mode),
};

export function init() {
  wardrobe.setWearToday(wearToday);
  mannequin.init({
    onAddGarmentRequested: () => {
      showTab("profile");
      wardrobe.addPhoto();
    },
  });
  onTabOpen("search", () => showTodayMode(mode));
}
