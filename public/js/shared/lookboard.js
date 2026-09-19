// 一鍵穿搭: the whole look on a figure, collaged from the real product photos. Nothing is generated: each garment
// is its own packshot with the background removed (cutout.js), cropped, then scaled into its body zone. The
// length and fit hints below decide how far down a skirt goes or how wide a relaxed coat sits, so a midi skirt
// and a pair of shorts don't come out the same size.
import { L } from "./i18n.js";
import { esc } from "./ui.js";

/** The body, in % of a 3:5 stage. Everything else is measured from these lines. */
const BODY = { shoulder: 16, waist: 44, hip: 53, floor: 97 };

export const FIGURE = `<svg class="figure" viewBox="0 0 300 500" aria-hidden="true">
  <circle cx="150" cy="44" r="28"/><path d="M138 70h24v18h-24z"/>
  <path d="M92 94q58-20 116 0l12 150q-70 18-140 0z"/>
  <path d="M92 98 64 232l16 4 26-112M208 98l28 134-16 4-26-112"/>
  <path d="M100 242h100l-10 236h-32l-8-184-8 184h-32z"/></svg>`;

/** Words in a product's name or description that change how a garment is drawn. */
const HINTS = [
  ["crop", /crop|短版|露臍/i], ["long", /tunic|longline|長版|及臀/i],
  ["mini", /mini|短裙|超短/i], ["knee", /knee|及膝/i], ["midi", /midi|中長|過膝/i], ["maxi", /maxi|長裙|及踝/i],
  ["short", /shorts|短褲|熱褲/i], ["highWaist", /high waist|high-waist|高腰/i],
  ["wide", /wide|flare|palazzo|寬版|寬褲|落地/i], ["relaxed", /oversize|relaxed|loose|寬鬆|落肩/i],
  ["slim", /slim|skinny|fitted|窄版|合身/i],
];

/** Where each garment's hem sits, by type then by hint (% of the stage). */
const HEM = { Shorts: 62, "Leggings/Tights": 88, Skirt: 72, Trousers: 90, "Outdoor trousers": 90 };
const SKIRT_HEM = { mini: 60, knee: 70, midi: 80, maxi: 92 };
const DRESS_HEM = { mini: 62, knee: 72, midi: 82, maxi: 94 };

const has = (hints, name) => hints.includes(name);

function hintsOf(item) {
  const text = `${item.name ?? ""} ${item.desc ?? ""} ${item.type ?? ""}`;
  return HINTS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

/** The box a garment is drawn in: {left, top, width, height} in % of the stage. */
function zone(item, hints) {
  const wide = has(hints, "relaxed") || has(hints, "wide");
  const centred = (width, top, bottom) => ({ left: 50 - width / 2, top, width, height: bottom - top });
  switch (item.slot) {
    case "top": {
      const width = has(hints, "relaxed") ? 50 : has(hints, "slim") ? 38 : 44;
      const hem = has(hints, "crop") ? 38 : has(hints, "long") ? 52 : 46;
      return centred(width, BODY.shoulder, hem);
    }
    case "outer": {
      // Slightly wider than the top and drawn behind it, so it reads as an open jacket.
      const long = /Coat/i.test(item.type ?? "") || has(hints, "long");
      return centred(wide ? 62 : 58, BODY.shoulder - 1, long ? 72 : 54);
    }
    case "bottom": {
      const top = has(hints, "highWaist") ? BODY.waist - 3 : BODY.waist;
      const skirt = item.type === "Skirt";
      const hint = ["maxi", "midi", "knee", "mini"].find((h) => has(hints, h));
      const hem = has(hints, "short") ? 62
        : hint ? (skirt ? SKIRT_HEM : DRESS_HEM)[hint]
        : HEM[item.type] ?? 88;
      return centred(skirt ? (wide ? 48 : 40) : wide ? 42 : 34, top, hem);
    }
    case "onepiece": {
      const hint = ["maxi", "midi", "knee", "mini"].find((h) => has(hints, h));
      return centred(wide ? 52 : 46, BODY.shoulder, hint ? DRESS_HEM[hint] : 78);
    }
    case "shoes":
      return centred(30, BODY.floor - 11, BODY.floor);
    case "bag":
      return { left: 68, top: BODY.hip - 6, width: 26, height: 20 };
    default:
      return null;
  }
}

// Later slots are drawn on top: the jacket sits behind the top, the shoes in front of everything.
const PAINT_ORDER = ["outer", "bottom", "top", "onepiece", "bag", "shoes"];

/**
 * The look on a figure. `items` are outfit items ({slot, type, name, desc, image}); accessories and anything
 * without a photo are left out. The tiles underneath stay the place to tap — this is the picture.
 */
export function lookBoard(items) {
  const drawn = PAINT_ORDER.flatMap((slot) => items.filter((item) => item.slot === slot && item.image));
  if (!drawn.length) return "";
  const layers = drawn.map((item) => {
    const box = zone(item, hintsOf(item));
    if (!box) return "";
    const style = `left:${box.left}%;top:${box.top}%;width:${box.width}%;height:${box.height}%`;
    return `<img class="lookboard-piece" data-cutout src="${esc(item.image)}" alt="${esc(item.name ?? "")}" style="${style}" loading="lazy">`;
  }).join("");
  return `<figure class="lookboard">
    <div class="lookboard-stage">${FIGURE}${layers}</div>
    <figcaption class="muted">${L("用實際商品照片拼成的示意圖，不是 AI 生成的圖",
      "Collaged from the real product photos — not an AI-generated image")}</figcaption>
  </figure>`;
}
