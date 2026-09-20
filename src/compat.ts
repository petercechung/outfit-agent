// The v1 page (public/, copied from outfit.cechung.com) speaks v1's API. This file translates between that
// shape and the v2 pipeline, so the page can stay exactly as it was while everything behind it is new.
//
//   request  {text} or {refine: {previous_intent, text, adjust}}  →  sentence + context for the stylist
//   response RecommendResult (pipeline.ts)                       →  v1 RecommendResponse (intent, outfits, …)
import type { SearchHit } from "./contracts";
import type { LookView, RecommendResult } from "./pipeline";

type Lang = "zh" | "en";
const tr = (lang: Lang, zh: string, en: string) => (lang === "en" ? en : zh);

const SLOT_NAME: Record<string, [string, string]> = {
  top: ["上衣", "Top"], bottom: ["下身", "Bottom"], onepiece: ["連身款", "One-piece"], outer: ["外套", "Outerwear"],
  shoes: ["鞋子", "Shoes"], bag: ["包包", "Bag"],
};

/** What v1's refine chips mean, in words the stylist reads. */
const ADJUST_WORDS: Record<string, [string, string]> = {
  lower: ["再便宜一點", "cheaper"], higher: ["可以貴一點、質感好一點", "a bit more upmarket"],
  "1": ["正式一點", "more formal"], "-1": ["休閒一點", "more casual"],
};

export interface V1Request {
  text?: string;
  lang?: string;
  stream?: boolean; // answer as a stream of progress lines (src/routes/recommend.ts)
  tester?: string; // who is testing, from a ?tester= link (src/history.ts)
  client_id?: string; // a random id this browser keeps
  model?: string; // one of config.ts MODELS, from the page's model menu
  memory?: string; // the person's style memory (src/person.ts), kept in their browser
  reactions?: string[]; // their likes/dislikes on looks since the memory was last updated
  profile?: unknown; // 我的資料: gender, height, body shape…
  closet_items?: unknown; // garments on the mannequin (從我的衣服搭)
  closet_pool?: unknown; // the rest of their wardrobe, when 優先用我的衣櫃 is on
  closet_options?: unknown; // {use_closet, warn_similar}
  refine?: { previous_intent?: { raw_text?: unknown }; text?: string; adjust?: Record<string, unknown> };
}

/** The sentence the stylist should answer, and what came before it on a refine turn. */
export function fromV1Request(body: V1Request): { sentence: string; context: string; feedback: string | null; lang: Lang } {
  const lang: Lang = body.lang === "en" ? "en" : "zh";
  if (!body.refine) return { sentence: String(body.text ?? "").trim(), context: "", feedback: null, lang };
  const original = typeof body.refine.previous_intent?.raw_text === "string" ? body.refine.previous_intent.raw_text : "";
  const adjust = body.refine.adjust ?? {};
  const said: string[] = [];
  if (typeof adjust.budget === "string" || typeof adjust.budget === "number") said.push(ADJUST_WORDS[String(adjust.budget)]?.[lang === "en" ? 1 : 0] ?? `預算 NT$${adjust.budget}`);
  if (typeof adjust.formality === "number") said.push(ADJUST_WORDS[String(adjust.formality)]?.[lang === "en" ? 1 : 0] ?? "");
  if (adjust.change_colour) said.push(tr(lang, "換個顏色", "different colours"));
  if (adjust.pattern_max === 0) said.push(tr(lang, "不要花紋", "no pattern"));
  for (const t of (adjust.types_avoid as string[] | undefined) ?? []) said.push(tr(lang, `不要 ${t}`, `no ${t}`));
  for (const t of (adjust.types_prefer as string[] | undefined) ?? []) said.push(tr(lang, `想要 ${t}`, `wants ${t}`));
  if (body.refine.text?.trim()) said.push(body.refine.text.trim());
  const feedback = said.filter(Boolean).join(tr(lang, "，", ", "));
  return {
    sentence: original ? `${original}（${tr(lang, "回饋", "feedback")}：${feedback}）` : feedback,
    context: original ? `Earlier the person asked: 「${original}」. They saw your looks and now give feedback. Keep what they asked for and change only what the feedback says.` : "",
    feedback: feedback || null,
    lang,
  };
}

