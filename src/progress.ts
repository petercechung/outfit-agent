// What the page shows while it waits: the stylist's plan as it is being written, and which step is running.
// The plan streams in as JSON; the readable fields are picked out as soon as each one is complete.

export type Thought = { key: "understood" | "title" | "idea" | "label" | "why"; value: string };
export type ProgressEvent = { type: "thought"; thought: Thought } | { type: "stage"; stage: "search" | "judge" | "revise" };

const FIELD = /"(understood|title|idea|label|why)"\s*:\s*("(?:[^"\\]|\\.)*")/g;

/** Every readable field that is already complete in the half-written plan, in the order written. */
export function thoughtsIn(partialJson: string): Thought[] {
  return [...partialJson.matchAll(FIELD)].map((m) => ({ key: m[1] as Thought["key"], value: JSON.parse(m[2]) as string }));
}

/** Calls `emit` once per new field as the plan grows. */
export function thoughtStream(emit: (t: Thought) => void): (soFar: string) => void {
  let sent = 0;
  return (soFar) => {
    const all = thoughtsIn(soFar);
    for (; sent < all.length; sent++) emit(all[sent]);
  };
}
