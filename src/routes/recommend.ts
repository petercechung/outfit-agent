// POST /api/recommend — what the page calls, in v1's request and response shape (src/compat.ts).
// POST /api/v2/recommend {text, context?} — the same pipeline, answered in v2's own shape (src/pipeline.ts).

import { fromV1Request, toV1Response, type V1Request } from "../compat";
import { LIMITS } from "../config";
import { HttpError, json, type RouteContext, readJson } from "../lib/http";
import { recommend as run } from "../pipeline";

export async function recommend({ request, env }: RouteContext): Promise<Response> {
  const body = await readJson<V1Request>(request, LIMITS.maxBodyBytes);
  const { sentence, context, feedback, lang } = fromV1Request(body);
  if (!sentence) throw new HttpError(400, lang === "en" ? "Please describe what you need in a sentence" : "請輸入一句話描述你的需求");
  const result = await run(env, sentence.slice(0, LIMITS.maxSentenceChars * 2), context);
  return json(toV1Response(result, sentence, lang, feedback));
}

export async function recommendV2({ request, env }: RouteContext): Promise<Response> {
  const { text, context } = await readJson<{ text?: unknown; context?: unknown }>(request, LIMITS.maxBodyBytes);
  if (typeof text !== "string" || !text.trim()) throw new HttpError(400, "text is required");
  return json(await run(env, text.trim().slice(0, LIMITS.maxSentenceChars), typeof context === "string" ? context.slice(0, 4000) : ""));
}
