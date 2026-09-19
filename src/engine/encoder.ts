// Text → photo space. Two ways, best first:
//
//   native  FashionCLIP's own text encoder, running in a Cloudflare Container (encoder/): the same model the
//           catalogue photos were embedded with, so a sentence lands in exactly their space. It understands style
//           words — 「甜美」「韓系」 — which the other way cannot. Judged from the photos of the top eight tops
//           (one rater, not blind): "sweet" 8/8 natively vs 6/8 through the map; "Korean style" 6/8 vs at most 1/8.
//   map     the OpenAI text vector times a learned 256×512 matrix (text_to_image.f32). Always available, no
//           container, but it only knows words that appear in product captions (fabric, cut, garment type).
//
// A container can be asleep or unavailable; then the map answers and the result says so, so a demo never hangs.
import { Container } from "@cloudflare/containers";
import { embed } from "../lib/openai";
import type { Catalog } from "./catalog";
import { mapToImage } from "./vectors";

/** The container class wrangler.jsonc binds as TEXT_ENCODER. */
export class FashionTextEncoder extends Container {
  defaultPort = 8080;
  sleepAfter = "30m"; // stay warm through a demo; a cold start loads the model again
}

export type EncodedBy = "native" | "map";

const NATIVE_TIMEOUT_MS = 8000; // a cold container loads the model in a few seconds; past this, use the map

async function nativeEncode(env: Env, texts: string[]): Promise<Float32Array[]> {
  const stub = env.TEXT_ENCODER.getByName("fashionclip-text");
  const response = await Promise.race([
    stub.fetch("http://encoder/embed", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texts }),
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("encoder timed out")), NATIVE_TIMEOUT_MS)),
  ]);
  if (!response.ok) throw new Error(`encoder HTTP ${response.status}`);
  const body = (await response.json()) as { vectors: number[][] };
  if (body.vectors?.length !== texts.length) throw new Error("encoder returned the wrong number of vectors");
  return body.vectors.map((v) => Float32Array.from(v));
}

/**
 * Unit vectors in the photo space for `texts`, and which way they were made. Throws only when neither way works
 * (no container answer and no learned map).
 */
export async function encodeForPhotos(env: Env, catalog: Catalog, texts: string[]): Promise<{ vectors: Float32Array[]; by: EncodedBy }> {
  try {
    return { vectors: await nativeEncode(env, texts), by: "native" };
  } catch (error) {
    console.warn("native text encoder unavailable, using the learned map:", (error as Error).message);
  }
  if (!catalog.textToPhoto) throw new Error("no text encoder: the container did not answer and text_to_image.f32 is missing");
  const w = catalog.textToPhoto;
  const query = await embed(env, texts);
  return { vectors: query.map((q) => mapToImage(q, w)), by: "map" };
}
