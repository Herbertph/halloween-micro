# Test cases — Haunted Portrait MVP (increment 1)

- **Spec:** [`docs/specs/haunted-portrait-mvp.md`](../specs/haunted-portrait-mvp.md)
- **Branch:** `feature/haunted-portrait-mvp`
- **Commit under test:** `23e9426`
- **Test run:** full test run (first QA pass)
- **Frameworks:** Vitest + Testing Library (unit, route and component), Playwright (e2e, iPhone 13 + Pixel 7), Lighthouse (opt-in)

## Traceability summary

| AC | Test cases | Result |
|---|---|---|
| AC-1 | TC-1 | Pass |
| AC-2 | TC-2, TC-3 | Pass |
| AC-3 | TC-4 | Pass |
| AC-4 | TC-5, TC-6 | Pass |
| AC-5 | TC-7, TC-8 | Pass |
| AC-6 | TC-9, TC-10 | Pass |
| AC-7 | TC-11 | Pass |
| AC-8 | TC-12 | Pass |
| AC-9 | TC-13 | Pass |
| AC-10 | TC-14 | Pass |
| AC-11 | TC-15 | Pass |
| AC-12 | TC-16 | Pass |
| AC-13 | TC-17 | Pass |
| AC-14 | TC-18 | Pass |
| AC-15 | TC-19 | Pass |
| AC-16 | TC-20, TC-31 | **Fail (#2)** |
| AC-17 | TC-21, TC-32 | **Fail (#2)** |
| AC-18 | TC-22 | Pass |
| AC-19 | TC-23 | Pass |
| AC-20 | TC-24, TC-33 | **Fail (#1)** |
| AC-21 | TC-25 | Pass |
| AC-22 | TC-26 | Pass |
| AC-23 | TC-27 | Pass |
| AC-24 | TC-28 | Pass |
| AC-25 | TC-29, TC-30 | **Fail (#3)** |
| AC-26 | TC-34 | Pass |
| AC-27 | TC-35 | Pass |
| AC-28 | TC-36 | Pass |
| FR-9 (unhappy path) | TC-37 | **Fail (#4)** |
| FR-12 | TC-38 | **Fail (#5)** |
| Security review | TC-39 | **Fail (#6)** |

## Test cases

### TC-1: Landing page has every promised section and is keyboard navigable
- **Acceptance criterion:** AC-1
- **Priority:** high
- **Type:** functional
- **Preconditions:** Production build served by the Playwright web server; no analytics configured.
- **Test data:** `/`
- **Steps:**
  1. Open `/`.
  2. Check the hero headline, the "Haunt my photo" CTA (`href="/create"`), pricing (`$4.99`), "How it works", "Questions", the contact email, the refund sentence and the Privacy/Terms links.
  3. Press `Tab` until the primary CTA receives focus.
  4. Focus the first FAQ summary and press `Enter`.
- **Expected result:** All sections and footer content are present; the CTA receives keyboard focus; the FAQ answer expands with the keyboard.
- **Automated by:** `e2e/journey.spec.ts` › `AC-1: the landing page has every promised section and is keyboard navigable`
- **Status:** Pass

### TC-2: Banner says "Halloween is today" on Oct 31 and "tomorrow" on Oct 30 (UTC)
- **Acceptance criterion:** AC-2
- **Priority:** high
- **Type:** boundary
- **Preconditions:** None.
- **Test data:** `2026-10-31T00:05:00Z`, `2026-10-30T23:59:00Z`
- **Steps:**
  1. Call `bannerForDate()` with each date.
  2. Render `/` with the current server date.
- **Expected result:** Oct 31 → tone `today`, text contains "Halloween is today"; Oct 30 → tone `tomorrow`, text contains "Halloween is tomorrow"; page banner is server-rendered.
- **Automated by:** `tests/unit/format.test.ts` › `AC-2: says Halloween is today on October 31 (UTC)` and `AC-2: says Halloween is tomorrow on October 30 (UTC)`; `e2e/journey.spec.ts` › `AC-2: the Halloween banner follows the server date in UTC`
- **Status:** Pass

### TC-3: Banner is hidden on every other date
- **Acceptance criterion:** AC-2
- **Priority:** medium
- **Type:** boundary
- **Preconditions:** None.
- **Test data:** `2026-10-29T12:00:00Z`, `2026-11-01T00:00:00Z`, `2026-10-01T00:00:00Z`
- **Steps:**
  1. Call `bannerForDate()` with each date.
- **Expected result:** `null` for all three dates (no banner, no hydration mismatch).
- **Automated by:** `tests/unit/format.test.ts` › `AC-2: is hidden on any other day`
- **Status:** Pass

### TC-4: A GIF is rejected in the browser with a specific message and no request
- **Acceptance criterion:** AC-3
- **Priority:** high
- **Type:** negative
- **Preconditions:** `/create` rendered.
- **Test data:** `fun.gif`, MIME `image/gif`, content `GIF89a…`
- **Steps:**
  1. Select the GIF in the file input.
  2. Observe the message and the network.
- **Expected result:** "That file type isn't supported. Use a JPG, PNG or WEBP." appears; no request reaches `/api/generate`; the server also rejects the same bytes by magic sniffing with 400 `unsupported_format` and never calls the provider.
- **Automated by:** `tests/ui/create-form.test.tsx` › `AC-3: rejects a GIF with a specific message and sends no request`; `tests/routes/generate.test.ts` › `AC-3: rejects a GIF by magic bytes without calling the provider`
- **Status:** Pass

### TC-5: An 11 MB JPEG is rejected client-side with a size message
- **Acceptance criterion:** AC-4
- **Priority:** high
- **Type:** boundary
- **Preconditions:** `/create` rendered.
- **Test data:** 11 MB `big.jpg` (`11 * 1024 * 1024` bytes), MIME `image/jpeg`
- **Steps:**
  1. Select the file.
- **Expected result:** "That photo is too large. The limit is 10 MB." appears; no fetch is made.
- **Automated by:** `tests/ui/create-form.test.tsx` › `AC-4: rejects an 11 MB file before any request`
- **Status:** Pass

### TC-6: A >10 MB body sent directly to the API is rejected with 4xx
- **Acceptance criterion:** AC-4
- **Priority:** high
- **Type:** boundary
- **Preconditions:** Disk storage/KV drivers; mock provider.
- **Test data:** 11 MB multipart body, `consent=true`, `styleId=pumpkin`
- **Steps:**
  1. `POST /api/generate` directly, bypassing the client.
- **Expected result:** HTTP 413, `error: "file_too_large"`, `maxBytes: 10485760`, provider not called.
- **Automated by:** `tests/routes/generate.test.ts` › `AC-4: rejects a body over 10 MB with a 4xx`
- **Status:** Pass

### TC-7: Generate stays disabled until a file, a style and consent are present
- **Acceptance criterion:** AC-5
- **Priority:** high
- **Type:** functional
- **Preconditions:** `/create` rendered; default style `pumpkin` already selected.
- **Test data:** A valid JPEG; consent unchecked.
- **Steps:**
  1. Check the button is disabled on load.
  2. Select a valid JPEG; check the button is still disabled.
  3. Tick the consent checkbox.
- **Expected result:** Button disabled until both file and consent exist, then enabled.
- **Automated by:** `tests/ui/create-form.test.tsx` › `AC-5: keeps generate disabled until a file and consent are present`
- **Status:** Pass

### TC-8: A direct POST without the consent flag returns 400 and never calls the provider
- **Acceptance criterion:** AC-5
- **Priority:** high
- **Type:** security
- **Preconditions:** Mock provider wrapped to count calls.
- **Test data:** Valid JPEG, `styleId=pumpkin`, no `consent` field.
- **Steps:**
  1. `POST /api/generate` as multipart form data.
- **Expected result:** HTTP 400 `consent_required`; provider call count stays 0.
- **Automated by:** `tests/routes/generate.test.ts` › `AC-5: rejects a request without consent and never calls the provider`
- **Status:** Pass

### TC-9: A generated preview is ≤512 px and no full-resolution URL or key is exposed
- **Acceptance criterion:** AC-6
- **Priority:** high
- **Type:** security
- **Preconditions:** Mock provider, disk drivers, valid 1536 px JPEG.
- **Test data:** `tests/fixtures/valid.jpg`, `styleId=pumpkin`
- **Steps:**
  1. `POST /api/generate`.
  2. Inspect the response body text.
  3. Fetch the returned `previewUrl` and read the JPEG metadata.
  4. Fetch `/api/jobs/<id>` without a session.
  5. Check the rendered `/create` page source before payment.
- **Expected result:** Response has `status: "preview_ready"` and a preview URL; no `blobs/`, `fullKey`, `originalKey` or `/api/download` anywhere; preview long edge ≤ 512 px; status endpoint silent about keys.
- **Automated by:** `tests/routes/generate.test.ts` › `AC-6: returns only a watermarked preview URL, never a storage key`; `tests/unit/jobs.test.ts` › `AC-6/FR-18: never serialises storage keys in the public job`; `e2e/journey.spec.ts` › `AC-26: the full upload → preview → pay → unlock → download flow works` (page-source assertions)
- **Status:** Pass

### TC-10: The preview is visibly watermarked
- **Acceptance criterion:** AC-6
- **Priority:** high
- **Type:** functional
- **Preconditions:** Valid JPEG.
- **Test data:** `tests/fixtures/valid.jpg`, host `haunted.example`
- **Steps:**
  1. Build the preview with `makePreview()`.
  2. Compare it with the un-watermarked 512 px resize.
- **Expected result:** Pixel statistics differ from the plain resize; the SVG watermark contains diagonal "PREVIEW" plus the site host.
- **Automated by:** `tests/unit/images.test.ts` › `AC-6: the preview is visibly watermarked`
- **Status:** Pass

### TC-11: The mock provider is deterministic and differs per style
- **Acceptance criterion:** AC-7
- **Priority:** high
- **Type:** functional
- **Preconditions:** Mock provider.
- **Test data:** `tests/fixtures/valid.jpg`; styles `vampire`, `skeleton`.
- **Steps:**
  1. Generate the same input twice with `vampire`.
  2. Generate with `vampire` and `skeleton`.
- **Expected result:** Identical bytes for the repeated call; different bytes across styles.
- **Automated by:** `tests/unit/mock-provider.test.ts` › `AC-7: is deterministic for the same input and style` and `AC-7: differs per style for the same input`
- **Status:** Pass

### TC-12: Stored original and generated result contain no EXIF/GPS
- **Acceptance criterion:** AC-8
- **Priority:** high
- **Type:** security
- **Preconditions:** Mock provider, disk storage.
- **Test data:** `tests/fixtures/gps.jpg` (contains camera EXIF/GPS and the string `Fixture Camera`).
- **Steps:**
  1. `POST /api/generate` with the EXIF fixture.
  2. Load the job and read `originalKey` and `fullKey` from storage.
  3. Read JPEG metadata and scan bytes for the EXIF marker.
- **Expected result:** `metadata.exif` is `undefined` for both objects; `Fixture Camera` is absent.
- **Automated by:** `tests/unit/images.test.ts` › `AC-8: strips EXIF and GPS from the stored original and the result`; `tests/routes/generate.test.ts` › `AC-8: the stored original and the generated result carry no EXIF/GPS`
- **Status:** Pass

### TC-13: A featureless image fails with `no_subject`, a friendly retry and no checkout
- **Acceptance criterion:** AC-9
- **Priority:** high
- **Type:** negative
- **Preconditions:** Mock provider, disk drivers.
- **Test data:** `tests/fixtures/blank.jpg` (uniform colour).
- **Steps:**
  1. Upload the blank image on `/create`, tick consent and generate.
  2. Observe the error and buttons.
  3. Directly request checkout for the failed job.
- **Expected result:** "We couldn't find a face or pet in that photo…" appears; "Try again" is offered; no "Unlock HD" button; direct checkout is refused (409).
- **Automated by:** `tests/unit/mock-provider.test.ts` › `AC-9: rejects a featureless image with no_subject`; `tests/routes/generate.test.ts` › `AC-9: a featureless image fails with no_subject and offers no checkout`; `tests/ui/create-form.test.tsx` › `AC-9: a no_subject failure shows a friendly message and a free retry, with no checkout`; `e2e/journey.spec.ts` › `AC-9: a featureless photo shows a friendly failure with a free retry`
- **Status:** Pass

### TC-14: Checkout creates a session with `job_id` metadata and lands on the mock checkout
- **Acceptance criterion:** AC-10
- **Priority:** high
- **Type:** functional
- **Preconditions:** Mock payment provider, preview-ready job.
- **Test data:** A persisted `preview_ready` job; `PRICE_SINGLE_CENTS=499`.
- **Steps:**
  1. `POST /api/checkout { jobId }`.
  2. Read the session record and the returned URL.
  3. Open the returned URL.
- **Expected result:** A session is created with `jobId`, `amountCents: 499`, status `pending`; the job moves to `awaiting_payment`; the browser lands on `/checkout/mock?session=…` showing `$4.99` and the "Test mode" label; the signed webhook body carries `metadata.job_id`.
- **Automated by:** `tests/routes/checkout.test.ts` › `AC-10: creates a mock session with job_id metadata and a hosted checkout URL` and `AC-10: the mock webhook carries job_id in the session metadata`; `e2e/journey.spec.ts` › `AC-26: …` (checkout assertions)
- **Status:** Pass

### TC-15: "Pay" unlocks within 10 s and the download returns the exact stored full-resolution bytes
- **Acceptance criterion:** AC-11
- **Priority:** high
- **Type:** functional
- **Preconditions:** Preview-ready job, mock checkout open.
- **Test data:** Full-resolution dummy bytes for the route test; generated portrait for e2e.
- **Steps:**
  1. Click "Pay $4.99".
  2. Wait for `/success?session_id=…` to reach "Your portrait is ready".
  3. Click "Download HD portrait" and read the bytes.
- **Expected result:** Unlocked within 10 s; the downloaded bytes equal the stored `fullKey` object exactly (route test) and start with JPEG magic bytes (e2e); the expiry notice is shown.
- **Automated by:** `tests/routes/checkout.test.ts` › `AC-11: Pay delivers a signed webhook and redirects to the success page`; `tests/routes/download.test.ts` › `AC-11: streams the exact stored full-resolution bytes for a paid job`; `e2e/journey.spec.ts` › `AC-26: …`
- **Status:** Pass

### TC-16: "Decline" leaves the job unpaid, issues no token and returns to a retryable paywall
- **Acceptance criterion:** AC-12
- **Priority:** high
- **Type:** negative
- **Preconditions:** Preview-ready job, mock checkout open.
- **Test data:** A pending mock session.
- **Steps:**
  1. Click "Decline payment".
  2. Inspect the redirect, the job and the session.
  3. Request `/api/jobs/<id>?session=<session>`.
- **Expected result:** Redirect to `/create?job=<id>&declined=1`; job stays `awaiting_payment` with no `paidAt`; session becomes `declined`; no `/api/download` or storage key in the response; the paywall shows "Payment was declined" and still offers Unlock HD.
- **Automated by:** `tests/routes/checkout.test.ts` › `AC-12: Decline leaves the job unpaid and issues no download token`; `e2e/journey.spec.ts` › `AC-12: declining the mock checkout returns to the paywall with a retryable error`
- **Status:** Pass

### TC-17: Forged, unknown or missing `session_id` never unlocks anything
- **Acceptance criterion:** AC-13
- **Priority:** high
- **Type:** security
- **Preconditions:** A paid job exists; a forged session id is used.
- **Test data:** `cs_forged`, unknown job id, no `session_id`.
- **Steps:**
  1. Open `/success?session_id=cs_forged`.
  2. Open `/success` without a session id.
  3. Request `/api/jobs/<paid-job-id>?session=cs_forged`.
- **Expected result:** The page shows "We couldn't find that order"; no download link; no `/api/download` or `blobs/` in the page source or API response; the unpaid job's status endpoint never returns a download URL.
- **Automated by:** `e2e/journey.spec.ts` › `AC-13: the success page never unlocks from a forged or missing session`; `tests/routes/download.test.ts` › `AC-13: unknown jobs and forged sessions never unlock anything` and `AC-11/AC-13: only the owning paid session receives a download URL`
- **Status:** Pass

### TC-18: A duplicate webhook event unlocks once and returns 200 both times
- **Acceptance criterion:** AC-14
- **Priority:** high
- **Type:** security
- **Preconditions:** Preview-ready job; known signed event id.
- **Test data:** `evt_duplicate`, `cs_test_1`, the job id.
- **Steps:**
  1. POST the signed webhook.
  2. POST the identical request again.
- **Expected result:** Both return 200; job is `unlocked` after the first; `paidAt` is unchanged after the second; no second generation happens (the webhook never generates).
- **Automated by:** `tests/routes/webhook.test.ts` › `AC-14: the same event delivered twice unlocks once and both return 200`
- **Status:** Pass

### TC-19: An invalid webhook signature returns 400 and leaves the job unpaid
- **Acceptance criterion:** AC-15
- **Priority:** high
- **Type:** security
- **Preconditions:** Preview-ready job.
- **Test data:** Valid body, signature `deadbeef`.
- **Steps:**
  1. POST to `/api/webhooks/payments`.
- **Expected result:** HTTP 400; job remains `preview_ready`; no `paidAt`.
- **Automated by:** `tests/routes/webhook.test.ts` › `AC-15: an invalid signature returns 400 and leaves the job unpaid`
- **Status:** Pass

### TC-20: Three sequential previews pass, the fourth is rejected with a retry time, and the window frees up 24 h later
- **Acceptance criterion:** AC-16
- **Priority:** high
- **Type:** boundary
- **Preconditions:** `PREVIEW_LIMIT_PER_IP=3`; one client IP; fake UTC clock.
- **Test data:** Same valid JPEG four times from `10.1.1.1` at `2026-10-30T10:00:00Z`; fifth attempt at `2026-10-31T10:00:01Z`.
- **Steps:**
  1. Generate three times.
  2. Generate a fourth time.
  3. Advance the clock past 24 h and generate again.
- **Expected result:** First three 202; fourth 429 `rate_limited` with a parseable `retryAt` (the UI renders "Try again after Oct 31, 2026, 10:00 UTC"); post-window attempt 202 and calls the provider.
- **Automated by:** `tests/routes/generate.test.ts` › `AC-16: allows 3 previews per IP in 24 h, rejects the 4th, then allows after the window`; `tests/unit/limits.test.ts` › `AC-16: allows three previews, rejects the fourth with a retry time, and frees up 24 h later`; `tests/ui/create-form.test.tsx` › `AC-16: a rate-limited visitor sees when they may try again`
- **Status:** Pass

### TC-21: The daily cap refuses the next generation with the capacity message and no provider call
- **Acceptance criterion:** AC-17
- **Priority:** high
- **Type:** boundary
- **Preconditions:** `DAILY_GENERATION_CAP=1`; two different IPs.
- **Test data:** Two valid JPEGs.
- **Steps:**
  1. Generate once.
  2. Generate from another IP.
- **Expected result:** First 202; second 429 `capacity`; provider call count unchanged; the UI shows "We're at capacity today. Please come back tomorrow."
- **Automated by:** `tests/routes/generate.test.ts` › `AC-17: refuses generation at the daily cap without calling the provider`; `tests/unit/limits.test.ts` › `AC-17: refuses once the cap is reached and does not increment further`; `tests/ui/create-form.test.tsx` › `AC-17: the capacity message is shown when the daily cap is reached`
- **Status:** Pass

### TC-22: One transient failure retries once and succeeds; two failures return the retryable error with no checkout
- **Acceptance criterion:** AC-18
- **Priority:** high
- **Type:** negative
- **Preconditions:** Scripted provider; `/create` with a valid file and consent.
- **Test data:** `[transient, fullRes]`, `[transient, transient]`
- **Steps:**
  1. Run `runGeneration` with each script.
  2. Render a failed job response with `error: "transient"`.
- **Expected result:** One retry then success (2 calls); two transient failures stop after 2 calls and return `transient`; the UI shows "Something hiccuped…", "Try again" and no Unlock HD button.
- **Automated by:** `tests/unit/generation.test.ts` › `AC-18: retries once after a transient failure and succeeds`, `AC-18: fails after two transient failures without further attempts`, `AC-18: non-retryable errors return immediately`; `tests/ui/create-form.test.tsx` › `AC-18: a transient failure offers a free retry and no checkout`
- **Status:** Pass

### TC-23: A slow provider is abandoned, retried once and reported as a timeout
- **Acceptance criterion:** AC-19
- **Priority:** high
- **Type:** boundary
- **Preconditions:** Scripted provider that resolves after 400 ms; 40 ms timeout.
- **Test data:** Two late attempts; UI failure payload `error: "timeout"`.
- **Steps:**
  1. Run `runGeneration` and measure elapsed time.
  2. Render the timeout failure state.
- **Expected result:** Two calls, result `timeout`, elapsed < 300 ms (not 2 × the provider's 400 ms); UI shows "Generation took too long. Try again — it's free." and no checkout.
- **Automated by:** `tests/unit/generation.test.ts` › `AC-19: abandons a slow attempt, retries once and reports timeout`; `tests/ui/create-form.test.tsx` › `AC-19: a timeout failure shows the timeout message and a free retry`
- **Status:** Pass

### TC-24: An expired job's objects are deleted, download answers 410 and cleanup answers 401 without the secret
- **Acceptance criterion:** AC-20
- **Priority:** high
- **Type:** security
- **Preconditions:** `RETENTION_HOURS=0`; disk storage/KV; `CRON_SECRET=test-cron-secret`.
- **Test data:** One job with original/full/preview objects; valid download token.
- **Steps:**
  1. Call `GET /api/cron/cleanup` without and with a wrong bearer token.
  2. Call it with the correct bearer token.
  3. Read the three objects; call `/api/download` with the token.
- **Expected result:** 401 without/wrong secret and objects stay; 200 with the secret; all three objects are gone; job status `expired`; download 410 with no content.
- **Automated by:** `tests/routes/cleanup.test.ts` › `AC-20: purges expired objects, answers 410 on download and 401 without CRON_SECRET`
- **Status:** Pass

### TC-25: A tampered token is 403 and an expired token is 410
- **Acceptance criterion:** AC-21
- **Priority:** high
- **Type:** security
- **Preconditions:** Paid job.
- **Test data:** Valid token with one signature character changed; token with `exp` in the past; valid token for an unpaid job.
- **Steps:**
  1. Call `/api/download?token=…` with each token.
- **Expected result:** Tampered → 403 `invalid_token`; expired → 410 `token_expired`; unpaid job → 410 (never leaks bytes).
- **Automated by:** `tests/unit/tokens.test.ts` › `AC-21: accepts a freshly signed token`, `AC-21: rejects a tampered token as invalid`, `AC-21: rejects an expired token as expired`; `tests/routes/download.test.ts` › `AC-21: returns 403 for a tampered token and 410 for an expired one` and `AC-21: a valid token for an unpaid job is refused`
- **Status:** Pass

### TC-26: The mock checkout renders for the mock provider and returns 404 for Stripe
- **Acceptance criterion:** AC-22
- **Priority:** high
- **Type:** functional
- **Preconditions:** `PAYMENT_PROVIDER=mock` / `stripe`; an existing session for the render case.
- **Test data:** `/checkout/mock?session=<session>`; unknown session.
- **Steps:**
  1. Open the mock checkout with a valid session.
  2. Switch to `PAYMENT_PROVIDER=stripe` and open the page; also POST complete/decline.
- **Expected result:** Mock renders amount + "Test mode" + Pay/Decline; unknown session and Stripe mode both 404.
- **Automated by:** `tests/routes/checkout-page.test.tsx` › `AC-22: returns 404 when PAYMENT_PROVIDER=stripe` and `AC-22: returns 404 for an unknown session`; `tests/routes/checkout.test.ts` › `AC-22: the mock checkout is enabled only for PAYMENT_PROVIDER=mock`; `e2e/journey.spec.ts` › `AC-26: …` (renders the page)
- **Status:** Pass

### TC-27: Privacy and terms state retention, the AI provider, contact and the refund policy
- **Acceptance criterion:** AC-23
- **Priority:** high
- **Type:** functional
- **Preconditions:** None.
- **Test data:** `/privacy`, `/terms`
- **Steps:**
  1. Open each page and read `main`.
- **Expected result:** Each contains "48 hours", "Gemini"/"AI image provider", `hello@hauntedportrait.example` and "7 days".
- **Automated by:** `e2e/journey.spec.ts` › `AC-23: privacy and terms disclose retention, the AI provider, contact and refunds`
- **Status:** Pass

### TC-28: Lighthouse mobile on `/` meets performance ≥ 85 and accessibility ≥ 90
- **Acceptance criterion:** AC-24
- **Priority:** high
- **Type:** accessibility
- **Preconditions:** `npm run build`; `RUN_LIGHTHOUSE=1`; Chromium available.
- **Test data:** `http://127.0.0.1:3101/`
- **Steps:**
  1. Run the Lighthouse spec on the iPhone project.
- **Expected result:** Both category scores are at or above the budget.
- **Automated by:** `e2e/lighthouse.spec.ts` › `AC-24: / meets the mobile performance and accessibility budget` (opt-in)
- **Status:** Pass — run with `RUN_LIGHTHOUSE=1 npx playwright test e2e/lighthouse.spec.ts --project=iphone`

### TC-29: `/` and `/create` have no critical axe violations, labelled controls and alt text
- **Acceptance criterion:** AC-25
- **Priority:** high
- **Type:** accessibility
- **Preconditions:** Production build served by Playwright.
- **Test data:** `/`, `/create`
- **Steps:**
  1. Run axe on both pages.
  2. Check the file input and consent labels.
  3. Check every `<img>` on `/` has non-empty alt text.
- **Expected result:** No critical violations; labels resolve; all images have alt text.
- **Automated by:** `e2e/accessibility.spec.ts` › `AC-25: / and /create have no critical axe violations` and `AC-25: upload controls expose labels and images have alt text`
- **Status:** Pass

### TC-30: Keyboard focus is visible on every control
- **Acceptance criterion:** AC-25
- **Priority:** high
- **Type:** accessibility
- **Preconditions:** Production build served by Playwright.
- **Test data:** `/create`
- **Steps:**
  1. Focus `#photo` (the file input is reachable by Tab).
  2. Compare the visible wrapper with its idle styling.
- **Expected result:** The focused control (or its visible label) shows a clear focus indicator.
- **Automated by:** `e2e/accessibility.spec.ts` › `AC-25: keyboard focus is visible on the upload control`
- **Status:** **Fail (#3)** — the real input is 1 × 1 px and clipped; the label does not change. Fails on both viewports.

### TC-31: Parallel generations from one IP cannot exceed the rolling limit
- **Acceptance criterion:** AC-16
- **Priority:** high
- **Type:** security
- **Preconditions:** Disk KV; `PREVIEW_LIMIT_PER_IP=3`; fake UTC clock.
- **Test data:** 10 simultaneous `consumePreviewAttempt("ip-raced", 2026-10-30T10:00:00Z)` calls.
- **Steps:**
  1. Fire all 10 calls with `Promise.all`.
- **Expected result:** Exactly 3 allowed and 7 refused (the rolling limit must hold under concurrency, not only sequentially).
- **Automated by:** `tests/unit/limits.test.ts` › `AC-16: parallel attempts from one IP cannot exceed the rolling limit`
- **Status:** **Fail (#2)** — 10 of 10 allowed.

### TC-32: Parallel generations cannot exceed the global daily cap
- **Acceptance criterion:** AC-17
- **Priority:** high
- **Type:** security
- **Preconditions:** Disk KV; `DAILY_GENERATION_CAP=3`; fake UTC clock.
- **Test data:** 10 simultaneous `consumeDailyGeneration()` calls.
- **Steps:**
  1. Fire all 10 calls with `Promise.all`.
- **Expected result:** Exactly 3 allowed and 7 refused; no provider call for rejected requests.
- **Automated by:** `tests/unit/limits.test.ts` › `AC-17: parallel requests cannot exceed the global daily cap`
- **Status:** **Fail (#2)** — 10 of 10 allowed.

### TC-33: Cleanup deletes every expired job created at the same time
- **Acceptance criterion:** AC-20
- **Priority:** high
- **Type:** security
- **Preconditions:** `RETENTION_HOURS=0`; disk storage/KV.
- **Test data:** 20 jobs created concurrently, each with original/full/preview objects.
- **Steps:**
  1. Create the 20 jobs with `Promise.all`.
  2. Persist the objects and keys.
  3. Run `cleanupExpiredJobs(now + 60 s)`.
  4. Read each `fullKey` back from storage.
- **Expected result:** All 20 jobs are swept and every object is gone.
- **Automated by:** `tests/routes/cleanup-concurrency.test.ts` › `AC-20/FR-31: cleanup deletes the objects of every expired job created at the same time`
- **Status:** **Fail (#1)** — 19 of 20 jobs never reach `jobs:index`; their objects survive.

### TC-34: The full upload → preview → pay → unlock → download flow works on both mobile viewports
- **Acceptance criterion:** AC-26
- **Priority:** high
- **Type:** functional
- **Preconditions:** Production build; mock providers; Playwright iPhone 13 and Pixel 7 projects.
- **Test data:** `tests/fixtures/valid.jpg`, Witch style.
- **Steps:**
  1. Open `/create`, upload the photo, pick Witch, tick consent, generate.
  2. Open checkout, verify `$4.99` and Test mode, pay.
  3. Wait for unlock, verify the expiry sentence and deletion time, download.
- **Expected result:** The whole journey completes on both viewports; the downloaded file is a JPEG.
- **Automated by:** `e2e/journey.spec.ts` › `AC-26: the full upload → preview → pay → unlock → download flow works` (iphone + android)
- **Status:** Pass

### TC-35: No server secret or prompt text reaches the client bundle
- **Acceptance criterion:** AC-27
- **Priority:** high
- **Type:** security
- **Preconditions:** `next build` completed; CI/e2e secret values set.
- **Test data:** `.next/static/**`; secret env values; prompt fragments.
- **Steps:**
  1. Walk `.next/static`.
  2. Search for each secret value (≥8 chars) and for `Reimagine the person or animal…`, `family-friendly`, `Keep the subject's identity…`.
  3. Also run `npm run check:secrets`.
- **Expected result:** No matches.
- **Automated by:** `tests/unit/bundle.test.ts` › `AC-27: no server secret or prompt text is in .next/static`; `npm run check:secrets`
- **Status:** Pass

### TC-36: Every `process.env` name read by the code is documented in `.env.example`
- **Acceptance criterion:** AC-28
- **Priority:** medium
- **Type:** functional
- **Preconditions:** Source tree checked out.
- **Test data:** `app/`, `lib/`, `components/`, `config/`; `.env.example`
- **Steps:**
  1. Extract every `process.env.X` and `process.env["X"]` name (except `NODE_ENV`).
  2. Compare with the keys defined in `.env.example`.
- **Expected result:** No missing names.
- **Automated by:** `tests/unit/env.test.ts` › `AC-28: every process.env name read by the code is documented in .env.example`
- **Status:** Pass

### TC-37: A corrupt image with valid magic bytes is a typed 4xx and does not call the provider
- **Acceptance criterion:** FR-9 (unhappy path; no AC)
- **Priority:** medium
- **Type:** negative
- **Preconditions:** Mock provider wrapped to count calls.
- **Test data:** 12-byte JPEG prefix (`ff d8 ff e0 …`), `consent=true`, `styleId=pumpkin`.
- **Steps:**
  1. POST the file to `/api/generate`.
- **Expected result:** 4xx with a typed `error`; provider call count 0.
- **Automated by:** `tests/routes/generate.test.ts` › `FR-9: a corrupt JPEG with valid magic bytes is a typed 4xx, not a 500`
- **Status:** **Fail (#4)** — 500 `{"error":"fatal"}`.

### TC-38: `POST /api/generate` returns 202 while generating and the client polls the job
- **Acceptance criterion:** FR-12
- **Priority:** medium
- **Type:** functional
- **Preconditions:** Code review; mock provider.
- **Test data:** `app/api/generate/route.ts`, `components/create/CreateForm.tsx`, `/api/jobs/[id]`
- **Steps:**
  1. Read the route and confirm the response is sent before/while generation runs.
  2. Confirm the client polls `/api/jobs/[id]` until `preview_ready`/`failed`.
- **Expected result:** 202 immediately after job creation; preview arrives via polling.
- **Automated by:** n/a (code review; no AC test because AC-26 passes with the inline flow)
- **Status:** **Fail (#5)** — generation runs inline and the client never polls.

### TC-39: Production responses carry baseline security headers
- **Acceptance criterion:** security review (no AC)
- **Priority:** medium
- **Type:** security
- **Preconditions:** `npm run build`; `next start` on a spare port.
- **Test data:** `GET /`
- **Steps:**
  1. Dump the response headers.
  2. Check for CSP, X-Frame-Options/`frame-ancestors`, X-Content-Type-Options and Referrer-Policy.
- **Expected result:** Baseline headers present.
- **Automated by:** n/a (manual header probe; no test in the repo)
- **Status:** **Fail (#6)** — none of the headers are sent.

## Not covered

- **Real Stripe and Gemini behaviour** — no keys exist in this increment; both adapters are explicitly unverified by the spec (Assumptions 2, FR-16, FR-23). Not testable here.
- **HEIC conversion on a real iPhone/Safari** — best effort by design (Assumption 5); the automated suite has no real HEIC fixture or WebKit engine.
- **Vercel Blob / Upstash drivers** — no accounts/tokens in this increment; only the local drivers are exercised. The concurrency findings also apply to the Upstash driver because it uses the same read-modify-write calls, but that is inference rather than an executed test.
- **10 MB uploads through Vercel's 4.5 MB serverless request-body limit** — a deployment constraint, not observable with the local server; the client normally resizes to well below it.
- **Visual quality of the mock portrait and the placeholder landing assets** — owner task (Assumptions 6, 7).
- **Lighthouse on the Android project** — one mobile run is enough for a per-page budget; the iPhone project was run.
- **A real Safari/WebKit engine** — `playwright.config.ts` intentionally uses Chromium for both mobile viewports.
- **Refund/email handling** — manual operational process, no code path in increment 1.
