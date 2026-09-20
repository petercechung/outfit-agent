# How it works, what it is built on, and why

A companion to the [README](../README.md), which covers running it. This document covers the idea behind the
system, the mathematics of the search, where every piece of data and every tool comes from (with its licence),
the architecture and the decisions behind it, what we measured, and what it cannot do.

---

## 1. The idea

People do not shop in keywords. They say 「下週一面試，想要簡約但不要太死板」 — a situation, a feeling and a
constraint in one breath. Turning that into clothes needs three different kinds of knowledge:

| Knowledge | Example | Who should hold it |
|---|---|---|
| **World and taste** | an interview wants a collar; Seoul in January wants a coat; 「韓系」 looks like *this* | a language model |
| **Facts** | this item is a women's Coat, Black, NT$2,499, and here is its photo | the catalogue |
| **Does it actually look right** | the product called "shirt" is a strappy camisole | vision, on the photo |

**v1 put all three in code** — weather bands, formality tables, colour-harmony scores, beam search. Every wrong
recommendation traced back to one of those rules, and each fix broke something else. The worst example: a white
T-shirt the rules rated "warmth 2" was banned on a 31 °C day.

**v2 gives each kind of knowledge to whoever holds it best.** Code knows only facts. Judgement belongs to agents.
Nowhere in `src/` is there a rule about coats, temperatures, formality or colour harmony — the word "coat" appears
only in a comment explaining that the stylist, not the code, decides when one is needed.

This is the design constraint the whole system is built around, and it is worth stating plainly because it is
easy to violate one line at a time.

---

## 2. Search: sentences against photographs

### The problem with words

A product's title and description are written by a merchandiser, not by the person shopping. 「a sheer blouse you
can see a bra top through」 matches nothing in the catalogue's text, but a human spots the right garment
immediately from the photos. So the search is over the **photographs**.

### The space

Every product photo is embedded with **FashionCLIP** (`Marqo/marqo-fashionCLIP`), a ViT-B/16 CLIP fine-tuned on
fashion data, into a 512-dimension vector, normalised to unit length, then quantised to `int8` (value ÷ 127).
11,636 items × 512 bytes ≈ 6 MB, which a Worker can hold and scan in memory.

A sentence is embedded by the **same model's text encoder**, so text and photos land in the same space, and
similarity is a plain dot product of unit vectors (cosine). Ranking one query over the eligible items is a few
million multiply-adds — single-digit milliseconds.

```
score(item) = photo(item) · want  −  0.5 × max over avoid phrases of ( photo(item) · avoid )
```

The subtraction is how negation is handled. "No leopard print" is not a filter — it is a direction in the space to
move away from. `AVOID_WEIGHT = 0.5` was measured, not guessed: on women's tops, 「a pretty feminine top for a
date」 with 「a busy floral or animal print」 to avoid took loud prints in the top 30 from 26.7% to 0% while keeping
98.5% of the similarity to the request. At 1.0 it kept 95.8%, at 1.5 only 88.8%.

### Two ways to reach the space

| | How | When | Cost |
|---|---|---|---|
| **native** | FashionCLIP's own text encoder, in a Cloudflare Container | normally | ~0.3–1 s warm |
| **map** | OpenAI text vector × a learned 256×512 matrix | while the container wakes | one embedding call |

The **map** exists because a Worker cannot run PyTorch. Every catalogue item has both an OpenAI caption vector
(256-d) and a FashionCLIP photo vector (512-d), which is 11,636 paired examples of "these words, that picture", so
a ridge regression learns the linear map between the spaces:

```
minimise ‖ caption · W − photo ‖²  +  0.1 ‖W‖²          W: 256 × 512
```

Held out on 20% of items, finding an item's own photo among all held-out photos: **top-1 18%, top-10 60%, median
rank 6 of 2,350** (random would be 1,175). It is a real retrieval signal, but weaker than the native encoder, and
it only knows words that appear in product captions — fabric, cut, garment type. It cannot do 「甜美」 or 「韓系」.

