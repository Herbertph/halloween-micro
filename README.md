# Haunted Portrait

A one-page Halloween micro-product: upload a photo, pick a style, see a watermarked
preview, then buy a **single portrait ($4.99)** or the **Monster Pack ($8.99, four styles)**
and download the full-resolution files. No accounts, no email. Photos are deleted after 48
hours. Paid buyers also get a before/after share image, and the owner gets a password-
protected daily numbers view.

This repository implements increments 1 and 2 from
[`docs/specs/haunted-portrait-mvp.md`](docs/specs/haunted-portrait-mvp.md) and
[`docs/specs/monster-pack-and-share.md`](docs/specs/monster-pack-and-share.md). It runs end
to end with **mock** image and payment providers and Turnstile off, so no API keys are
needed to develop, test or demo it.

## Requirements

- Node.js 22+ (the repo is developed on Node 22)
- npm
- No database, no cloud account, no API keys for local development

## Quick start

```bash
npm install
cp .env.example .env.local     # Windows PowerShell: Copy-Item .env.example .env.local
npm run dev                    # http://localhost:3000
```

Open `/create`, upload a photo, keep the consent box checked and generate. The mock image
provider produces a deterministic stylised derivative with `sharp`; the mock payment
provider shows a hosted-checkout look-alike labelled **Test mode**. Click **Pay** to walk
the whole flow.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (`next lint`) |
| `npm test` | Vitest unit, route-handler and component tests |
| `npm run e2e` | Playwright end to end. Requires `npm run build` first; serves on port **3101** (never 4545) |
| `npm run check:secrets` | Scans `.next/static` for server secrets and prompt text (run after a build) |
| `npm run verify:providers` | Manual, needs keys: probes Gemini, Stripe, Blob, Upstash and Turnstile with a pass/fail table; `npm run verify:providers:dry` validates shape only |
| `npm run assets` | Regenerates the placeholder landing/OG images in `public/` |
| `npm run fixtures` | Regenerates the test fixtures in `tests/fixtures/` |

Run the whole gate the way CI does:

```bash
npm run lint && npm run build && npm test && npm run check:secrets && npm run e2e
```

### Lighthouse budget

Lighthouse is opt-in because it is slow and needs a Chrome binary:

```bash
npm run build
RUN_LIGHTHOUSE=1 npx playwright test e2e/lighthouse.spec.ts --project=iphone
```

It checks the mobile scores (performance ≥ 85, accessibility ≥ 90) on `/` and `/create`.
Each page is measured as the **median of three runs**, because Lighthouse is noisy on shared
machines.

## Environment variables

Every variable the code reads is listed and commented in
[`.env.example`](.env.example). Copy it to `.env.local`; never commit real values.

