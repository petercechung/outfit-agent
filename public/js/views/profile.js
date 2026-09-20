// 我的: the style memory the stylist keeps (造型師記得的你), body profile, options, proof that it improves, my posts.
import { L } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { closetOptionsHtml, shareSignalsHtml } from "../shared/options.js";
import {
  memoryFields, myPosts, prefs, profile, resetPrefs, saveProfile, saveStyleMemory,
} from "../shared/store.js";
import { $, BODY_TYPE_NAME, empty, esc, onTabOpen, options, toast } from "../shared/ui.js";
import { removeMyPost } from "./feed.js";
import { loadStudy, progressSection } from "./progress.js";
import * as wardrobe from "./wardrobe.js";

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
      <p class="muted">${L("只存在這台裝置。身高與身形是穿搭牆相似排序的主要條件；體重有填時會輔助判斷。性別與身形也會用於推薦及合身提醒。",
        "Stored only on this device. Height and body shape drive similar-build ranking; weight helps when provided. Gender and body shape also inform recommendations and fit notes.")}</p>
    </section>
    <section class="stack">${sectionTitle(L("造型師記得的你", "What your stylist remembers"))}
      <textarea class="input style-memory" id="styleMemory" rows="4" maxlength="600"
        placeholder="${L("例如：偏好日系甜美但不要太幼稚，喜歡粉色和咖啡色，不穿黑色。上班要方便騎車。", "e.g. Soft Japanese style but not childish; love pink and brown, never black. I ride a scooter to work.")}"
        aria-label="${L("造型師記得的你", "What your stylist remembers")}">${esc(memoryFields().memory)}</textarea>
      <div class="button-row"><button class="btn btn-sm btn-primary" data-action="memory-save">${L("儲存", "Save")}</button>
        <button class="btn btn-sm" data-action="memory-clear">${L("清空", "Clear")}</button>
        ${prefs.events ? `<button class="btn btn-sm" data-action="profile-reset-prefs">${L("清除回饋紀錄", "Clear my reactions")}</button>` : ""}</div>
      ${prefs.events ? `<p class="muted">${L(`你按過 ${prefs.events} 次喜歡／不喜歡／換掉，最近幾次會一起送給造型師，讓它更新上面這段話。`,
        `${prefs.events} reactions so far (likes, dislikes, swaps); the recent ones go to your stylist so it can update the paragraph above.`)}</p>` : ""}
      <p class="muted">${L("造型師會在你說出長期喜好（例如「我不穿黑色」）或對穿搭按喜歡、不喜歡後，自己更新這段話；每次推薦都會參考它。你可以直接修改或刪掉任何一句。只存在這台裝置。",
        "Your stylist updates this when you mention a lasting preference (\"I never wear black\") or react to looks, and reads it on every recommendation. Edit or delete anything. Stored only on this device.")}</p>
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
  "memory-save": () => {
    saveStyleMemory($("#styleMemory").value);
    toast(L("已儲存，下次推薦會參考", "Saved; your next recommendation will use it"));
  },
  "memory-clear": () => {
    saveStyleMemory("");
    render();
    toast(L("已清空", "Cleared"));
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
