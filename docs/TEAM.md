# Who owns what (v2)

Three parts talk through fixed interfaces in [`src/contracts.ts`](../src/contracts.ts). Anyone can rebuild their
own part without touching the others, and each part has a debug endpoint so you can work from recorded examples.

| | Part | Files | Debug endpoint | Owner |
|---|---|---|---|---|
| ① | **Engine** — facts and photo search | `src/engine/`, `encoder/` | `POST /api/search`, `/api/encode` | |
| ② | **Stylist agent** — sentence → what to wear | `src/agents/stylist.ts` | `POST /api/plan` | |
| ③ | **Critic + analyst** — judging the finished looks | `src/agents/critic.ts`, `analyst.ts` | `POST /api/analyze` | |
| — | **The page** | `public/` | the site itself | |
| — | **Data pipeline** — catalogue, vectors, thumbnails | prototype repo `scripts/*.py` | — | |

## Working agreements

- **Never change `src/contracts.ts` alone.** It is the seam between three people; changing it is a team decision.
- **Deploy from `main` only** (`npm run deploy`), after `npm run check` passes (types, lint, 27 tests, dry run).
- **Pull before you push.** Several of us push to `main`; rebase on top rather than merging in a knot.
- **The OpenAI key is a secret.** It lives in `.dev.vars` locally (gitignored) and as a Worker secret in
  production. Never paste it in chat, in the group, or in a commit.
- **No load tests against production** — every request costs model tokens.
- The repo stays **private**; judges are invited at submission.

## Where to look when something is wrong

```bash
npm run history               # the last 20 requests: sentence, plan, looks, timings, model, errors
npm run history -- 1 --full   # one request with the stylist's full plan and the critic's verdict
npx wrangler tail             # live logs
npm run smoke -- https://stylist.cechung.com
```

The history database answers most questions: what the person said, what the stylist planned, which garments the
engine returned, what the critic kept, and how long each step took.

## Ideas worth taking on

- **Engine data** — better photo vectors (fashionSigLIP, MODA), refit the text→photo map, and a retrieval metric
  to prove the change ("shirts in the top 10 for 'structured shirt'").
- **Latency** — 13–17 s per recommendation. The stylist's plan is the biggest share.
- **The critic** — it judges from photos and can miss fabric or season problems that the product text would reveal.
- **Wardrobe** — v2 uses the person's own clothes, but never suggests what to buy *to complete* what they own.
