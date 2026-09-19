import { describe, expect, it } from "vitest";
import { taiwanToday, tidyPlan } from "../src/agents/stylist";
import type { StylistPlan } from "../src/contracts";

const base = (looks: StylistPlan["looks"], kind: StylistPlan["kind"] = "outfit"): StylistPlan => ({
  kind, question: null, understood: "面試", looks,
  constraints: { gender: "women", budget_max_twd: null, avoid_colours: [], avoid_types: [] },
});
const p = (slot: string, extra = {}) => ({ slot, search: `a ${slot} in cotton`, label: slot, why: "因為", avoid: [], types: [], ...extra }) as never;

describe("tidyPlan", () => {
  it("keeps complete looks and drops ones without shoes or without a top-and-bottom or one-piece", () => {
    const plan = tidyPlan(base([
      { title: "A", idea: "", pieces: [p("top"), p("bottom"), p("shoes")] },
      { title: "B", idea: "", pieces: [p("onepiece"), p("shoes")] },
      { title: "C", idea: "", pieces: [p("top"), p("shoes")] },
      { title: "D", idea: "", pieces: [p("onepiece"), p("bag")] },
    ]));
    expect(plan.looks.map((l) => l.title)).toEqual(["A", "B"]);
  });

  it("keeps catalogue types only in the slot they belong to, and one piece per slot", () => {
    const plan = tidyPlan(base([{ title: "A", idea: "", pieces: [
      p("top", { types: ["Shirt", "Sandals", "Nonsense"] }), p("top"), p("bottom"), p("shoes", { types: ["Sandals"] }),
    ] }]));
    expect(plan.looks[0].pieces.map((x) => x.slot)).toEqual(["top", "bottom", "shoes"]);
    expect(plan.looks[0].pieces[0].types).toEqual(["Shirt"]);
    expect(plan.looks[0].pieces[2].types).toEqual(["Sandals"]);
  });

  it("asks instead of recommending when there is no usable look, and never keeps looks for other kinds", () => {
    expect(tidyPlan(base([{ title: "C", idea: "", pieces: [p("top")] }])).kind).toBe("vague");
    const offTopic = tidyPlan({ ...base([{ title: "A", idea: "", pieces: [p("onepiece"), p("shoes")] }], "off_topic"), question: "你要穿去哪裡？" });
    expect(offTopic.looks).toEqual([]);
    expect(offTopic.question).toBe("你要穿去哪裡？");
  });

  it("drops constraint values outside the catalogue vocabulary", () => {
    const plan = tidyPlan({ ...base([]), constraints: { gender: "women", budget_max_twd: 2500, avoid_colours: ["Black", "Beigeish"], avoid_types: ["Skirt", "Crown"] } });
    expect(plan.constraints).toEqual({ gender: "women", budget_max_twd: 2500, avoid_colours: ["Black"], avoid_types: ["Skirt"] });
  });
});

describe("taiwanToday", () => {
  it("is the date in Taiwan (UTC+8)", () => {
    expect(taiwanToday(Date.UTC(2026, 8, 19, 17, 0))).toBe("2026-09-20");
  });
});
