import { describe, expect, it } from "vitest";
import { EMBEDDING_DIM, IMAGE_EMBEDDING_DIM } from "../src/config";
import type { SearchQuery } from "../src/contracts";
import { buildCatalog, type CatalogColumns } from "../src/engine/catalog";
import { rankQuery } from "../src/engine/search";

// Four women's tops whose photos point along different axes of the photo space.
function fixture() {
  const rows = [
    { type: "Shirt", colour: "White", price: 799 },
    { type: "Vest top", colour: "Black", price: 299 },
    { type: "Blouse", colour: "Pink", price: 599 },
    { type: "Shirt", colour: "Black", price: 1499 },
  ];
  const n = rows.length;
  const cat: CatalogColumns = {
    article_id: rows.map((_, i) => String(i).padStart(10, "0")), prod_name: rows.map((r) => r.type),
    product_type_name: rows.map((r) => r.type), slot: Array(n).fill("top"), gender: Array(n).fill("women"),
    colour_master: rows.map((r) => r.colour), colour: rows.map((r) => r.colour), pattern: Array(n).fill("Solid"),
    price_twd: rows.map((r) => r.price), detail_desc: Array(n).fill(""), pop: Array(n).fill(0.5),
  };
  const photo = new Int8Array(n * IMAGE_EMBEDDING_DIM);
  photo[0 * IMAGE_EMBEDDING_DIM + 0] = 127; // shirt: axis 0
  photo[1 * IMAGE_EMBEDDING_DIM + 0] = 90; // vest top: close to the shirt, but also on the "straps" axis 1
  photo[1 * IMAGE_EMBEDDING_DIM + 1] = 90;
  photo[2 * IMAGE_EMBEDDING_DIM + 2] = 127; // blouse: axis 2
  photo[3 * IMAGE_EMBEDDING_DIM + 0] = 120; // black shirt: axis 0
  return buildCatalog(cat, new Int8Array(n * EMBEDDING_DIM), photo);
}
const axis = (k: number) => Float32Array.from({ length: IMAGE_EMBEDDING_DIM }, (_, i) => (i === k ? 1 : 0));
const q = (extra: Partial<SearchQuery> = {}): SearchQuery => ({ slot: "top", text: "t", gender: "women", limit: 10, ...extra });
const ids = (r: ReturnType<typeof rankQuery>) => r.hits.map((h) => h.article_id.slice(-1));

describe("rankQuery", () => {
  it("ranks by how close the photo is to the request", () => {
    expect(ids(rankQuery(fixture(), q(), axis(0)))).toEqual(["0", "3", "1", "2"]);
  });

  it("pushes down what the query asks to avoid", () => {
    const r = rankQuery(fixture(), q(), axis(0), [axis(1)]);
    expect(ids(r).indexOf("1")).toBeGreaterThan(ids(r).indexOf("3"));
  });

  it("filters on facts only when asked: types, avoided types and colours, price, exclusions", () => {
    const c = fixture();
    expect(ids(rankQuery(c, q({ types: ["Shirt"] }), axis(0)))).toEqual(["0", "3"]);
    expect(ids(rankQuery(c, q({ avoid_types: ["Vest top"], avoid_colours: ["Pink"] }), axis(0)))).toEqual(["0", "3"]);
    expect(ids(rankQuery(c, q({ price_max: 800 }), axis(0)))).toEqual(["0", "1", "2"]);
    expect(ids(rankQuery(c, q({ exclude_ids: ["0000000000"] }), axis(0)))).toEqual(["3", "1", "2"]);
  });

  it("returns at most limit hits and says how many were eligible", () => {
    const r = rankQuery(fixture(), q({ limit: 2 }), axis(0));
    expect(r.hits).toHaveLength(2);
    expect(r.eligible).toBe(4);
  });
});
