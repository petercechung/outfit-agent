// POST /api/recommend — what the page calls, in v1's request and response shape (src/compat.ts).
// POST /api/v2/recommend {text, context?} — the same pipeline, answered in v2's own shape (src/pipeline.ts).

import { closetFrom } from "../closet";
import { fromV1Request, toV1Response, type V1Request } from "../compat";
import { LIMITS, withModel } from "../config";
import { askerOf, keepRecord } from "../history";
import { HttpError, json, type RouteContext, readJson } from "../lib/http";
import { describePerson, personFrom } from "../person";
import { recommend as run } from "../pipeline";
import type { ProgressEvent } from "../progress";
import { keepDemand } from "../signals";

export async function recommend({ request, env: baseEnv, ctx }: RouteContext): Promise<Response> {
  const body = await readJson<V1Request>(request, LIMITS.maxBodyBytes);
  const env = withModel(baseEnv, body.model); // the model menu in the page header
  const { sentence, context, feedback, lang } = fromV1Request(body);
  if (!sentence) throw new HttpError(400, lang === "en" ? "Please describe what you need in a sentence" : "請輸入一句話描述你的需求");
  const text = sentence.slice(0, LIMITS.maxSentenceChars * 2);
  const person = personFrom(body);
  const closet = closetFrom(body);
  const asker = { ...askerOf(request, body, lang), person: describePerson(person) }; // what the agents were told
  const turn = { sentence: text, feedback };
  const failed = (error: unknown) => {
    console.error("recommend failed:", (error as Error).message);
    keepRecord(ctx, env, asker, turn, { error: (error as Error).message });
  };
  if (!body.stream) {
    try {
      const result = await run(env, text, context, undefined, person, closet);
      keepRecord(ctx, env, asker, turn, { result });
      if (body.share_signals !== false) keepDemand(ctx, env, text, result);
      return json({ ...toV1Response(result, sentence, lang, feedback), model: env.OPENAI_MODEL });
    } catch (error) {
      failed(error);
      throw error;
    }
  }

  // {stream: true}: one JSON object per line — the stylist's thoughts and steps as they happen, then the result.
  const { readable, writable } = new TransformStream<string, string>();
  const writer = writable.getWriter();
  const send = (line: ProgressEvent | { type: "result"; result: unknown } | { type: "error"; error: string }) =>
    writer.write(`${JSON.stringify(line)}\n`).catch(() => {}); // the person may have left; the answer is simply dropped
  const work = run(env, text, context, send, person, closet)
    .then((result) => {
      keepRecord(ctx, env, asker, turn, { result });
      if (body.share_signals !== false) keepDemand(ctx, env, text, result);
      return send({ type: "result", result: { ...toV1Response(result, sentence, lang, feedback), model: env.OPENAI_MODEL } });
    })
    .catch((error) => {
      failed(error);
      return send({ type: "error", error: lang === "en" ? "The stylist is unavailable, please try again" : "造型師暫時沒有回應，請再試一次" });
    })
    .finally(() => writer.close().catch(() => {}));
  ctx.waitUntil(work);
  return new Response(readable.pipeThrough(new TextEncoderStream()), {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function recommendV2({ request, env: baseEnv, ctx }: RouteContext): Promise<Response> {
  const body = await readJson<{ text?: unknown; context?: unknown; tester?: unknown; client_id?: unknown; model?: unknown }>(request, LIMITS.maxBodyBytes);
  const env = withModel(baseEnv, body.model);
  if (typeof body.text !== "string" || !body.text.trim()) throw new HttpError(400, "text is required");
  const text = body.text.trim().slice(0, LIMITS.maxSentenceChars);
  const found = askerOf(request, body, "zh");
  const asker = { ...found, tester: found.tester ?? "api" }; // called by scripts, not the page
  const turn = { sentence: text, feedback: null };
  try {
    const result = await run(env, text, typeof body.context === "string" ? body.context.slice(0, 4000) : "");
    keepRecord(ctx, env, asker, turn, { result });
    return json(result);
  } catch (error) {
    keepRecord(ctx, env, asker, turn, { error: (error as Error).message });
    throw error;
  }
}
