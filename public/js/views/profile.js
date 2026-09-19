// 我的: body profile, options, what the feedback profile has learnt, proof that it improves, and my posts.
import { L } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { closetOptionsHtml, shareSignalsHtml } from "../shared/options.js";
import {
  myPosts, prefs, profile, removeFromStyleProfile, resetPrefs, saveProfile, styleProfile, styleProfileEmpty,
} from "../shared/store.js";
import { $, BODY_TYPE_NAME, colourLabel, empty, esc, onTabOpen, options, toast } from "../shared/ui.js";
import { removeMyPost } from "./feed.js";
import { loadStudy, progressSection } from "./progress.js";
import * as wardrobe from "./wardrobe.js";

function attributeLabel(attr) {
  const [kind, value] = attr.split(/:(.*)/s);
  if (kind === "colour") return colourLabel(value);
  if (kind === "pattern") return L(`花紋：${value}`, `Pattern: ${value}`);
  return value;
}

function bars(sign) {
  const rows = Object.entries(prefs.attrs)
    .filter(([, v]) => Math.sign(v) === sign)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 6);
  if (!rows.length) return `<p class="muted">${L("尚無資料", "Nothing yet")}</p>`;
  const max = Math.max(...rows.map(([, v]) => Math.abs(v)));
  return rows.map(([attr, v]) => `<div class="hbar"><span>${esc(attributeLabel(attr))}</span>
      <div class="bar ${v < 0 ? "neg" : ""}"><i style="width:${Math.round((Math.abs(v) / max) * 100)}%"></i></div>
      <span class="muted">${v.toFixed(1)}</span></div>`).join("");
}

const STYLE_GROUPS = [
  ["colors_prefer", L("喜歡的顏色", "Colours I like"), colourLabel],
  ["colors_avoid", L("避開的顏色", "Colours I avoid"), colourLabel],
  ["types_prefer", L("喜歡的款式", "Pieces I like"), (t) => t],
  ["types_avoid", L("避開的款式", "Pieces I avoid"), (t) => t],
];

/** 個人風格檔案: what the person has told us they like or avoid. Each entry can be removed. */
function styleProfileHtml() {
  if (styleProfileEmpty()) {
    return `<p class="muted">${L("還是空的。在推薦結果按 ♡ 或 ✕ 再選「哪裡」，或回饋時說「我不穿黑色」，就會記在這裡。",
      "Empty for now. Tap ♡ or ✕ on a look and pick what you mean, or say \"I never wear black\" in feedback.")}</p>`;
  }
  return STYLE_GROUPS.filter(([key]) => styleProfile[key].length).map(([key, label, format]) => `<div class="profile-row">
      <span class="label">${label}</span>
      <div class="chips">${styleProfile[key].map((value) =>
        `<button class="chip" data-action="style-remove" data-key="${key}" data-value="${esc(value)}" aria-label="${L("移除", "Remove")} ${esc(format(value))}">${esc(format(value))} ×</button>`).join("")}</div>
    </div>`).join("");
}

const GENDERS = L(
  { unspecified: "不指定", female: "女性", male: "男性", nonbinary: "無性別" },
  { unspecified: "Not specified", female: "Female", male: "Male", nonbinary: "Non-binary / genderless" },
);
/** Optional measurements: [profile key, label, min, max]. */
const MEASUREMENTS = [
  ["weight_kg", L("體重 (kg)", "Weight (kg)"), 30, 200],
  ["chest_cm", L("胸寬／胸圍 (cm)", "Chest (cm)"), 50, 160],
  ["waist_cm", L("腰圍 (cm)", "Waist (cm)"), 40, 160],
  ["shoulder_cm", L("肩寬 (cm)", "Shoulder width (cm)"), 25, 70],
  ["sleeve_cm", L("袖長 (cm)", "Sleeve length (cm)"), 30, 90],
];
const RANGES = { height_cm: [120, 210], ...Object.fromEntries(MEASUREMENTS.map(([key, , min, max]) => [key, [min, max]])) };

const sectionTitle = (title) => `<div class="section-title"><h2 class="display">${title}</h2><span class="rule"></span></div>`;
const numberField = (key, label) => `<label class="field"><span class="label">${label}</span>
  <input class="input" data-profile="${key}" type="number" inputmode="numeric" min="${RANGES[key][0]}" max="${RANGES[key][1]}" value="${profile[key] ?? ""}"></label>`;

