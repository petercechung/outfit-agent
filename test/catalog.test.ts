import { describe, expect, it } from "vitest";
import { EMBEDDING_DIM, IMAGE_EMBEDDING_DIM } from "../src/config";
import { buildCatalog, type CatalogColumns } from "../src/engine/catalog";

const columns = (n: number): CatalogColumns => ({
  article_id: Array.from({ length: n }, (_, i) => String(i).padStart(10, "0")),
  prod_name: Array(n).fill("item"), product_type_name: Array(n).fill("Shirt"), slot: Array(n).fill("top"),
  gender: Array(n).fill("women"), colour_master: Array(n).fill("White"), colour: Array(n).fill("White"),
  pattern: Array(n).fill("Solid"), price_twd: Array(n).fill(499), detail_desc: Array(n).fill(""), pop: Array(n).fill(0.5),
});

describe("buildCatalog", () => {
  it("indexes rows by slot and gender and by article id", () => {
    const c = buildCatalog(columns(3), new Int8Array(3 * EMBEDDING_DIM));
    expect(c.bySlotGender.get("women|top")).toEqual([0, 1, 2]);
    expect(c.idToRow.get("0000000002")).toBe(2);
  });

  it("marks which rows have a photo and keeps the text→photo map only when it fits", () => {
    const photo = new Int8Array(2 * IMAGE_EMBEDDING_DIM);
    photo[IMAGE_EMBEDDING_DIM + 3] = 5; // row 1 has a photo, row 0 does not
    const map = new Float32Array(EMBEDDING_DIM * IMAGE_EMBEDDING_DIM);
    const c = buildCatalog(columns(2), new Int8Array(2 * EMBEDDING_DIM), photo, map);
    expect(Array.from(c.hasPhoto!)).toEqual([0, 1]);
    expect(c.textToPhoto).not.toBeNull();
    expect(buildCatalog(columns(2), new Int8Array(2 * EMBEDDING_DIM), photo, new Float32Array(10)).textToPhoto).toBeNull();
  });

  it("refuses text vectors that don't match the catalogue", () => {
    expect(() => buildCatalog(columns(2), new Int8Array(EMBEDDING_DIM))).toThrow(/rows/);
  });
});
