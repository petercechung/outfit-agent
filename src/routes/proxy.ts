// Everything v2 did not rebuild — 照片找同款, 穿搭牆, 設計師洞察, trends, 進步驗證 — is still served by v1
// (outfit.cechung.com, same catalogue in R2). The copied page calls these paths here; they are passed through.
import type { RouteContext } from "../lib/http";

export const V1 = "https://outfit.cechung.com";

export async function toV1({ request }: RouteContext): Promise<Response> {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("host");
  const response = await fetch(`${V1}${url.pathname}${url.search}`, {
    method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
  });
  return new Response(response.body, { status: response.status, headers: response.headers });
}
