// POST /api/analyze {sentence, title, idea, article_ids, lang, tester?, client_id?, model?}
// The analyst agent's write-up of one look, streamed as plain text. The page asks for it after the looks are shown.
import { analyse } from "../agents/analyst";
import { LIMITS, withModel } from "../config";
import type { Item } from "../contracts";
import { loadCatalog } from "../engine/catalog";
import { itemOf } from "../engine/search";
import { askerOf } from "../history";
import { HttpError, type RouteContext, readJson } from "../lib/http";
import { trendBrief } from "../trends";

interface Body {
  sentence?: unknown; title?: unknown; idea?: unknown; article_ids?: unknown; lang?: unknown;
  tester?: unknown; client_id?: unknown; model?: unknown;
}

const text = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

export async function analyze({ request, env: baseEnv, ctx }: RouteContext): Promise<Response> {
  const body = await readJson<Body>(request, LIMITS.maxBodyBytes);
  const env = withModel(baseEnv, body.model);
  const lang = body.lang === "en" ? "en" : "zh";
  const sentence = text(body.sentence, LIMITS.maxSentenceChars * 2).trim();
  const ids = Array.isArray(body.article_ids) ? body.article_ids.filter((id): id is string => typeof id === "string").slice(0, 8) : [];
  if (!sentence || !ids.length) throw new HttpError(400, "sentence and article_ids are required");
  const catalog = await loadCatalog(env);
  // The garments come from the catalogue, not from the page, so the analysis is about the real products.
  const items: Item[] = ids.flatMap((id) => (catalog.idToRow.has(id) ? [itemOf(catalog, catalog.idToRow.get(id)!)] : []));
  if (!items.length) throw new HttpError(400, "unknown article_ids");
  const look = { title: text(body.title, 60), idea: text(body.idea, 300), items };
  const asker = askerOf(request, body, lang);

  const { readable, writable } = new TransformStream<string, string>();
  const writer = writable.getWriter();
  const t0 = Date.now();
  const record = (written: string | null, error: string | null) =>
    env.DB.prepare(`INSERT INTO analyses (tester, client_id, model, sentence, look_title, article_ids, text, ms, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(asker.tester, asker.client_id, env.OPENAI_MODEL, sentence, look.title,
      JSON.stringify(items.map((i) => i.article_id)), written, Date.now() - t0, error).run()
      .catch((e) => console.error("analysis write failed:", (e as Error).message));
  const work = trendBrief()
    .then((trends) => analyse(env, sentence, look, trends, lang, (delta) => { writer.write(delta).catch(() => {}); }))
    .then((written) => record(written, null))
    .catch((error) => {
      console.error("analysis failed:", (error as Error).message);
      writer.write(lang === "en" ? "\n(The analysis is unavailable right now.)" : "\n（分析暫時無法完成）").catch(() => {});
      return record(null, (error as Error).message);
    })
    .finally(() => writer.close().catch(() => {}));
  ctx.waitUntil(work);
  return new Response(readable.pipeThrough(new TextEncoderStream()), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
