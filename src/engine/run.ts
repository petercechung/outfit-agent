// Runs several engine queries at once: every text and avoid phrase is embedded in ONE call (the stylist's plan
// can hold twenty pieces), then each query is ranked on its own.
import type { SearchQuery, SearchResult } from "../contracts";
import type { Catalog } from "./catalog";
import { type EncodedBy, encodeForPhotos } from "./encoder";
import { rankQuery } from "./search";

export async function runSearches(env: Env, catalog: Catalog, queries: SearchQuery[]): Promise<{ results: SearchResult[]; by: EncodedBy }> {
  const texts = queries.flatMap((q) => [q.text, ...(q.avoid ?? [])]);
  const { vectors, by } = await encodeForPhotos(env, catalog, texts);
  let k = 0;
  const results = queries.map((q) => {
    const want = vectors[k++];
    const avoid = (q.avoid ?? []).map(() => vectors[k++]);
    return rankQuery(catalog, q, want, avoid);
  });
  return { results, by };
}
