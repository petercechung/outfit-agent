// POST /api/recommend {text, context?} — the whole pipeline (src/pipeline.ts).
import { LIMITS } from "../config";
import { HttpError, json, type RouteContext, readJson } from "../lib/http";
import { recommend as run } from "../pipeline";

export async function recommend({ request, env }: RouteContext): Promise<Response> {
  const { text, context } = await readJson<{ text?: unknown; context?: unknown }>(request, LIMITS.maxBodyBytes);
  if (typeof text !== "string" || !text.trim()) throw new HttpError(400, "text is required");
  return json(await run(env, text.trim().slice(0, LIMITS.maxSentenceChars), typeof context === "string" ? context.slice(0, 4000) : ""));
}
