// ② The stylist agent: reads the sentence, decides what to wear, and writes the garments to search for.
//
// Everything a human stylist would judge lives in the instructions below and nowhere else in the code: whether
// the sentence is even an outfit request, what the weather at that place and date calls for, what an interview or
// a date needs, what "韓系" or "甜美" look like. The code only checks that the answer has the right shape and uses
// the catalogue's own vocabulary.
import type { LookPlan, Piece, RequestKind, StylistPlan } from "../contracts";
import { COLOURS, PRODUCT_TYPES, SLOTS, type Slot, TYPES_BY_SLOT } from "../engine/vocabulary";
import { structuredOutput } from "../lib/openai";
import { type Thought, thoughtStream } from "../progress";

// Four looks: enough for the critic to keep three different ones. Measured on 「下週一面試」: six looks with an
// avoid phrase on every piece took 13.3 s to plan and 48 phrases to embed; four looks with avoid only where
// needed took 6.9 s (reasoning "none") with no loss in the looks.
const LOOKS_WANTED = "4";

const piece = {
  type: "object",
  additionalProperties: false,
  properties: {
    slot: { type: "string", enum: SLOTS },
    search: { type: "string", description: "ONE garment in English, like a product page: fabric, cut, neckline, sleeves, length, colour, details. Style words are fine (\"a sweet feminine blouse with puff sleeves\"). Never a negation." },
    avoid: { type: "array", items: { type: "string" }, description: "Usually EMPTY. Only when the person said to avoid something, or the occasion clearly rules something out: at most one phrase, written positively (\"a top with thin spaghetti straps\")." },
    types: { type: "array", items: { type: "string", enum: PRODUCT_TYPES }, description: "Catalogue types to restrict to when you are sure (e.g. [\"Coat\"], [\"Sandals\"]). Empty to allow any type in the slot." },
    label: { type: "string", description: "The same garment in the person's language, at most 12 characters." },
    why: { type: "string", description: "In the person's language, the reasoning from THEIR words to this garment. At most 40 characters." },
  },
  required: ["slot", "search", "avoid", "types", "label", "why"],
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["outfit", "vague", "off_topic", "care"] },
    question: { type: ["string", "null"], description: "When kind is not outfit: one short question (or, for care, a kind sentence pointing to help). Null for outfit." },
    understood: { type: "string", description: "One line, in the person's language: what you took from the sentence, including anything you assumed." },
    constraints: {
      type: "object",
      additionalProperties: false,
      properties: {
        gender: { type: "string", enum: ["women", "men", "any"] },
        budget_max_twd: { type: ["integer", "null"], description: "Only if the person gave a budget for the whole outfit." },
        avoid_colours: { type: "array", items: { type: "string", enum: COLOURS }, description: "Only colours the person said to avoid." },
        avoid_types: { type: "array", items: { type: "string", enum: PRODUCT_TYPES }, description: "Only garment types the person refused." },
      },
      required: ["gender", "budget_max_twd", "avoid_colours", "avoid_types"],
    },
    looks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "A short name for the idea, in the person's language." },
          idea: { type: "string", description: "One sentence, in the person's language: how this look answers the request." },
          pieces: { type: "array", items: piece },
        },
        required: ["title", "idea", "pieces"],
      },
    },
  },
  required: ["kind", "question", "understood", "constraints", "looks"],
};

function instructions(today: string): string {
  return `You are a personal stylist in Taiwan. Today is ${today}. A person describes, in one sentence (usually
Traditional Chinese), what they need to wear. You choose real clothes from an H&M catalogue by describing each
garment; a search engine finds the product whose PHOTO looks most like your description.

First decide the kind of request:
- outfit: anything that gives you something to dress for — an occasion, a place, weather, a style, a garment, a budget.
- vague: they want clothes but give nothing to go on ("幫我搭一套"). Ask ONE short question; no looks.
- off_topic: not about getting dressed ("你好，我喜歡吃冰淇淋"). Say so kindly and ask what they are dressing for; no looks.
- care: they say they may hurt themselves. No clothes. Reply kindly and point them to Taiwan's free lines
  (安心專線 1925, 生命線 1995) and to someone they trust.

For an outfit, propose ${LOOKS_WANTED} GENUINELY DIFFERENT complete looks — different ideas, not variations of one.
Among them include the one that answers the brief best, the most comfortable one, and a lower-cost one.
Each look has a top and a bottom, or a one-piece; always shoes; outerwear only when the place, date or season
calls for it; a bag when it helps.

You decide what the situation needs. Reason from the place, the date and the season (Taiwan is hot and humid most
of the year; Seoul in winter is freezing), from the occasion (an interview, a wedding, a concert) and from the style
words they use. Nothing else in the system will add a coat, remove sandals or judge formality — you must.

Write each garment the way a product page describes it, including its colour. Leave \`avoid\` empty unless
they said what to avoid ("不要花紋", "不要太暴露") or the occasion clearly rules something out; then write the
thing itself ("a busy floral print", "a top with thin spaghetti straps"). Never put "not" or "no" inside
\`search\` — the search engine reads words, not negations.

constraints: only what the person actually said. Gender: "men" only if they imply menswear; otherwise "women".`;
}

