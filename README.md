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

Status: working prototype — recommendation agents, photo search, 穿搭牆, 手帳 and personal wardrobe are available.

## 產品功能

### 穿搭牆

- 依價格、顏色、季節與場合複選篩選，並可切換「身形相近」或「最新」排序。
- 設定身高與身形後，優先顯示身形相近的使用者；體重有填時作為輔助條件。
- 瀏覽、收藏或購買其他使用者分享的整套穿搭。

### 手帳

手帳分成「我的收藏」與「我的穿搭」：

- 我的收藏收錄從「今天」與「穿搭牆」收藏的整套服裝及配件，並以可拖曳的去背貼紙呈現。
- 我的穿搭可上傳全身照；系統會在瀏覽器中嘗試移除單色背景，保留人物、包包與鞋子。可以記錄日期、場景、筆記與實際穿著次數。
- 發布至穿搭牆前可裁切或遮臉，且必須由使用者勾選公開同意。

### 我的

- 將真正擁有的衣服拍照去背後存入衣櫃，並在自由搭配區拖曳組合。
- 基本資料包含性別、身高與下拉式身形選項；體重、胸寬／胸圍、腰圍、肩寬及袖長皆為選填。

## Run it

```bash
npm install
echo 'OPENAI_API_KEY=sk-...' > .dev.vars   # never commit this file
npm run dev        # wrangler dev --remote: uses the shared R2 bucket outfit-assets
npm run check      # types, lint, tests, deploy dry-run
npm run smoke -- https://stylist.cechung.com
```
