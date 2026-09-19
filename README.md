# 一句穿搭 v2 · stylist.cechung.com

v2 of the one-sentence outfit recommender for the 2026 梅竹黑客松 × 聚陽實業 challenge. v1 (rule-based) stays live at
[outfit.cechung.com](https://outfit.cechung.com) in `petercechung/MeiChu`.

v2 has three parts and no styling rules in code:

1. **Engine** (`src/engine/`) — facts about 11,636 H&M items and a search over them. A sentence is matched against
   product *photos* through a learned map from the text-embedding space into the FashionCLIP photo space.
2. **Stylist agent** (`src/agents/`) — reads the sentence, decides what to wear (a coat if it will be cold, a
   collared shirt for an interview) and asks the engine for concrete garments.
3. **Critic agent** (`src/agents/`) — looks at the finished outfits' photos against the original sentence and keeps
   the best three.

Status: step 1 of 7 — Worker, data and photo search are live; the agents are being built.

## Run it

```bash
npm install
echo 'OPENAI_API_KEY=sk-...' > .dev.vars   # never commit this file
npm run dev        # wrangler dev --remote: uses the shared R2 bucket outfit-assets
npm run check      # types, lint, tests, deploy dry-run
npm run smoke -- https://stylist.cechung.com
```
