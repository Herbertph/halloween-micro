# Spec: Haunted Portrait — MVP (increment 1)

- **Branch:** `feature/haunted-portrait-mvp`
- **Status:** ready for development
- **Source:** "Haunted Portrait — MVP Requirements" (owner document, pasted 2026-10-30)
- **Deadline:** live and taking payments the night of Oct 30, selling through Oct 31

## Context

**What.** A one-page Halloween micro-product. A visitor uploads a photo (person, pet or
group), picks a style, sees a watermarked low-resolution preview, pays once with a card
and downloads the full-resolution portrait. No accounts, no login, no email required.

**Why.** One-day seasonal product with a hard deadline: the site must be able to sell on
Halloween. The owner drives traffic from TikTok/Instagram, so the page has to look good in a
phone browser and the whole purchase has to fit in under 90 seconds.

**Who.** Mobile-first visitor coming from a social video: they are curious, not patient.
They will not create an account, and they will pay $4.99 for a single portrait.

**What success looks like.** Upload → preview → payment → download works end to end in
under 90 seconds on a phone, with the full-resolution image never exposed before payment,
and with per-visitor rate limits that protect the image-generation budget.

## Scope

### In scope (increment 1)

- Landing page: hero + CTA, placeholder before/after examples, how it works, pricing, FAQ,
  date-aware Halloween banner, Open Graph/Twitter meta, contact + legal footer.
- Upload flow: file picker / camera on mobile, JPG/PNG/WEBP accepted (HEIC best effort,
  converted in the browser), 10 MB limit, client-side resize to 1536 px, required consent
  checkbox, 5 styles from one server-side config.
- Generation: provider adapter with a working **mock** implementation, EXIF/GPS stripping,
  private storage of the full-res result, 512 px watermarked preview, 60 s timeout with one
  retry, typed errors, free retry.
- Payment: paywall, payment adapter with a working **mock** hosted checkout that behaves
  like Stripe Checkout, signed + idempotent webhook, polling success page, signed
  time-limited download.
- Retention and privacy: 48 h deletion (lazy + cron endpoint), privacy and terms pages, no
  public gallery, no reuse of images.
- Abuse and cost control: 3 previews per IP per 24 h, global daily generation cap.
- Analytics events via Plausible when configured, no-op otherwise.
- README with setup, env vars and how to deploy / switch providers.

### Out of scope (increment 2 and later)

- Monster Pack ($8.99, 4 styles generated after payment, per-card loading state).
- "Download before/after" share image.
- Password-protected admin view (use a script for now).
- Cloudflare Turnstile (no account yet; the rate limits and global cap ship first).
- Real Stripe and real Gemini keys, live deployment, real landing-page examples.
  These are owner tasks; the code ships behind adapters so enabling them is configuration.
- Replicate fallback adapter (documented in the README, not implemented in this increment).
- Accounts, order history, email delivery, languages other than English, custom prompts,
  video output, native app.

## Functional requirements

### Landing and legal pages

- **FR-1** — `GET /` renders the landing page with: urgency banner, hero headline and a
  "Haunt my photo" CTA to `/create`, 3–4 before/after example cards, "How it works" (3
  steps), pricing (`$4.99` single), FAQ (privacy, refunds, pets, kids), footer with the
  contact email, the refund sentence and links to `/privacy` and `/terms`.
- **FR-2** — The banner is computed on the server from the current date: "Halloween is
  today — get yours before midnight" on Oct 31, "Halloween is tomorrow" on Oct 30, hidden
  on every other day. No client clock, no hydration mismatch.
- **FR-3** — Example before/after cards are local image assets in `public/`. They are
  placeholders in this increment and are required to be replaced by the owner before
  launch (see Assumptions). No celebrity or unlicensed photos.
- **FR-4** — `GET /privacy` and `GET /terms` render short static pages: what is stored, for
  how long (48 h), which AI provider processes the image, contact email, consent
  requirement, prohibited content, 7-day refund policy.
- **FR-5** — Open Graph and Twitter card meta tags, canonical URL and an OG image built
  from `NEXT_PUBLIC_SITE_URL`. Dark Halloween theme (black/orange/purple), mobile-first,
  no layout shift, Lighthouse mobile performance ≥ 85 and accessibility ≥ 90 on `/`.