**Why the container was worth building.** Judged from the photos of the top eight women's tops (one rater, not
blind): 「sweet feminine」 8/8 correct natively vs 6/8 through the map; 「Korean style」 6/8 vs at most 1/8. Style
words are exactly what people say, so the native encoder earns its keep.

### What the engine may filter on

Only facts the catalogue records: gender, product type, colour, price, and whether the item has a photo. Filters
that come from the **person** (a colour they refused, a budget) are never relaxed. A garment type the **stylist**
guessed at is relaxed when it matches nothing, because the catalogue's own labels are uneven — H&M files almost
every bag as plain `Bag`, and only three women's items are `Cross-body bag`.

---

## 3. The four agents

```
sentence ─▶ ② stylist ─▶ ① engine ─▶ fill ─▶ ③ critic ─▶ answer ─▶ ④ analyst (streamed per look)
```

**② Stylist** (`src/agents/stylist.ts`) — one structured call. Decides whether this is even a clothing request
(`outfit` / `vague` / `off_topic` / `care`), what the situation needs, and writes each garment the way a product
page would describe it, in English, for the engine to search. It reasons about weather, occasion and style words;
nothing downstream will add a coat if it does not. It also rewrites the person's style memory when they reveal a
lasting preference, and labels the request for the designers' report.

**① Engine** (`src/engine/`) — facts and photo similarity, as above. It has no opinions.

**fill** (`src/fill.ts`) — bookkeeping only: the best candidate per piece, no product reused across looks,
cheaper candidates swapped in (each time the one that saves the most per unit of similarity lost) until a stated
budget fits. A piece nothing can fill is dropped if the look is still wearable.

**③ Critic** (`src/agents/critic.ts`) — one vision call over every filled outfit with the person's words. It is the
only step that sees the *result*, so it catches what planning and searching cannot: a "shirt" that turned out to be
a camisole, sandals on a snowy day, two looks that are really the same outfit. It keeps three and may ask for one
garment to be searched again.

**④ Analyst** (`src/agents/analyst.ts`) — runs *after* the looks are on screen, so it can think longer (`medium`
reasoning effort) without making anyone wait. It compares the finished outfit with the request and with this
week's fashion headlines, and writes four short parts, streamed into the card.

### Why four, and not one big prompt

Each has a different input, a different failure mode and a different cost:

