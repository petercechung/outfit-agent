# 一句穿搭 v2 · stylist.cechung.com

**Features**
The app consists of four main pages:
Today: Describe your needs in one sentence, and AI recommends multiple outfits with styling reasons.
Outfit Wall: Browse other users’ outfit journals and find inspiration.
Journal: Your own complete Junk Journal, where you can add photos.
My Closet: Manage the clothes you actually own.
**Today**
The page is divided into two sections: Say It in One Sentence and Save My Clothes.
**Say It in One Sentence**
1.Say It in One Sentence:
Enter your outfit needs in one sentence. The system converts natural language into structured styling criteria and generates 3 complete outfits with styling reasons and items that can be purchased directly. The first column displays the complete outfit on a model. Individual items are shown afterward, and similar or identical items are also recommended within each item section as alternatives.
2.Closet Options (Off by Default):
3.Prioritize My Closet: When generating outfits, prioritize clothes you already own.
   Remind Me About Similar Items in My Closet: When you are about to purchase an item, the app will proactively remind you if you already own a similar piece.
4.Find Similar Items from Photos:
AI identifies each clothing item in a photo and finds the most similar, directly purchasable products in the database. You can then save them to your favorites.
5.Feedback & Adjustments:
After each recommendation, the app asks “What would you like to adjust?” You can provide feedback through quick-select options or by entering your own text.



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
