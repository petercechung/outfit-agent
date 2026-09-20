// ③ The critic agent: looks at every filled outfit — the actual product photos — next to the person's own words,
// and keeps the best three. It is the only part that sees the result, so it catches what the stylist's plan and
// the search could not: a "shirt" that turned out to be a camisole, sandals on a snowy day, two looks that are
// really the same outfit. Like the stylist, its judgement lives in its instructions, not in code.
import type { CriticVerdict, FilledLook } from "../contracts";
import { type Content, structuredOutput } from "../lib/openai";
import { describePerson, type Person } from "../person";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    keep: {
      type: "array",
      description: "The best looks, best first, at most three, all genuinely different from each other.",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          id: { type: "string" },
          reason: { type: "string", description: "In the person's language, what in the PHOTOS makes this look answer their words. At most 60 characters." },
        },
        required: ["id", "reason"],
      },
    },
    problems: {
      type: "array",
      description: "Pieces that do not answer the person's words, as seen in the photos.",
      items: {
        type: "object", additionalProperties: false,
        properties: { id: { type: "string" }, piece: { type: "integer" }, problem: { type: "string" } },
        required: ["id", "piece", "problem"],
      },
    },
    revise: {
      type: ["object", "null"],
      description: "At most one piece worth searching again: a kept look that would be right but for this piece.",
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        piece: { type: "integer" },
        search: { type: "string", description: "The replacement garment in English, like a product page. No negations." },
        why: { type: "string", description: "In the person's language." },
      },
      required: ["id", "piece", "search", "why"],
    },
    question: { type: ["string", "null"], description: "Only when no look answers the request well: one question to ask the person." },
  },
  required: ["keep", "problems", "revise", "question"],
};

const INSTRUCTIONS = `You are a demanding fashion stylist reviewing outfits before they are shown to a client.
You get the client's own words and several outfits; each outfit shows the photo of every garment, numbered from 0.
Judge from the PHOTOS, not the product names — a product called "shirt" may be a strappy camisole.

If you are told about the client (their style memory, body, reactions), prefer outfits that suit them, unless their
words today ask for something else.
Reject what cannot be worn together: a dress or jumpsuit with a skirt or trousers, two of the same garment, or a
photo that is clearly not the garment the outfit says it is (planned as a bra top, the photo shows a dress).
For each outfit ask: does every garment suit what the client said (the occasion, the weather at that place and
date, the style words, anything they refused)? Do the pieces work together as one look?
Keep THREE, best first — fewer only if you were given fewer, or if two are really the same outfit. Keeping the
best three is your job even when none is perfect: say what is wrong in problems, and ask a question if it is bad.
Reasons are for the client, in their language, and point to what you can see in the photos.
If one kept outfit would be right except for one garment, ask for that one garment to be searched again.
If nothing answers the request well, keep what is closest and ask one question.`;

/** Photos must be reachable by the model, so they are addressed on the public domain even during local dev. */
export async function judge(env: Env, sentence: string, looks: FilledLook[], person?: Person): Promise<CriticVerdict> {
  const about = person ? describePerson(person) : "";
  const content: Content[] = [{ type: "input_text", text: `${about ? `${about}\n\n` : ""}The client said: 「${sentence}」` }];
  for (const look of looks) {
    content.push({ type: "input_text", text: `Outfit ${look.id} — ${look.plan.title}: ${look.plan.idea} (NT$${look.total_price})` });
    look.items.forEach((item, k) => {
      // The person's own clothes stay in their browser: no photo, only what they told us about the garment.
      const own = item.owned ? " — THE CLIENT'S OWN GARMENT, no photo: judge it from these words" : "";
      content.push({ type: "input_text", text: `${look.id} garment ${k} (${item.slot}): ${item.name}, ${item.type}, ${item.colour}, ${item.owned ? "already theirs" : `NT$${item.price}`}${own}` });
      if (!item.owned) content.push({ type: "input_image", image_url: `${env.IMAGE_ORIGIN}${item.image}`, detail: "low" });
    });
  }
  const verdict = await structuredOutput<CriticVerdict>(env, {
    name: "critic_verdict", schema: SCHEMA, instructions: INSTRUCTIONS, input: [{ role: "user", content }],
  });
  return tidyVerdict(verdict, looks);
}

/** Keeps only ids and pieces that exist; the critic's choices themselves are not changed. */
export function tidyVerdict(v: CriticVerdict, looks: FilledLook[]): CriticVerdict {
  const byId = new Map(looks.map((l) => [l.id, l]));
  const validPiece = (id: string, piece: number) => Number.isInteger(piece) && piece >= 0 && piece < (byId.get(id)?.items.length ?? 0);
  const seen = new Set<string>();
  const keep = (v.keep ?? []).filter((k) => byId.has(k.id) && !seen.has(k.id) && seen.add(k.id)).slice(0, 3);
  const revise = v.revise && keep.some((k) => k.id === v.revise!.id) && validPiece(v.revise.id, v.revise.piece) && v.revise.search?.trim()
    ? v.revise : null;
  return {
    keep,
    problems: (v.problems ?? []).filter((p) => validPiece(p.id, p.piece)),
    revise,
    question: v.question ?? null,
  };
}
