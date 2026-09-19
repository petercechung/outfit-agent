import { describe, expect, it } from "vitest";
import { describePerson, personFrom } from "../src/person";

describe("person", () => {
  it("reads memory, reactions and body facts, and describes them for the agents", () => {
    const person = personFrom({
      memory: "喜歡日系甜美，不穿黑色。", reactions: ["不喜歡：黑色 Bag「Sara」", ""],
      profile: { gender: "women", height_cm: 158, body_type: "pear", weight_kg: null },
    });
    expect(person.body).toBe("women, 158 cm, body shape: pear");
    expect(person.reactions).toEqual(["不喜歡：黑色 Bag「Sara」"]);
    const text = describePerson(person);
    expect(text).toContain("喜歡日系甜美，不穿黑色。");
    expect(text).toContain("158 cm");
  });

  it("says nothing when nothing is known", () => {
    expect(describePerson(personFrom({}))).toBe("");
  });
});
