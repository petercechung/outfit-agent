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
  tally: string; // what their taps add up to, e.g. "likes Pink +2.5, Dress +2; avoids Black −3"
}

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/**
 * What the person's taps add up to. The page keeps a running score per colour, garment type and pattern
 * (js/shared/feedback.js: like +1, save +1.5, buy or wear +2, dislike −1, swapped out −0.7) and sends it with
 * every request. The agents read the strongest few as words; nothing in code ranks by them.
 */
function tallyOf(raw: unknown): string {
  const attrs = (raw && typeof raw === "object" ? (raw as { attrs?: unknown }).attrs : null) ?? {};
  const scores = Object.entries(attrs as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Math.abs(entry[1]) >= 1)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const say = (sign: number) => scores.filter(([, v]) => Math.sign(v) === sign).slice(0, 4)
    .map(([attr, v]) => `${attr.split(":").slice(1).join(":")} ${v > 0 ? "+" : ""}${v}`).join(", ");
  const likes = say(1);
  const avoids = say(-1);
  if (!likes && !avoids) return "";
  return `${likes ? `often likes ${likes}` : ""}${likes && avoids ? "; " : ""}${avoids ? `often avoids ${avoids}` : ""}`;
}

/** Reads what the page sent; anything missing is simply empty. */
export function personFrom(body: { memory?: unknown; reactions?: unknown; profile?: unknown; prefs?: unknown }): Person {
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
    tally: tallyOf(body.prefs),
  };
}

/** The block every agent reads; empty when there is nothing to know. */
export function describePerson(person: Person): string {
  const parts = [
    person.memory ? `What you remember about this person's style (they can read and edit this):\n${person.memory}` : "",
    person.body ? `Their body, as they described it: ${person.body}.` : "",
    person.tally ? `What their taps add up to so far (their own counts): ${person.tally}.` : "",
    person.reactions.length ? `How they reacted to earlier looks:\n${person.reactions.map((r) => `- ${r}`).join("\n")}` : "",
  ].filter(Boolean);
  return parts.length ? `About this person:\n${parts.join("\n")}` : "";
}
