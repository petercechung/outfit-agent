// The full history of requests while v2 is being tested: who asked (tester name / browser id), exactly what they
// said, what the stylist planned, what the critic decided and what was shown. Testers are identified on purpose,
// so the team can follow each person's session. Writing never delays or breaks the answer (ctx.waitUntil).
import type { RecommendResult } from "./pipeline";

export interface Asker {
  tester: string | null;
  client_id: string | null;
  country: string | null;
  user_agent: string | null;
  lang: string;
}

const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

/** Who is asking: the page sends `tester` and `client_id`; Cloudflare adds the country. */
export function askerOf(request: Request, body: { tester?: unknown; client_id?: unknown }, lang: string): Asker {
  const cf = (request as { cf?: { country?: string } }).cf;
  return {
    tester: clip(body.tester, 40), client_id: clip(body.client_id, 64), country: cf?.country ?? null,
    user_agent: clip(request.headers.get("user-agent"), 300), lang,
  };
}

/** The looks as shown, small enough to read in a table: title, price and each item's id, name and price. */
function looksShown(r: RecommendResult) {
  return r.looks.map((l) => ({
    id: l.id, title: l.title, total_price: l.total_price, over_budget: l.over_budget, revised: l.revised,
    items: l.pieces.map((p) => ({ slot: p.item.slot, article_id: p.item.article_id, name: p.item.name, price: p.item.price, label: p.label })),
  }));
}

export async function recordRequest(
  env: Env,
  asker: Asker & { person?: string },
  turn: { sentence: string; feedback: string | null },
  outcome: { result: RecommendResult } | { error: string },
): Promise<void> {
  const r = "result" in outcome ? outcome.result : null;
  await env.DB.prepare(
    `INSERT INTO requests (tester, client_id, country, user_agent, lang, turn, sentence, feedback, kind, understood,
       question, budget_max_twd, looks, plan, verdict, encoded_by, critic, ms_plan, ms_search, ms_judge, ms_total, error, model, person, memory_update)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    asker.tester, asker.client_id, asker.country, asker.user_agent, asker.lang,
    turn.feedback === null ? "new" : "refine", turn.sentence, turn.feedback,
    r?.kind ?? null, r?.understood ?? null, r?.looks.length ? null : (r?.question ?? null),
    r?.constraints.budget_max_twd ?? null,
    r ? JSON.stringify(looksShown(r)) : null, r ? JSON.stringify(r.trace.plan) : null,
    r?.trace.verdict ? JSON.stringify(r.trace.verdict) : null,
    r?.encoded_by ?? null, r?.critic ?? null, r?.ms.plan ?? null, r?.ms.search ?? null, r?.ms.judge ?? null, r?.ms.total ?? null,
    "error" in outcome ? outcome.error.slice(0, 500) : null,
    env.OPENAI_MODEL, asker.person || null, r?.memory_update ?? null,
  ).run();
}

/** Starts the write in the background; a failed write is logged, never shown to the person. */
export function keepRecord(
  ctx: ExecutionContext, env: Env, asker: Asker & { person?: string }, turn: { sentence: string; feedback: string | null },
  outcome: { result: RecommendResult } | { error: string },
): void {
  ctx.waitUntil(recordRequest(env, asker, turn, outcome).catch((e) => console.error("history write failed:", (e as Error).message)));
}
