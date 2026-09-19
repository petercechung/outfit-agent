// How one feedback action changes a preference profile. Pure, so the live store (store.js) and the shopper
// simulation (simulate.js, also run by scripts/eval-loop.mjs) learn exactly the same way.
// The Worker rebuilds profiles with the same weights: keep in sync with FEEDBACK_WEIGHTS in src/config.ts.

/** How strongly each action moves the profile. Mirrors how much intent the action shows. */
export const FEEDBACK_WEIGHTS = { like: 1, save: 1.5, buy: 2, wear: 2, dislike: -1, swap_out: -0.7 };
export const POSITIVE_ACTIONS = new Set(["like", "save", "buy", "wear"]);
const MAX_REMEMBERED_ITEMS = 60;

export const emptyPrefs = () => ({ liked: [], disliked: [], attrs: {}, events: 0 });

const attributesOf = (item) => [`colour:${item.colour_master}`, `type:${item.type}`, `pattern:${item.pattern}`];

/** Applies one action on some items to `prefs` (mutated). The person's own clothes are ignored. */
export function applyFeedback(prefs, items, action) {
  const weight = FEEDBACK_WEIGHTS[action];
  for (const item of items.filter((i) => !i.owned)) {
    for (const attr of attributesOf(item)) {
      prefs.attrs[attr] = Math.round(((prefs.attrs[attr] || 0) + weight) * 100) / 100;
    }
    const [addTo, removeFrom] = weight > 0 ? ["liked", "disliked"] : ["disliked", "liked"];
    prefs[removeFrom] = prefs[removeFrom].filter((id) => id !== item.article_id);
    prefs[addTo] = [item.article_id, ...prefs[addTo].filter((id) => id !== item.article_id)].slice(0, MAX_REMEMBERED_ITEMS);
  }
  prefs.events += 1;
  return prefs;
}
