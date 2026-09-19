// Every call to the Worker API goes through here. Server error messages are written for users.
// Every request carries the page language, so server-written texts (reasons, insights) match it.
import { lang } from "./i18n.js";

/**
 * Who is testing, sent with every recommendation so the team can follow each tester's history (src/history.ts).
 * Open the site once as /?tester=名字 and this browser remembers the name; client_id is a random id per browser.
 */
export const tester = (() => {
  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const keep = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode: this visit only */ } };
  const fromLink = new URLSearchParams(location.search).get("tester")?.trim().slice(0, 40);
  if (fromLink) keep("tester", fromLink);
  let clientId = read("client_id");
  if (!clientId) keep("client_id", (clientId = crypto.randomUUID()));
  return { name: fromLink || read("tester"), client_id: clientId };
})();
const who = () => ({ tester: tester.name ?? undefined, client_id: tester.client_id });

async function request(method, path, body, headers = {}) {
  if (method === "GET") path += `${path.includes("?") ? "&" : "?"}lang=${lang}`;
  else if (body) body = { ...body, lang };
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json", ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${response.status} ${response.statusText}`);
  return data;
}

const post = (path, body = {}) => request("POST", path, body);

/**
 * The same request as api.recommend, answered line by line: onEvent sees the stylist's thoughts and each step
 * ({type: "thought" | "stage"}) while the looks are being made; the promise resolves with the RecommendResponse.
 */
async function recommendStream(body, onEvent) {
  const response = await fetch("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, ...who(), lang, stream: true }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `${response.status} ${response.statusText}`);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines.filter(Boolean)) {
      const event = JSON.parse(line);
      if (event.type === "result") return event.result;
      if (event.type === "error") throw new Error(event.error);
      onEvent(event);
    }
  }
  throw new Error("連線中斷，請再試一次");
}

export const api = {
  /** {text, prefs, closet_items?, profile?} -> RecommendResponse (src/types.ts) */
  recommend: (body) => post("/api/recommend", { ...body, ...who() }),
  recommendStream,
  /** Anonymous feedback for 設計師洞察: [{article_id, action, occasion}] */
  events: (events) => post("/api/events", { events }),
  /** -> InsightsResponse (src/types.ts) */
  insights: () => request("GET", "/api/insights"),
  /** 即時流行趨勢 -> TrendSnapshot, or {snapshot: null} before the first collection */
  trends: () => request("GET", "/api/trends"),
  /** Collect now (the server ignores it if the snapshot is only minutes old) -> TrendSnapshot */
  refreshTrends: () => post("/api/trends/refresh"),
  /** Leave-one-out check of the person's own feedback log -> VerifyResponse */
  verify: (events) => post("/api/verify", { events }),
  /** mode "closet" -> {garment, vec}; mode "inspo" -> {garments: [...matches], style_keywords} */
  analyzePhoto: (image, mode) => post("/api/photo", { image, mode }),
  feed: {
    list({ sort, height_cm, body_type, offset = 0 }) {
      const query = new URLSearchParams({ sort, offset: String(offset) });
      if (height_cm) query.set("height_cm", String(height_cm));
      if (body_type) query.set("body_type", body_type);
      return request("GET", `/api/feed?${query}`);
    },
    create: (postInput) => post("/api/feed", postInput),
    like: (id) => post(`/api/feed/${encodeURIComponent(id)}/like`),
    report: (id) => post(`/api/feed/${encodeURIComponent(id)}/report`),
    remove: (id, deleteToken) => request("DELETE", `/api/feed/${encodeURIComponent(id)}`, null, { "x-delete-token": deleteToken }),
  },
};
