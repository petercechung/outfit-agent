// ② The stylist agent: reads the sentence, decides what to wear, and writes the garments to search for.
//
// Everything a human stylist would judge lives in the instructions below and nowhere else in the code: whether
// the sentence is even an outfit request, what the weather at that place and date calls for, what an interview or
// a date needs, what "韓系" or "甜美" look like. The code only checks that the answer has the right shape and uses
// the catalogue's own vocabulary.
import type { LookPlan, Piece, RequestKind, StylistPlan } from "../contracts";
import { COLOURS, PRODUCT_TYPES, SLOTS, type Slot, TYPES_BY_SLOT } from "../engine/vocabulary";
import { SIGNAL_OCCASIONS } from "../signals";
import { structuredOutput } from "../lib/openai";
import { describePerson, MEMORY_MAX_CHARS, type Person } from "../person";
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
    own: { type: ["string", "null"], description: "The id of one of the person's own clothes (c1, p1…) to wear here; null to search the shop." },
  },
  required: ["slot", "search", "avoid", "types", "label", "why", "own"],
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
    occasion: {
      type: ["string", "null"], enum: [...SIGNAL_OCCASIONS, null],
      description: "For the brand's demand report only: which of these the request is for, or null if none fits.",
    },
    style_keywords: {
      type: "array", items: { type: "string" },
      description: "For the demand report only: the style words in the request, in their language (韓系, 極簡…). Empty if none.",
    },
    memory: {
      type: ["string", "null"],
      description: "The person's style memory, rewritten in full, ONLY when this turn reveals a lasting preference; otherwise null.",
    },
  },
  required: ["kind", "question", "understood", "constraints", "looks", "occasion", "style_keywords", "memory"],
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

The slots are what the person wears, not a list to fill: \`onepiece\` is a dress or a jumpsuit and REPLACES the top
and the bottom — never plan a one-piece together with a skirt or trousers. The only exception is real layering the
outfit needs: a top worn under a pinafore or slip dress; then say so in that piece's \`why\`.
The catalogue is outerwear and clothes people see: no underwear, bras, swimwear or socks. If the person asks for
something like that ("裡面穿 bratop"), do not squeeze it into another slot — leave it out, plan the rest, and say in
\`understood\` that you cannot find that piece.

You decide what the situation needs. Reason from the place, the date and the season (Taiwan is hot and humid most
of the year; Seoul in winter is freezing), from the occasion (an interview, a wedding, a concert) and from the style
words they use. Nothing else in the system will add a coat, remove sandals or judge formality — you must.

Write each garment the way a product page describes it, including its colour. Leave \`avoid\` empty unless
they said what to avoid ("不要花紋", "不要太暴露") or the occasion clearly rules something out; then write the
thing itself ("a busy floral print", "a top with thin spaghetti straps"). Never put "not" or "no" inside
\`search\` — the search engine reads words, not negations.

You may be shown the person's own clothes. Wear one by putting its id in \`own\` (and still write \`search\`, \`label\`
and \`why\` for it, so the card reads the same); garments on the mannequin must appear in every look. Use their own
clothes when they suit the brief, and the shop for the rest — they came to be shown something new, so build each
look around one or two of their garments at most (besides anything on the mannequin) and keep the looks different
from each other. A garment of theirs that does not suit the brief is simply not used.

constraints: only what the person actually said. Gender: "men" only if they imply menswear; otherwise "women".

You may be told what you remember about the person, their body and how they reacted to earlier looks. Use it the
way a stylist who knows a client would — their favourite colours, what they never wear, what flatters their shape —
unless today's sentence asks for something else (today's words always win).
memory: keep a short paragraph about this person's lasting style, in their language, at most ${MEMORY_MAX_CHARS}
characters. Rewrite it in full (keep what is still true, add what is new, drop what they contradicted) ONLY when this
turn or their reactions show something lasting: "我不穿黑色", "我喜歡日系", repeatedly disliking leopard print.
NOT memories: anything about this one request — "這次", "今天", "正式一點", a budget, an occasion or a place (a café,
an interview, Seoul). If the only new thing is one of those, return null.
Write short notes about their taste without a subject or pronoun ("不穿黑色，覺得太沉重。喜歡粉色。"), never "她"/"他"/
"you", and never guesses about who they are.`;
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
      own: typeof p.own === "string" && p.own.trim() ? p.own.trim() : null,
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
    memory: typeof raw.memory === "string" && raw.memory.trim() ? raw.memory.trim().slice(0, MEMORY_MAX_CHARS) : null,
    occasion: (SIGNAL_OCCASIONS as readonly string[]).includes(raw.occasion ?? "") ? raw.occasion : null,
    style_keywords: (raw.style_keywords ?? []).filter((k) => typeof k === "string" && k.trim()).map((k) => k.trim().slice(0, 20)).slice(0, 5),
  };
}

/**
 * One call to the model. `context` carries the previous looks and feedback on a refine turn. With `onThought`,
 * the plan is streamed and each readable field (what was understood, look titles, garments) is passed on as written.
 */
export async function plan(
  env: Env, sentence: string, context = "", onThought?: (t: Thought) => void, person?: Person, closet = "",
  onPartial?: (soFar: string) => void,
): Promise<StylistPlan> {
  const about = [person ? describePerson(person) : "", closet].filter(Boolean).join("\n\n");
  const raw = await structuredOutput<StylistPlan>(env, {
    name: "stylist_plan",
    schema: SCHEMA,
    instructions: instructions(taiwanToday()),
    input: [about, context, context ? `The person now says: ${sentence}` : sentence].filter(Boolean).join("\n\n"),
    effort: "none", // the plan is long to write; thinking longer did not change the looks (8.0 s vs 6.9 s)
    onText: onThought || onPartial
      ? ((thoughts) => (soFar: string) => {
          thoughts?.(soFar);
          onPartial?.(soFar);
        })(onThought && thoughtStream(onThought))
      : undefined,
  });
  return tidyPlan(raw);
}
