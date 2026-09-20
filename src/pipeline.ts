// One request, end to end:
//
//   ② stylist plans several different looks  →  ① the engine finds products for every piece (one batch)
//   →  fill: the best product per piece, none reused across looks, cheaper swaps if over budget
//   →  ③ the critic looks at the photos against the person's words and keeps three
//   →  at most one revision of a single piece, only while there is time.
//
// No step here decides what suits what. Filling is bookkeeping; the judgements are the agents'.
import { judge } from "./agents/critic";
import { plan as stylistPlan } from "./agents/stylist";
import { type Closet, describeCloset, ownedItem, similarOwned } from "./closet";
import { EMBEDDING_DIM } from "./config";
import type { CriticVerdict, SearchHit, StylistPlan } from "./contracts";
import { loadCatalog } from "./engine/catalog";
import type { EncodedBy } from "./engine/encoder";
import { encodeForPhotos } from "./engine/encoder";
import { runSearches } from "./engine/run";
import { fillLooks, queryFor, withinBudget } from "./fill";
import type { Person } from "./person";
import { type ProgressEvent, searchTextsIn } from "./progress";

const REVISION_BEFORE_MS = 9000; // a revision costs another search; skip it once the request is this old

export interface LookView {
  id: string;
  title: string;
  idea: string;
  reason: string; // the critic's, or the stylist's idea when the critic did not answer
  total_price: number;
  over_budget: boolean;
  // `similar`: they already own the same type in the same colour (「衣櫃已有類似的」)
  pieces: { label: string; why: string; item: SearchHit; alternates: SearchHit[]; similar: { id: string; name: string } | null }[];
  revised: { piece: number; why: string } | null;
}

export interface RecommendResult {
  kind: StylistPlan["kind"];
  question: string | null;
  understood: string;
  constraints: StylistPlan["constraints"];
  looks: LookView[];
  problems: CriticVerdict["problems"];
  encoded_by: EncodedBy | null;
  critic: "ok" | "unavailable" | "skipped"; // skipped: no look could be made, so there was nothing to judge
  ms: { plan: number; search: number; judge: number; total: number };
  trace: { plan: StylistPlan; verdict: CriticVerdict | null }; // for the request history (src/history.ts)
  memory_update: string | null; // the stylist rewrote the person's style memory; the page saves it
  signals: { occasion: string | null; style_keywords: string[] }; // labels for 設計師洞察 (src/signals.ts)
}

