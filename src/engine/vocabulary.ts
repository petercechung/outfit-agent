// The catalogue's own vocabulary: the values H&M records for garment type and colour. These are facts about the
// data, used so the stylist agent can name exactly what to include or avoid. No judgement about what suits what.

export type Slot = "top" | "bottom" | "onepiece" | "outer" | "shoes" | "bag";
export const SLOTS: Slot[] = ["top", "bottom", "onepiece", "outer", "shoes", "bag"];

export const TYPES_BY_SLOT: Record<Slot, string[]> = {
  top: ["T-shirt", "Top", "Vest top", "Blouse", "Shirt", "Polo shirt", "Sweater", "Hoodie", "Bodysuit"],
  bottom: ["Trousers", "Skirt", "Shorts", "Leggings/Tights", "Outdoor trousers"],
  onepiece: ["Dress", "Jumpsuit/Playsuit", "Dungarees"],
  outer: ["Jacket", "Blazer", "Coat", "Cardigan", "Outdoor Waistcoat", "Tailored Waistcoat"],
  shoes: ["Sneakers", "Boots", "Sandals", "Heeled sandals", "Pumps", "Flat shoe", "Flat shoes", "Ballerinas", "Wedge",
    "Heels", "Bootie", "Other shoe"],
  bag: ["Bag", "Cross-body bag", "Shoulder bag", "Tote bag", "Backpack"],
};
export const PRODUCT_TYPES = Object.values(TYPES_BY_SLOT).flat();

export const COLOURS = ["Black", "White", "Grey", "Beige", "Mole", "Brown", "Pink", "Red", "Orange", "Yellow", "Green",
  "Khaki green", "Blue", "Turquoise", "Lilac Purple", "Metal"];
