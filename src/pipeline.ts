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
import type { CriticVerdict, SearchHit, StylistPlan } from "./contracts";
import { loadCatalog } from "./engine/catalog";
import type { EncodedBy } from "./engine/encoder";
import { runSearches } from "./engine/run";
import { fillLooks, queryFor, withinBudget } from "./fill";
import type { Person } from "./person";
import type { ProgressEvent } from "./progress";

const REVISION_BEFORE_MS = 9000; // a revision costs another search; skip it once the request is this old

export interface LookView {
  id: string;
  title: string;
  idea: string;
  reason: string; // the critic's, or the stylist's idea when the critic did not answer
  total_price: number;
  over_budget: boolean;
  pieces: { label: string; why: string; item: SearchHit; alternates: SearchHit[] }[]; // alternates: "換一件"
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
}

/** `onEvent` (optional) hears the stylist's plan as it is written and each step as it starts. */
export async function recommend(
  env: Env, sentence: string, context = "", onEvent?: (e: ProgressEvent) => void, person?: Person,
): Promise<RecommendResult> {
  const t0 = Date.now();
  const plan = await stylistPlan(env, sentence, context, onEvent && ((thought) => onEvent({ type: "thought", thought })), person);
  const tPlan = Date.now();
  const base = {
    kind: plan.kind, question: plan.question, understood: plan.understood, constraints: plan.constraints, memory_update: plan.memory,
  };
  if (plan.kind !== "outfit") {
    return {
      ...base, looks: [], problems: [], encoded_by: null, critic: "ok",
      ms: { plan: tPlan - t0, search: 0, judge: 0, total: tPlan - t0 }, trace: { plan, verdict: null },
    };
  }

  onEvent?.({ type: "stage", stage: "search" });
  const catalog = await loadCatalog(env);
  const queries = plan.looks.flatMap((look) => look.pieces.map((p) => queryFor(p, plan.constraints)));
  const { results, by } = await runSearches(env, catalog, queries);
  let k = 0;
  const perLook = plan.looks.map((look) => look.pieces.map(() => results[k++]));
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
  if (r && Date.now() - t0 < REVISION_BEFORE_MS) {
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

  const keep = verdict.keep.length ? verdict.keep : filled.slice(0, 3).map((l) => ({ id: l.id, reason: l.plan.idea }));
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