/** `onEvent` (optional) hears the stylist's plan as it is written and each step as it starts. */
export async function recommend(
  env: Env, sentence: string, context = "", onEvent?: (e: ProgressEvent) => void, person?: Person, closet?: Closet,
): Promise<RecommendResult> {
  const t0 = Date.now();
  const wardrobe = closet ? describeCloset(closet) : "";
  // The catalogue and the garment vectors are wanted the moment the plan is ready, so both are started now:
  // R2 loads while the stylist writes, and each garment is encoded as soon as its line of the plan is complete.
  const catalogSoon = loadCatalog(env);
  catalogSoon.catch(() => {}); // handled where it is awaited
  let encoded = 0;
  const warming: Promise<unknown>[] = [];
  const encodeEarly = (soFar: string) => {
    const texts = searchTextsIn(soFar);
    if (texts.length <= encoded) return;
    const fresh = texts.slice(encoded);
    encoded = texts.length;
    warming.push(catalogSoon.then((catalog) => encodeForPhotos(env, catalog, fresh)).catch(() => {}));
  };
  const plan = await stylistPlan(
    env, sentence, context, onEvent && ((thought) => onEvent({ type: "thought", thought })), person, wardrobe, encodeEarly,
  );
  const tPlan = Date.now();
  const base = {
    kind: plan.kind, question: plan.question, understood: plan.understood, constraints: plan.constraints, memory_update: plan.memory,
    signals: { occasion: plan.occasion, style_keywords: plan.style_keywords },
  };
  if (plan.kind !== "outfit") {
    return {
      ...base, looks: [], problems: [], encoded_by: null, critic: "ok",
      ms: { plan: tPlan - t0, search: 0, judge: 0, total: tPlan - t0 }, trace: { plan, verdict: null },
    };
  }

  onEvent?.({ type: "stage", stage: "search" });
  const catalog = await catalogSoon;
  await Promise.all(warming); // whatever was encoded early is already in the encoder's cache
  // A piece the stylist took from the person's own wardrobe needs no search: it is the one garment it can be.
  const ownById = new Map([...(closet?.placed ?? []), ...(closet?.pool ?? [])].map((i) => [i.id, i]));
  const own = (piece: { own?: string | null }) => (piece.own ? ownById.get(piece.own) : undefined);
  const queries = plan.looks.flatMap((look) => look.pieces.filter((p) => !own(p)).map((p) => queryFor(p, plan.constraints)));
  const { results, by } = await runSearches(env, catalog, queries);
  let k = 0;
  const perLook = plan.looks.map((look) => look.pieces.map((p) => {
    const mine = own(p);
    if (!mine) return results[k++];
    return { hits: [{ ...ownedItem(mine), similarity: 1, matched_by: "photo" as const }], eligible: 1 };
  }));
  const filled = withinBudget(fillLooks(plan, perLook));
  const tSearch = Date.now();
  if (!filled.length) {
    // Nothing the person asked for is in the catalogue. Say so instead of sending the critic an empty page.
    return {
      ...base, looks: [], problems: [], encoded_by: by, critic: "skipped", trace: { plan, verdict: null },
      question: "目錄裡找不到符合這些條件的整套衣服。可以放寬一個條件嗎？例如顏色、款式或預算。",
      ms: { plan: tPlan - t0, search: tSearch - tPlan, judge: 0, total: Date.now() - t0 },
    };
  }

  let verdict: CriticVerdict;
  let critic: RecommendResult["critic"] = "ok";
  onEvent?.({ type: "stage", stage: "judge" });
  try {
    verdict = await judge(env, sentence, filled, person);
  } catch (error) {
    console.warn("critic unavailable:", (error as Error).message);
    critic = "unavailable";
    verdict = { keep: filled.slice(0, 3).map((l) => ({ id: l.id, reason: l.plan.idea })), problems: [], revise: null, question: null };
  }
  const tJudge = Date.now();

  // One revision at most: the critic kept a look but wants one garment searched again.
  const revised = new Map<string, { piece: number; why: string }>();
  const r = verdict.revise;
  const revisable = r && !filled.find((l) => l.id === r.id)?.items[r.piece].owned; // never replace their own garment
  if (r && revisable && Date.now() - t0 < REVISION_BEFORE_MS) {
    onEvent?.({ type: "stage", stage: "revise" });
    const look = filled.find((l) => l.id === r.id)!;
    const piece = { ...look.plan.pieces[r.piece], search: r.search, types: undefined };

    const exclude = filled.flatMap((l) => l.items.map((i) => i.article_id));
    const budget = plan.constraints.budget_max_twd;
    const room = budget ? budget - (look.total_price - look.items[r.piece].price) : undefined; // the swap must still fit
    const again = await runSearches(env, catalog, [queryFor(piece, plan.constraints, exclude, room)]);
    const hit = again.results[0].hits[0];
    if (hit) {
      look.total_price += hit.price - look.items[r.piece].price;
      look.items[r.piece] = hit;
      revised.set(look.id, { piece: r.piece, why: r.why });
    }
  }

  // Their own garments must not be swapped away by the critic's revision either: it only asked for a search.
  const captionVec = (id: string) => {
    const row = catalog.idToRow.get(id);
    return row === undefined ? null : catalog.text.subarray(row * EMBEDDING_DIM, (row + 1) * EMBEDDING_DIM);
  };
  // Three looks is what the person is promised. If the critic ranked fewer, the rest follow in the order they were
  // planned, each carrying whatever the critic said was wrong with it, so nothing is hidden.
  const keep = [...verdict.keep];
  for (const look of filled) {
    if (keep.length >= 3) break;
    if (keep.some((k) => k.id === look.id)) continue;
    const problem = verdict.problems.find((p) => p.id === look.id);
    keep.push({ id: look.id, reason: problem ? `評審的疑慮：${problem.problem}` : look.plan.idea });
  }
  // Other candidates the engine found for the same piece, for swapping one garment on the card.
  const shown = new Set(filled.flatMap((l) => l.items.map((i) => i.article_id)));
  const alternatesFor = (id: string, piece: StylistPlan["looks"][number]["pieces"][number]) => {
    const l = Number(id.slice(1)) - 1; // fill may have dropped pieces, so find this one in the original plan
    return perLook[l][plan.looks[l].pieces.indexOf(piece)].hits.filter((h) => !shown.has(h.article_id)).slice(0, 4);
  };
  const looks: LookView[] = keep.map(({ id, reason }) => {
    const look = filled.find((l) => l.id === id)!;
    return {
      id, title: look.plan.title, idea: look.plan.idea, reason, total_price: look.total_price,
      over_budget: Boolean(plan.constraints.budget_max_twd && look.total_price > plan.constraints.budget_max_twd),
      pieces: look.items.map((item, p) => ({
        label: look.plan.pieces[p].label, why: look.plan.pieces[p].why, item, alternates: alternatesFor(id, look.plan.pieces[p]),
        similar: closet && !item.owned ? similarOwned(closet, item, captionVec(item.article_id)) : null,
      })),
      revised: revised.get(id) ?? null,
    };
  });
  return {
    ...base, question: verdict.question ?? base.question, looks, problems: verdict.problems, encoded_by: by, critic,
    ms: { plan: tPlan - t0, search: tSearch - tPlan, judge: tJudge - tSearch, total: Date.now() - t0 },
    trace: { plan, verdict },
  };
}
