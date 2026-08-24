# Handoff: Solarpunk Currents ingest worker

## What this is

A Cloudflare Worker that ingests solar/energy news, generates a newsletter with
an LLM pipeline, and (once finished) commits it as a draft post into the
`solarcurrents.co` Astro site repo for review before publishing to
Substack. Forked from an AI-newsletter Worker (`ainewsletter-ingest`) that
published to Ghost/Beehiiv — that publish path has been replaced.

Pipeline: `scrape → evaluate → upload → generate → publish`, one Cloudflare
Queue per stage, driven by cron triggers already defined in `wrangler.toml`.

## Current state — dry-run verified, NOT deployed

`wrangler deploy --dry-run --config ./wrangler.toml` succeeds and shows the
worker bound to its own isolated resources (see below). It has never been
deployed. No secrets are set. No cron has ever fired for this worker.

**Do not run `wrangler deploy` until the "Before you deploy" checklist below
is done** — deploying activates the crons, which will start spending API
credits and, once secrets are set, committing to a real GitHub repo.

## Resources created this session (already live on Cloudflare)

| Resource | Name / ID |
|---|---|
| KV namespace | `SOLARPUNK_INGEST_STATE` → `001945d020b346869102022f6b10ada9` |
| R2 bucket | `solarpunkcurrents` |
| Queues | `sp-scrape-queue`, `sp-evaluate-queue`, `sp-upload-queue`, `sp-generate-queue`, `sp-publish-queue` |

These are dedicated to this worker — none of them are shared with the
original `ainewsletter-ingest` worker or its `ainewsletter` bucket/KV, which
are still running independently for the AI newsletter.

## Code changes made this session

- `wrangler.toml` — renamed worker `ainewsletter-ingest` → `solarpunkcurrents-ingest`
  (prod: `solarpunkcurrents-ingest-prod`, dev: `solarpunkcurrents-ingest-dev`),
  repointed at the isolated KV/R2/queues above, removed the Ghost secret list
  comment.
- `src/worker/index.ts` — `Env` interface: dropped `REDDIT_CLIENT_ID`,
  `REDDIT_CLIENT_SECRET`, `GHOST_ADMIN_API_KEY`, `GHOST_API_URL`; made
  `EXA_API_KEY` optional (it's guarded as optional everywhere it's read);
  added `GITHUB_TOKEN: string` (required).
- `src/worker/config.ts`, `src/worker/lib/config.ts` — removed the dead
  `reddit: { clientId, clientSecret }` config block (declared but never
  consumed by any handler — Reddit content comes in as RSS feeds, not via
  this OAuth path).
- `src/worker/handlers/generate.ts` — **bug fix**: line 45 read `env.Exa`
  instead of `env.EXA_API_KEY`, so Exa search was silently never configured
  even when the secret was set correctly. Fixed to read `env.EXA_API_KEY`.
- `src/worker/handlers/publish.ts` — **rewritten**. Previously posted to the
  Ghost Admin API (JWT signing, `/ghost/api/admin/posts/`). solarcurrents.co
  is a static Astro site on Cloudflare Pages with no Ghost instance, so that
  call could never succeed. New version:
  - Builds frontmatter matching the `post` collection schema in
    `astro-citrus/src/content.config.ts` (`title`, `description`,
    `publishDate` required; `draft: true` so nothing goes live unreviewed;
    tags `["newsletter", "solar", "energy"]`).
  - Commits the file via the GitHub Contents API (`PUT
    /repos/Phinneas/solarcurrents/contents/...`) to
    `astro-citrus/src/content/post/<date>-<slug>.md` on branch `main`.
  - Auth is a single `GITHUB_TOKEN` secret (Bearer), no more Ghost JWT logic.
  - Same KV dedup-by-`generateId` and error-logging pattern as before.
- `src/worker/test-manual.ts` — local dev script, not part of the deployed
  bundle. Updated its mock `Env` object to match the new interface (dropped
  Reddit fields, added `GITHUB_TOKEN`). It was already missing
  `GENERATE_QUEUE`/`PUBLISH_QUEUE` mocks before this session — not fixed,
  out of scope, cast with `as unknown as Env` to keep it compiling.
- `feeds.json` — removed 6 Reddit feed entries (`reddit_openai`,
  `reddit_artificial_intelligence`, `reddit_artificial`,
  `reddit_ai_memory`, `reddit_mcp`, `reddit_ai_news_trends`). These were
  AI-topic subreddits inherited from the source fork — off-topic for a
  solar/energy newsletter regardless of the Reddit API question, and fed
  through third-party `rss.app` proxies rather than Reddit's own API.

None of these edits touched `src/generate/index.ts` or
`src/worker/lib/worker-types.ts`.

## Known pre-existing issues (not caused by this session, not fixed)

