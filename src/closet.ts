// 我的衣櫃: the person's own clothes, sent by the page with a recommendation (the photos never leave the browser).
//
//   placed   garments they put on the mannequin (從我的衣服搭): every look must use them
//   pool     the rest of their wardrobe, offered to the stylist when 優先用我的衣櫃 is on
//   warn     mark a recommended product when they already own the same type in the same colour
//
// The stylist decides which of their clothes to wear; nothing here scores or ranks.

import { EMBEDDING_DIM } from "./config";
import type { Item } from "./contracts";
import { PRODUCT_TYPES, SLOTS, type Slot, TYPES_BY_SLOT } from "./engine/vocabulary";

export interface ClosetItem {
  id: string; // "c1" while planning; "closet:<their id>" in the answer, which the page matches to the photo
  own_id: string;
  name: string;
  slot: Slot;
  type: string;
  colour: string;
  colour_master: string;
  pattern: string;
  description: string;
  vec: Int8Array | null; // caption vector, same space as the catalogue's (for 「衣櫃已有類似的」)
}

export interface Closet {
  placed: ClosetItem[];
  pool: ClosetItem[];
  warn: boolean;
}

const str = (v: unknown, n = 120) => (typeof v === "string" ? v.slice(0, n) : "");

function itemFrom(raw: unknown, k: number): ClosetItem | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const type = PRODUCT_TYPES.includes(str(a.type)) ? str(a.type) : "";
  const slot = (SLOTS as readonly string[]).includes(str(a.slot)) ? (str(a.slot) as Slot) : null;
  if (!type || !slot || !TYPES_BY_SLOT[slot].includes(type)) return null;
  const vec = Array.isArray(a.vec) && a.vec.length === EMBEDDING_DIM ? Int8Array.from(a.vec.map((x) => Math.max(-127, Math.min(127, Math.round(Number(x) || 0))))) : null;
  return {
    id: `c${k + 1}`, own_id: str(a.id, 60) || `c${k + 1}`, name: str(a.name, 60) || type, slot, type,
    colour: str(a.colour, 40), colour_master: str(a.colour_master, 40), pattern: str(a.pattern, 40),
    description: str(a.description, 200), vec,
  };
}

const MAX_CLOSET = 60; // a wardrobe the stylist can read in one go

/** What the page sent, kept only when the person turned the closet options on (or put clothes on the mannequin). */
export function closetFrom(body: { closet_items?: unknown; closet_pool?: unknown; closet_options?: unknown }): Closet {
  const options = (body.closet_options ?? {}) as Record<string, unknown>;
  const read = (v: unknown) => (Array.isArray(v) ? v.slice(0, MAX_CLOSET).map(itemFrom).filter((x): x is ClosetItem => x !== null) : []);
  const placed = read(body.closet_items);
  return {
    placed: placed.map((item, k) => ({ ...item, id: `p${k + 1}` })),
    pool: options.use_closet ? read(body.closet_pool) : [],
    warn: options.warn_similar === true,
  };
}

/** The wardrobe as the stylist reads it; empty when there is nothing to offer. */
export function describeCloset(closet: Closet): string {
  const line = (i: ClosetItem) => `- ${i.id}: ${i.name} — ${i.type}, ${i.colour || i.colour_master}, ${i.pattern}${i.description ? `. ${i.description}` : ""}`;
  const parts = [
    closet.placed.length
      ? `The person has put these of their own clothes on the mannequin. EVERY look must use them (set \`own\` to the id):\n${closet.placed.map(line).join("\n")}`
      : "",
    closet.pool.length
      ? `They asked you to use their own wardrobe where it fits. Use a garment by setting \`own\` to its id instead of searching:\n${closet.pool.map(line).join("\n")}`
      : "",
  ].filter(Boolean);
  return parts.join("\n\n");
}

/** Their garment as a result item: the page recognises "closet:<id>" and puts the photo back. */
export function ownedItem(item: ClosetItem): Item & { owned: true } {
  return {
    article_id: `closet:${item.own_id}`, name: item.name, type: item.type, slot: item.slot, colour: item.colour,
    colour_master: item.colour_master, pattern: item.pattern, price: 0, description: item.description, image: "",
    owned: true,
  };
}

/**
 * 「你的衣櫃已經有類似的」: the same garment type in the same colour is already a warning worth showing; the
 * caption vectors decide which of those is the closest match.
 */
export function similarOwned(closet: Closet, item: Item, catalogVec: Int8Array | null): { id: string; name: string; similarity: number } | null {
  if (!closet.warn) return null;
  let best: { id: string; name: string; similarity: number } | null = null;
  for (const own of [...closet.placed, ...closet.pool]) {
    if (own.type !== item.type || own.colour_master !== item.colour_master) continue;
    let similarity = 1;
    if (own.vec && catalogVec) {
      let dot = 0;
      for (let k = 0; k < EMBEDDING_DIM; k++) dot += catalogVec[k] * own.vec[k];
      similarity = Math.round((dot / (127 * 127)) * 100) / 100;
    }
    if (!best || similarity > best.similarity) best = { id: own.own_id, name: own.name, similarity };
  }
  return best;
}
