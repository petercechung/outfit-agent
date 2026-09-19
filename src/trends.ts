// What fashion media are talking about this week, for the analyst agent. The snapshot is collected by v1
// (outfit.cechung.com /api/trends: Google Trends Taiwan, Vogue, Vogue Taiwan, GQ Taiwan, WWD, Hypebeast…).
import { V1 } from "./routes/proxy";

interface Snapshot {
  updated_at: number;
  rising: { kind: string; label: string; mentions: number; examples: { title: string; source: string }[] }[];
}

const FRESH_MS = 30 * 60e3; // the snapshot itself changes a few times a day
let cached: { at: number; brief: string } | null = null;

/** A short list the model can cite: each rising garment, colour or style with one headline and its source. */
export async function trendBrief(): Promise<string> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.brief;
  try {
    const res = await fetch(`${V1}/api/trends?lang=zh`, { signal: AbortSignal.timeout(3000) });
    const body = (await res.json()) as { snapshot?: Snapshot } & Partial<Snapshot>;
    const snap = (body.snapshot ?? body) as Snapshot;
    const lines = (snap.rising ?? []).slice(0, 15).map((r) => {
      const ex = r.examples?.[0];
      return `- ${r.kind} ${r.label}: ${r.mentions} headlines this week${ex ? `, e.g. 「${ex.title}」(${ex.source})` : ""}`;
    });
    const day = new Date(snap.updated_at + 8 * 3600e3).toISOString().slice(0, 10);
    const brief = lines.length ? `Fashion media this week (collected ${day}):\n${lines.join("\n")}` : "";
    cached = { at: Date.now(), brief };
    return brief;
  } catch {
    return ""; // no trends: the analyst says so rather than inventing them
  }
}
