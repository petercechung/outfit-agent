# 一句穿搭 v2 — Outfit in a Sentence

Say one sentence — 「下週一面試，想要簡約但不要太死板」 — and get three complete, purchasable outfits from a real
catalogue of 11,636 H&M items, each garment explained, and change them by saying what you want different.

Built for the 2026 梅竹黑客松 × 聚陽實業 challenge. Live: **https://stylist.cechung.com** (interface in 中文/EN).

v1, the rule-based version this replaces, is still live at [outfit.cechung.com](https://outfit.cechung.com)
(repo `petercechung/MeiChu`), and v2 still serves a few of its pages through a proxy (see *What v2 does not own*).

---

## What makes it different

**No styling rules in code.** v1 decided what to wear with hand-written rules: weather bands, formality tables,
colour-harmony scores. Every wrong recommendation traced back to one of them. In v2 the judgement belongs to
language models, and the code only knows facts about the catalogue. If it will be cold in Seoul, the stylist agent
searches for a coat because it knows Seoul is cold — nothing in the code mentions coats or temperatures.

**Search is over product photos, not words.** A garment description is embedded with FashionCLIP
(`Marqo/marqo-fashionCLIP`) in the same space as the product photography, so 「a sheer blouse with puff sleeves」
finds garments that *look* like that, not ones whose title happens to match. Five kinds of women's top are told
apart from the photo alone 86.5% of the time.

**Four agents, each with one job:**

| | Agent | What it does | Sees |
|---|---|---|---|
| ① | **Engine** (`src/engine/`) | facts only: gender, garment type, colour, price, photo similarity | — |
| ② | **Stylist** (`src/agents/stylist.ts`) | reads the sentence, decides what to wear, writes the garments to search for | the sentence, the person's style memory, their wardrobe |
| ③ | **Critic** (`src/agents/critic.ts`) | looks at the finished outfits' photos against the sentence, keeps three, may swap one piece | product photos |
| ④ | **Analyst** (`src/agents/analyst.ts`) | after the looks are on screen, a slower write-up of each one | photos + this week's fashion headlines |

The three parts talk through fixed interfaces in [`src/contracts.ts`](src/contracts.ts), so any one of them can be
rebuilt without touching the others, and each has its own debug endpoint.

---

## How one request flows

```
POST /api/recommend  {text, memory, reactions, profile, closet…}
  │
  ├─ ② stylist — one streamed call
  │     kind: outfit | vague | off_topic | care      (asks a question instead of guessing)
  │     constraints: only what the person said       (budget, colours refused, gender)
  │     4 different complete looks, each garment written as a product page would describe it
  │     … streams to the page as it is written, so the wait is not blank
  │
  ├─ ① engine — every garment of every look in one batch
  │     FashionCLIP text encoder (Cloudflare Container) → photo-space vector
  │     filters are facts; ranking is photo similarity − 0.5 × similarity to what to avoid
  │
  ├─ fill — best product per piece, none reused across looks, cheaper swaps until the budget fits
  │
  ├─ ③ critic — one vision call over every filled look → keeps three, may re-search one piece
  │
  └─ answer, then ④ analyst per look (streamed into the card)
```

Typical timing: first text on screen **~1.5 s**, looks **13–17 s**, each analysis **3–5 s** after that.

---

## Closing the loop back to design

The challenge asks for consumer intent to reach 開款・選款・備料. Every recommendation also writes an anonymous
demand signal ([`src/signals.ts`](src/signals.ts)): the de-identified sentence, the occasion and style words, the
budget, what was refused, and **whether the catalogue could answer at all**. 設計師洞察 turns those into decisions,
e.g. *「米色」佔需求 28%，只佔商品 8% → 提前準備這個方向的布料* or *「海邊」的整套供給不足 → 評估開發新款*.

Personal details are removed before storage ([`src/deidentify.ts`](src/deidentify.ts)) and a flagged sentence is
dropped entirely. No tester name, browser id or IP address goes into that table.

## Personalisation, and how we measured it

The stylist keeps a short **style memory** about the person, like an assistant's memory: it rewrites it when a turn
or their reactions show a lasting preference (「我從來不穿黑色」), leaves one-off wishes out, and the person can read
and edit it under 我的. Body details and recent likes/dislikes go with it on every request.

Two opposite memories, same five sentences, ~60 garments each:

| Memory | Black | Pink | Beige/brown |
|---|---|---|---|
| 「喜歡粉色和咖啡色，不穿黑色」 | **0%** | 13% | **61%** |
| 「只穿黑灰，不穿粉色」 | **81%** | **0%** | 2% |
| no memory | 51% | 0% | 11% |

我的 → 進步驗證 runs the same check live: a simulated shopper with a hidden taste runs the same sentences twice,
with the memory carried between rounds and without, against this deployment.

---

## Run it yourself

**Prerequisites:** Node 20+, a Cloudflare account (Workers paid plan, for Containers), Docker running (the
FashionCLIP encoder image is built and pushed on deploy), an OpenAI API key.

```bash
git clone https://github.com/petercechung/outfit-agent && cd outfit-agent
npm install
echo 'OPENAI_API_KEY=sk-...' > .dev.vars        # never commit this file

npm run dev                                      # wrangler dev --remote, on the real R2 data
npm run check                                    # types, lint, 27 tests, deploy dry-run
npm run smoke -- https://stylist.cechung.com     # health + a thumbnail against a deployment
```

**Cloudflare resources** (`wrangler.jsonc` names them; swap in your own ids):

| Binding | What | Notes |
|---|---|---|
| `BUCKET` | R2 `outfit-assets` | the catalogue, vectors and thumbnails (below) |
| `DB` | D1 `outfit-agent-db` | full request history while testing — `npx wrangler d1 migrations apply outfit-agent-db --remote` |
| `SIGNALS_DB` | D1 `outfit-db` | v1's database, for the designer demand signals |
| `TEXT_ENCODER` | Container | FashionCLIP text encoder, `encoder/` |

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy                              # builds encoder/Dockerfile for linux/amd64 — Docker must run
```

**The data in R2** — `catalog.json`, `vec_query.bin`, `vec_image.bin`, `text_to_image.f32`, `thumbs.pack`,
`thumbs_index.json`. They are built from the public H&M dataset
([Qdrant/hm_ecommerce_products](https://huggingface.co/datasets/Qdrant/hm_ecommerce_products), CC-BY-4.0) by the
scripts in the prototype repo, in this order:

```
build_catalog.py        the curated catalogue (slot, gender, NT$ price) from the raw parquet
fetch_images.py         one thumbnail per article
embed_catalog.py        caption vectors, OpenAI text-embedding-3-small, 256 dims, int8
export_image_vectors.py photo vectors, FashionCLIP, 512 dims, int8
fit_text_to_image.py    a 256×512 ridge map from caption space into photo space (in the v1 repo,
                        MeiChu/outfit-site/pipeline/) — the fallback used while the container wakes
export_site.py          packs all of the above into the files above, which are uploaded to R2
```

Nothing but public data is used, and no product images are redistributed in this repo.

---

## Endpoints

| Method | Path | |
|---|---|---|
| POST | `/api/recommend` | the page's request; `{"stream": true}` answers as progress lines then the result |
| POST | `/api/v2/recommend` | the same pipeline in v2's own shape, handy for scripts |
| POST | `/api/analyze` | one look's analysis, streamed as plain text |
| POST | `/api/plan` | ② alone — the stylist's plan |
| POST | `/api/search` | ① alone — `{queries: [SearchQuery]}` |
| POST | `/api/encode` | the FashionCLIP text encoder, for checking it is warm |
| GET | `/api/health` | items, photo search, model, the models the page may switch to |

```bash
curl -s https://stylist.cechung.com/api/v2/recommend \
  -H 'content-type: application/json' \
  -d '{"text":"冬天去首爾玩五天"}' | jq '.looks[].pieces[].item.name'
```

## Development history

Every request while we test is recorded in `DB`: who (a tester name from a `?tester=` link, and a random browser
id), the sentence, what the stylist planned, the critic's verdict, the looks shown, timings, errors and which model
answered. `npm run history` prints it; `npm run history -- 1 --full` shows one request's full plan and verdict.
The page says so in plain language under 我的.

## Layout

```
src/
  engine/      ① catalogue, vectors, search, the FashionCLIP container
  agents/      ② stylist  ③ critic  ④ analyst
  routes/      HTTP handlers (recommend, analyze, search, plan, health, media, proxy)
  contracts.ts the fixed interfaces between the three parts
  person.ts    the style memory, body details and reactions
  closet.ts    the person's own clothes
  signals.ts   the anonymous demand signal for 設計師洞察
  history.ts   the development history
public/        the page (no build step, ES modules)
encoder/       the FashionCLIP text encoder container
test/          27 tests: search, fill, budget, agent output handling, memory
```

## What v2 does not own

照片找同款, 穿搭牆, 手帳, 設計師洞察 and the trend collection still run on v1 and are proxied through
(`src/routes/proxy.ts`), sharing the same catalogue in R2.

## Known limitations

- A recommendation takes 13–17 s; the container sleeps after 30 minutes, and the first request after that falls
  back to the learned map while it wakes.
- De-identification catches emails, phone numbers, IDs, handles and 「我叫○○」, but cannot catch every name written
  in free text.
- The stylist occasionally writes today's occasion into the style memory; it is editable under 我的.
- Prices are estimated NT$ from the public dataset, not live H&M prices, and nothing is actually purchasable.
