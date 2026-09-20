// 我的: the style memory the stylist keeps (造型師記得的你), body profile, options, proof that it improves, my posts.
import { L } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { closetOptionsHtml, shareSignalsHtml } from "../shared/options.js";
import { openItemSheet, productTile } from "../shared/outfit.js";
import {
  favourites, journal, memoryFields, memoryStats, myPosts, prefs, profile, recordFeedback, resetPrefs, rounds,
  saveProfile, saveStyleMemory, unrecordFeedback,
} from "../shared/store.js";
import { $, BODY_TYPE_NAME, colourLabel, empty, esc, onTabOpen, options, toast } from "../shared/ui.js";
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

/** One recorded attribute as words: 「粉色」「Dress」「花紋：Leopard」. */
function attributeLabel(attr) {
  const [kind, value] = attr.split(/:(.*)/s);
  if (kind === "colour") return colourLabel(value);
  if (kind === "pattern") return L(`花紋：${value}`, `Pattern: ${value}`);
  return value;
}

/** The strongest scores, as bars. These exact numbers go to the stylist with every request (src/person.ts). */
function bars(sign) {
  const rows = Object.entries(prefs.attrs)
    .filter(([, v]) => Math.sign(v) === sign && Math.abs(v) >= 1)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5);
  if (!rows.length) return `<p class="muted">${L("尚無資料", "Nothing yet")}</p>`;
  const max = Math.max(...rows.map(([, v]) => Math.abs(v)));
  return rows.map(([attr, v]) => `<div class="hbar"><span>${esc(attributeLabel(attr))}</span>
      <div class="bar ${v < 0 ? "neg" : ""}"><i style="width:${Math.round((Math.abs(v) / max) * 100)}%"></i></div>
      <span class="muted">${v > 0 ? "+" : ""}${v.toFixed(1)}</span></div>`).join("");
}

/** What the fourth number counts: the person's most-liked colour and garment type. */
function favouriteLabel() {
  const top = favourites();
  const names = [top.colour ? colourLabel(top.colour) : null, top.type].filter(Boolean).join(L("／", " / "));
  return names
    ? L(`最近幾次推薦裡是${names}的比例`, `of recent picks are ${names}`)
    : L("最近幾次符合你的紀錄", "of recent picks match your record");
}

/** What the record adds up to: reactions, memory rewrites, and how well the last rounds matched it. */
function memoryNumbers() {
  const withMatch = rounds.filter((r) => typeof r.match === "number").slice(-5);
  const mean = withMatch.length ? withMatch.reduce((s, r) => s + r.match, 0) / withMatch.length : null;
  const scored = Object.values(prefs.attrs).filter((v) => Math.abs(v) >= 1).length;
  const cells = [
    [prefs.events, L("次回饋", "reactions")],
    [scored, L("項偏好有分數", "attributes scored")],
    [memoryStats.updates, L("次造型師更新記憶", "memory rewrites")],
    [mean === null ? "—" : `${Math.round(mean * 100)}%`, favouriteLabel()],
  ];
  return `<div class="pref-numbers">${cells.map(([n, label]) =>
    `<div><b>${esc(String(n))}</b><span class="muted">${label}</span></div>`).join("")}</div>`;
}

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
      ${memoryNumbers()}
      ${prefs.events ? `<details class="more-details"><summary class="label">${L("我的回饋數據", "My reaction scores")}</summary>
        <div class="pref-columns"><div class="stack"><div class="label">${L("常喜歡", "Often liked")}</div>${bars(1)}</div>
          <div class="stack"><div class="label">${L("常不喜歡", "Often disliked")}</div>${bars(-1)}</div></div>
        <p class="muted">${L("每按一次喜歡 +1、收藏 +1.5、買或穿過 +2、不喜歡 −1、換掉 −0.7，依顏色、款式、花紋累積。這些分數會連同上面那段話一起送給造型師。",
          "Each tap scores the garment's colour, type and pattern: like +1, save +1.5, buy or wear +2, dislike −1, swapped out −0.7. These scores go to your stylist with the paragraph above.")}</p>
      </details>` : ""}
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
    <section class="stack">${sectionTitle(L("我收藏的單品", "Items I saved"))}
      ${savedItemsHtml()}
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

/** Every product from the outfits saved to 手帳, newest first, each one only once. */
function savedItems() {
  const seen = new Set();
  return journal.flatMap((page) => page.items ?? [])
    .filter((item) => item.article_id && !item.owned && !item.whole_outfit && !seen.has(item.article_id) && seen.add(item.article_id));
}

function savedItemsHtml() {
  const items = savedItems();
  if (!items.length) {
    return `<p class="muted">${L("還沒有收藏。在「今天」按「收藏」或「用這套」，整套的單品就會出現在這裡，也會存進手帳。",
      "Nothing saved yet. Tap 收藏 or 用這套 on a look and its pieces appear here, and in your journal.")}</p>`;
  }
  return `<div class="products products-4">${items.map((item, k) =>
      productTile(item, `data-action="saved-item" data-index="${k}"`, { pressed: prefs.liked.includes(item.article_id) })).join("")}</div>
    <p class="muted">${L(`來自手帳裡收藏的 ${journal.length} 套穿搭。點一件可以看細節、按喜歡或取消。`,
      `From the ${journal.length} outfits in your journal. Tap one for details, to like it or to undo.`)}</p>`;
}

export const actions = {
  "saved-item": (data) => {
    const item = savedItems()[Number(data.index)];
    openItemSheet(item, {
      onLike: (already) => {
        if (already) {
          unrecordFeedback([item], "like");
          toast(L("已取消", "Undone"));
        } else {
          recordFeedback([item], "like");
          toast(L("記下了", "Noted"));
        }
        render();
      },
      onDislike: (already) => {
        if (already) {
          unrecordFeedback([item], "dislike");
          toast(L("已取消", "Undone"));
        } else {
          recordFeedback([item], "dislike");
          toast(L("之後會少推這種", "We'll show fewer like this"));
        }
        render();
      },
    });
  },
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