| Group | Variables |
| --- | --- |
| Production safety | `ALLOW_MOCK_PROVIDERS` |
| Site | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `CONTACT_EMAIL` |
| Pricing | `PRICE_SINGLE_CENTS`, `PRICE_PACK_CENTS`, `GENERATION_COST_CENTS` |
| Image provider | `IMAGE_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`, `GEMINI_API_BASE`, `GENERATION_TIMEOUT_MS` |
| Payments | `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_API_BASE`, `STRIPE_PRICE_SINGLE_ID`, `STRIPE_PRICE_PACK_ID` |
| Turnstile | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_ENFORCED` |
| Admin | `ADMIN_PASSWORD` |
| Secrets | `DOWNLOAD_SIGNING_SECRET`, `MOCK_WEBHOOK_SECRET`, `CRON_SECRET` |
| Storage/KV | `STORAGE_DRIVER`, `KV_DRIVER`, `DATA_DIR`, `BLOB_READ_WRITE_TOKEN`, `KV_REST_URL`, `KV_REST_TOKEN` |
| Limits | `PREVIEW_LIMIT_PER_IP`, `DAILY_GENERATION_CAP`, `RETENTION_HOURS` |

`DOWNLOAD_SIGNING_SECRET`, `MOCK_WEBHOOK_SECRET` and `CRON_SECRET` are required in
production: the server refuses to start handling those requests without them. In dev they
fall back to obviously-insecure values so a fresh clone works.

## Architecture

- **Next.js App Router + TypeScript**, React Server Components for the landing, legal and
  checkout pages; client components only for upload, polling and checkout actions.
- **`config/styles.ts`** is the single style config (five styles, display copy and prompt
  templates). It is server-only; prompts never reach the browser or an API response.
- **`lib/config-check.ts` / `lib/demo.ts`** refuse production deployments that still use
  mock providers or local disk drivers, unless `ALLOW_MOCK_PROVIDERS=true` opts into a
  labelled demo. `GET /api/health` reports readiness without echoing values.
- **`lib/providers/image`** is the only image-generation boundary. `mock` uses `sharp`
  (deterministic per style, `no_subject` on featureless images); `gemini` is implemented
  against the Gemini image API but unverified (no key in this increment).
- **`lib/providers/payments`** is the payment boundary. `mock` creates a session, a signed
  webhook is the only thing that unlocks a job; `stripe` creates real Checkout Sessions
  and verifies `stripe-signature`.
- **`lib/jobs.ts` / `lib/job-service.ts`** hold the one-way job state machine
  (`created → generating → preview_ready | failed`, `preview_ready → awaiting_payment →
  paid → unlocked`, any → `expired`), lazy retention and the asset model. Increment 1 jobs
  are normalised into a single asset on read.
- **`lib/assets.ts` / `lib/expand.ts`** own the pack assets: the chosen style is ready from
  the preview, the other three start `pending` and are generated **only after payment**.
  `claimPendingAsset` uses an atomic KV set membership, and a short per-job edit lock makes
  concurrent updates safe; the success page and the cron sweeper share the same path.
- **`lib/products.ts`** derives both prices from env and the pack composition as a pure
  function of the chosen style (chosen first + three distinct defaults).
- **`lib/share.ts`** builds the before/after JPEG composite (equal heights, long edge
  ≤ 1600 px, < 3 MB) for a signed share URL.
- **`lib/captcha.ts`** exposes mock and Turnstile verifiers. Enforcement is off unless
  `TURNSTILE_ENFORCED=true` **and** both keys exist; verification runs before any quota is
  consumed.
- **`lib/stats.ts` / `lib/admin.ts`** write day counters where events happen and render the
  aggregate-only admin view behind a signed, HttpOnly cookie.
- **`lib/images.ts`** strips EXIF/GPS, resizes and builds the 512 px watermarked preview.
  Full-resolution files are **separate private objects**; only `/api/download` and
  `/api/assets` read them, after the job is paid, with signed 15-minute tokens.
- **`lib/limits.ts`** enforces the rolling 24 h per-IP preview allowance and the global
  daily generation cap through the KV adapter (atomic in both drivers).
- **`lib/storage`**, **`lib/kv`** are small interfaces with disk drivers for dev/tests and
  Vercel Blob / Upstash Redis drivers for production.

### Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page (server-rendered date banner, both products, FAQ, meta) |
| `/create` | Upload, style picker, consent, free preview, single + pack paywall |
| `/success?session_id=` | Polls job status, expands pack cards, shows downloads and share image |
| `/admin` | Password-protected daily aggregates (no photos, no job ids) |
| `/privacy`, `/terms` | Legal pages |
| `/checkout/mock?session=` | Mock hosted checkout (only when `PAYMENT_PROVIDER=mock`) |
| `POST /api/generate` | Validate, Turnstile, strip metadata, generate, store private objects |
| `GET /api/jobs/[id]` | Public job status with `assets[]`; URLs only for the owning paid session |
| `POST /api/jobs/[id]/expand?session=` | Claims and generates **one** pending pack asset |
| `GET /api/assets/[jobId]/[styleId]?session=` | Inline full-res asset for a paid owner |
| `GET /api/preview/[id]` | Streams the watermarked preview only |
| `POST /api/checkout` | `{ jobId, product }`; price/product come from env and the session record |
| `POST /api/webhooks/payments` | Signature-verified, idempotent webhook that marks the paid product |
| `GET /api/download?token=` | Streams one full-resolution asset (signed, per style) |
| `GET /api/share?token=` | Streams the before/after JPEG for a paid job |
| `GET /api/cron/cleanup` | Bearer `CRON_SECRET`; purges expired jobs and every asset |
| `GET /api/cron/expand-packs` | Bearer `CRON_SECRET`; finishes packs left by a closed tab |
| `POST /api/admin/login`, `POST /api/admin/logout` | Password login and logout |

## Monster Pack flow

1. Preview generation stores the chosen style as a `ready` asset and records the preview.
2. Checkout with `product: "pack"` reserves four assets (chosen + three `pending`) and stores
   the product on the **session record**. The job does not record a paid product yet.
3. The webhook reads the product/amount from that session record (never the request body),
   marks the job paid, sets `product`, `paidAmountCents` and unlocks the chosen asset. The
   event id is claimed atomically (SET NX) before any side effect, so simultaneous duplicate
   deliveries record exactly one sale.
4. `/success` calls `POST /api/jobs/[id]/expand` once per pending card, showing per-card
   loading/failed/retry states. Each call atomically claims **one** style with a TTL of
   `2 × GENERATION_TIMEOUT_MS + 30 s`, so the client and the cron can never generate the same
   style twice; a crashed claim or a `generating` asset older than one timeout is reclaimed.
5. `GET /api/cron/expand-packs` does the same for paid packs older than 60 s, for visitors who
   close the tab. It is bounded to three assets per run and declares `maxDuration = 420`, which
   fits three full generation budgets plus overhead. If your plan caps function duration below
   420 s, lower `GENERATION_TIMEOUT_MS` (three assets × two attempts must fit) or reduce
   `MAX_EXPANSIONS_PER_RUN`; a killed run is recoverable through the claim TTL.

A single purchase keeps exactly one asset. Failed extra styles show a retry action that
regenerates only that style; other cards stay downloadable and no preview quota or payment
is consumed again.

## Share image

Paid jobs expose a signed `/api/share?token=` URL for the chosen style. The composite places
the original photo and the chosen portrait side by side at equal height (no stretching or
letterboxing), adds a footer band with the site host, caps the long edge at 1600 px and
compresses under 3 MB. The share button emits `share_image_downloaded` on each click and the
file is named `haunted-portrait-before-after.jpg`.

## Turnstile

- Off by default: with no keys (or `TURNSTILE_ENFORCED=false`) the widget is not rendered and
  the verifier is a no-op, so local development, tests and e2e need no Cloudflare account.
- To enable, set `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` and `TURNSTILE_ENFORCED=true`.
  Use Cloudflare's published **test keys** in development.
- Verification has a 5 s timeout, runs before the preview quota/daily cap and before any
  provider call. A rejection is `400 captcha_failed`; a timeout is a retryable
  `503 captcha_timeout`. Neither consumes quota. Secrets and tokens are never logged or
  returned.

## Admin

`/admin` fails closed without `ADMIN_PASSWORD`. The login route compares in constant time,
limits each IP to five attempts per minute, and sets an HttpOnly `SameSite=Lax` cookie signed
under a distinct admin context that lasts 8 hours. The signed-in page shows today's UTC
previews, single/pack sales, revenue, estimated generation cost
(`GENERATIONS × GENERATION_COST_CENTS`) and margin, plus yesterday's revenue. It renders no
job ids, photos, storage keys or customer data.

## Storage and KV drivers

| Driver | Env | Used by |
| --- | --- | --- |
| Disk | `STORAGE_DRIVER=local`, `KV_DRIVER=local` | local dev, tests and e2e. Files live under `DATA_DIR` (default `.data/`, gitignored) |
| Vercel Blob | `STORAGE_DRIVER=vercel-blob` + `BLOB_READ_WRITE_TOKEN` | production |
| Upstash Redis (REST) | `KV_DRIVER=upstash` + `KV_REST_URL`, `KV_REST_TOKEN` | production |

Serverless filesystems are ephemeral and not shared, so **never run `local` drivers on
Vercel**. The drivers are chosen by env; no flow code changes.

## Switching providers

### Image: mock → Gemini

1. Get a Gemini image API key and set `GEMINI_API_KEY`.
2. Set `IMAGE_PROVIDER=gemini` (optionally `GEMINI_IMAGE_MODEL`).
3. Restart. Misconfiguration (missing key, bad model) returns a `fatal` generation error
   instead of crashing the request.

The Gemini adapter is implemented but **cannot be verified in this increment** (no key).
Replicate is documented as a future fallback and is not implemented.

### Payments: mock → Stripe

1. Create a Stripe account and a webhook endpoint pointing at
   `https://<your-domain>/api/webhooks/payments` for `checkout.session.completed`.
