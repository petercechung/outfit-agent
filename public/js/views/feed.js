// B · 穿搭牆: outfit photos from people, ranked so posters with a similar height come first.
import { api } from "../shared/api.js";
import { openCart } from "../shared/cart.js";
import { icon } from "../shared/icons.js";
import { productTile } from "../shared/outfit.js";
import { closeSheet, openSheet, updateSheet } from "../shared/sheet.js";
import { likedPosts, myPosts, profile, saveLikedPosts, saveMyPosts } from "../shared/store.js";
import { $, BODY_TYPE_NAME, COLOUR_NAME, currentTab, empty, esc, formatPrice, loading, notice, OCCASION_NAME, onTabOpen, showTab, toast } from "../shared/ui.js";
import { openComposer } from "./composer.js";
import { addToJournal } from "./journal.js";

let sort = null; // "similar" | "latest"; defaults once the tab opens
let posts = [];
let nextOffset = null;
let status = "idle"; // idle | loading | error
let filtersOpen = false;
const filters = { price: null, colours: new Set(), seasons: new Set(), occasions: new Set() };

const SEASON_NAME = { warm: "春夏", cool: "秋冬" };
const PRICE_OPTIONS = [["1500", "NT$1,500 以下"], ["3000", "NT$3,000 以下"], ["5000", "NT$5,000 以下"]];

const bodyText = (p) => [p.height_cm && `${p.height_cm}cm`, p.weight_kg && `${p.weight_kg}kg`, BODY_TYPE_NAME[p.body_type]].filter(Boolean).join(" · ");

async function load({ append = false } = {}) {
  sort ??= profile.height_cm ? "similar" : "latest";
  status = "loading";
  if (!append) posts = [];
  render();
  try {
    const page = await api.feed.list({
      sort, height_cm: profile.height_cm, weight_kg: profile.weight_kg, body_type: profile.body_type, offset: append ? posts.length : 0,
    });
    posts = append ? [...posts, ...page.posts] : page.posts;
    nextOffset = page.next_offset;
    status = "idle";
  } catch {
    status = "error";
  }
  render();
}

const itemColours = (post) => new Set((post.items ?? []).map((item) => item.colour_master).filter(Boolean));
const postSeasons = (post) => {
  const values = new Set([post.season, ...(post.items ?? []).map((item) => item.season)].filter(Boolean));
  if (values.has("all")) values.add("warm").add("cool");
  for (const item of post.items ?? []) {
    if (Number(item.warmth) >= 2) values.add("cool");
    if (item.warmth != null && Number(item.warmth) <= 0) values.add("warm");
  }
  if (/(春天|夏天|炎熱|海邊|spring|summer|beach)/i.test(post.caption ?? "")) values.add("warm");
  if (/(秋天|冬天|寒冷|保暖|autumn|fall|winter|cold)/i.test(post.caption ?? "")) values.add("cool");
  return values;
};
const intersects = (selected, values) => !selected.size || [...selected].some((value) => values.has(value));
const similarityDistance = (post) => {
  if (!profile.height_cm) return 0;
  let distance = post.height_cm ? Math.abs(profile.height_cm - post.height_cm) : 1000;
  if (profile.body_type && post.body_type && profile.body_type !== post.body_type) distance += 20;
  if (profile.weight_kg && post.weight_kg) distance += Math.abs(profile.weight_kg - post.weight_kg) * 0.35;
  return distance;
};
const visiblePosts = () => posts.filter((post) => {
  if (filters.price && Number(post.total_price) > filters.price) return false;
  if (!intersects(filters.colours, itemColours(post))) return false;
  if (!intersects(filters.seasons, postSeasons(post))) return false;
  if (filters.occasions.size && !filters.occasions.has(post.occasion)) return false;
  return true;
}).sort((a, b) => sort === "similar" ? similarityDistance(a) - similarityDistance(b) : 0);
const activeFilterCount = () => Number(Boolean(filters.price)) + filters.colours.size + filters.seasons.size + filters.occasions.size;

function filterChips(kind, labels, selected) {
  return Object.entries(labels).map(([value, label]) => `<button class="chip" data-action="feed-filter" data-kind="${kind}" data-value="${esc(value)}"
    aria-pressed="${selected.has(value)}">${esc(label)}</button>`).join("");
}

