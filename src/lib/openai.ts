// The only place that talks to OpenAI.
import { EMBEDDING_DIM } from "../config";

const API = "https://api.openai.com/v1";

export type Content = { type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "auto" | "low" };
type Input = string | { role: "user"; content: Content[] }[];

function headers(env: Env) {
  return { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" };
}

/**
 * Reasoning models (gpt-5*, o3, o4) reject `temperature`; they take a thinking effort instead. Everything we ask
 * for is a short extraction with a fixed schema, so the effort stays low: the accuracy is in the model, not in
 * letting it think longer, and a live demo can't wait.
 */
const isReasoningModel = (model: string) => /^(gpt-5|o[34])/.test(model);

/** Calls the Responses API with a strict JSON schema and returns the parsed object. */
export async function structuredOutput<T>(
  env: Env,
  request: {
    name: string; schema: object; input: Input; instructions?: string; temperature?: number; model?: string;
    effort?: "none" | "low" | "medium" | "high"; // reasoning models only; defaults to OPENAI_REASONING_EFFORT
    onText?: (soFar: string) => void; // when given, the answer is streamed and this sees the JSON as it is written
  },
): Promise<T> {
  const model = request.model ?? env.OPENAI_MODEL;
  const thinking = isReasoningModel(model)
    ? { reasoning: { effort: request.effort ?? (env.OPENAI_REASONING_EFFORT || "low") } }
    : request.temperature !== undefined ? { temperature: request.temperature } : {};
  const res = await fetch(`${API}/responses`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({
      model,
      instructions: request.instructions,
      input: request.input,
      ...thinking,
      text: { format: { type: "json_schema", name: request.name, strict: true, schema: request.schema } },
      ...(request.onText ? { stream: true } : {}),
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${request.name} failed (${res.status})`);
  if (request.onText) return JSON.parse(await readStream(res, request.name, request.onText)) as T;
  const body = (await res.json()) as { output?: { content?: { type: string; text?: string }[] }[] };
  const text = body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text;
  if (!text) throw new Error(`OpenAI ${request.name} returned no text`);
  return JSON.parse(text) as T;
}

/** Reads a streamed response (server-sent events) and returns the full output text. */
async function readStream(res: Response, name: string, onText: (soFar: string) => void): Promise<string> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const event = JSON.parse(line.slice(6)) as { type: string; delta?: string };
      if (event.type === "response.output_text.delta" && event.delta) {
        text += event.delta;
        onText(text);
      } else if (event.type === "response.failed" || event.type === "error") {
        throw new Error(`OpenAI ${name} failed while streaming`);
      }
    }
  }
  if (!text) throw new Error(`OpenAI ${name} returned no text`);
  return text;
}

/** Recent embeddings, per Worker isolate: repeated queries (e.g. "<style>. A top.") skip the API call. */
const embedCache = new Map<string, Float32Array>();
const EMBED_CACHE_SIZE = 1000;

/** Embeds texts with the same model and dimensions used for the catalog vectors. */
export async function embed(env: Env, texts: string[]): Promise<Float32Array[]> {
  const missing = [...new Set(texts.filter((t) => !embedCache.has(t)))];
  if (missing.length) {
    const res = await fetch(`${API}/embeddings`, {
      method: "POST",
      headers: headers(env),
      body: JSON.stringify({ model: env.OPENAI_EMBED_MODEL, input: missing, dimensions: EMBEDDING_DIM }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings failed (${res.status})`);
    const body = (await res.json()) as { data: { embedding: number[] }[] };
    missing.forEach((text, k) => embedCache.set(text, Float32Array.from(body.data[k].embedding)));
    // Maps keep insertion order, so the first keys are the oldest.
    for (const key of embedCache.keys()) {
      if (embedCache.size <= EMBED_CACHE_SIZE) break;
      embedCache.delete(key);
    }
  }
  return texts.map((t) => embedCache.get(t)!);
}

async function moderate(env: Env, input: string | object[]): Promise<boolean> {
  const res = await fetch(`${API}/moderations`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({ model: "omni-moderation-latest", input }),
  });
  if (!res.ok) throw new Error(`OpenAI moderation failed (${res.status})`);
  const body = (await res.json()) as { results: { flagged: boolean }[] };
  return body.results.some((r) => r.flagged);
}

/** True when OpenAI's moderation model flags the text or image as unsuitable for a public page. */
export async function isFlagged(env: Env, text: string, imageDataUrl: string): Promise<boolean> {
  const input: object[] = [{ type: "image_url", image_url: { url: imageDataUrl } }];
  if (text.trim()) input.push({ type: "text", text });
  return moderate(env, input);
}

/** Same check for text only (sentences kept for 設計師洞察). */
export const isTextFlagged = (env: Env, text: string) => moderate(env, text);
