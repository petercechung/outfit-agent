// GET /api/health — what data and models this deployment is running on.
import { MODELS } from "../config";
import { loadCatalog } from "../engine/catalog";
import { json, type RouteContext } from "../lib/http";

export async function health({ env }: RouteContext): Promise<Response> {
  const catalog = await loadCatalog(env);
  return json({
    ok: true,
    version: "v2",
    items: catalog.n,
    photo_vectors: catalog.photo !== null,
    photo_search: catalog.textToPhoto !== null, // a sentence can be matched against product photos
    llm: Boolean(env.OPENAI_API_KEY),
    model: env.OPENAI_MODEL,
    models: MODELS, // what the page's model menu offers
  });
}
