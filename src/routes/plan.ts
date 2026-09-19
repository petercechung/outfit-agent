// POST /api/plan {text} — the stylist agent on its own: what it understood and the looks it wants to search for.
import { plan as runStylist } from "../agents/stylist";
import { LIMITS } from "../config";
import { HttpError, json, type RouteContext, readJson } from "../lib/http";

export async function plan({ request, env }: RouteContext): Promise<Response> {
  const { text } = await readJson<{ text?: unknown }>(request, 20_000);
  if (typeof text !== "string" || !text.trim()) throw new HttpError(400, "text is required");
  const started = Date.now();
  const result = await runStylist(env, text.trim().slice(0, LIMITS.maxSentenceChars));
  return json({ ms: Date.now() - started, ...result });
}