- the stylist must never see product photos (it would anchor on what exists instead of deciding what is right);
- the critic must see only photos and facts (it is the check on the stylist's imagination);
- the analyst can be slow, because the person is already reading;
- the engine must be deterministic and testable.

They talk through fixed interfaces in [`src/contracts.ts`](../src/contracts.ts) — `SearchQuery`/`SearchResult`,
`StylistPlan`, `CriticVerdict` — so one part can be rebuilt without touching the others, and each has a debug
endpoint (`/api/search`, `/api/plan`, `/api/analyze`) to work against recorded examples.

### Latency, and how it is hidden

| Step | Time |
|---|---|
| stylist plan | 3.8–5.6 s |
| search | 0.3–1.4 s |
| critic | 3.6–4.3 s |
| **total** | **~9.4 s** |

Two tricks. First, the plan is **streamed**: garment descriptions are pulled out of the half-written JSON and
encoded while the model is still writing the rest, and the catalogue load starts at the same moment — so by the
time the plan is complete, the search is mostly already done (it was 4.6 s before). Second, the same stream feeds
the page, so the person sees the stylist's thinking about **1.5 s** in rather than a blank spinner.

---

## 4. Personalisation as a paragraph

Instead of a vector of weights, the system keeps **one short paragraph** about the person, written by the stylist
and editable by them — the same idea as an assistant's memory:

> 女性、158 cm、梨型身材。偏好日系甜美但不要太幼稚，喜歡粉色和咖啡色，不穿黑色。上班需要方便騎車。

Why text rather than numbers: an LLM reads it directly, it holds things a table cannot (「不要太幼稚」), the person
can read and correct it, and every change is legible in the history. The cost is precision — 「粉色 +2.5」 becomes
「喜歡粉色」 — which does not matter to a model reading prose.

Lasting preferences go in; one-off requests ("這次正式一點", a budget, today's occasion) stay out. Reactions to
looks are queued and folded in on the next turn.

**Measured** — two opposite memories, five sentences each, ~60 garments per arm:

| Memory | Black | Pink | Beige/brown |
|---|---|---|---|
| 「喜歡粉色和咖啡色，不穿黑色」 | 0% | 13% | 61% |
| 「只穿黑灰，不穿粉色」 | 81% | 0% | 2% |
| no memory | 51% | 0% | 11% |

---

## 5. The loop back to the brand

Each recommendation also writes one anonymous demand row (`src/signals.ts`): the de-identified sentence, occasion,
style words, budget, what was refused, and **whether the catalogue could answer at all**. 設計師洞察 aggregates
those into decisions with their evidence — 「米色」佔需求 28%、只佔商品 8% → 備料; 「海邊」的整套找不到 → 開款.

The signal that matters most is the *absence*: a request nothing could answer is a gap in the range, which is
exactly what a manufacturer wants to know and what a recommender usually throws away.

---

## 6. Data, models and tools — sources and licences

### Data

| What | Source | Licence / terms | How we use it |
|---|---|---|---|
| Product catalogue (11,636 items) | [`Qdrant/hm_ecommerce_products`](https://huggingface.co/datasets/Qdrant/hm_ecommerce_products), a public mirror of H&M e-commerce product data (~105k rows) | **CC-BY-4.0** | names, product type, colour, pattern, description, image URL; we keep a curated subset with a slot, a gender and an estimated NT$ price |
| Product photos | the image URLs in that dataset | same | fetched once, resized to thumbnails, stored in our own R2 bucket and served from it. **Not redistributed in this repo** |
| Prices | derived from the public H&M transaction data | same | a median price per article, converted to NT$ — an **estimate**, not a live H&M price |
| Trend headlines | public RSS feeds: Vogue, Vogue Taiwan, GQ Taiwan, Harper's Bazaar TW, Cosmopolitan TW, WWD, Hypebeast, Google Trends Taiwan | each publisher's feed | **titles, links and source names only**, always attributed and linked; no article text is copied or stored |
| Consumer sentences | the people using the site | de-identified before storage; dropped if moderation flags them; 30-day retention | demand signals for 設計師洞察 |

No scraping of a retailer's site, no private data, nothing behind a login.

### Models

| Model | Licence / terms | Role |
|---|---|---|
| **Marqo/marqo-fashionCLIP** (ViT-B/16, fine-tuned with Generalised Contrastive Learning) | **Apache-2.0** | photo and text vectors — the search space |
| **OpenAI gpt-5.4-mini** (switchable to nano / 5.4 / 5.5 / 5.6-luna) | OpenAI API terms; we own the outputs | stylist, critic, analyst |
| **OpenAI text-embedding-3-small** (256 dims) | same | caption vectors and the fallback map |
| **OpenAI omni-moderation-latest** | same | a stored sentence or a public post is dropped if flagged |

### Libraries and platform

| | Licence |
|---|---|
| `open_clip_torch` 3.3.0 | MIT |
| PyTorch 2.14 / torchvision 0.29 (CPU) | BSD-3-Clause |
| NumPy | BSD-3-Clause |
| `@cloudflare/containers`, `wrangler` | MIT OR Apache-2.0 |
| Biome | MIT OR Apache-2.0 |
| Vitest | MIT |
| TypeScript | Apache-2.0 |
| Oswald (Google Fonts) | SIL Open Font License 1.1 |
| Cloudflare Workers, R2, D1, Containers | the platform we deploy on |

The page itself has **no framework and no build step** — plain ES modules, so anything in `public/` is the code
that runs.

---

## 7. Architecture and the decisions behind it

```
Browser (public/, plain ES modules; everything personal stays here)
   │  POST /api/recommend  (NDJSON stream)
   ▼
Cloudflare Worker (src/)
   ├─ agents ──▶ OpenAI Responses API (structured output / vision / streamed text)
   ├─ engine ──▶ R2 outfit-assets: catalog.json, vec_query.bin, vec_image.bin, text_to_image.f32, thumbs.pack
   │             └─▶ Container (FashionCLIP text encoder, python + open_clip)
   ├─ D1 outfit-agent-db ── the development history
   ├─ D1 outfit-db ──────── anonymous demand signals, read by v1's 設計師洞察
   └─ proxy ─────────────── 照片找同款 / 穿搭牆 / 手帳 / 設計師洞察 / trends, still served by v1
```

**Decisions worth defending:**

- **Everything personal stays in the browser.** The wardrobe, its photos, the body profile and the style memory
  live in `localStorage` and travel with the request only. There are no accounts, so there is nothing to breach.
  The cost: it does not follow you to another device.
- **The catalogue lives in R2 as flat binary columns**, not a database. The whole thing is read once per isolate
  and scanned in memory; there is no index to maintain and no query planner to fight.
- **A container, not a Worker, for FashionCLIP.** Workers cannot run PyTorch. The container sleeps after 30
  minutes and a cron wakes it every 20, and if it is asleep anyway the learned map answers — the demo never hangs.
- **The stylist's output is a strict JSON schema** using the catalogue's own vocabulary for garment types and
  colours, so the agent's freedom is in *judgement*, not in inventing labels the engine cannot act on.
- **A tolerant reader for the half-written plan.** Streaming means parsing incomplete JSON; rather than a partial
  JSON parser, a small regex pulls out whichever string fields are already complete. Simple, and it cannot throw.
- **One D1 for development history, another for demand signals.** Different purposes, different privacy rules:
  the history is identified on purpose while we test; the signals are anonymous by design.
- **Facts are filtered, judgement is ranked.** Anything the person states plainly (budget, colour refused) is a
  hard filter in code. Anything about taste is left to the agents. This is the line we keep coming back to.

---

## 8. What we measured

| Claim | Number | How |
|---|---|---|
| Photo vectors carry fashion meaning | five kinds of women's top told apart from the photo alone **86.5%** | held-out classification on the photo vectors |
| The learned map retrieves | median rank **6 of 2,350**, top-10 **60%** | 20% of items held out of the ridge fit |
| Native encoder beats the map on style words | 「sweet」 8/8 vs 6/8; 「Korean style」 6/8 vs ≤1/8 | top-8 tops judged from photos (one rater, not blind) |
| Avoid phrases work | loud prints in the top 30: **26.7% → 0%**, keeping 98.5% similarity | one query, three weights |
| The memory changes the looks | black **81% ↔ 0%** between opposite memories | 5 sentences × 2 memories, ~60 garments each |
| Latency | **13.8 s → 9.4 s** | 74 logged requests before, 4 sentences after |

Every number here came from a run we can repeat; where a check was one rater or a single query, it says so.

---

## 9. Limits, and what we would do next

- **The critic judges from photos**, so it can miss what only the product text reveals — a linen trouser for Seoul
  in January, a beach skirt at an interview. Giving it the description alongside the photo is the obvious next fix.
- **Prices are estimates** from public data, and nothing is really purchasable; 「買整套」 builds a shopping list.
- **De-identification is rule-based.** It catches emails, phone numbers, ID numbers, handles and 「我叫○○」, but it
  cannot catch every name written in free text.
- **One rater, small samples.** The style-word comparison and several of the quality checks are ours, not blind.
- **The map is linear.** A small MLP, or simply always having the native encoder warm, would beat it.
- **No outfit-compatibility model.** Whether a top and a skirt go together is judged by the critic from photos,
  not by anything trained on outfits (Polyvore-style). That is the largest piece of technical depth left on the table.
