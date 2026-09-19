import { describe, expect, it } from "vitest";
import { thoughtStream, thoughtsIn } from "../src/progress";

const plan = JSON.stringify({
  kind: "outfit", question: null, understood: "下週一面試，想要「簡約」",
  looks: [{ title: "俐落柔和", idea: "白襯衫配錐形褲", pieces: [{ slot: "top", search: "a white shirt", label: "白襯衫", why: "乾淨" }] }],
});

describe("thoughtsIn", () => {
  it("picks the readable fields in the order written, with escapes decoded", () => {
    expect(thoughtsIn(plan).map((t) => `${t.key}=${t.value}`)).toEqual(
      ["understood=下週一面試，想要「簡約」", "title=俐落柔和", "idea=白襯衫配錐形褲", "label=白襯衫", "why=乾淨"]);
    expect(thoughtsIn('{"understood":"說 \\"不要\\" 花紋"}')[0].value).toBe('說 "不要" 花紋');
  });

  it("waits until a field is complete", () => {
    expect(thoughtsIn('{"kind":"outfit","understood":"下週一面')).toEqual([]);
  });
});

describe("thoughtStream", () => {
  it("emits each field once as the text grows", () => {
    const seen: string[] = [];
    const feed = thoughtStream((t) => seen.push(t.key));
    for (let n = 1; n <= plan.length; n++) feed(plan.slice(0, n));
    expect(seen).toEqual(["understood", "title", "idea", "label", "why"]);
  });
});