/** The date in Taiwan, which is what "明天" and "這週六" mean to the person. */
export function taiwanToday(now = Date.now()): string {
  return new Date(now + 8 * 3600e3).toISOString().slice(0, 10);
}

/** A look someone can wear: shoes, and a top with a bottom or a one-piece. */
export const isComplete = (pieces: Pick<Piece, "slot">[]) => {
  const slots = new Set(pieces.map((p) => p.slot));
  return slots.has("shoes") && (slots.has("onepiece") || (slots.has("top") && slots.has("bottom")));
};

/**
 * Keeps what the engine can act on: known slots and vocabulary, one piece per slot, complete looks only.
 * It does not change any choice the stylist made.
 */
export function tidyPlan(raw: StylistPlan): StylistPlan {
  const kinds: RequestKind[] = ["outfit", "vague", "off_topic", "care"];
  const kind = kinds.includes(raw.kind) ? raw.kind : "vague";
  const looks: LookPlan[] = kind !== "outfit" ? [] : (raw.looks ?? []).flatMap((look) => {
    const seen = new Set<Slot>();
    const pieces = (look.pieces ?? []).filter((p) => {
      if (!SLOTS.includes(p.slot) || seen.has(p.slot) || !p.search?.trim()) return false;
      seen.add(p.slot);
      return true;
    }).map((p) => ({
      ...p,
      search: p.search.slice(0, 300),
      avoid: (p.avoid ?? []).filter((a) => a?.trim()).slice(0, 2),
      types: (p.types ?? []).filter((t) => TYPES_BY_SLOT[p.slot].includes(t)),
    }));
    return isComplete(pieces) ? [{ title: look.title, idea: look.idea, pieces }] : [];
  });
  const c = raw.constraints ?? { gender: "women", budget_max_twd: null, avoid_colours: [], avoid_types: [] };
  return {
    kind: kind === "outfit" && !looks.length ? "vague" : kind,
    question: kind === "outfit" && looks.length ? null : raw.question ?? "可以多說一點嗎？例如要去哪裡、做什麼？",
    understood: raw.understood ?? "",
    constraints: {
      gender: ["women", "men", "any"].includes(c.gender) ? c.gender : "women",
      budget_max_twd: Number.isInteger(c.budget_max_twd) && (c.budget_max_twd ?? 0) > 0 ? c.budget_max_twd : null,
      avoid_colours: (c.avoid_colours ?? []).filter((x) => COLOURS.includes(x)),
      avoid_types: (c.avoid_types ?? []).filter((x) => PRODUCT_TYPES.includes(x)),
    },
    looks: looks.slice(0, 6),
  };
}

/**
 * One call to the model. `context` carries the previous looks and feedback on a refine turn. With `onThought`,
 * the plan is streamed and each readable field (what was understood, look titles, garments) is passed on as written.
 */
export async function plan(env: Env, sentence: string, context = "", onThought?: (t: Thought) => void): Promise<StylistPlan> {
  const raw = await structuredOutput<StylistPlan>(env, {
    name: "stylist_plan",
    schema: SCHEMA,
    instructions: instructions(taiwanToday()),
    input: context ? `${context}\n\nThe person now says: ${sentence}` : sentence,
    effort: "none", // the plan is long to write; thinking longer did not change the looks (8.0 s vs 6.9 s)
    onText: onThought && thoughtStream(onThought),
  });
  return tidyPlan(raw);
}