function filtersHtml() {
  if (!filtersOpen) return "";
  const prices = Object.fromEntries(PRICE_OPTIONS);
  return `<div class="feed-filters">
    <div class="filter-group"><span class="label">價格</span><div class="chips">
      ${Object.entries(prices).map(([value, label]) => `<button class="chip" data-action="feed-price" data-value="${value}" aria-pressed="${filters.price === Number(value)}">${label}</button>`).join("")}
    </div></div>
    <div class="filter-group"><span class="label">顏色（可複選）</span><div class="chips chips-wrap">${filterChips("colours", COLOUR_NAME, filters.colours)}</div></div>
    <div class="filter-group"><span class="label">季節（可複選）</span><div class="chips chips-wrap">${filterChips("seasons", SEASON_NAME, filters.seasons)}</div></div>
    <div class="filter-group"><span class="label">場合（可複選）</span><div class="chips chips-wrap">${filterChips("occasions", OCCASION_NAME, filters.occasions)}</div></div>
    ${activeFilterCount() ? `<button class="btn btn-sm" data-action="feed-clear-filters">清除全部篩選</button>` : ""}
  </div>`;
}

function card(post) {
  return `<button class="post-card" data-action="feed-open" data-id="${esc(post.id)}">
    <span class="post-image"><img src="${esc(post.image)}" alt="" loading="lazy">
      <span class="badges">${post.similar ? `<span class="badge badge-good">身形相近</span>` : ""}${post.is_sample ? `<span class="badge">AI 示意</span>` : ""}</span></span>
    <span class="post-meta"><strong>${esc(bodyText(post) || "未提供身形")}</strong><span class="muted">${post.likes} 喜歡</span></span>
    ${post.caption ? `<span class="post-caption">${esc(post.caption)}</span>` : ""}
    ${post.items.length ? `<span class="post-meta"><span class="muted">${post.items.length} 件可買</span><span class="price">${formatPrice(post.total_price)}</span></span>` : ""}
  </button>`;
}

function render() {
  const mine = bodyText(profile);
  const visible = visiblePosts();
  $("#feed").innerHTML = `<div class="stack">
    <div class="section-title"><h1 class="display page-title">穿搭牆</h1></div>
    <p class="muted">瀏覽其他使用者的穿搭手帳、掌握最新潮流。設定身高與身形後，會優先顯示和你相近的人；體重有填時也會輔助排序。</p>
    <div class="feed-toolbar">
      <div class="segmented">
        <button data-action="feed-sort" data-sort="similar" aria-pressed="${sort === "similar"}">身形相近</button>
        <button data-action="feed-sort" data-sort="latest" aria-pressed="${sort === "latest"}">最新</button>
      </div>
      <div class="button-row">
        <button class="btn btn-sm" data-action="feed-toggle-filters" aria-expanded="${filtersOpen}">${icon("sliders")}篩選${activeFilterCount() ? `（${activeFilterCount()}）` : ""}</button>
        <button class="btn btn-sm" data-action="feed-edit-profile">${icon("ruler")}${mine ? `我的身形：${esc(mine)}` : "設定我的身形"}</button>
      </div>
    </div>
    ${filtersHtml()}
    ${sort === "similar" && !profile.height_cm ? notice("先在「我的」設定身高，才能把身形相近的人排在前面。", "warn") : ""}
    ${status === "loading" && !posts.length ? loading("載入穿搭中…") : ""}
    ${status === "error" ? notice("載入失敗，請稍後再試。", "warn") : ""}
    ${status === "idle" && !posts.length ? empty("還沒有人發文，成為第一個分享穿搭的人吧。") : ""}
    ${posts.length && !visible.length ? empty("目前載入的穿搭沒有符合條件；可以清除部分篩選或載入更多。") : ""}
    ${visible.length ? `<p class="muted">目前顯示 ${visible.length} 套穿搭</p><div class="feed-grid">${visible.map(card).join("")}</div>` : ""}
    ${nextOffset !== null && status === "idle" ? `<button class="btn btn-block" data-action="feed-more">載入更多</button>` : ""}
  </div>
  <button class="btn btn-primary fab" data-action="feed-new">${icon("plus")}發佈穿搭</button>`;
}