interface V1Item {
  article_id: string; name: string; type: string; slot: string; slot_zh: string; colour: string; colour_master: string;
  pattern: string; price: number; desc: string; image: string; fit_note: null; score: number; intent_pct: null; pref: number;
  owned?: true; // one of their own clothes; the page puts the photo back (js/shared/store.js)
  similar_owned?: { id: string; name: string };
  alternates: V1Item[];
}

function itemView(hit: SearchHit, lang: Lang, alternates: SearchHit[] = [], similar: { id: string; name: string } | null = null): V1Item {
  return {
    article_id: hit.article_id, name: hit.name, type: hit.type, slot: hit.slot,
    slot_zh: SLOT_NAME[hit.slot]?.[lang === "en" ? 1 : 0] ?? hit.slot, colour: hit.colour, colour_master: hit.colour_master,
    pattern: hit.pattern, price: hit.price, desc: hit.description, image: hit.image, fit_note: null,
    score: hit.similarity, intent_pct: null, pref: 0,
    ...(hit.owned ? { owned: true } : {}),
    ...(similar ? { similar_owned: similar } : {}),
    alternates: alternates.map((a) => itemView(a, lang)),
  };
}

function outfitView(look: LookView, lang: Lang) {
  const reasons = [
    { key: "coherence", label: tr(lang, "評審看法", "Critic"), value: null, text: look.reason, group: "stylist" },
    { key: "intent", label: tr(lang, "造型師的想法", "Stylist's idea"), value: null, text: look.idea, group: "stylist" },
    ...look.pieces.map((p) => ({ key: "intent", label: p.label, value: null, text: p.why, group: "context" })),
    ...(look.revised ? [{ key: "feedback", label: tr(lang, "評審換掉一件", "Swapped by the critic"), value: null, text: look.revised.why, group: "context" }] : []),
    ...(look.over_budget ? [{ key: "budget", label: tr(lang, "預算", "Budget"), value: null, text: tr(lang, "這套超出你的預算", "This look is over your budget"), group: "system" }] : []),
  ];
  return {
    outfit_id: look.id, theme: { key: "brief", label: look.title }, tags: [], score: 0, total_price: look.total_price,
    reasons, items: look.pieces.map((p) => itemView(p.item, lang, p.alternates, p.similar)),
  };
}

/** v2's result in the shape public/js expects (v1 src/types.ts RecommendResponse). */
export function toV1Response(r: RecommendResult, sentence: string, lang: Lang, feedback: string | null) {
  return {
    intent: {
      gender: r.constraints.gender, occasion: null, companions: null, location: null, day_offset: null, temperature_c: null,
      rainy: null, style_keywords: [], style_query_en: "", reference: null, colors_prefer: [],
      colors_avoid: r.constraints.avoid_colours, include_types: [], exclude_types: r.constraints.avoid_types,
      budget_max_twd: r.constraints.budget_max_twd, formality: null, pattern_max: null, request_kind: r.kind,
      body_type: null, height_cm: null, raw_text: sentence, parser: "openai", weather: null,
      assumptions: [r.understood].filter(Boolean),
    },
    ask: r.kind === "outfit" && r.looks.length ? null
      : r.critic === "skipped" ? tr(lang, r.question ?? "", "Nothing in the catalogue meets all of that. Could you relax one thing, like the colour, style or budget?")
      : r.question, // shown instead of looks (public/js/views/search.js)
    outfits: r.looks.map((l) => outfitView(l, lang)),
    relaxed: {}, weather_policy: { band: null, outer: "none", label: "" }, candidate_counts: {}, personalized: false,
    closet_items: r.looks.flatMap((l) => l.pieces.filter((p) => p.item.owned).map((p) => p.item.article_id)),
    closet_options: { use_closet: false, warn_similar: false, pool_size: 0 },
    coherence_source: "image", explored: false,
    applied_feedback: feedback ? [feedback] : [], profile_delta: null,
    memory_update: r.memory_update, // the page saves it as the new style memory (「我的」)
    latency_ms: r.ms.total, ms: r.ms, encoded_by: r.encoded_by, critic: r.critic,
  };
}
