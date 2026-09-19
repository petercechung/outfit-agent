// ① The engine's data: facts about each catalogue item, loaded from R2 once per Worker isolate.
//
// Only facts live here — what H&M records (type, colour, pattern, price, description) and two vectors per item:
// its caption in the OpenAI text space and its photo in the FashionCLIP space, plus a learned map from the first
// space into the second (pipeline/fit_text_to_image.py in the v1 repo), so a sentence can be matched against photos.
// Nothing here says what suits an occasion or a temperature; that is the stylist agent's job.
import { EMBEDDING_DIM, IMAGE_EMBEDDING_DIM } from "../config";

/** Column-oriented catalogue as exported to R2: row i is the same item in every column and vector file. */
export interface CatalogColumns {
  article_id: string[];
  prod_name: string[];
  product_type_name: string[];
  slot: string[];
  gender: string[];
  colour_master: string[];
  colour: string[];
  pattern: string[];
  price_twd: number[];
  detail_desc: string[];
  pop: number[];
}

export interface Catalog {
  cat: CatalogColumns;
  n: number;
  text: Int8Array; // n × EMBEDDING_DIM caption vectors (value / 127 = unit-vector component)
  photo: Int8Array | null; // n × IMAGE_EMBEDDING_DIM photo vectors; an all-zero row means no photo
  hasPhoto: Uint8Array | null;
  textToPhoto: Float32Array | null; // EMBEDDING_DIM × IMAGE_EMBEDDING_DIM, row-major
  bySlotGender: Map<string, number[]>; // "women|top" -> rows
  idToRow: Map<string, number>;
}

let catalogPromise: Promise<Catalog> | null = null;
let thumbIndexPromise: Promise<Record<string, [number, number]>> | null = null;

async function r2Json<T>(env: Env, key: string): Promise<T> {
  const obj = await env.BUCKET.get(key);
  if (!obj) throw new Error(`R2 object missing: ${key}`);
  return obj.json<T>();
}

/** Marks rows whose photo vector is not all zeros. */
function photoRows(photo: Int8Array, n: number): Uint8Array {
  const has = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const start = i * IMAGE_EMBEDDING_DIM;
    for (let k = 0; k < IMAGE_EMBEDDING_DIM; k++) {
      if (photo[start + k] !== 0) {
        has[i] = 1;
        break;
      }
    }
  }
  return has;
}

/** Builds the lookup structures; exported for tests. Photo data is dropped unless every piece of it fits. */
export function buildCatalog(
  cat: CatalogColumns, text: Int8Array, photo: Int8Array | null = null, textToPhoto: Float32Array | null = null,
): Catalog {
  const n = cat.article_id.length;
  if (text.length !== n * EMBEDDING_DIM) throw new Error(`vec_query.bin has ${text.length / EMBEDDING_DIM} rows, catalog has ${n}`);
  const bySlotGender = new Map<string, number[]>();
  const idToRow = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${cat.gender[i]}|${cat.slot[i]}`;
    if (!bySlotGender.has(key)) bySlotGender.set(key, []);
    bySlotGender.get(key)!.push(i);
    idToRow.set(cat.article_id[i], i);
  }
  const photosFit = photo !== null && photo.length === n * IMAGE_EMBEDDING_DIM;
  const mapFits = photosFit && textToPhoto?.length === EMBEDDING_DIM * IMAGE_EMBEDDING_DIM;
  return {
    cat, n, text,
    photo: photosFit ? photo : null,
    hasPhoto: photosFit ? photoRows(photo, n) : null,
    textToPhoto: mapFits ? textToPhoto : null,
    bySlotGender, idToRow,
  };
}

export function loadCatalog(env: Env): Promise<Catalog> {
  catalogPromise ??= (async () => {
    const [cat, textObj, photoObj, mapObj] = await Promise.all([
      r2Json<CatalogColumns>(env, "catalog.json"),
      env.BUCKET.get("vec_query.bin"),
      env.BUCKET.get("vec_image.bin"),
      env.BUCKET.get("text_to_image.f32"),
    ]);
    if (!textObj) throw new Error("R2 object missing: vec_query.bin");
    return buildCatalog(
      cat,
      new Int8Array(await textObj.arrayBuffer()),
      photoObj ? new Int8Array(await photoObj.arrayBuffer()) : null,
      mapObj ? new Float32Array(await mapObj.arrayBuffer()) : null,
    );
  })().catch((e) => {
    catalogPromise = null; // retry on the next request instead of caching the failure
    throw e;
  });
  return catalogPromise;
}

/** article_id -> [offset, length] inside the thumbs.pack R2 object. */
export function loadThumbIndex(env: Env): Promise<Record<string, [number, number]>> {
  thumbIndexPromise ??= r2Json<Record<string, [number, number]>>(env, "thumbs_index.json").catch((e) => {
    thumbIndexPromise = null;
    throw e;
  });
  return thumbIndexPromise;
}
