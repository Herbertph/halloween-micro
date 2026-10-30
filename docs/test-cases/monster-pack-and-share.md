# Test cases — Monster Pack, share image, Turnstile and admin (increment 2)

- **Spec:** [`docs/specs/monster-pack-and-share.md`](../specs/monster-pack-and-share.md)
- **Branch:** `feature/monster-pack-and-share`
- **Commit under test:** `4e1b114` (retest; first pass `0fcd9cf`, fixes `0d10649`, `697b5b0`, `79c0d4b`, `ebb2f0b`)
- **Test run:** retest of #9, #10, #11 and #12 plus the increment 1 regression
- **Frameworks:** Vitest + Testing Library (unit, route and component), Playwright (e2e, iPhone 13 + Pixel 7), Lighthouse (opt-in, `/` and `/create`)

> **Naming note:** increment 1 also has AC-1..AC-28. In this document **AC-n means the increment 2 spec**, and the increment 1 regression is AC-26 only. The increment 1 test cases live in `haunted-portrait-mvp.md`; its tests keep their names.

## Traceability summary

| AC | Test cases | Result |
|---|---|---|
| AC-1 | MP-1 | Pass |
| AC-2 | MP-2, MP-3 | Pass |
| AC-3 | MP-4, MP-5, MP-6 | Pass |
| AC-4 | MP-7 | Pass |
| AC-5 | MP-8 | Pass |
| AC-6 | MP-9 | Pass |
| AC-7 | MP-10 | Pass |
| AC-8 | MP-11, MP-12 | Pass (fixed #11) |
| AC-9 | MP-13, MP-14 | Pass |
| AC-10 | MP-15, MP-16, MP-17 | Pass (fixed #9) |
| AC-11 | MP-18 | Pass |
| AC-12 | MP-19 | Pass |
| AC-13 | MP-20, MP-21 | Pass |
| AC-14 | MP-22, MP-23 | Pass |
| AC-15 | MP-24 | Pass |
| AC-16 | MP-25 | Pass |
| AC-17 | MP-26 | Pass |
| AC-18 | MP-27 | Pass |
| AC-19 | MP-28, MP-29 | Pass |
| AC-20 | MP-30 | Pass |
| AC-21 | MP-31 | Pass |
| AC-22 | MP-32 | Pass |
| AC-23 | MP-33 | Pass |
| AC-24 | MP-34 | Pass |
| AC-25 | MP-35 | Pass |
| AC-26 | MP-37 | Pass |
| AC-27 | MP-38 | Pass |
| AC-28 | MP-40 | Pass |
| AC-29 | MP-36 | Pass (fixed #12) |
| AC-30 | MP-41 | Pass |
| FR-9 (operational) | MP-39 | Pass (fixed #10) |

## Test cases

### MP-1: Landing and paywall show both products and prices
- **Acceptance criterion:** AC-1
- **Priority:** high
- **Type:** functional
- **Preconditions:** Production build, mock providers.
- **Test data:** `/`, `/create` after a preview.
- **Steps:**
  1. Open `/`; check `$4.99`, `$8.99` and "4 styles, one download each".
  2. Generate a preview and check the "Unlock HD — $4.99" and "Get the Monster Pack — $8.99" buttons and the pack description.
- **Expected result:** Both prices and the pack description are visible; the paywall has both buttons.
- **Automated by:** `e2e/pack.spec.ts` › `AC-1: landing and paywall show both products and prices`
- **Status:** Pass

### MP-2: Pack composition returns four distinct styles with the chosen style first (five cases)
- **Acceptance criterion:** AC-2
- **Priority:** high
- **Type:** functional
- **Preconditions:** None.
- **Test data:** `vampire`, `zombie`, `witch`, `skeleton`, `pumpkin`.
- **Steps:**
  1. Call `packStyles()` for each style.
- **Expected result:** Exactly four distinct styles; the chosen one first; expected order for each case.
- **Automated by:** `tests/unit/products.test.ts` › `AC-2: %s produces four distinct styles with the chosen one first` (5 parameterised cases)
- **Status:** Pass

### MP-3: Pack composition pads a short list (boundary)
- **Acceptance criterion:** AC-2
- **Priority:** medium
- **Type:** boundary
- **Preconditions:** None.
- **Test data:** `skeleton`.
- **Steps:**
  1. Call `packStyles("skeleton")`.
- **Expected result:** Four distinct styles including `skeleton` first. With the current five styles the padding branch is unreachable (three defaults remain), so this is a boundary check of the ordering, not of a short list.
- **Automated by:** `tests/unit/products.test.ts` › `AC-2: pads with skeleton when the chosen style would leave a short list`
- **Status:** Pass (test is weak: the padding branch is not reachable with today's style set)

### MP-4: An unknown product is rejected with a typed 400
- **Acceptance criterion:** AC-3
- **Priority:** high
- **Type:** negative
- **Preconditions:** Preview-ready job.
- **Test data:** `{ jobId, product: "mega" }`.
- **Steps:**
  1. POST `/api/checkout` with the unknown product.
- **Expected result:** 400 `invalid_product`; no session.
- **Automated by:** `tests/routes/checkout-products.test.ts` › `AC-3: rejects an unknown product and ignores any client amount`
- **Status:** Pass

### MP-5: The amount always comes from env, never the client
- **Acceptance criterion:** AC-3
- **Priority:** high
- **Type:** security
- **Preconditions:** `PRICE_PACK_CENTS=899`, `PRICE_SINGLE_CENTS=499`.
- **Test data:** `{ jobId, product: "pack", amountCents: 1 }`.
- **Steps:**
  1. POST `/api/checkout`.
  2. Read the response and the session record.
- **Expected result:** `amountCents` is 899 in the response and session; the client amount is ignored; `product` is `pack`.
- **Automated by:** `tests/routes/checkout-products.test.ts` › `AC-3: rejects an unknown product and ignores any client amount`; `tests/unit/products.test.ts` › `AC-3: derives both prices from env, never from the client`
- **Status:** Pass

### MP-6: A missing product stays valid and means single
- **Acceptance criterion:** AC-3 (compatibility note)
- **Priority:** medium
- **Type:** boundary
- **Preconditions:** Preview-ready job.
- **Test data:** `{ jobId }` only.
- **Steps:**
  1. POST `/api/checkout`.
- **Expected result:** 200; product `single`; amount 499 in the response and session.
- **Automated by:** `tests/routes/checkout-products.test.ts` › `AC-3: a missing product stays valid for increment 1 clients and means single`
- **Status:** Pass

### MP-7: The checkout response and session carry the product; the job records it only after the webhook
- **Acceptance criterion:** AC-4
- **Priority:** high
- **Type:** functional
- **Preconditions:** Preview-ready job; mock provider.
- **Test data:** `product: "pack"`, amount 899.
- **Steps:**
  1. Checkout; read the session and the job before payment.
  2. Deliver the signed webhook; read the job again.
- **Expected result:** Session has `product: pack`; job `product` is undefined before the webhook; after, `product: pack`, `paidAmountCents: 899`, status unlocked, 3 pending assets; session paid.
- **Automated by:** `tests/routes/checkout-products.test.ts` › `AC-4: records the product on the session, and on the job only after the webhook`
- **Status:** Pass

### MP-8: A paid pack unlocks the chosen style immediately, then three extras, with distinct downloads
- **Acceptance criterion:** AC-5
- **Priority:** high
- **Type:** functional
- **Preconditions:** Paid pack job; mock provider.
- **Test data:** Chosen `pumpkin`.
- **Steps:**
  1. Before expansion: read the job; the chosen asset must be ready with a download, three pending.
  2. Expand until no pending assets.
  3. Download all four assets.
- **Expected result:** Chosen ready immediately; exactly three extra provider calls, all different styles; four ready assets; four distinct downloads.
- **Automated by:** `tests/routes/pack.test.ts` › `AC-5: paying for a pack unlocks four assets with exactly three extra calls`; `e2e/pack.spec.ts` › `AC-27: a pack purchase delivers four cards and a download`
- **Status:** Pass

### MP-9: A single purchase creates one asset and no extra generation
- **Acceptance criterion:** AC-6
- **Priority:** high
- **Type:** functional
- **Preconditions:** Paid single job.
- **Test data:** `product: "single"`.
- **Steps:**
  1. Expand until idle.
  2. Read the job and the provider calls.
- **Expected result:** One ready asset; provider calls 0; no pack assets.
- **Automated by:** `tests/routes/pack.test.ts` › `AC-6: a single purchase unlocks one asset and generates no extras`; `tests/routes/checkout-products.test.ts` › `AC-6: a single checkout keeps one asset and records the single product`
- **Status:** Pass

### MP-10: Before payment only the chosen preview is reachable
- **Acceptance criterion:** AC-7
- **Priority:** high
- **Type:** security
- **Preconditions:** Preview-ready pack job, checkout session, unpaid.
- **Test data:** Chosen style plus `witch`; a valid signed download token for the chosen key.
- **Steps:**
  1. Read the job with the unpaid session.
  2. Request `/api/assets/:jobId/witch` and `/api/assets/:jobId/<chosen>`.
  3. Request `/api/download` with the signed chosen token; request `/api/share` with a signed token.
- **Expected result:** Four assets listed; only the chosen has a preview; no download/share URLs; extra and chosen assets endpoints 403; download 410; share 403.
- **Automated by:** `tests/routes/pack.test.ts` › `AC-7: before payment only the chosen preview is reachable`
- **Status:** Pass

### MP-11: A sequential duplicate webhook adds no styles and unlocks once
- **Acceptance criterion:** AC-8
- **Priority:** high
- **Type:** security
- **Preconditions:** Pack checkout; one signed event.
- **Test data:** `evt_pack_duplicate`.
- **Steps:**
  1. Deliver the event twice sequentially.
  2. Read the job and provider calls.
- **Expected result:** Both 200; unlocked once; 3 pending assets; 0 provider calls; duplicate no change.
- **Automated by:** `tests/routes/pack.test.ts` › `AC-8: a duplicate webhook creates no extra styles and unlocks once`
- **Status:** Pass

### MP-12: Two simultaneous duplicate webhooks record one sale
- **Acceptance criterion:** AC-8
- **Priority:** high
- **Type:** security
- **Preconditions:** Pack checkout; one signed event.
- **Test data:** Concurrent delivery of the same event id.
- **Steps:**
  1. Deliver the same signed event twice with `Promise.all`.
  2. Read `readDayStats(dayKey())` and the job.
- **Expected result:** Both 200; job unlocked once; `salesPack: 1`; `revenueCents: 899`.
- **Automated by:** `tests/routes/pack.test.ts` › `AC-8: two simultaneous deliveries of the same event record one sale`
- **Status:** Pass — verified in `4e1b114`; one sale, revenue 899, job unlocked once. (Originally failed as #11.)

### MP-13: Concurrent expand calls claim distinct styles and never duplicate work
- **Acceptance criterion:** AC-9
- **Priority:** high
- **Type:** security
- **Preconditions:** Paid pack job.
- **Test data:** Three concurrent expand calls, then drain.
- **Steps:**
  1. Call expand three times with `Promise.all`.
  2. Continue until no pending.
- **Expected result:** Exactly three provider calls, three distinct styles; all four ready.
- **Automated by:** `tests/routes/pack.test.ts` › `AC-9: concurrent expansions claim distinct styles and never duplicate work`
- **Status:** Pass

### MP-14: Client and cron together still produce exactly three extras
- **Acceptance criterion:** AC-9
- **Priority:** high
- **Type:** security
- **Preconditions:** Second paid pack job, `paidAt` two minutes ago.
- **Test data:** One client expand plus `sweepPacks()` concurrently, then drain.
- **Expected result:** Exactly three provider calls, three distinct styles.
- **Automated by:** `tests/routes/pack.test.ts` › `AC-9: concurrent expansions claim distinct styles and never duplicate work`
- **Status:** Pass

### MP-15: The cron needs its secret and completes an eligible closed-tab pack
- **Acceptance criterion:** AC-10
- **Priority:** high
- **Type:** security
- **Preconditions:** Paid pack job older than 60 s.
- **Test data:** No bearer, then `Bearer test-cron-secret`.
- **Steps:**
  1. Call `/api/cron/expand-packs` without the secret.
  2. Call it with the secret.
  3. Read the job.
- **Expected result:** 401 then 200; four ready assets; exactly three extra provider calls.
- **Automated by:** `tests/routes/pack.test.ts` › `AC-10: the cron sweeper needs the secret and delivers a closed-tab pack`
- **Status:** Pass

### MP-16: The sweeper recovers an asset left `generating` by a crash
- **Acceptance criterion:** AC-10
- **Priority:** high
- **Type:** negative
- **Preconditions:** Paid pack job older than 60 s; one extra asset forced to `generating` with an old `startedAt`.
- **Test data:** `status: "generating"`, `startedAt` two minutes ago.
- **Steps:**
  1. Run `sweepPacks()`.
  2. Read the job.
- **Expected result:** The stale generating style is reclaimed and the job ends with four ready assets.
- **Automated by:** `tests/routes/pack.test.ts` › `AC-10: the sweeper recovers a pack asset left generating by a crashed worker`
- **Status:** Pass — verified in `4e1b114`; a `generating` asset older than one timeout is reclaimed. (Originally failed as #9.)

### MP-17: A stale claim left by a crash does not strand a pending style
- **Acceptance criterion:** AC-10
- **Priority:** high
- **Type:** negative
- **Preconditions:** Paid pack job older than 60 s; one pending style with a `claim:<jobId>:<styleId>` key and a short TTL, plus a legacy `claims:<jobId>` set for upgrade compatibility.
- **Test data:** A short-TTL claim (1 s) and a legacy set member.
- **Steps:**
  1. Create the claim key with a 1 s TTL, wait for expiry, run `sweepPacks()`.
  2. Repeat with the legacy set member.
- **Expected result:** The expired claim and the legacy set member never block the pending style; the job ends with all four ready.
- **Automated by:** `tests/routes/pack.test.ts` › `AC-10: a crashed TTL claim is reclaimed after it expires` and `AC-10: a legacy claim set from the previous release does not block a pending style`
- **Status:** Pass — verified in `4e1b114`. (Originally failed as #9.)

### MP-18: One failed style is retried without regenerating the ready ones
- **Acceptance criterion:** AC-11
- **Priority:** high
- **Type:** negative
- **Preconditions:** Paid pack job; provider fails `witch` twice.
- **Test data:** Two transient failures for `witch`, then a manual retry.
- **Steps:**
  1. Drain the pack.
  2. Retry the failed card.
  3. Count calls per style.
- **Expected result:** The failed card only; three ready; `vampire` 1, `zombie` 1, `witch` 3, chosen 0; no preview-quota call.
- **Automated by:** `tests/routes/pack.test.ts` › `AC-11: one failed style can be retried without regenerating the ready ones`
- **Status:** Pass

### MP-19: Pack assets are deleted with the job and URLs answer 410
- **Acceptance criterion:** AC-12
- **Priority:** high
- **Type:** security
- **Preconditions:** Paid pack job with full assets; retention forced past.
- **Test data:** Download URL and share URL.
- **Steps:**
  1. Record the asset keys and URLs.
  2. Expire and run cleanup.
  3. Read storage and the URLs.
- **Expected result:** Every asset object is gone; download 410; share 410.
- **Automated by:** `tests/routes/pack.test.ts` › `AC-12: pack assets are deleted with retention and URLs answer 410`
- **Status:** Pass

### MP-20: A paid job exposes a landscape JPEG with a footer, under 3 MB
- **Acceptance criterion:** AC-13, AC-16
- **Priority:** high
- **Type:** functional
- **Preconditions:** Paid pack job; chosen ready.
- **Test data:** Job share URL.
- **Steps:**
  1. Read the job; check `shareUrl`.
  2. Fetch it.
- **Expected result:** 200 JPEG; `haunted-portrait-before-after.jpg`; wider than tall; long edge ≤ 1600; under 3 MB.
- **Automated by:** `tests/routes/share.test.ts` › `AC-13/AC-16: a paid job exposes a landscape JPEG with a footer under 3 MB`; `tests/unit/share.test.ts` › `AC-13/AC-16: builds a landscape JPEG under 3 MB with a footer`
- **Status:** Pass

### MP-21: The footer is derived from the site host
- **Acceptance criterion:** AC-13
- **Priority:** medium
- **Type:** functional
- **Preconditions:** None.
- **Test data:** Same sources, hosts `one.example` and `two.example`.
- **Steps:**
  1. Build both composites.
- **Expected result:** The JPEG bytes differ, proving the footer text comes from the host.
- **Automated by:** `tests/unit/share.test.ts` › `AC-13: the footer is derived from the site host`
- **Status:** Pass

### MP-22: Portrait and landscape sources get equal-height halves without stretching
- **Acceptance criterion:** AC-14
- **Priority:** high
- **Type:** boundary
- **Preconditions:** None.
- **Test data:** 600 × 900 portrait and 900 × 600 landscape.
- **Steps:**
  1. Compute `shareLayout`.
- **Expected result:** Both halves use the same `imageHeight`; widths follow each aspect ratio; width = left + right.
- **Automated by:** `tests/unit/share.test.ts` › `AC-14: portrait and landscape sources get equal halves without stretching`
- **Status:** Pass

### MP-23: Portrait and landscape sources fill equal-height halves in the actual JPEG
- **Acceptance criterion:** AC-14
- **Priority:** high
- **Type:** boundary
- **Preconditions:** None.
- **Test data:** Synthetic red 600 × 900 and blue 900 × 600 images.
- **Steps:**
  1. Build the composite.
  2. Check output dimensions; extract each half to a buffer and read channel means.
- **Expected result:** Output matches the layout; the left half is the portrait (red-dominant) and the right is the landscape (blue-dominant).
- **Automated by:** `tests/unit/share.test.ts` › `AC-14: portrait and landscape sources fill equal-height halves`
- **Status:** Pass

### MP-24: Share URLs are paid-only, signed and time-limited
- **Acceptance criterion:** AC-15
- **Priority:** high
- **Type:** security
- **Preconditions:** Unpaid preview job; signed share token.
- **Test data:** Forged token; valid token for an unpaid job; expired token.
- **Steps:**
  1. Read the job with a forged session (no share URL).
  2. Request the endpoint directly with the valid-unpaid and expired tokens.
- **Expected result:** No share URL; unpaid 403; forged 403; expired 410.
- **Automated by:** `tests/routes/share.test.ts` › `AC-15: unpaid and forged sessions get no share URL and the endpoint refuses`; `tests/unit/share-tokens.test.ts` › the three AC-15 tests
- **Status:** Pass

### MP-25: The composite stays at or under 1600 px and under 3 MB
- **Acceptance criterion:** AC-16
- **Priority:** high
- **Type:** boundary
- **Preconditions:** None.
- **Test data:** Portrait + landscape sources.
- **Steps:**
  1. Compute the layout; build the JPEG; read metadata and length.
- **Expected result:** Long edge ≤ 1600; length < 3 MB.
- **Automated by:** `tests/unit/share.test.ts` › `AC-16: keeps the long edge at or under 1600 px` and `AC-13/AC-16: builds a landscape JPEG under 3 MB with a footer`
- **Status:** Pass

### MP-26: Clicking share emits `share_image_downloaded` once per click
- **Acceptance criterion:** AC-17
- **Priority:** high
- **Type:** functional
- **Preconditions:** Unlocked single job with a share URL; analytics mock.
- **Test data:** Two clicks.
- **Steps:**
  1. Render `SuccessPoller`.
  2. Click the share link twice.
- **Expected result:** One event per click; event name `share_image_downloaded`; `download` attribute present.
- **Automated by:** `tests/ui/success-share.test.tsx` › `AC-17: clicking share emits share_image_downloaded once per click`
- **Status:** Pass

### MP-27: A rejected Turnstile token is 400, calls no provider and leaves the quota untouched
- **Acceptance criterion:** AC-18
- **Priority:** high
- **Type:** security
- **Preconditions:** Enforcement on; rejecting verifier; mock provider.
- **Test data:** Valid image, no token.
- **Steps:**
  1. POST `/api/generate`.
  2. Check the response, job index and a later valid request.
- **Expected result:** 400 `captcha_failed`; no job/provider call; the next valid request is accepted.
- **Automated by:** `tests/routes/captcha.test.ts` › `AC-18: a rejected token is 400 and leaves the quota untouched`; `tests/unit/captcha.test.ts` › `AC-18: a missing token fails without any network call`
- **Status:** Pass

### MP-28: A passing Turnstile verifier lets generation work as before
- **Acceptance criterion:** AC-19
- **Priority:** high
- **Type:** functional
- **Preconditions:** Enforcement on; passing verifier; mock provider.
- **Test data:** Valid image, test token.
- **Steps:**
  1. POST `/api/generate`.
- **Expected result:** 202 `preview_ready` with a preview URL; widget rendering is covered by MP-29.
- **Automated by:** `tests/routes/captcha.test.ts` › `AC-19: a passing verifier lets generation work as before`; `tests/unit/captcha.test.ts` › `AC-19: requires both keys and the explicit flag to enforce`; `tests/ui/turnstile.test.tsx` › `AC-19: renders when a site key is provided`
- **Status:** Pass

### MP-29: The Turnstile widget renders under the production CSP with Cloudflare test keys
- **Acceptance criterion:** AC-19, AC-20
- **Priority:** medium
- **Type:** functional
- **Preconditions:** Production build; `TURNSTILE_ENFORCED=true`; Cloudflare test site/secret keys; CSP includes Cloudflare in `script-src`/`frame-src`.
- **Test data:** Cloudflare test site key `1x00000000000000000000AA`, test secret `1x0000000000000000000000000000000AA`; `tests/fixtures/valid.jpg`.
- **Steps:**
  1. Start the production build with the keys.
  2. Open `/create`; check the script and widget iframe/token.
  3. Generate a preview.
- **Expected result:** Widget loads, token is present, no CSP errors, preview appears.
- **Automated by:** manual production probe (not part of `npm run e2e`; the Playwright web server deliberately runs with Turnstile off)
- **Status:** Pass — widget token present, preview generated, no console errors.

### MP-30: With enforcement off the widget is absent and the flow needs no token
- **Acceptance criterion:** AC-20
- **Priority:** high
- **Type:** functional
- **Preconditions:** No keys / `TURNSTILE_ENFORCED=false`.
- **Test data:** `/create`; valid image.
- **Steps:**
  1. Render `/create`; check no `.cf-turnstile`.
  2. Generate.
- **Expected result:** No widget; no token required; full flow works (e2e).
- **Automated by:** `tests/unit/captcha.test.ts` › `AC-20: is off by default, so no widget and a no-op verifier`; `tests/ui/turnstile.test.tsx` › `AC-20: is not rendered when enforcement is off`; `e2e/journey.spec.ts` › `AC-26: …` and `e2e/pack.spec.ts` › `AC-27: …`
- **Status:** Pass

### MP-31: A verifier timeout is friendly, retryable and unlocks nothing
- **Acceptance criterion:** AC-21
- **Priority:** high
- **Type:** negative
- **Preconditions:** Enforcement on; verifier returns `captcha_timeout`.
- **Test data:** A token that must not leak.
- **Steps:**
  1. POST `/api/generate`.
- **Expected result:** 503 `captcha_timeout`; token absent from the response; no job; UI has the `captcha_timeout` message in `CreateForm`.
- **Automated by:** `tests/routes/captcha.test.ts` › `AC-21: a verifier timeout is friendly, retryable and unlocks nothing`
- **Status:** Pass

### MP-32: `/admin` without a cookie shows only the password form; wrong/rate-limited attempts
- **Acceptance criterion:** AC-22
- **Priority:** high
- **Type:** security
- **Preconditions:** `ADMIN_PASSWORD=test-admin-password`.
- **Test data:** No cookie; wrong password five times from one IP; sixth.
- **Steps:**
  1. Render `/admin`;
- **Expected result:** Password form, no numbers; five wrong attempts 401; sixth 429; e2e sees no numbers.
- **Automated by:** `tests/routes/admin-login.test.ts` › `AC-22: wrong passwords return 401 and repeated attempts return 429`; `tests/routes/admin-page.test.tsx` › `AC-22: without a cookie the page is only a password form`; `e2e/accessibility.spec.ts` › `AC-22: /admin shows only the password form until signed in`
- **Status:** Pass

### MP-33: The authenticated admin page matches a scripted day
- **Acceptance criterion:** AC-23
- **Priority:** high
- **Type:** functional
- **Preconditions:** Cookie; temp KV.
- **Test data:** 2 previews, 1 single, 1 pack, 5 generation attempts; `GENERATION_COST_CENTS=4`.
- **Steps:**
  1. Seed the counters.
  2. Render `/admin` with a valid cookie.
- **Expected result:** previews 2; single 1; pack 1; revenue `$13.98`; cost `$0.20`; margin `$13.78`; yesterday section.
- **Automated by:** `tests/routes/admin-page.test.tsx` › `AC-23: authenticated aggregates match the scripted day (revenue $13.98)`; `tests/unit/admin-stats.test.ts` › `AC-23: reads one UTC day record with previews, sales and revenue`
- **Status:** Pass

### MP-34: The admin cookie is HttpOnly/SameSite=Lax/8 h and logout clears it
- **Acceptance criterion:** AC-24
- **Priority:** high
- **Type:** security
- **Preconditions:** Login route.
- **Test data:** Correct password.
- **Steps:**
  1. Log in; inspect the Set-Cookie.
  2. Verify after 8 h + 1 s; log out.
- **Expected result:** HttpOnly; SameSite=Lax; Max-Age 28800; signed; invalid after the TTL; logout Max-Age 0.
- **Automated by:** `tests/routes/admin-login.test.ts` › the three AC-24 tests; `tests/unit/admin-stats.test.ts` › `AC-24: signs an HttpOnly SameSite=Lax cookie that lasts eight hours` and `AC-24: logout clears the cookie`; `tests/routes/admin-page.test.tsx` › `AC-24/AC-25: logging out removes the numbers and the page never renders private data`
- **Status:** Pass

### MP-35: The admin page renders no job ids, storage keys or images
- **Acceptance criterion:** AC-25
- **Priority:** high
- **Type:** security
- **Preconditions:** Authenticated admin page.
- **Test data:** Seeded day.
- **Steps:**
  1. Render the HTML.
  2. Search for `job_…`, `blobs/` and `<img`.
- **Expected result:** None present; after logout the numbers are gone.
- **Automated by:** `tests/routes/admin-page.test.tsx` › `AC-24/AC-25: logging out removes the numbers and the page never renders private data`
- **Status:** Pass

### MP-36: `npm run check:secrets` scans the increment 2 secrets
- **Acceptance criterion:** AC-29
- **Priority:** high
- **Type:** security
- **Preconditions:** `next build`; script source.
- **Test data:** `.next/static/**`; `TURNSTILE_SECRET_KEY`, `ADMIN_PASSWORD`, prompts, download/share secrets.
- **Steps:**
  1. Inspect the script's secret list.
  2. Run the script and the bundle test with fake values.
- **Expected result:** The command scans both new secrets and reports clean only if none appear.
- **Automated by:** `tests/unit/bundle.test.ts` › `AC-29: Turnstile secret, admin password, download/share secrets and prompts stay server-side` and `AC-29: the check:secrets script scans the increment 2 secrets`; `npm run check:secrets`
- **Status:** Pass — verified in `4e1b114`; the script scans both new secrets and the bundle test stays green. (Originally failed as #12.)

### MP-37: The full increment 1 regression stays green
- **Acceptance criterion:** AC-26
- **Priority:** high
- **Type:** functional
- **Preconditions:** Production build; mock providers.
- **Test data:** The increment 1 unit/route/component suite and e2e journeys.
- **Steps:**
  1. Run `npm test` and `npm run e2e`.
- **Expected result:** All increment 1 tests pass with no flaky test; the new increment 2 tests are additive.
- **Automated by:** the existing `tests/**` and `e2e/journey.spec.ts` / `e2e/heic.spec.ts` / `e2e/security.spec.ts` suites
- **Status:** Pass — 131/131 unit/route tests pass; the e2e suite passes 32/36 (4 Lighthouse skips, opt-in run 2/2 passes).

### MP-38: A pack purchase completes on both mobile viewports
- **Acceptance criterion:** AC-27
- **Priority:** high
- **Type:** functional
- **Preconditions:** Production build; mock providers; iPhone 13 + Pixel 7.
- **Test data:** `tests/fixtures/valid.jpg`, Witch style.
- **Steps:**
  1. Generate a preview.
  2. Buy the pack.
  3. Wait for four cards; download one.
- **Expected result:** Four cards and a download on both projects; expiry notice.
- **Automated by:** `e2e/pack.spec.ts` › `AC-27: a pack purchase delivers four cards and a download` (both projects)
- **Status:** Pass

### MP-39: The expand-packs cron is bounded to fit the serverless function budget
- **Acceptance criterion:** FR-9 / AC-10 (operational)
- **Priority:** medium
- **Type:** functional
- **Preconditions:** Production deployment.
- **Test data:** `app/api/cron/expand-packs/route.ts`, `MAX_EXPANSIONS_PER_RUN`.
- **Steps:**
  1. Inspect the route's duration configuration.
  2. Compare with the generation budget.
- **Expected result:** A run fits the deployment's function duration, or expands one asset per invocation; a killed run cannot strand an asset (see #9).
- **Automated by:** static inspection (no route-level duration test)
- **Status:** Pass — verified in `4e1b114`; `maxDuration = 420`, `MAX_EXPANSIONS_PER_RUN = 3`, and a killed run is recoverable through the claim TTL. (Originally failed as #10.)

### MP-40: Lighthouse and axe budgets
- **Acceptance criterion:** AC-28
- **Priority:** high
- **Type:** accessibility
- **Preconditions:** `RUN_LIGHTHOUSE=1`; production build.
- **Test data:** `/`, `/create`, `/success?session_id=cs_forged`, `/admin`.
- **Steps:**
  1. Run the two Lighthouse tests.
  2. Run the axe test.
- **Expected result:** Performance ≥ 85 and accessibility ≥ 90 on both pages; no critical axe violations.
- **Automated by:** `e2e/lighthouse.spec.ts` › `AC-24: / …` and `AC-28: /create …`; `e2e/accessibility.spec.ts` › `AC-28: axe reports no critical violations on /success and /admin`
- **Status:** Pass — Lighthouse 2/2; axe passes.

### MP-41: Every `process.env` name is documented
- **Acceptance criterion:** AC-30
- **Priority:** high
- **Type:** functional
- **Preconditions:** Source tree.
- **Test data:** `app/`, `lib/`, `components/`, `config/`; `.env.example`.
- **Steps:**
  1. Extract every env name.
  2. Compare with `.env.example`; check the six new increment 2 names.
- **Expected result:** No missing names; the six new names are present.
- **Automated by:** `tests/unit/env.test.ts` › `AC-28: every process.env name…` and `AC-30: the increment 2 env vars are documented too`
- **Status:** Pass

## Not covered

- **Real Stripe and Gemini** — no keys in this increment (spec Assumptions); adapters unverified.
- **Real Cloudflare Turnstile in production** — the widget was probed with Cloudflare's published test keys under the production CSP (MP-29); real keys and region/latency behaviour are owner tasks. The Playwright web server runs with Turnstile off so the suite needs no Cloudflare account.
- **Authenticated `/admin` axe** — the axe test covers `/admin` before login; the aggregate page is simple text/cards, but a logged-in axe pass would be a useful addition.
- **Literal OCR of the share footer text** — MP-21 proves the host changes the composite; the exact pixels are not OCR-checked.
- **EXIF-rotated share sources** — `lib/share.ts` reads dimensions before applying orientation; portrait/landscape without EXIF are covered.
- **Vercel Blob / Upstash** — no accounts; only the disk drivers are exercised. The Lua script and SADD/SMEMBERS paths are code-reviewed but not run against a real Redis.
- **Multiple simultaneous packs / cron fairness** — the cron budget and concurrency are tested with one/two jobs; not a load test.
- **The 20 s HEIC fallback** — covered by the increment 1 `e2e/heic.spec.ts` conversion path; the timeout branch is not forced (code review).
- **Admin cookie `Secure`** — the spec asks for HttpOnly/SameSite/signature/TTL, not Secure; in production it should be set on an HTTPS-only deployment.
