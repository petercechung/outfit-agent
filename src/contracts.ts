// The fixed interfaces between the three parts. Each part can be rebuilt behind its interface without touching
// the others; changing an interface is a team decision, because different people own different parts.
//
//   ① engine   search(SearchQuery) → SearchResult          facts only: types, colours, prices, photos
//   ② stylist  plan(sentence) → StylistPlan                decides what to wear; writes garments to search for
//   ③ critic   judge(sentence, FilledLook[]) → CriticVerdict  looks at the outfits' photos against the sentence
//
// Every value that names a garment type or a colour uses the catalogue's own vocabulary (engine/vocabulary.ts).
import type { Slot } from "./engine/vocabulary";

// ---------------------------------------------------------------- ① engine

export interface SearchQuery {
  slot: Slot;
  text: string; // one garment in English; style and occasion words are understood ("a sweet feminine top")
  avoid?: string[]; // what to move away from, each written POSITIVELY: "a top with thin spaghetti straps"
  gender: "women" | "men" | "any";
  types?: string[]; // only these catalogue types, e.g. ["Sandals"]; omitted = any type in the slot
  avoid_types?: string[];
  avoid_colours?: string[];
  price_max?: number; // NT$ for this one item
  exclude_ids?: string[]; // e.g. items already used in another look
  limit: number;
}

/** One catalogue item, as the agents and the page see it. */
export interface Item {
  owned?: true; // one of the person's own clothes (src/closet.ts), not a product to buy
  article_id: string;
  name: string;
  type: string;
  slot: string;
  colour: string;
  colour_master: string;
  pattern: string;
  price: number; // NT$
  description: string;
  image: string; // /thumbs/<article_id>.jpg
}

export interface SearchHit extends Item {
  similarity: number; // cosine between the query and the item
  matched_by: "photo" | "caption"; // photo when the item has one; the caption otherwise
}

export interface SearchResult {
  hits: SearchHit[]; // best first, at most `limit`
  eligible: number; // items that passed the filters
  types_dropped?: true; // `types` matched nothing that passes the other filters, so the whole slot was searched
}

// ---------------------------------------------------------------- ② stylist

export type RequestKind = "outfit" | "vague" | "off_topic" | "care";

/** One garment the stylist wants, and why the sentence calls for it. */
export interface Piece {
  slot: Slot;
  search: string; // English, catalogue language — what the engine searches with
  label: string; // the same garment in the person's language, short, for the card
  why: string; // the reasoning from the person's words to this garment, in their language
  types?: string[]; // optional: restrict to these catalogue types when the stylist is sure (e.g. ["Coat"])
  avoid?: string[]; // what this piece must not look like, written positively ("a busy floral print")
  own?: string | null; // id of one of the person's own garments (src/closet.ts) to wear instead of searching
}

export interface LookPlan {
  title: string; // a short name for the idea, in the person's language
  idea: string; // one sentence: why this look answers the request
  pieces: Piece[];
}

export interface StylistPlan {
  kind: RequestKind;
  question: string | null; // asked instead of recommending when kind is not "outfit"
  understood: string; // what the stylist took from the sentence, in the person's language
  constraints: {
    gender: "women" | "men" | "any";
    budget_max_twd: number | null; // only when the person gave one
    avoid_colours: string[]; // only what the person said
    avoid_types: string[];
  };
  looks: LookPlan[]; // several different complete outfits when kind is "outfit"; empty otherwise
  memory: string | null; // the person's style memory, rewritten when they revealed a lasting preference (src/person.ts)
  // Labels for the designers' demand report only (src/signals.ts); no part of the recommendation uses them.
  occasion: string | null;
  style_keywords: string[];
}

// ---------------------------------------------------------------- ③ critic

export interface FilledLook {
  id: string;
  plan: LookPlan;
  items: SearchHit[]; // items[k] fills plan.pieces[k]
  total_price: number;
}

export interface CriticVerdict {
  keep: { id: string; reason: string }[]; // best first, at most three
  problems: { id: string; piece: number; problem: string }[]; // what does not answer the sentence, and where
  revise: { id: string; piece: number; search: string; why: string } | null; // one piece to search again, at most
  question: string | null; // when nothing fits well enough, what to ask the person
}
