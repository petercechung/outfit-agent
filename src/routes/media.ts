// GET /thumbs/:article_id.jpg — a byte range of the thumbs.pack R2 object, cached at the edge. The critic agent
// looks at these same URLs, so a product's photo is exactly what the person sees.
import { loadThumbIndex } from "../engine/catalog";
import type { RouteContext } from "../lib/http";

const notFound = () => new Response("Not found", { status: 404 });

export async function thumbnail({ request, env, ctx, params: [articleId] }: RouteContext): Promise<Response> {
  const cached = await caches.default.match(request);
  if (cached) return cached;
  const location = (await loadThumbIndex(env))[articleId];
  if (!location) return notFound();
  const object = await env.BUCKET.get("thumbs.pack", { range: { offset: location[0], length: location[1] } });
  if (!object) return notFound();
  const response = new Response(object.body, {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
  });
  ctx.waitUntil(caches.default.put(request, response.clone()));
  return response;
}
