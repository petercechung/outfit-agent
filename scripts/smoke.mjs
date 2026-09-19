// Checks a deployed version: node scripts/smoke.mjs [https://stylist.cechung.com]
const base = process.argv[2] ?? "https://stylist.cechung.com";
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const health = await (await fetch(`${base}/api/health`)).json();
if (health.items !== 11636) fail(`health: expected 11,636 items, got ${JSON.stringify(health)}`);
if (!health.photo_search) fail("health: photo search is off (text_to_image.f32 or vec_image.bin missing)");
if (!health.llm) fail("health: OPENAI_API_KEY is not set");
console.log(`✓ health: ${health.items} items, photo search on, model ${health.model}`);
const thumb = await fetch(`${base}/thumbs/0697031002.jpg`);
if (thumb.status !== 200 || thumb.headers.get("content-type") !== "image/jpeg") fail(`thumbnail: HTTP ${thumb.status}`);
console.log("✓ thumbnail served");
console.log("smoke ok");
