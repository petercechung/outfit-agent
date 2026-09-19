// Vector math over the int8 item vectors (value / 127 = component of a unit vector).
import { EMBEDDING_DIM as DIM, IMAGE_EMBEDDING_DIM as IMAGE_DIM } from "../config";

/** Cosine similarity of catalog items i and j (dim: vector length per row). */
export function itemDot(vec: Int8Array, i: number, j: number, dim = DIM): number {
  let s = 0;
  const a = i * dim, b = j * dim;
  for (let k = 0; k < dim; k++) s += vec[a + k] * vec[b + k];
  return s / (127 * 127);
}

/** Cosine similarity of catalog item i and a float unit vector q. */
export function queryDot(vec: Int8Array, i: number, q: Float32Array): number {
  let s = 0;
  const a = i * DIM;
  for (let k = 0; k < DIM; k++) s += vec[a + k] * q[k];
  return s / 127;
}

/**
 * Carries a text query into the photo space: q (256, unit) times the learned map W (256 x 512, row-major,
 * pipeline/fit_text_to_image.py), normalised. The Worker can't run the FashionCLIP text encoder; this can.
 */
export function mapToImage(q: Float32Array, w: Float32Array): Float32Array {
  const out = new Float32Array(IMAGE_DIM);
  for (let r = 0; r < DIM; r++) {
    const x = q[r];
    if (x === 0) continue;
    const row = r * IMAGE_DIM;
    for (let c = 0; c < IMAGE_DIM; c++) out[c] += x * w[row + c];
  }
  let norm = 0;
  for (let c = 0; c < IMAGE_DIM; c++) norm += out[c] * out[c];
  norm = Math.sqrt(norm) || 1;
  for (let c = 0; c < IMAGE_DIM; c++) out[c] /= norm;
  return out;
}

/** Cosine similarity of catalog item i's photo and a float unit vector q in the photo space. */
export function photoDot(imageVec: Int8Array, i: number, q: Float32Array): number {
  let s = 0;
  const a = i * IMAGE_DIM;
  for (let k = 0; k < IMAGE_DIM; k++) s += imageVec[a + k] * q[k];
  return s / 127;
}

/** Normalised mean vector of the given items, or null when there are none. */
export function centroid(vec: Int8Array, items: number[]): Float32Array | null {
  if (!items.length) return null;
  const c = new Float32Array(DIM);
  for (const i of items) for (let k = 0; k < DIM; k++) c[k] += vec[i * DIM + k] / 127;
  const norm = Math.hypot(...c) || 1;
  for (let k = 0; k < DIM; k++) c[k] /= norm;
  return c;
}

export function quantize(v: Float32Array): number[] {
  return Array.from(v, (x) => Math.max(-127, Math.min(127, Math.round(x * 127))));
}
