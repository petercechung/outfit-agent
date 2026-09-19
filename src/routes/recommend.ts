// POST /api/recommend — what the page calls, in v1's request and response shape (src/compat.ts).
// POST /api/v2/recommend {text, context?} — the same pipeline, answered in v2's own shape (src/pipeline.ts).

import { fromV1Request, toV1Response, type V1Request } from "../compat";
import { LIMITS } from "../config";
import { HttpError, json, type RouteContext, readJson } from "../lib/http";
import { recommend as run } from "../pipeline";
import type { ProgressEvent } from "../progress";

export async function recommend({ request, env, ctx }: RouteContext): Promise<Response> {
  const body = await readJson<V1Request>(request, LIMITS.maxBodyBytes);
  const { sentence, context, feedback, lang } = fromV1Request(body);
  if (!sentence) throw new HttpError(400, lang === "en" ? "Please describe what you need in a sentence" : "請輸入一句話描述你的需求");
  const text = sentence.slice(0, LIMITS.maxSentenceChars * 2);
  if (!body.stream) return json(toV1Response(await run(env, text, context), sentence, lang, feedback));

  // {stream: true}: one JSON object per line — the stylist's thoughts and steps as they happen, then the result.
  const { readable, writable } = new TransformStream<string, string>();
  const writer = writable.getWriter();
  const send = (line: ProgressEvent | { type: "result"; result: unknown } | { type: "error"; error: string }) =>
    writer.write(`${JSON.stringify(line)}\n`).catch(() => {}); // the person may have left; the answer is simply dropped
  const work = run(env, text, context, send)
    .then((result) => send({ type: "result", result: toV1Response(result, sentence, lang, feedback) }))
    .catch((error) => {
      console.error("recommend failed:", (error as Error).message);
      return send({ type: "error", error: lang === "en" ? "The stylist is unavailable, please try again" : "造型師暫時沒有回應，請再試一次" });
    })
    .finally(() => writer.close().catch(() => {}));
  ctx.waitUntil(work);
  return new Response(readable.pipeThrough(new TextEncoderStream()), {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function recommendV2({ request, env }: RouteContext): Promise<Response> {
  const { text, context } = await readJson<{ text?: unknown; context?: unknown }>(request, LIMITS.maxBodyBytes);
  if (typeof text !== "string" || !text.trim()) throw new HttpError(400, "text is required");
  return json(await run(env, text.trim().slice(0, LIMITS.maxSentenceChars), typeof context === "string" ? context.slice(0, 4000) : ""));
}
