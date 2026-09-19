// What the agents know about the person, all of it kept in the person's own browser and sent with each request:
//   memory     a short paragraph about their style, written by the stylist agent and editable by them (「我的」)
//   reactions  likes / dislikes on looks since the memory was last updated, for the stylist to fold in
//   body       what they filled in under 我的資料
// Nothing here is scored or ranked in code; the agents read it as text.

export const MEMORY_MAX_CHARS = 600; // a paragraph, not a log: the stylist rewrites it rather than appending
const REACTIONS_MAX = 20;

export interface Person {
  memory: string;
  reactions: string[];
  body: string; // one line, e.g. "women, 158 cm, pear-shaped"
}

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** Reads what the page sent; anything missing is simply empty. */
export function personFrom(body: { memory?: unknown; reactions?: unknown; profile?: unknown }): Person {
  const p = (body.profile && typeof body.profile === "object" ? body.profile : {}) as Record<string, unknown>;
  const facts = [
    p.gender && p.gender !== "unspecified" ? String(p.gender) : "",
    Number(p.height_cm) ? `${Number(p.height_cm)} cm` : "",
    Number(p.weight_kg) ? `${Number(p.weight_kg)} kg` : "",
    p.body_type ? `body shape: ${clip(p.body_type, 30)}` : "",
  ].filter(Boolean);
  return {
    memory: clip(body.memory, MEMORY_MAX_CHARS * 2),
    reactions: Array.isArray(body.reactions) ? body.reactions.map((r) => clip(r, 120)).filter(Boolean).slice(-REACTIONS_MAX) : [],
    body: facts.join(", "),
  };
}

/** The block every agent reads; empty when there is nothing to know. */
export function describePerson(person: Person): string {
  const parts = [
    person.memory ? `What you remember about this person's style (they can read and edit this):\n${person.memory}` : "",
    person.body ? `Their body, as they described it: ${person.body}.` : "",
    person.reactions.length ? `How they reacted to earlier looks:\n${person.reactions.map((r) => `- ${r}`).join("\n")}` : "",
  ].filter(Boolean);
  return parts.length ? `About this person:\n${parts.join("\n")}` : "";
}
