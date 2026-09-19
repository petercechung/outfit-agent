// Prints the request history from the production database (src/history.ts). Needs `wrangler login`.
//   npm run history                  the last 20 requests
//   npm run history -- 50            the last 50
//   npm run history -- 20 小明        the last 20 from tester 小明
//   npm run history -- 1 --full      the newest request with the stylist's plan and the critic's verdict
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const full = args.includes("--full");
const [limit = "20", tester] = args.filter((a) => a !== "--full");
if (!/^\d+$/.test(limit)) throw new Error("the first argument is how many requests to show");
const where = tester ? `WHERE tester = '${tester.replaceAll("'", "''")}'` : "";
const sql = `SELECT * FROM requests ${where} ORDER BY id DESC LIMIT ${Number(limit)}`;
const out = execFileSync("npx", ["wrangler", "d1", "execute", "outfit-agent-db", "--remote", "--json", "--command", sql], { encoding: "utf8" });
const rows = JSON.parse(out)[0].results;

for (const r of rows.reverse()) {
  const who = r.tester ?? `browser ${String(r.client_id ?? "?").slice(0, 8)}`;
  console.log(`\n#${r.id}  ${r.created_at}  ${who}  ${r.turn}${r.budget_max_twd ? `  budget NT$${r.budget_max_twd}` : ""}  ${r.ms_total ?? "-"} ms`);
  console.log(`  「${r.sentence}」`);
  if (r.error) console.log(`  ERROR ${r.error}`);
  if (r.understood) console.log(`  understood: ${r.understood}`);
  if (r.question) console.log(`  asked back (${r.kind}): ${r.question}`);
  for (const look of JSON.parse(r.looks ?? "[]")) {
    console.log(`  ${look.id} ${look.title}  NT$${look.total_price}${look.over_budget ? "  OVER BUDGET" : ""}${look.revised ? "  (critic swapped one piece)" : ""}`);
    for (const i of look.items) console.log(`      ${i.slot.padEnd(8)} NT$${String(i.price).padEnd(5)} ${i.name}  [${i.article_id}]`);
  }
  if (full) console.log(`  plan: ${r.plan}\n  verdict: ${r.verdict}`);
}