2. Set `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
3. Restart. `/checkout/mock` returns 404 automatically, so the test checkout disappears.

The Stripe adapter is implemented but **cannot be verified in this increment** (no key):
confirm test-mode checkout and webhook signatures before taking real payments.

## Production safety, health and demo mode

Production is detected from `NODE_ENV=production` (set by `next build`/`next start`), not
from a variable. In that mode the server refuses to run with `PAYMENT_PROVIDER=mock`,
`IMAGE_PROVIDER=mock`, `STORAGE_DRIVER=local` or `KV_DRIVER=local`: `/api/generate` and
`/api/checkout` answer **503 `misconfigured`** before any provider call or storage write,
and the reason is logged once at start-up. Missing provider/driver variables are reported
by name only.

- `GET /api/health` returns `200 { ready: true, mode: "live" | "demo" }` or
  `503 { ready: false, problems: [...] }`. It never returns a configuration value.
- A deliberate demo deploy sets `ALLOW_MOCK_PROVIDERS=true`. It keeps the mock flow working
  and renders **“Demo — no real payment”** in the header, on the paywall and on the success
  page. Never use it to take money.
- `npm run verify:providers` probes only configured services (Gemini, Stripe, Blob, Upstash,
  Turnstile), prints `PASS` / `FAIL` / `SKIP` and exits non-zero if a configured service
  fails. `npm run verify:providers:dry` (or `node scripts/verify-providers.mjs --dry-run`)
  validates environment shape without any network call. Output is centrally redacted; secrets
  and tokens never appear, even in verbose/crash paths.
- `npm test` includes Blob and Upstash integration tests against an ephemeral local HTTP
  stub (success, 4xx, timeout and the pack-claim conditional delete), so the production
  drivers are exercised offline.

## Deploying to Vercel

1. Import the repository and set the env vars from `.env.example` in Project Settings.
   At minimum: `NEXT_PUBLIC_SITE_URL`, `CONTACT_EMAIL`, `PRICE_SINGLE_CENTS`,
   `PRICE_PACK_CENTS`, `GENERATION_COST_CENTS`, `IMAGE_PROVIDER`, `PAYMENT_PROVIDER`,
   `ADMIN_PASSWORD`, the three secrets, `STORAGE_DRIVER=vercel-blob`,
   `KV_DRIVER=upstash`, `BLOB_READ_WRITE_TOKEN`, `KV_REST_URL`, `KV_REST_TOKEN`.
   Keep `ALLOW_MOCK_PROVIDERS=false` for a real deployment; the health endpoint must report
   `ready: true, mode: "live"` before announcing. Set the Turnstile variables only when you
   enable the check, and the Stripe price ids when you run the verifier.
2. Attach a Vercel Blob store and an Upstash Redis database; copy their tokens.
3. `vercel.json` registers two crons: hourly `/api/cron/cleanup` and every-five-minutes
   `/api/cron/expand-packs` (paid packs left by a closed tab). Vercel sends
   `Authorization: Bearer <CRON_SECRET>`; both routes also work from a manual call with the
   same header.
4. Set `NEXT_PUBLIC_SITE_URL` to the real domain: it feeds canonical/OG tags and the
   preview/share watermark host.
5. Replace `public/examples/*` and `public/og.png` with the owner's real assets before
   launch (the current files are generated placeholders).

## Security headers and the HEIC decoder

`next.config.ts` sends `Content-Security-Policy`, `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` on every response. The CSP
allows `'unsafe-eval'` because `heic2any`'s Emscripten worker evaluates strings with
`new Function`; `'wasm-unsafe-eval'` alone is not enough and production HEIC uploads would
fail. The trade-off is deliberate for this one-page product: script origins are still
limited to `self`, Plausible and Cloudflare Turnstile, and the app never renders user HTML.
The HEIC path also decodes natively first (Safari), gives the WASM decoder a 20 s timeout,
and falls back to the "export as JPG" message, so a blocked or broken decoder can never hang
the form. Critical CSS is inlined at build time (`experimental.inlineCss`) to keep the
mobile LCP fast.

## Retention and privacy

- `RETENTION_HOURS` (default 48) is enforced by application code, not a storage lifecycle
  rule: every job access checks expiry lazily and the cron route sweeps the rest.
- Expired jobs and deleted objects answer **410**, never content.
- Uploaded originals are re-encoded so all EXIF/GPS metadata is removed before storage or
  provider use.
- There is no listing endpoint, no gallery and no reuse of user photos.

## Known limitations of mock mode

- The mock portrait is a deterministic `sharp` colour grade, not AI art. Quality arrives
  with the real provider.
- The mock checkout charges nothing and is labelled **Test mode**; Payment and webhook
  semantics mirror Stripe but are not Stripe.
- The Monster Pack is demonstrated with three extra mock colour grades. The composition,
  claim, retry and download behaviour is real; only the artwork is placeholder.
- HEIC conversion is best effort in the browser (`heic2any`); if the browser cannot decode
  it the user is told to export a JPG. iOS camera capture normally yields JPEG.
- Landing examples and the OG image are generated placeholders and must be replaced by the
  owner before launch. They are not customer results.
- Turnstile is off by default. The verifier is implemented and tested with mocks, but the
  Cloudflare widget itself is only exercised when real/test keys are configured.
- A production deployment with any mock provider or local driver is refused unless
  `ALLOW_MOCK_PROVIDERS=true`; a demo deployment shows the red “Demo — no real payment”
  label and must not be used to sell.
- The admin view is an aggregate convenience, not accounting: it counts generation
  *attempts* at `GENERATION_COST_CENTS` each and has no per-order data.
- Lighthouse runs only when explicitly requested (`RUN_LIGHTHOUSE=1`), as the median of
  three runs on `/` and `/create`.

### Known deviation: synchronous generation (FR-12, issue #5)

`POST /api/generate` runs generation inside the request and returns 202 as soon as the
preview is ready; `/create` does not poll a `generating` job. This is deliberate for
increment 1 (the mock provider is fast, and Vercel does not guarantee work after the
response), and it is bounded by `maxDuration = 120` plus the 2 × `GENERATION_TIMEOUT_MS`
budget. Before enabling `IMAGE_PROVIDER=gemini`:

1. Confirm the deployment plan allows 120 s function duration, or lower
   `GENERATION_TIMEOUT_MS` so two attempts fit.
2. Prefer replacing the inline call with a real job queue plus client polling (the
   `/api/jobs/[id]` status endpoint already exists) if long provider calls are expected.

### Rate limiting behind a proxy

The client IP comes from the first `x-forwarded-for` entry, falling back to `x-real-ip`.
That is correct on Vercel (which overwrites the header). On another proxy, configure it to
overwrite or append a trusted client IP; otherwise the per-IP preview limit can be spoofed.

## Owner checklist before launch

- [ ] Real Gemini key + `IMAGE_PROVIDER=gemini` verified.
- [ ] Real Stripe key + webhook verified end to end (test mode first).
- [ ] `NEXT_PUBLIC_SITE_URL` set to the live domain.
- [ ] `PRICE_SINGLE_CENTS`, `PRICE_PACK_CENTS` and `GENERATION_COST_CENTS` confirmed.
- [ ] `ADMIN_PASSWORD` set to a strong value (admin fails closed without it).
- [ ] Turnstile keys + `TURNSTILE_ENFORCED=true` when traffic warrants it; remove test keys.
- [ ] `npm run verify:providers` passes every configured service (use `-- --dry-run`
      first when shaping the env).
- [ ] `GET /api/health` returns `ready: true, mode: "live"` on the deployment.
- [ ] `ALLOW_MOCK_PROVIDERS` is unset/false on the real deployment.
- [ ] Landing examples and OG image replaced with licensed assets.
- [ ] Privacy/terms reviewed for the live jurisdictions.
- [ ] `CRON_SECRET`, `DOWNLOAD_SIGNING_SECRET`, `MOCK_WEBHOOK_SECRET` rotated to real values.
