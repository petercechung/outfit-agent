// POST /api/search {queries: SearchQuery[]} — the engine on its own, for testing and for whoever works on it.
import type { SearchQuery } from "../contracts";
import { loadCatalog } from "../engine/catalog";
import { runSearches } from "../engine/run";
import { SLOTS } from "../engine/vocabulary";
import { HttpError, json, type RouteContext, readJson } from "../lib/http";

function check(q: SearchQuery): SearchQuery {
  if (!q || typeof q.text !== "string" || !q.text.trim()) throw new HttpError(400, "each query needs text");
  if (!SLOTS.includes(q.slot)) throw new HttpError(400, `slot must be one of ${SLOTS.join(", ")}`);
  if (!["women", "men", "any"].includes(q.gender)) throw new HttpError(400, "gender must be women, men or any");
  return { ...q, text: q.text.slice(0, 300), avoid: (q.avoid ?? []).slice(0, 5), limit: Math.min(Math.max(1, q.limit || 10), 50) };
}

export async function search({ request, env }: RouteContext): Promise<Response> {
  const body = await readJson<{ queries?: SearchQuery[] }>(request, 50_000);
  if (!Array.isArray(body.queries) || !body.queries.length || body.queries.length > 30) throw new HttpError(400, "queries: 1–30");
  const started = Date.now();
  const { results, by } = await runSearches(env, await loadCatalog(env), body.queries.map(check));
  return json({ encoded_by: by, ms: Date.now() - started, results });
}