function postDetail(post) {
  const mine = myPosts.some((p) => p.id === post.id);
  const liked = likedPosts.has(post.id);
  return `<img class="post-photo" src="${esc(post.image)}" alt="穿搭照">
    ${post.is_sample ? notice("這是 AI 生成的示意照片，不是真人穿搭，用來展示穿搭牆的樣子。") : ""}
    <div class="post-meta"><strong>${esc(bodyText(post) || "未提供身形")}</strong>
      <span class="muted">${[OCCASION_NAME[post.occasion], new Date(post.created_at).toLocaleDateString()].filter(Boolean).join(" · ")}</span></div>
    ${post.caption ? `<p>${esc(post.caption)}</p>` : ""}
    ${post.owned_items.length ? `<p class="muted">自己的衣服：${esc(post.owned_items.join("、"))}</p>` : ""}
    ${post.items.length ? `<div class="label">照片裡買得到的單品</div>
      <div class="products products-4">${post.items.map((item) => productTile(item, 'tabindex="-1"')).join("")}</div>
      <div class="total-row"><div class="amount"><span class="label">Total</span><span class="price price-lg">${formatPrice(post.total_price)}</span></div></div>` : ""}
    <div class="button-row">
      <button class="btn" data-action="sheet" data-handler="like" ${liked ? "disabled" : ""}>${icon("heart")}${liked ? "已喜歡" : "喜歡"}（${post.likes}）</button>
      <button class="btn" data-action="sheet" data-handler="save">${icon("bookmark")}存進手帳</button>
      ${post.items.length ? `<button class="btn btn-primary" data-action="sheet" data-handler="buy">${icon("bag")}買整套</button>` : ""}
    </div>
    ${mine
      ? `<button class="btn btn-block" data-action="sheet" data-handler="delete">${icon("trash")}刪除我的這篇</button>`
      : `<button class="btn-text muted" data-action="sheet" data-handler="report">${icon("flag", 14)} 檢舉不當內容</button>`}`;
}

function openPost(post) {
  openSheet({
    title: "穿搭",
    html: postDetail(post),
    handlers: {
      like: async () => {
        try {
          post.likes = (await api.feed.like(post.id)).likes;
          likedPosts.add(post.id);
          saveLikedPosts();
          updateSheet(postDetail(post));
          render();
        } catch (error) {
          toast(error.message);
        }
      },
      save: () => addToJournal(post.caption || "穿搭牆收藏", [{
        article_id: `feed:${post.id}`, name: post.caption || "穿搭牆收藏", image: post.image, owned: true, whole_outfit: true,
      }], { kind: "saved", occasion: post.occasion }),
      buy: () => openCart(post.items),
      delete: async () => {
        if (!confirm("確定刪除這篇穿搭？")) return;
        await removeMyPost(post.id);
        closeSheet();
      },
      report: () => updateSheet(`<p>這篇穿搭有不當內容嗎？被多人檢舉後會自動隱藏。</p>
        <div class="button-row"><button class="btn" data-action="sheet" data-handler="cancel-report">取消</button>
        <button class="btn btn-dark" data-action="sheet" data-handler="confirm-report">${icon("flag")}確定檢舉</button></div>`),
      "cancel-report": () => updateSheet(postDetail(post)),
      "confirm-report": async () => {
        try {
          await api.feed.report(post.id);
          toast("已收到檢舉，謝謝你");
        } catch (error) {
          toast(error.message);
        }
        closeSheet();
      },
    },
  });
}

/** Deletes a post made from this browser (the delete token proves it). Used by 我的 too. */
export async function removeMyPost(id) {
  const mine = myPosts.find((p) => p.id === id);
  if (!mine) return;
  try {
    await api.feed.remove(id, mine.delete_token);
  } catch (error) {
    if (!/找不到/.test(error.message)) return toast(error.message); // already gone: just forget it locally
  }
  myPosts.splice(myPosts.indexOf(mine), 1);
  saveMyPosts();
  posts = posts.filter((p) => p.id !== id);
  if (currentTab() === "feed") render();
  toast("已刪除這篇穿搭");
}

/** Reloads the feed if it is the visible tab. */
export const refresh = () => currentTab() === "feed" && load();

export const actions = {
  "feed-sort": (data) => { sort = data.sort; load(); },
  "feed-toggle-filters": () => { filtersOpen = !filtersOpen; render(); },
  "feed-price": (data) => { filters.price = filters.price === Number(data.value) ? null : Number(data.value); render(); },
  "feed-filter": (data) => {
    const selected = filters[data.kind];
    if (selected.has(data.value)) selected.delete(data.value);
    else selected.add(data.value);
    render();
  },
  "feed-clear-filters": () => {
    filters.price = null;
    filters.colours.clear();
    filters.seasons.clear();
    filters.occasions.clear();
    render();
  },
  "feed-more": () => load({ append: true }),
  "feed-open": (data) => openPost(posts.find((p) => p.id === data.id)),
  "feed-new": () => openComposer(),
  "feed-edit-profile": () => showTab("profile"),
};

export function init() {
  onTabOpen("feed", () => load());
}
