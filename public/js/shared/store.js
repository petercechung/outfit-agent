// Everything a person creates stays in their own browser (localStorage): feedback profile, body profile,
// journal, closet, and the delete tokens of their 穿搭牆 posts. On the server: 穿搭牆 posts, and — unless the
// person turns it off in 我的 — anonymous request and feedback signals for 設計師洞察 (see js/shared/signals.js).
import { applyFeedback, emptyPrefs, POSITIVE_ACTIONS } from "./feedback.js";
import { queueEvents } from "./signals.js";

const MAX_LOG = 300; // feedback actions kept for 進步驗證
const MAX_ROUNDS = 30; // result rounds kept for the learning curve

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Returns false when the browser refuses (private mode, storage full). */
function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Sent with every search: liked/disliked article ids and per-attribute affinity ("colour:Pink": 2.5). */
export const prefs = load("prefs", emptyPrefs());
/** Height and body type the person chose to share; used for fit notes and 穿搭牆 ranking. */
export const profile = load("profile", { gender: null, height_cm: null, body_type: null });
/** [{id, ts, text, note, wear, layout: {article_id: {x, y, r}}, items: [ItemView]}] */
export const journal = load("journal", []);
/** [{id, name, slot, type, colour_master, colour, pattern, warmth, formality, gender, description, vec, image, ts}] */
export const closet = load("closet", []);
/** [{id, delete_token, caption, created_at}] posts made from this browser */
export const myPosts = load("myPosts", []);
export const likedPosts = new Set(load("likedPosts", []));
/** Closet features are off by default (js/shared/options.js); sharing anonymous signals is on and can be turned off. */
export const settings = { useCloset: false, warnSimilar: false, shareSignals: true, ...load("settings", {}) };
/** 個人風格檔案: lasting likes/avoids the person stated (「我不穿黑色」, a colour picked on a disliked look). */
export const styleProfile = { colors_prefer: [], colors_avoid: [], types_prefer: [], types_avoid: [], ...load("styleProfile", {}) };
/** [{article_id, action}] every feedback action, oldest first: what 我的 → 進步驗證 checks. */
export const feedbackLog = load("feedbackLog", []);
/** [{ts, looks: [[article_id]], hits: [look index]}] each result shown and which looks got positive feedback. */
export const rounds = load("rounds", []);

export const saveProfile = () => persist("profile", profile);
export const saveJournal = () => persist("journal", journal);
export const saveCloset = () => persist("closet", closet);
export const saveMyPosts = () => persist("myPosts", myPosts);
export const saveLikedPosts = () => persist("likedPosts", [...likedPosts]);
export const saveSettings = () => persist("settings", settings);

/** The garment as the API expects it: the photo never leaves the browser. */
export function closetItemPayload(item) {
  const { image, ts, brand, size, season, occasions, price, bought, ...garment } = item; // details stay local
  return garment;
}

/**
 * Request fields for the optional closet features. Empty when both options are off or the closet is empty,
 * so a recommendation request stays exactly as before. `placedIds` are garments already on the mannequin.
 */
export function closetOptionFields(placedIds = []) {
  if (!closet.length || !(settings.useCloset || settings.warnSimilar)) return {};
  return {
    closet_pool: closet.filter((item) => !placedIds.includes(item.id)).map(closetItemPayload),
    closet_options: { use_closet: settings.useCloset, warn_similar: settings.warnSimilar },
  };
}

/** Owned garments come back without a photo (it never left the browser); put the closet photo back. */
export function attachClosetPhotos(result) {
  for (const outfit of result.outfits) {
    for (const item of outfit.items) {
      if (item.owned) item.image = closet.find((c) => `closet:${c.id}` === item.article_id)?.image ?? "";
    }
  }
  return result;
}

const OPPOSITE = { colors_prefer: "colors_avoid", colors_avoid: "colors_prefer", types_prefer: "types_avoid", types_avoid: "types_prefer" };

/** Adds lasting preferences; a new like cancels an old avoid of the same thing, and the other way round. */
export function updateStyleProfile(delta) {
  for (const [key, opposite] of Object.entries(OPPOSITE)) {
    for (const value of delta[key] ?? []) {
      if (!styleProfile[key].includes(value)) styleProfile[key].push(value);
      styleProfile[opposite] = styleProfile[opposite].filter((v) => v !== value);
    }
  }
  persist("styleProfile", styleProfile);
}

export function removeFromStyleProfile(key, value) {
  styleProfile[key] = styleProfile[key].filter((v) => v !== value);
  persist("styleProfile", styleProfile);
}

export const styleProfileEmpty = () => Object.keys(OPPOSITE).every((key) => !styleProfile[key].length);

/** Sent with every recommendation: the style profile, only when it has something in it. */
export const profileFields = () => (styleProfileEmpty() ? {} : { style_profile: styleProfile });

/** Request fields for the feedback loop: an exploration look, and whether the request may be logged anonymously. */
export const loopFields = () => ({ explore: true, share_signals: settings.shareSignals });

let currentOccasion = null; // occasion of the results on screen, attached to feedback for 設計師洞察

/** Remembers a result the person was shown, for the learning curve in 進步驗證. */
export function recordRound(result) {
  currentOccasion = result.intent.occasion;
  const looks = result.outfits.map((o) => o.items.filter((i) => !i.owned).map((i) => i.article_id));
  if (!looks.length) return;
  rounds.push({ ts: Date.now(), looks, hits: [] });
  rounds.splice(0, Math.max(0, rounds.length - MAX_ROUNDS));
  persist("rounds", rounds);
}

/** Positive feedback marks the looks of the latest round it came from as hits. */
function markHits(items) {
  const ids = new Set(items.map((i) => i.article_id));
  for (let r = rounds.length - 1; r >= 0; r--) {
    const hit = rounds[r].looks.map((look, k) => (look.some((id) => ids.has(id)) ? k : -1)).filter((k) => k >= 0);
    if (hit.length) {
      rounds[r].hits = [...new Set([...rounds[r].hits, ...hit])];
      persist("rounds", rounds);
      return;
    }
  }
}

/** Updates the feedback profile from an action on catalog items. The person's own clothes are ignored. */
export function recordFeedback(items, action) {
  applyFeedback(prefs, items, action);
  persist("prefs", prefs);
  const catalogItems = items.filter((i) => !i.owned);
  feedbackLog.push(...catalogItems.map((i) => ({ article_id: i.article_id, action })));
  feedbackLog.splice(0, Math.max(0, feedbackLog.length - MAX_LOG));
  persist("feedbackLog", feedbackLog);
  if (POSITIVE_ACTIONS.has(action)) markHits(catalogItems);
  if (settings.shareSignals) queueEvents(catalogItems.map((i) => ({ article_id: i.article_id, action, occasion: currentOccasion })));
}

export function resetPrefs() {
  Object.assign(prefs, emptyPrefs());
  feedbackLog.length = 0;
  rounds.length = 0;
  persist("prefs", prefs);
  persist("feedbackLog", feedbackLog);
  persist("rounds", rounds);
}
