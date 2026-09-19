import { describe, expect, it } from "vitest";
import { tidyVerdict } from "../src/agents/critic";
import type { SearchHit, SearchResult, StylistPlan } from "../src/contracts";
import { fillLooks, queryFor, withinBudget } from "../src/fill";

const hit = (id: string, price: number, similarity: number): SearchHit => ({
  article_id: id, name: id, type: "T", slot: "top", colour: "Black", colour_master: "Black", pattern: "Solid",
  price, description: "", image: `/thumbs/${id}.jpg`, similarity, matched_by: "photo",
});
const res = (...hits: SearchHit[]): SearchResult => ({ hits, eligible: hits.length });
const piece = (slot: string) => ({ slot, search: slot, label: slot, why: "", avoid: [], types: [] }) as never;
const plan = (looks: number, budget: number | null = null): StylistPlan => ({
  kind: "outfit", question: null, understood: "",
  constraints: { gender: "women", budget_max_twd: budget, avoid_colours: [], avoid_types: [] },
  looks: Array.from({ length: looks }, (_, l) => ({ title: `T${l}`, idea: "", pieces: [piece("onepiece"), piece("shoes")] })),
});

describe("fillLooks", () => {
  it("takes the best product per piece and never reuses one across looks", () => {
    const dress = res(hit("d1", 900, 0.9), hit("d2", 800, 0.8));
    const shoes = res(hit("s1", 500, 0.9), hit("s2", 400, 0.7));
    const looks = fillLooks(plan(2), [[dress, shoes], [dress, shoes]]);
    expect(looks.map((l) => l.items.map((i) => i.article_id))).toEqual([["d1", "s1"], ["d2", "s2"]]);
  });

  it("drops a look when a piece has nothing left", () => {
    const one = res(hit("d1", 900, 0.9));
    expect(fillLooks(plan(2), [[one, res(hit("s1", 1, 1))], [one, res(hit("s2", 1, 1))]])).toHaveLength(1);
  });

  it("swaps in cheaper products until the look fits the budget, losing as little similarity as it can", () => {
    const dress = res(hit("d1", 2000, 0.9), hit("d2", 1000, 0.89), hit("d3", 500, 0.5));
    const shoes = res(hit("s1", 800, 0.9), hit("s2", 300, 0.6));
    const [look] = fillLooks(plan(1, 1900), [[dress, shoes]]);
    expect(look.items.map((i) => i.article_id)).toEqual(["d2", "s1"]); // 1,800: the near-identical cheaper dress
    expect(look.over_budget).toBe(false);
  });

  it("marks a look over budget when nothing cheaper is left", () => {
    const [look] = fillLooks(plan(1, 100), [[res(hit("d1", 900, 0.9)), res(hit("s1", 500, 0.9))]]);
    expect(look.over_budget).toBe(true);
  });
});

describe("budget", () => {
  it("never searches for an item dearer than the whole budget", () => {
    expect(queryFor(piece("top"), plan(1, 2500).constraints).price_max).toBe(2500);
    expect(queryFor(piece("top"), plan(1).constraints).price_max).toBeUndefined();
    expect(queryFor(piece("top"), plan(1, 2500).constraints, [], 700).price_max).toBe(700); // a swap within a look
  });

  it("shows over-budget looks only when none fits", () => {
    const a = { id: "a", over_budget: false };
    const b = { id: "b", over_budget: true };
    expect(withinBudget([b, a])).toEqual([a]);
    expect(withinBudget([b])).toEqual([b]);
  });
});

describe("tidyVerdict", () => {
  const filled = fillLooks(plan(2), [[res(hit("d1", 1, 1)), res(hit("s1", 1, 1))], [res(hit("d2", 1, 1)), res(hit("s2", 1, 1))]]);
  it("keeps only real looks, once each, and a revision only for a kept look's real piece", () => {
    const v = tidyVerdict({
      keep: [{ id: "L2", reason: "a" }, { id: "L9", reason: "b" }, { id: "L2", reason: "c" }],
      problems: [{ id: "L1", piece: 5, problem: "x" }, { id: "L1", piece: 1, problem: "sandals" }],
      revise: { id: "L1", piece: 0, search: "a coat", why: "冷" }, question: null,
    }, filled);
    expect(v.keep).toEqual([{ id: "L2", reason: "a" }]);
    expect(v.problems).toEqual([{ id: "L1", piece: 1, problem: "sandals" }]);
    expect(v.revise).toBeNull(); // L1 was not kept
  });
});
