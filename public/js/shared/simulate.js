// Simulated shoppers with a hidden taste, for checking that the feedback loop really learns (可變強).
// Each round a shopper asks for an outfit, likes the items that match their taste, dislikes the ones they avoid,
// and asks again. The hit rate is the share of shown items they like. Used live in 我的 → 進步驗證 and at scale by
// scripts/eval-loop.mjs, so both report the same thing.
import { applyFeedback, emptyPrefs } from "./feedback.js";

/** Hidden tastes. Colours are catalog colour_master values, types are product_type_name values. */
export const PERSONAS = [
  { name: "米色控", likes: { colour: ["Beige"], type: [] }, avoids: ["Black"] },
  { name: "洋裝派", likes: { colour: [], type: ["Dress"] }, avoids: ["Red"] },
  { name: "藍色系", likes: { colour: ["Blue"], type: [] }, avoids: ["Pink"] },
  { name: "甜美粉", likes: { colour: ["Pink"], type: ["Skirt"] }, avoids: ["Black"] },
  { name: "黑白極簡", likes: { colour: ["Black", "White"], type: [] }, avoids: ["Yellow", "Orange", "Red"] },
  { name: "裙裝派", likes: { colour: [], type: ["Skirt", "Blouse"] }, avoids: ["Grey"] },
  { name: "大地色", likes: { colour: ["Brown", "Khaki green"], type: [] }, avoids: ["Pink"] },
  { name: "襯衫控", likes: { colour: ["White"], type: ["Shirt"] }, avoids: ["Lilac Purple"] },
];

/** Everyday requests the shoppers cycle through (parsed by keyword rules, so no language model is involved). */
export const SENTENCES = ["日常穿搭", "週末跟朋友逛街", "上班通勤穿搭", "約會穿搭", "上課穿搭"];

/**
 * Policies compared:
 *   none     – feedback is ignored (what you'd get without the loop)
 *   greedy   – feedback is used, every look shows the best-known taste
 *   thompson – feedback is used and the last look explores (Thompson sampling)
 */
export const POLICIES = ["none", "greedy", "thompson"];

/** +1 the shopper likes the item, -1 they avoid its colour, 0 indifferent. */
export function judge(persona, item) {
  if (persona.avoids.includes(item.colour_master)) return -1;
  return persona.likes.colour.includes(item.colour_master) || persona.likes.type.includes(item.type) ? 1 : 0;
}

/**
 * Runs one shopper for `rounds` rounds and returns the hit rate of each round.
 * `recommend(body)` calls POST /api/recommend and resolves with its JSON.
 */
export async function simulateShopper(recommend, persona, { rounds, policy, seed = 1, offset = 0 }) {
  const prefs = emptyPrefs();
  const curve = [];
  for (let r = 0; r < rounds; r++) {
    const body = { text: SENTENCES[(r + offset) % SENTENCES.length], use_llm: false, share_signals: false };
    if (policy !== "none") body.prefs = prefs;
    if (policy === "thompson") Object.assign(body, { explore: true, explore_seed: seed * 1000 + r });
    const result = await recommend(body);
    const items = result.outfits.flatMap((o) => o.items).filter((i) => !i.owned);
    const verdicts = items.map((item) => judge(persona, item));
    curve.push(items.length ? verdicts.filter((v) => v > 0).length / items.length : 0);
    items.forEach((item, k) => {
      if (verdicts[k] > 0) applyFeedback(prefs, [item], "like");
      if (verdicts[k] < 0) applyFeedback(prefs, [item], "dislike");
    });
  }
  return curve;
}

/** Mean and 95% confidence half-width of a list of numbers. */
export function meanCi(xs) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length - 1));
  return { mean, ci: xs.length > 1 ? (1.96 * sd) / Math.sqrt(xs.length) : 0 };
}

/** Mean and 95% confidence half-width per round across shoppers. */
export function summarize(curves) {
  const rounds = curves[0]?.length ?? 0;
  return Array.from({ length: rounds }, (_, r) => meanCi(curves.map((c) => c[r])));
}
