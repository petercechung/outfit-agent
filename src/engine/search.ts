// ① The search engine: facts and photos, nothing else.
//
// Filters are facts the catalogue records — gender, garment type, colour, price — applied only because a query
// asks for them. Ranking is how close an item's PHOTO is to what was asked for, minus how close it is to what was
// asked to avoid. There is no rule here about weather, occasions, formality or what goes with what: the stylist
// agent decides those and expresses them as the text it searches with.
import type { Item, SearchHit, SearchQuery, SearchResult } from "../contracts";
import type { Catalog } from "./catalog";
import { photoDot } from "./vectors";

/**
 * How strongly "avoid" pushes an item down: score = similarity to the request − AVOID_WEIGHT × similarity to the
 * closest avoid phrase. Measured with the native encoder on women's tops: "a pretty feminine top for a date"
 * with "a busy floral or animal print" to avoid took loud prints in the top 30 from 26.7% to 0% while keeping
 * 98.5% of the similarity to the request (1.0 kept 95.8%, 1.5 only 88.8%). Two cases so far — re-check with more.
 */
export const AVOID_WEIGHT = 0.5;

export function itemOf(catalog: Catalog, row: number): Item {
  const c = catalog.cat;
  return {
    article_id: c.article_id[row], name: c.prod_name[row], type: c.product_type_name[row], slot: c.slot[row],
    colour: c.colour[row], colour_master: c.colour_master[row], pattern: c.pattern[row], price: c.price_twd[row],
    description: c.detail_desc[row], image: `/thumbs/${c.article_id[row]}.jpg`,
  };
}

/** Rows that pass the query's fact filters. Items without a photo cannot be ranked by photo and are left out. */
export function eligibleRows(catalog: Catalog, q: SearchQuery): number[] {
  const c = catalog.cat;
  const genders = q.gender === "any" ? ["women", "men"] : [q.gender];
  const exclude = new Set(q.exclude_ids ?? []);
  return genders.flatMap((g) => catalog.bySlotGender.get(`${g}|${q.slot}`) ?? []).filter((i) =>
    catalog.hasPhoto?.[i] === 1
    && (!q.types?.length || q.types.includes(c.product_type_name[i]))
    && !q.avoid_types?.includes(c.product_type_name[i])
    && !q.avoid_colours?.includes(c.colour_master[i])
    && (q.price_max === undefined || c.price_twd[i] <= q.price_max)
    && !exclude.has(c.article_id[i]));
}

/**
 * Ranks one query. `want` and `avoid` are unit vectors in the photo space for q.text and q.avoid
 * (engine/encoder.ts makes them), so the engine never embeds text itself and can be tested without a network.
 */
export function rankQuery(catalog: Catalog, q: SearchQuery, want: Float32Array, avoid: Float32Array[] = []): SearchResult {
  const photo = catalog.photo;
  if (!photo) return { hits: [], eligible: 0 };
  const rows = eligibleRows(catalog, q);
  const scored = rows.map((i) => {
    const similarity = photoDot(photo, i, want);
    const pushAway = avoid.length ? Math.max(...avoid.map((a) => photoDot(photo, i, a))) : 0;
    return { i, similarity, score: similarity - AVOID_WEIGHT * pushAway };
  });
  scored.sort((a, b) => b.score - a.score);
  const hits: SearchHit[] = scored.slice(0, q.limit).map(({ i, similarity }) => ({
    ...itemOf(catalog, i), similarity: Math.round(similarity * 1000) / 1000, matched_by: "photo",
  }));
  return { hits, eligible: rows.length };
}
