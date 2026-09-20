// The closed loop back to design: every request also becomes an anonymous demand signal for 設計師洞察.
//
// 設計師洞察 is still v1's page (outfit.cechung.com), reading the `intents` and `events` tables of the shared
// database `outfit-db`. v2 writes the same kind of row, so what people ask for today reaches 開款・選款・備料.
// No tester name, browser id or personal data goes in here: the sentence is de-identified (src/deidentify.ts)
// and dropped entirely when moderation flags it. This is separate from the development history (src/history.ts).
import { deidentify } from "./deidentify";
import { isTextFlagged } from "./lib/openai";
import type { RecommendResult } from "./pipeline";

/**
 * The occasions 設計師洞察 groups demand by (v1 src/taxonomy.ts OCCASIONS). It is a reporting vocabulary only:
 * nothing in the recommendation depends on it, the stylist just labels the request for the designers.
 */
export const SIGNAL_OCCASIONS = [
  "everyday", "date", "party", "concert", "work", "interview", "wedding", "formal", "travel", "sport", "school", "beach",
] as const;

const RETENTION_DAYS = 30; // the same window v1 keeps and the insights page reports

export async function logDemand(env: Env, sentence: string, result: RecommendResult): Promise<void> {
  const clean = deidentify(sentence);
  const keep = clean !== null && !(await isTextFlagged(env, clean).catch(() => true));
  const c = result.constraints;
  // Which slots the catalogue could not answer, in v1's shape: {slot: ["找不到"]}
  const missing = result.kind === "outfit" && !result.looks.length ? { 整套: ["no match"] } : {};
  await env.SIGNALS_DB.batch([
    env.SIGNALS_DB.prepare("DELETE FROM intents WHERE created_at < ?").bind(Date.now() - RETENTION_DAYS * 86400e3),
    env.SIGNALS_DB.prepare(
      `INSERT INTO intents (created_at, text, gender, occasion, formality, temperature_c, budget_max_twd, style_keywords,
         colors_prefer, colors_avoid, include_types, exclude_types, body_type, height_cm, relaxed, candidate_counts,
         outfits, parser, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).bind(
      Date.now(), keep ? clean : null, c.gender === "any" ? null : c.gender, result.signals.occasion, null, null, c.budget_max_twd,
      JSON.stringify(result.signals.style_keywords), "[]", JSON.stringify(c.avoid_colours), "[]", JSON.stringify(c.avoid_types), null, null,
      JSON.stringify(missing), "{}", result.looks.length, "openai",
    ),
  ]);
}

/** Never delays or breaks the answer. */
export function keepDemand(ctx: ExecutionContext, env: Env, sentence: string, result: RecommendResult): void {
  ctx.waitUntil(logDemand(env, sentence, result).catch((e) => console.error("demand signal failed:", (e as Error).message)));
}