function render() {
  loadStudy();
  $("#profile").innerHTML = `<div class="stack">
    <section class="stack">${sectionTitle(L("我的資料", "About me"))}
      <div class="form-grid">
        <label class="field"><span class="label">${L("性別", "Gender")}</span>
          <select class="select" data-profile="gender">${options(GENDERS, profile.gender ?? "unspecified")}</select></label>
        ${numberField("height_cm", L("身高 (cm)", "Height (cm)"))}
        <label class="field"><span class="label">${L("身形", "Body shape")}</span>
          <select class="select" data-profile="body_type"><option value="">${L("不提供", "Prefer not to say")}</option>${options(BODY_TYPE_NAME, profile.body_type)}</select></label>
      </div>
      <details class="more-details"><summary class="label">${L("更多身材資訊（選填）", "More measurements (optional)")}</summary>
        <div class="form-grid">${MEASUREMENTS.map(([key, label]) => numberField(key, label)).join("")}</div>
      </details>
      <p class="muted">${L("只存在這台裝置。性別與身形用在推薦（句子沒說時）、合身提醒，以及把身形相近的穿搭排在前面。",
        "Stored only on this device. Gender and body shape are used for recommendations (when your sentence doesn't say), fit notes, and showing people with a similar build first.")}</p>
    </section>
    <section class="stack">${sectionTitle(L("個人風格檔案", "Style profile"))}
      ${styleProfileHtml()}
      <p class="muted">${L("避開的顏色與款式不會再出現在推薦裡（除非你在那句話裡指定要）；喜歡的會優先。只存在這台裝置。",
        "Avoided colours and pieces won't be recommended (unless your sentence asks for them); liked ones come first. Stored only on this device.")}</p>
    </section>
    <section class="stack">${sectionTitle(L("推薦選項", "Recommendation options"))}
      ${closetOptionsHtml()}
      <p class="muted">${L("預設都是關閉的。打開後，推薦時會把你的衣櫃資料（不含照片）一起送出。", "Off by default. When on, your closet (without photos) is sent with each request.")}</p>
      ${shareSignalsHtml()}
      <p class="muted">${L("預設開啟。只送出去識別化的需求句子（電話、email、名字等會被移除）和你對商品的回饋，不含帳號、裝置或照片，30 天後刪除。設計師用它決定開什麼款、備什麼料（見「設計師洞察」）。",
        "On by default. Only your request with personal details removed (phones, emails, names…) and your reactions to products are sent — no account, device or photos — and deleted after 30 days. Designers use it to decide what to make (see For designers).")}</p>
      <p class="muted">${L("測試期間另外會完整記錄你輸入的句子、回饋和推薦結果（連同測試者名稱與這台瀏覽器的代號），供開發團隊檢查效果；這項紀錄無法在這裡關閉。",
        "While we test, your sentences, feedback and results are also recorded in full (with your tester name and this browser's id) so the team can check the results; this cannot be turned off here.")}</p>
    </section>
    <section class="stack">${sectionTitle(L("系統學到的偏好", "What the system learnt"))}
      <p class="muted">${L(`已累積 ${prefs.events} 次回饋（喜歡、不喜歡、換掉、收藏、購買、穿過），每次搜尋都會一起送出，用來重新排序推薦。`,
        `${prefs.events} reactions so far (likes, dislikes, swaps, saves, purchases, wears). They're sent with every search to re-rank recommendations.`)}</p>
      <div class="pref-columns"><div class="stack"><div class="label">${L("常喜歡", "Often liked")}</div>${bars(1)}</div>
        <div class="stack"><div class="label">${L("常不喜歡", "Often disliked")}</div>${bars(-1)}</div></div>
      <div><button class="btn btn-sm" data-action="profile-reset-prefs">${L("清除偏好", "Clear")}</button></div>
    </section>
    <section class="stack">${sectionTitle(L("進步驗證", "Is it getting better?"))}
      ${progressSection()}
    </section>
    <section class="stack">${sectionTitle(L("我的發文", "My posts"))}
      ${myPosts.length ? `<ul class="my-posts">${myPosts.map((post) => `<li>
          <img src="/feed-images/${esc(post.id)}.jpg" alt="">
          <div><div>${esc(post.caption || L("（沒有文字）", "(no caption)"))}</div><div class="muted">${new Date(post.created_at).toLocaleDateString()}</div></div>
          <button class="icon-btn" data-action="profile-delete-post" data-id="${esc(post.id)}" aria-label="${L("刪除這篇", "Delete post")}">${icon("trash")}</button>
        </li>`).join("")}</ul>` : empty(L("還沒有發文。", "No posts yet."))}
    </section>
  </div>`;
}

export const actions = {
  "style-remove": (data) => {
    removeFromStyleProfile(data.key, data.value);
    render();
  },
  "profile-reset-prefs": () => {
    resetPrefs();
    render();
    toast(L("偏好已清除", "Preferences cleared"));
  },
  "profile-delete-post": async (data) => {
    if (!confirm(L("確定刪除這篇穿搭？", "Delete this post?"))) return;
    await removeMyPost(data.id);
    render();
  },
};

export function init() {
  onTabOpen("profile", () => {
    wardrobe.render();
    render();
  });
  $("#profile").addEventListener("change", (event) => {
    const key = event.target.dataset?.profile;
    if (!key) return;
    if (key in RANGES) {
      const value = Number(event.target.value);
      const [min, max] = RANGES[key];
      profile[key] = value >= min && value <= max ? Math.round(value) : null;
    } else {
      profile[key] = event.target.value && event.target.value !== "unspecified" ? event.target.value : null;
    }
    saveProfile();
    toast(L("已更新", "Updated"));
  });
}
