// POST /api/encode {texts} — which text encoder answered and how fast. For checking the container, and for
// waking it before a demo (a cold container loads the model first).
import { loadCatalog } from "../engine/catalog";
import { encodeForPhotos } from "../engine/encoder";
import { HttpError, json, type RouteContext, readJson } from "../lib/http";

export async function encode({ request, env }: RouteContext): Promise<Response> {
  const { texts } = await readJson<{ texts?: unknown }>(request, 20_000);
  if (!Array.isArray(texts) || !texts.length || texts.length > 64 || !texts.every((t) => typeof t === "string")) {
    throw new HttpError(400, "texts must be 1–64 strings");
  }
  const started = Date.now();
  const { vectors, by } = await encodeForPhotos(env, await loadCatalog(env), texts as string[]);
  return json({ by, ms: Date.now() - started, dims: vectors[0].length, first: Array.from(vectors[0].slice(0, 4)) });
}