`npx tsc --noEmit -p tsconfig.json` reports two errors, both pre-dating this
work:

1. `src/generate/index.ts:77` — `Property 'text' does not exist on type
   'R2Object'` (likely needs `.text()` called on the body via
   `R2ObjectBody`, or the object typed differently).
2. `src/worker/lib/worker-types.ts:14` — `Cannot find module
   '@cloudflare/workers-types'`. Package is referenced but not installed as
   a dependency; run `npm install -D @cloudflare/workers-types` and confirm
   the version matches `compatibility_date`.

Neither blocks `wrangler deploy` (wrangler bundles with esbuild, not tsc),
but both should be cleaned up before this is treated as production-quality.

## Content mismatch worth flagging

`feeds.json` still carries the AI-newsletter source list otherwise —
Hacker News, r/OpenAI-adjacent blogs (OpenAI, NVIDIA, Google AI, Anthropic,
Cloudflare, Meta), AI newsletters (Rundown AI, Ben's Bites, etc.). None of
that is solar/energy content. **This worker will generate an AI newsletter,
not a solarpunk one, until `feeds.json` is replaced with actual solar/energy
sources.** This is the single largest remaining gap — everything else here
is plumbing.

## Before you deploy — checklist

1. **Replace `feeds.json`** with real solar/energy sources (RSS/JSON feeds,
   blogs, news aggregators). This is required for the output to make sense;
   nothing downstream checks topic relevance beyond Mistral's relevance
   scoring prompt, which itself may still be tuned for "AI relevance" — check
   `src/ingest/evaluate` or equivalent for a hardcoded topic/prompt and
   retarget it to solar/energy if so.
2. **Create the secrets** on the new worker (none are set yet):
   ```bash
   cd /Users/chesterbeard/CascadeProjects/solarpunkcurrents/solarpunkcurrents
   for s in FIRECRAWL_API_KEY MISTRAL_API_KEY MOONSHOT_API_KEY ANTHROPIC_API_KEY GITHUB_TOKEN; do
     wrangler secret put "$s" --name solarpunkcurrents-ingest
   done
   # optional, discovery search — degrades gracefully if omitted:
   wrangler secret put EXA_API_KEY --name solarpunkcurrents-ingest
   wrangler secret put TAVILY_API_KEY --name solarpunkcurrents-ingest
   ```
   `GITHUB_TOKEN` should be a fine-grained PAT scoped to only the
   `Phinneas/solarcurrents` repo, Contents: Read and write. Nothing else.
3. **Confirm the GitHub token can actually write** to
   `astro-citrus/src/content/post/` on `main` before relying on the cron —
   test with a single manual `/trigger` POST once deployed (see below),
   or a local script hitting the same Contents API endpoint.
4. **Decide on multiple `wrangler.toml` environments**: the file still has
   `[env.production]` and `[env.dev]` blocks inherited from the source fork.
   Confirm which one you actually want live — plain `wrangler deploy` targets
   the top-level (unnamed) environment, not `production`, and wrangler will
   warn about this ("Multiple environments are defined...") every time you
   deploy without `-e`. Either delete the unused env blocks or always pass
   `--env=""` / `-e production` explicitly to avoid deploying the wrong one
   by accident.
5. **First deploy**, from this directory:
   ```bash
   cd /Users/chesterbeard/CascadeProjects/solarpunkcurrents/solarpunkcurrents
   wrangler deploy --config ./wrangler.toml --env=""
   ```
6. **Manually trigger one run** rather than waiting for the cron, to see the
   full pipeline execute once before trusting the schedule:
   ```bash
   curl -X POST https://solarpunkcurrents-ingest.<your-subdomain>.workers.dev/trigger
   ```
   Then watch KV for `error:*` keys (`wrangler kv key list --namespace-id
   001945d020b346869102022f6b10ada9 --remote`) and check
   `astro-citrus/src/content/post/` in the GitHub repo for a new draft file.
7. **Review the first generated draft** in the repo — check frontmatter
   renders correctly in Astro's schema, `draft: true` is respected, then flip
   to `false` and merge when ready to publish.

## Reference: full secrets list

| Secret | Required | Purpose |
|---|---|---|
| `FIRECRAWL_API_KEY` | Yes | Scraping article content |
| `MISTRAL_API_KEY` | Yes | Relevance scoring, source extraction |
| `MOONSHOT_API_KEY` | Yes | Kimi K2 — story selection, subject line |
| `ANTHROPIC_API_KEY` | Yes | Claude — writes newsletter sections |
| `GITHUB_TOKEN` | Yes | Commits draft markdown to solarcurrents repo |
| `EXA_API_KEY` | No | Semantic discovery search (now actually wired, see bug fix above) |
| `TAVILY_API_KEY` | No | Supplementary discovery search |
