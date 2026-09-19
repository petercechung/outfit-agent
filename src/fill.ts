// Filling planned looks with products — pure bookkeeping, no network, no judgement (see pipeline.ts).
import type { FilledLook, Piece, SearchQuery, SearchResult, StylistPlan } from "./contracts";

const CANDIDATES_PER_PIECE = 8; // enough alternatives for distinct looks and budget swaps

export function queryFor(piece: Piece, constraints: StylistPlan["constraints"], exclude: string[] = []): SearchQuery {
  return {
    slot: piece.slot, text: piece.search, avoid: piece.avoid, gender: constraints.gender,
    types: piece.types?.length ? piece.types : undefined,
    avoid_types: constraints.avoid_types, avoid_colours: constraints.avoid_colours,
    exclude_ids: exclude, limit: CANDIDATES_PER_PIECE,
  };
}

/**
 * Turns each planned look into products: the best candidate per piece that no earlier look uses. If the person
 * gave a budget, swaps in cheaper candidates — each time the one that saves the most per unit of similarity
 * lost — until the look fits or nothing cheaper is left (then it is marked over budget; the critic sees prices).
 */
export function fillLooks(plan: StylistPlan, results: SearchResult[][]): (FilledLook & { over_budget: boolean })[] {
  const used = new Set<string>();
  const budget = plan.constraints.budget_max_twd;
  const filled: (FilledLook & { over_budget: boolean })[] = [];
  plan.looks.forEach((look, l) => {
    const options = results[l].map((r) => r.hits.filter((h) => !used.has(h.article_id)));
    if (options.some((o) => !o.length)) return; // a piece with nothing left: this look cannot be made
    const pick = options.map(() => 0);
    const total = () => pick.reduce((s, k, p) => s + options[p][k].price, 0);
    while (budget && total() > budget) {
      let best = null as { p: number; k: number; value: number } | null;
      options.forEach((opt, p) => {
        const current = opt[pick[p]];
        opt.forEach((alt, k) => {
          const saving = current.price - alt.price;
          if (saving <= 0) return;
          const value = saving / (Math.max(0, current.similarity - alt.similarity) + 1e-3);
          if (!best || value > best.value) best = { p, k, value };
        });
      });
      if (best === null) break;
      pick[best.p] = best.k;
    }
    const items = pick.map((k, p) => options[p][k]);
    items.forEach((i) => used.add(i.article_id));
    filled.push({ id: `L${l + 1}`, plan: look, items, total_price: total(), over_budget: Boolean(budget && total() > budget) });
  });
  return filled;
}
