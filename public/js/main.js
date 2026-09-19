// Boots the page. Each view module exports `init()` and an `actions` map; any element with
// data-action="name" calls actions[name](element.dataset, element) when clicked.
import { api, modelChoice } from "./shared/api.js";
import { lang, setLang, translateStatic } from "./shared/i18n.js";
import * as closetOptions from "./shared/options.js";
import * as sheet from "./shared/sheet.js";
import { $$, hydrateIcons, showTab } from "./shared/ui.js";
import * as composer from "./views/composer.js";
import * as feed from "./views/feed.js";
import * as insights from "./views/insights.js";
import * as inspo from "./views/inspo.js";
import * as journal from "./views/journal.js";
import * as profile from "./views/profile.js";
import * as progress from "./views/progress.js";
import * as search from "./views/search.js";
import * as today from "./views/today.js";
import * as wardrobe from "./views/wardrobe.js";

/** Page-level actions: the language switch and the 設計師洞察 link in the header. */
const pageActions = {
  "toggle-lang": () => setLang(lang === "en" ? "zh" : "en"),
  "open-insights": () => showTab("insights"),
};

const modules = [search, inspo, today, wardrobe, feed, journal, profile, progress, insights, sheet, closetOptions, { actions: pageActions }];
const actions = Object.assign({}, ...modules.map((module) => module.actions ?? {}));

document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const action = actions[el.dataset.action];
  if (!action) return;
  event.preventDefault();
  action(el.dataset, el);
});

translateStatic();
hydrateIcons();
$$("#tabs [data-tab]").forEach((button) => button.addEventListener("click", () => showTab(button.dataset.tab)));
modules.forEach((module) => module.init?.());
composer.setOnPosted(() => feed.refresh());

/** The model menu, a one-click switch like the language button: remembered by this browser, sent with every request. */
api.health().then(({ model, models }) => {
  const menu = $$("#modelMenu")[0];
  const current = models.includes(modelChoice.get()) ? modelChoice.get() : model;
  menu.innerHTML = models.map((m) => `<option value="${m}" ${m === current ? "selected" : ""}>${m}${m === model ? " ★" : ""}</option>`).join("");
  menu.addEventListener("change", () => modelChoice.set(menu.value));
  menu.hidden = false;
}).catch(() => {}); // no menu: requests use the server's default