### Upload and consent

- **FR-6** — `/create` offers a file input (`accept` JPG/PNG/WEBP/HEIC/HEIF, `capture` on
  mobile), drag & drop on desktop, a style picker with the 5 styles (default `pumpkin`) and
  the required consent checkbox: "I own this photo or have permission from the people in
  it". The generate button is disabled until a file, a style and consent are present.
- **FR-7** — In the browser: HEIC/HEIF is converted to JPEG, the long edge is scaled to at
  most 1536 px, the image is re-encoded as JPEG (quality ~0.9) and client metadata is
  dropped. If the browser cannot decode the file, the user gets a clear message ("iPhone
  photos in HEIC can't be read here — export as JPG") and can pick another file.
- **FR-8** — Client-side validation rejects unsupported types and files over 10 MB with a
  specific message, before any request is sent.
- **FR-9** — The server re-validates: magic-byte sniffing (not just the MIME header), size
  limit and consent flag. Invalid requests return a typed 4xx error and never call the
  image provider.

### Styles and prompts

- **FR-10** — The 5 styles (`vampire`, `zombie`, `witch`, `skeleton`, `pumpkin`) live in a
  single server-only config file with id, display name, short description and prompt
  template. The template contains one subject placeholder that resolves to "the person or
  animal in the photo", so pets need no separate mode.
- **FR-11** — Prompts preserve identity, pose and framing and stay family-friendly (no
  gore, blood, nudity or weapons). The prompt text is never sent to the browser, never
  logged and never included in an API response.

### Generation

- **FR-12** — `POST /api/generate` accepts the image plus `styleId` and consent flag,
  creates a job (`id`, `createdAt`, `expiresAt`, `status`, `styleId`, rate-limit context)
  and returns the job id and the preview URL. HTTP 202 while generating, and the client
  polls for status.
- **FR-13** — Before storage and before calling the provider, the server decodes the image,
  applies EXIF orientation, and re-encodes it so that **all** metadata (including GPS) is
  removed.
- **FR-14** — `generatePortrait(image, styleId)` is the single provider boundary. Error
  codes: `no_subject`, `moderation`, `transient`, `timeout`, `fatal`. One retry is allowed
  for `transient` and `timeout`; `no_subject`, `moderation` and `fatal` return immediately.
  Total budget 60 s per attempt, configurable.
- **FR-15** — `IMAGE_PROVIDER=mock` returns a deterministic stylised derivative of the
  input built with `sharp` (per-style colour grade, vignette, subtle grain, "MOCK" corner
  label) so the whole flow is demoable offline. The mock must reject a featureless image
  (uniform colour / no detectable subject) with `no_subject` so that path is testable.
- **FR-16** — `IMAGE_PROVIDER=gemini` implements the same interface against the Gemini image
  API using `GEMINI_API_KEY` and `GEMINI_IMAGE_MODEL`. It is untested against the real API
  in this increment (no key) and must fail cleanly with `fatal` if misconfigured.
- **FR-17** — The full-resolution result is written to private object storage under a
  random key. The preview is derived server-side: long edge 512 px, diagonal "PREVIEW"
  watermark plus the site host, stored as a separate object.
- **FR-18** — No response, page, script or header ever contains the full-resolution object
  key or a URL that resolves to it. Only the watermarked preview is reachable before
  payment.
- **FR-19** — Failure surfaces a friendly message with "Try again" (free, creates a new
  job) and no checkout is offered for a failed job.

### Payment

- **FR-20** — The paywall shows the preview, the price (`$4.99`, from env) and
  "Unlock HD — $4.99". Checkout is only reachable for a job in `preview_ready`.
- **FR-21** — `POST /api/checkout` creates a payment session through the payments adapter
  with `job_id` in metadata and returns the hosted checkout URL, or a typed error.
- **FR-22** — `PAYMENT_PROVIDER=mock` exposes `/checkout/mock?session=...`: a page that
  looks like a hosted checkout and shows the amount with "Test mode" clearly marked, plus a
  "Pay" and a "Decline" action. "Pay" delivers a signed webhook request to
  `/api/webhooks/payments` and then redirects to `/success?session_id=...`; "Decline" marks
  the session declined, delivers no success webhook and returns to the paywall with an
  error. When `PAYMENT_PROVIDER=stripe`, the mock checkout route returns 404.
- **FR-23** — `PAYMENT_PROVIDER=stripe` creates real Checkout Sessions (single price) with
  the same metadata and verifies webhooks with the Stripe signature. It is implemented but
  cannot be exercised in this increment (no key).
- **FR-24** — `/api/webhooks/payments` verifies the signature, then on a completed session
  marks the job paid and unlocks the download. Unknown job ids and unhandled event types
  return 200 and are ignored; invalid signatures return 400 and change nothing.
- **FR-25** — The webhook is idempotent: the same event id delivered twice is processed
  once, produces no second generation and no duplicate unlock.
- **FR-26** — `/success` reads `session_id`, polls job status every 1.5 s for up to 60 s and
  renders one of: waiting for payment, processing, unlocked (HD download + expiry notice),
  cancelled/declined, or timed out with a "refresh" hint. The page never unlocks from the
  redirect alone; only a paid job state unlocks anything.
- **FR-27** — `GET /api/download?token=...` streams the full-resolution file. The token is
  an HMAC over job id, object key and expiry, valid 15 minutes, and only issued after the
  job is paid. A tampered token returns 403; an expired or deleted one returns 410 with a
  clear message.
- **FR-28** — The unlocked page shows: HD download button, the sentence "Your images are
  deleted after 48 hours. Download them now." and the exact expiry time.

### Abuse, cost and retention

- **FR-29** — Rate limiting counts generation attempts per client IP in a rolling 24 h
  window: the 3rd attempt passes, the 4th is rejected with a friendly message stating when
  the visitor can try again. Limits come from `PREVIEW_LIMIT_PER_IP`.
- **FR-30** — A global daily cap (`DAILY_GENERATION_CAP`, default 2000) stops generation
  with a friendly "we're at capacity today" message. Both counters live in the KV adapter.
- **FR-31** — Everything about a job (original, result, preview, metadata) is deleted after
  `RETENTION_HOURS` (default 48). Expiry is enforced lazily on every job access and by
  `GET /api/cron/cleanup` (requires `CRON_SECRET`), which is also documented as a Vercel
  Cron entry. Expired jobs answer 410, not 404-with-content.
- **FR-32** — No listing endpoint, no gallery, no reuse of user images in marketing copy.
  Object keys are random and not enumerable.

### Operations

- **FR-33** — Analytics: Plausible script only when `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set.
  Events: `upload_started`, `preview_generated`, `checkout_clicked`, `payment_succeeded`,
  `download_clicked`. Missing configuration must not break the page.
- **FR-34** — `.env.example` lists every environment variable the code reads, including the
  commented ones for providers that are not enabled yet.
- **FR-35** — README covers: install, dev, test, build, storage/KV drivers, how to switch
  image provider and payment provider, how to deploy to Vercel (including cron and env
  vars), and the known mock-mode limitations.

## Acceptance criteria

Testable in this increment with the mock providers. Each one must have at least one
automated test named `AC-<n>: ...`.

- **AC-1** — Given a visitor on `/`, when the page renders, then hero, CTA, pricing, how it
  works, FAQ and footer (contact email, refund sentence, privacy/terms links) are present,
  and the page is fully keyboard navigable.
- **AC-2** — Given the server date is Oct 31, when `/` renders, then the banner says
  "Halloween is today"; given Oct 30, then "tomorrow"; given any other date, then no banner.
- **AC-3** — Given a GIF, when the visitor selects it, then a specific "unsupported format"
  message appears and no request reaches `/api/generate`.
- **AC-4** — Given an 11 MB JPEG, then the client rejects it with a size message; and a
  request with >10 MB body sent directly to `/api/generate` is rejected with 4xx.
- **AC-5** — Given a valid image but consent unchecked, then the generate button stays
  disabled; and a direct `POST /api/generate` without the consent flag returns 400 and does
  not call the provider.
- **AC-6** — Given a valid 1536 px JPEG and a style, when generation completes, then the
  response contains a preview URL whose image is ≤512 px on the long edge, is visibly
  watermarked, and contains no full-resolution URL or storage key anywhere in the response
  or page source.
- **AC-7** — Given the same input twice, when the mock provider runs, then the mock output
  is deterministic and differs per style (two styles produce different bytes).
- **AC-8** — Given a JPEG with GPS EXIF, when it is stored, then the stored original and the
  generated result contain no EXIF tags (including GPS).
- **AC-9** — Given a featureless white image, then generation fails with `no_subject`, the
  UI shows a friendly "we couldn't find a face or pet" message and offers "Try again", and
  checkout is not offered.
- **AC-10** — Given a preview-ready job, when checkout is requested, then a session is
  created with `job_id` in metadata and the browser lands on the mock hosted checkout
  showing the correct amount and the "Test mode" label.
- **AC-11** — Given the mock checkout "Pay" action, when the webhook is delivered, then the
  success page reaches "unlocked" within 10 s, the download returns the exact stored
  full-resolution bytes, and the expiry notice is shown.
- **AC-12** — Given the mock checkout "Decline" action, then the job is still unpaid, no
  download token is issued, and the paywall shows a retryable error.
- **AC-13** — Given a visit to `/success` with a forged, unknown or missing `session_id`,
  then no unlock happens, no full-resolution URL appears and no download token is issued.
- **AC-14** — Given the same webhook event id delivered twice, then the job is unlocked
  once, generation ran once, and the second delivery returns 200.
- **AC-15** — Given a webhook with an invalid signature, then the endpoint returns 400 and
  the job stays unpaid.
- **AC-16** — Given one IP, when it generates 3 previews in 24 h, then all three succeed;
  the 4th is rejected with a message that includes when it may retry; a generation 24 h
  later (faked clock) succeeds again.
- **AC-17** — Given the daily cap is reached, then the next generation is refused with the
  capacity message and no provider call is made.
- **AC-18** — Given the provider fails transiently once, then a single retry happens and the
  job succeeds; given it fails twice, then the job fails, the UI shows the retryable error
  and no checkout is offered.
- **AC-19** — Given a provider response slower than the timeout, then the attempt is
  abandoned, one retry occurs, and the user sees a timeout message (no hang past ~2 ×
  timeout).
- **AC-20** — Given `RETENTION_HOURS` short enough for a job to expire, then the stored
  objects are gone after cleanup, `/api/download` returns 410, and the cleanup endpoint
  returns 401 without `CRON_SECRET`.
- **AC-21** — Given a download token that is tampered with, then the response is 403; given
  a token past its TTL, then 410.
- **AC-22** — Given `PAYMENT_PROVIDER=mock`, then `/checkout/mock` renders; given
  `PAYMENT_PROVIDER=stripe`, then it returns 404.
- **AC-23** — `/privacy` and `/terms` contain the 48-hour retention statement, the AI
  provider disclosure, the contact email and the 7-day refund sentence.
- **AC-24** — Lighthouse mobile on `/`: performance ≥ 85 and accessibility ≥ 90.
- **AC-25** — Automated accessibility check on `/` and `/create`: labels on the file input
  and consent checkbox, alt text on images, visible focus, no critical axe violations.
- **AC-26** — The full flow passes in Playwright at an iPhone (Safari-like) viewport and an
  Android Chrome viewport: upload → preview → pay → unlock → download.
- **AC-27** — No server secret is in the client bundle: after `next build`, the prompt text,
  `DOWNLOAD_SIGNING_SECRET`, `MOCK_WEBHOOK_SECRET` and any provider key do not appear in
  `.next/static/**`.
- **AC-28** — Every `process.env` name read by the code appears in `.env.example`.

## Assumptions (please confirm in review)

1. **Increment 1 is single-portrait only.** Monster Pack, the before/after share image,
   Turnstile and the admin view are increment 2. ("seguir até onde dá" = continue with them
   once this is green and reviewed.)
2. **No real keys exist yet**, so Stripe and Gemini ship as adapters that are wired but
   unverified, with a faithful mock in front. Nothing in this increment can take a real
   payment; the mock checkout is labelled "Test mode".
3. **Price lives in env** (`PRICE_SINGLE_CENTS=499`). Pack price is documented but unused.
4. **Site URL is a placeholder** (`NEXT_PUBLIC_SITE_URL`); the watermark and OG tags read it.
   The owner replaces it when the domain exists.
5. **HEIC is best effort**: converted in the browser, with a clear fallback message if the
   browser cannot decode it. iOS camera capture normally yields JPEG.
6. **Landing page examples are placeholders** and must be replaced by the owner before
   launch. We will not claim they are real customer results.
7. **Mock provider output is a stylised derivative, not an AI portrait.** It exists to make
   the flow demoable and testable; visual quality arrives with the real provider.
8. **Countdown uses the server date in UTC**, no clock sync, no ticking timer.
9. **Storage and KV**: Vercel Blob + Upstash Redis in production, disk-backed drivers in dev
   and tests (`STORAGE_DRIVER`, `KV_DRIVER`). No accounts are needed to develop or test.
10. **Retention of 48 h is enforced by our own code**, not by a storage lifecycle rule, so
    it is testable with a shortened TTL.

## Technical notes

### Stack

- Next.js (App Router) + TypeScript on Vercel; React Server Components for the landing,
  client components only where interaction requires it.
- Tailwind CSS for the theme; no component library.
- `sharp` for decoding, EXIF stripping, resizing, watermarking and mock rendering.
- `heic2any` (WASM) in the browser for HEIC conversion.
- Vitest + Testing Library for unit and route-handler tests; Playwright for e2e.
- Storage and KV behind small interfaces, so production drivers can be swapped without
  touching the flow.

### Structure

```
app/                    routes: /, /create, /success, /privacy, /terms,
                        /checkout/mock, /api/generate, /api/jobs/[id],
                        /api/checkout, /api/webhooks/payments,
                        /api/download, /api/cron/cleanup
config/styles.ts        style ids, names, descriptions, prompt templates (server only)
lib/providers/          image: index.ts (mock, gemini); payments: index.ts (mock, stripe)
lib/storage/            storage interface + local (disk) and vercel-blob drivers
lib/kv/                 kv interface + local (disk) and upstash drivers
lib/jobs.ts             job state machine, transitions, expiry
lib/images.ts           exif strip, resize, watermark, before/after helpers
lib/limits.ts           per-IP rolling window and global daily cap
lib/tokens.ts           HMAC download tokens
lib/analytics.ts        Plausible events (no-op when unset)
components/             landing sections, upload form, paywall, success cards
tests/                  unit + route tests, fixtures (EXIF image, blank image)
e2e/                    Playwright specs, one per user journey
```

### Contracts (keep these stable)

```ts
type StyleId = "vampire" | "zombie" | "witch" | "skeleton" | "pumpkin";
type GenerateError = "no_subject" | "moderation" | "transient" | "timeout" | "fatal";

interface ImageProvider {
  generatePortrait(input: { image: Buffer; styleId: StyleId }) =>
    Promise<{ fullRes: Buffer } | { error: GenerateError }>;
}

interface PaymentsProvider {
  createSession(input: { jobId: string; amountCents: number }): Promise<{ url: string; sessionId: string }>;
  parseWebhook(input: { headers: Headers; body: string }):
    Promise<{ eventId: string; type: string; jobId?: string; sessionId: string } | { invalid: true }>;
}
```

Rules that keep the flow safe:

- The preview is a *separate stored object*; the full-res key is only ever read by
  `/api/download` after a paid check. Nothing serialises the full-res key into a page.
- Job transitions are one-way and validated in `lib/jobs.ts`: `created → generating →
  preview_ready | failed`, `preview_ready → awaiting_payment → paid → unlocked`, any →
  `expired`.
- Secrets (`DOWNLOAD_SIGNING_SECRET`, `MOCK_WEBHOOK_SECRET`, provider keys, prompts) are
  imported only from server modules (no `NEXT_PUBLIC_` prefix, `import "server-only"` on
  `config/styles.ts`).

### Commands

```
Install:  npm install
Dev:      npm run dev            # http://localhost:3000
Build:    npm run build && npm start
Unit:     npm test
E2E:      npm run e2e           # Playwright, own port per worker (never 4545)
Lint:     npm run lint
```

### Testing strategy

- Unit: EXIF stripping, watermarking dimensions, token signing/expiry, rate-limit windows,
  job transitions, mock provider determinism.
- Route tests: every API route with the mock providers and the disk drivers.
- E2E: the happy path, the decline path, the forged-success path (AC-26).
- Fixtures live in `tests/fixtures/`; no real people's photos, no real cards.

### Ordered task list (vertical slices)

1. **Scaffold** — Next.js + TS + Tailwind, Vitest, Playwright, `npm run lint`, `.env.example`
   with every variable, `.gitignore` for `.data/`, README skeleton. Verify: build, test,
   lint, e2e smoke all green.
2. **Providers and drivers** — `config/styles.ts` with the 5 prompts; storage and KV
   interfaces with disk drivers; mock image provider (deterministic, `no_subject` on blank
   images). Verify: unit tests for determinism and `no_subject`.
3. **Image pipeline** — EXIF strip, resize, watermarked 512 px preview. Verify: AC-6/AC-8
   unit tests.
4. **Job model + `/api/generate`** — job creation, rate limits, global cap, provider call
   with timeout/retry, status endpoint. Verify: AC-9, AC-16, AC-17, AC-18, AC-19 route tests.
5. **Upload UI** — `/create` with file input, client HEIC conversion, resize, validation,
   style picker, consent gating, preview display and error states. Verify: AC-3, AC-4, AC-5,
   AC-9 UI tests.
6. **Payments** — payments adapter, mock checkout page, signed idempotent webhook, checkout
   endpoint. Verify: AC-10, AC-12, AC-14, AC-15, AC-22 route tests.
7. **Success + download** — status polling page, HMAC download tokens, expiry notice.
   Verify: AC-11, AC-13, AC-21 e2e.
8. **Retention and cleanup** — lazy expiry, `/api/cron/cleanup` with `CRON_SECRET`. Verify:
   AC-20.
9. **Landing and legal pages** — hero, examples, how it works, pricing, FAQ, banner, meta,
   footer, `/privacy`, `/terms`. Verify: AC-1, AC-2, AC-23.
10. **Analytics** — Plausible events with no-op fallback. Verify: unit test that the page
    renders without the env var and events fire when the stub is present.
11. **Quality pass** — Lighthouse run, axe checks, client-bundle secret scan, `.env.example`
    completeness test, README finished. Verify: AC-24, AC-25, AC-27, AC-28.

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Real Stripe/Gemini behaviour differs from the mock | High | Adapters keep the boundary small; mock mirrors documented semantics; owner verifies with test keys before launch. |
| EXIF/heic handling on iOS | Medium | Server-side strip is authoritative; HEIC fallback message is honest. |
| Watermark/preview leak of full-res | High | Separate stored objects, signed tokens only after payment, AC-6/AC-13/AC-27 tests. |
| Serverless file drivers used in production | High | Drivers are chosen by env; production config uses Vercel Blob + Upstash; README states it. |
| Rate limiting by IP behind a proxy | Medium | Read `x-forwarded-for` carefully, document the setting. |
| Landing examples not replaced before launch | Medium | Owner task, tracked in the README and the PR. |

## Mapping to the owner document

| Owner doc | This spec |
|---|---|
| FR-1..FR-8 (upload) | FR-6..FR-9, FR-13 |
| FR-5..FR-7 (generation) | FR-12..FR-18, FR-27 |
| FR-9..FR-13 (payment) | FR-20..FR-28 |
| FR-14..FR-16 (abuse) | FR-29, FR-30 (Turnstile deferred) |
| FR-17..FR-20 (retention, privacy) | FR-4, FR-31, FR-32 |
| FR-21..FR-25 (landing) | FR-1..FR-5 |
| FR-26, FR-27 (analytics, admin) | FR-33 (admin deferred) |
| Monster Pack, before/after share, AC-2, AC-15 | Increment 2 |
