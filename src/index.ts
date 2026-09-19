// Worker entry: the route table and error handling.
//
//   ① engine   src/engine/   facts about the catalogue and a search over them
//   ② stylist  src/agents/   reads the sentence, decides what to wear, searches for concrete garments
//   ③ critic   src/agents/   looks at the finished outfits against the original sentence
import { HttpError, json, type RouteContext } from "./lib/http";
import { health } from "./routes/health";
import { thumbnail } from "./routes/media";

interface Route {
  method: string;
  pattern: RegExp;
  handler: (route: RouteContext) => Promise<Response>;
  needsOpenAI?: boolean;
}

const ROUTES: Route[] = [
  { method: "GET", pattern: /^\/api\/health$/, handler: health },
  { method: "GET", pattern: /^\/thumbs\/(\d{10})\.jpg$/, handler: thumbnail },
];

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      const matching = ROUTES.filter((route) => route.pattern.test(pathname));
      const route = matching.find((r) => r.method === request.method);
      if (!route) {
        if (matching.length) throw new HttpError(405, `Use ${matching.map((r) => r.method).join(" or ")}`);
        if (pathname.startsWith("/api/")) throw new HttpError(404, "Not found");
        return env.ASSETS.fetch(request); // static UI in public/
      }
      if (route.needsOpenAI && !env.OPENAI_API_KEY) throw new HttpError(503, "Server is missing OPENAI_API_KEY");
      const params = pathname.match(route.pattern)!.slice(1);
      return await route.handler({ request, env, ctx, params });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "伺服器暫時出了問題，請稍後再試" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
