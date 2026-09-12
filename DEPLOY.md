# Deploying Digger 3D

Two places serve the game:

* **GitHub Pages** — built and published by `.github/workflows/pages.yml` on every
  push, at <https://ilya000.github.io/Digger3D/>. Static only: there is no API
  there, so the high-score table stays in each player's browser and nothing is
  counted.
* **Cloudflare Pages** at `digger.ilyaos.com` — the same build plus the functions
  in `functions/`, which give the game a shared high-score table and the play
  counters, backed by a D1 database.

## Setting up Cloudflare (once)

1. **A token.** In the personal Cloudflare account (the one that holds the
   `ilyaos.com` zone), create an API token with:

   | Scope | Permission |
   |---|---|
   | Account | Cloudflare Pages · Edit |
   | Account | D1 · Edit |
   | Zone (`ilyaos.com` only) | Zone · Read |
   | Zone (`ilyaos.com` only) | DNS · Edit |

   Put it in `.secrets/cloudflare.token` (gitignored, `chmod 600`).

2. **The database and its schema:**

   ```bash
   export CLOUDFLARE_API_TOKEN="$(cat .secrets/cloudflare.token)"
   npx wrangler@4 d1 create digger_scores        # put the id into wrangler.toml
   npx wrangler@4 d1 execute digger_scores --remote --file db/schema.sql
   ```

3. **The first deploy**, which creates the Pages project `digger-3d`:

   ```bash
   npm run build
   npx wrangler@4 pages deploy
   ```

4. **The domain**: in Pages → `digger-3d` → Custom domains add
   `digger.ilyaos.com`; Cloudflare writes the DNS record itself.

## Updating

```bash
export CLOUDFLARE_API_TOKEN="$(cat .secrets/cloudflare.token)"
npm run build && npx wrangler@4 pages deploy
```

Wrangler takes the output directory (`dist`) and the project name from
`wrangler.toml`, and the functions from `functions/`.

## What is where

```
dist/                     the build (pages_build_output_dir)
public/_headers           security headers and caching for /assets/*
public/stats.html         the page that shows the play counters, at /stats
functions/api/scores.js   GET/POST /api/scores  — the shared high-score table
functions/api/play.js     POST /api/play        — visits and games started
functions/api/stats.js    GET /api/stats        — those counts per day
functions/_worker.src.js  bundled into dist/_worker.js for a direct upload
db/schema.sql             the tables in D1 (binding DB)
wrangler.toml             project name, build output, D1 binding
```

## The high-score table

* `GET /api/scores` → `{ "scores": [ { "initials": "ABC", "score": 12345 }, … ] }`,
  ten places in the original's order (an equal score goes below the one that was
  there first).
* `POST /api/scores` with `{ "initials": "ABC", "score": 12345 }` → the same list
  with the entry in it. The initials must be three characters of A–Z, 0–9 or `.`,
  the score 0…10,000,000, and one address may add 30 entries an hour.
* The client (`src/app/highScores.ts`) reads the table at start-up and sends every
  new entry. Where there is no API — the dev server, GitHub Pages, a published
  build — the table stays in `localStorage` and the game never notices.
* While the title screen is up the page re-reads the table every 20 seconds, so
  somebody else's score appears by itself.

## The play counters

* `POST /api/play` with `{"kind":"visit"}` when the page opens and
  `{"kind":"game"}` when a game starts. Only the day, the kind and a mark are
  stored — the mark is the day, the address and the browser hashed together, so
  one person counts once a day and no day can be linked to another. Neither the
  address nor the browser is kept.
* `GET /api/stats?days=30` → per day: `people` (how many opened the game),
  `players` (how many of them started one), `games`, `visits`.
* `/stats` shows the same as a table.
* Cloudflare Web Analytics can be switched on in the Pages project for general
  traffic; it needs no code and no cookies.
