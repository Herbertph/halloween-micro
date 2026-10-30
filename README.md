# Haunted Portrait

A one-page Halloween micro-product: upload a photo, pick a style, see a watermarked
preview, pay $4.99 once and download the full-resolution portrait. No accounts, no email.
Photos are deleted after 48 hours.

This repository is increment 1 of the MVP described in
[`docs/specs/haunted-portrait-mvp.md`](docs/specs/haunted-portrait-mvp.md). It runs end to
end with **mock** image and payment providers, so no API keys are needed to develop, test
or demo it.

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
| `npm run assets` | Regenerates the placeholder landing/OG images in `public/` |
| `npm run fixtures` | Regenerates the test fixtures in `tests/fixtures/` |

Run the whole gate the way CI does:

```bash
npm run lint && npm run build && npm test && npm run check:secrets && npm run e2e
```

### Lighthouse budget (AC-24)

Lighthouse is opt-in because it is slow and needs a Chrome binary:

```bash
npm run build
RUN_LIGHTHOUSE=1 npx playwright test e2e/lighthouse.spec.ts
```

It checks the mobile scores (performance ≥ 85, accessibility ≥ 90) on `/`.

## Environment variables

Every variable the code reads is listed and commented in
[`.env.example`](.env.example). Copy it to `.env.local`; never commit real values.

| Group | Variables |
| --- | --- |
| Site | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `CONTACT_EMAIL` |
| Pricing | `PRICE_SINGLE_CENTS`, `PRICE_PACK_CENTS` (documented only in increment 1) |
| Image provider | `IMAGE_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`, `GEMINI_API_BASE`, `GENERATION_TIMEOUT_MS` |
| Payments | `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_API_BASE` |
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
- **`lib/providers/image`** is the only image-generation boundary. `mock` uses `sharp`
  (deterministic per style, `no_subject` on featureless images); `gemini` is implemented
  against the Gemini image API but unverified (no key in this increment).
- **`lib/providers/payments`** is the payment boundary. `mock` creates a session, a signed
  webhook is the only thing that unlocks a job; `stripe` creates real Checkout Sessions
  and verifies `stripe-signature`.
- **`lib/jobs.ts` / `lib/job-service.ts`** hold the one-way job state machine
  (`created → generating → preview_ready | failed`, `preview_ready → awaiting_payment →
  paid → unlocked`, any → `expired`) and lazy retention.
- **`lib/images.ts`** strips EXIF/GPS, resizes and builds the 512 px watermarked preview.
  The full-resolution file is a **separate private object**; only `/api/download` reads it,
  after the job is paid, with a 15-minute HMAC token.
- **`lib/limits.ts`** enforces the rolling 24 h per-IP preview allowance and the global
  daily generation cap through the KV adapter.
- **`lib/storage`**, **`lib/kv`** are small interfaces with disk drivers for dev/tests and
  Vercel Blob / Upstash Redis drivers for production.

### Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page (server-rendered date banner, pricing, FAQ, meta) |
| `/create` | Upload, style picker, consent, free preview, paywall |
| `/success?session_id=` | Polls job status, shows the HD download and expiry time |
| `/privacy`, `/terms` | Legal pages |
| `/checkout/mock?session=` | Mock hosted checkout (only when `PAYMENT_PROVIDER=mock`) |
| `POST /api/generate` | Validate, strip metadata, generate, store private objects, return preview URL |
| `GET /api/jobs/[id]` | Public job status; download URL only for the owning **paid** session |
| `GET /api/preview/[id]` | Streams the watermarked preview only |
| `POST /api/checkout` | Creates a payment session with `job_id` metadata |
| `POST /api/webhooks/payments` | Signature-verified, idempotent webhook |
| `GET /api/download?token=` | Streams the full-resolution file for a paid job |
| `GET /api/cron/cleanup` | Bearer `CRON_SECRET`; purges expired jobs |

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

## Deploying to Vercel

1. Import the repository and set the env vars from `.env.example` in Project Settings.
   At minimum: `NEXT_PUBLIC_SITE_URL`, `CONTACT_EMAIL`, `PRICE_SINGLE_CENTS`,
   `IMAGE_PROVIDER`, `PAYMENT_PROVIDER`, the three secrets, `STORAGE_DRIVER=vercel-blob`,
   `KV_DRIVER=upstash`, `BLOB_READ_WRITE_TOKEN`, `KV_REST_URL`, `KV_REST_TOKEN`.
2. Attach a Vercel Blob store and an Upstash Redis database; copy their tokens.
3. `vercel.json` registers the hourly cleanup cron (`/api/cron/cleanup`). Vercel sends
   `Authorization: Bearer <CRON_SECRET>`; the route also works from a manual call with the
   same header.
4. Set `NEXT_PUBLIC_SITE_URL` to the real domain: it feeds canonical/OG tags and the
   preview watermark host.
5. Replace `public/examples/*` and `public/og.png` with the owner's real assets before
   launch (the current files are generated placeholders).

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
- HEIC conversion is best effort in the browser (`heic2any`); if the browser cannot decode
  it the user is told to export a JPG. iOS camera capture normally yields JPEG.
- Landing examples and the OG image are generated placeholders and must be replaced by the
  owner before launch. They are not customer results.
- Lighthouse runs only when explicitly requested (`RUN_LIGHTHOUSE=1`).

## Owner checklist before launch

- [ ] Real Gemini key + `IMAGE_PROVIDER=gemini` verified.
- [ ] Real Stripe key + webhook verified end to end (test mode first).
- [ ] `NEXT_PUBLIC_SITE_URL` set to the live domain.
- [ ] Landing examples and OG image replaced with licensed assets.
- [ ] Privacy/terms reviewed for the live jurisdictions.
- [ ] `CRON_SECRET`, `DOWNLOAD_SIGNING_SECRET`, `MOCK_WEBHOOK_SECRET` rotated to real values.
