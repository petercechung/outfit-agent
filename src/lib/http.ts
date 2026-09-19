/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** What every route handler receives. `params` are the capture groups of the route's pattern. */
export interface RouteContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  params: string[];
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export async function readJson<T>(request: Request, maxBytes: number): Promise<T> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) throw new HttpError(413, "請求內容太大");
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
}
