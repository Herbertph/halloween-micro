# Spec: Monster Pack, share image, Turnstile and admin (increment 2)

- **Branch:** `feature/monster-pack-and-share`
- **Status:** ready for development
- **Builds on:** `docs/specs/haunted-portrait-mvp.md` (increment 1, merged in #8)
- **Why now:** increment 1 takes $4.99 for one portrait. Increment 2 adds the $8.99
  multi-style upsell, the shareable before/after image that drives social traffic, the
  bot protection that protects the generation budget, and the one-screen view that tells
  the owner what sold today.

## Context

The site can already sell a single portrait. On Halloween the owner will point TikTok and
Instagram traffic at it, and three things are missing: a higher-value offer (the Monster
Pack), a reason for buyers to post (the before/after share image), and the ability to see
whether the day is working without reading a database. Turnstile is included here because
the free preview is the only thing that spends money before a sale, and tomorrow it will
meet real traffic.

Everyone still runs with the mock providers: no Stripe key, no Gemini key. Turnstile ships
with a no-op verifier by default and Cloudflare's published test keys when enabled.

## Scope

### In scope

- Monster Pack at $8.99: the chosen style plus three others, generated after payment, shown
  as cards with a loading state and a download button each.
- Paywall and landing page updated for two products; prices from env.
- Before/after share image (side by side, small site URL footer) for paid jobs.
- Cloudflare Turnstile on the generate action, off by default, testable with Cloudflare's
  test keys and with a mock verifier.
- Password-protected `/admin` with today's previews, sales (single/pack), revenue,
  estimated generation cost and margin.
- Stats counters that the admin reads, the cron sweeper for pack styles left pending by a
  closed tab, and the supporting env vars, tests and docs.

### Out of scope

- Real Stripe/Gemini keys, live deployment, real landing examples: owner tasks.
- Upgrading a $4.99 purchase into a pack, coupons, multiple currencies, email delivery.
- Per-face handling of group photos, video, custom prompts, accounts, order history.
- Any per-customer admin data: admin shows aggregates only, never photos or job ids.

Precedence if time runs short: **pack → share image → Turnstile → admin**. If the dev has
to stop, the branch must be green and the spec updated with what was deferred, so QA tests
only what exists.

## Functional requirements

### Products and pricing

- **FR-1** — Two products exist server-side: `single` (`PRICE_SINGLE_CENTS`, default 499)
  and `pack` (`PRICE_PACK_CENTS`, default 899). The client never sends an amount; the server
  derives it from the product and env.
- **FR-2** — Pack composition is a pure function of the chosen style: start from the ordered
  defaults `[vampire, zombie, witch, pumpkin]`, remove the chosen style, keep the first
  three, and pad with `skeleton` if the list is short. The chosen style is always included
  first. The result is always exactly four distinct styles.
- **FR-3** — The landing page pricing section and the paywall show both products with their
  prices and the pack description ("4 styles, one download each"). The paywall keeps the
  current single button and adds the pack button.
- **FR-4** — `/api/checkout` accepts `{ jobId, product }`, rejects an unknown product with a
  typed 400, and stores the product on the payment session record. The job stores the
  product it was paid for; nothing else is trusted.

### Pack generation

- **FR-5** — A job carries a list of assets (one per style to deliver). A single job has one
  asset (the chosen style); a pack job gets four assets created at checkout time, all
  `pending` except the chosen style's, which starts `ready` from the preview generation.
- **FR-6** — Extra pack styles are generated **only** after a verified payment. No extra
  style is generated, previewed or stored before the webhook confirms the pack.
- **FR-7** — `POST /api/jobs/:id/expand?session=...` claims and generates **at most one**
  pending asset per call and returns the updated job. The claim is atomic in KV, so two
  concurrent calls (client and cron) never generate the same style twice, and the chosen
  style is never regenerated.
- **FR-8** — The success page drives expansion: while a paid pack job has pending assets,
  it polls, calls expand for the next one, shows per-card loading states and fills each card
  as it becomes ready. Each asset has its own download button.
- **FR-9** — `GET /api/cron/expand-packs` (bearer `CRON_SECRET`) sweeps paid pack jobs with
  pending assets older than 60 s and runs the same claim-and-generate path, bounded to a
  small number of styles per run, so a closed tab still delivers what was paid for. It is
  documented as a Vercel Cron entry next to the cleanup cron.
- **FR-10** — A failed extra style is retried once automatically; if it still fails, only
  that card shows a retry action, the other assets stay delivered, and the retry never
  consumes the free-preview quota or asks for payment again.
- **FR-11** — `GET /api/jobs/:id` returns, for each asset: style id, status, preview URL
  (preview only for the chosen style before payment), download URL and share URL when the
  requesting session is paid and owns the job. No storage key is ever included.
- **FR-12** — `GET /api/assets/:jobId/:styleId?session=...` streams a full-resolution asset
  inline, only for a paid session that owns the job; otherwise 403/404. Downloads keep using
  the signed token from `GET /api/download`, now per asset.

### Share image

- **FR-13** — For a paid job, `<a download>` on a signed share URL returns a JPEG composite:
  original photo on the left, the chosen style's portrait on the right, a footer band with
  the site host in small type. Portrait and landscape inputs must both produce a sane
  composite (equal heights, no stretching, no letterbox gaps).
- **FR-14** — The composite is at most 1600 px on its long edge and under 3 MB.
- **FR-15** — The share URL is signed and time-limited like download tokens, appears in the
  job response only for paid sessions, and is refused before payment and after expiry.
- **FR-16** — Clicking the share button emits `share_image_downloaded` once per click; the
  file name is human-readable (for example `haunted-portrait-before-after.jpg`).

### Turnstile

- **FR-17** — `lib/captcha` exposes a verifier with `mock` and `turnstile` implementations.
  The generate form includes the Turnstile widget only when `TURNSTILE_SITE_KEY` is present;
  the token is sent to `/api/generate` and verified server-side with `TURNSTILE_SECRET_KEY`
  and a 5 s timeout.
- **FR-18** — `POST /api/generate` rejects a missing/invalid token with 400 `captcha_failed`
  when verification is enforced, without consuming the per-IP quota or calling the provider.
  A verifier timeout is a friendly retryable error.
- **FR-19** — Enforcement is controlled by `TURNSTILE_ENFORCED` and defaults to off when the
  keys are missing, so local development and the whole test suite run without Cloudflare.
  When it is off, the widget is not rendered and the verifier is the mock.
- **FR-20** — The Turnstile secret and the token are never logged, never returned and never
  in the client bundle.

### Admin

- **FR-21** — `/admin` shows a password form until a valid session cookie exists. The
  password comes from `ADMIN_PASSWORD`; comparison is timing-safe; five wrong attempts per
  IP per minute are refused with 429. The cookie is HttpOnly, SameSite=Lax, signed with the
  existing signing secret under a distinct context, and lasts 8 hours.
- **FR-22** — The signed-in page shows today's (UTC) numbers: previews generated, single
  sales, pack sales, total revenue in USD, estimated generation cost
  (`GENERATIONS × GENERATION_COST_CENTS`, default 4) and margin. It also shows yesterday's
  revenue for context.
- **FR-23** — `/admin` contains no job ids, no photos, no customer data and no ability to
  change anything. Without the cookie it never renders numbers.
- **FR-24** — Counters are written where the events happen (successful previews, provider
  generation attempts, paid sessions with amount and product) and are readable as one
  day record through a small `lib/stats` module.

### Cross-cutting

- **FR-25** — All new env vars are in `.env.example`: `PRICE_PACK_CENTS`,
  `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_ENFORCED`, `ADMIN_PASSWORD`,
  `GENERATION_COST_CENTS`, plus the documented `NEXT_PUBLIC_SITE_URL` already present.
- **FR-26** — README and `CLAUDE.md` cover the pack flow, the share image, Turnstile test
  keys, the admin view, both cron entries, and the new job/asset model.
- **FR-27** — Increment 1 behaviour does not regress: single purchase, decline path,
  forged success page, rate limits, retention and the existing 28 acceptance criteria stay
  green.

## Acceptance criteria

Each `AC-n` must have an automated test named `AC-<n>: ...`. Everything runs with mock
providers and disk storage/KV.

**Products and pack composition**

- **AC-1** — Landing and paywall show both prices ($4.99 and $8.99) and a pack description;
  the paywall has both buttons.
- **AC-2** — For each of the five chosen styles, pack composition returns exactly four
  distinct styles, the chosen one first, and pads with `skeleton` when needed (five
  parameterised cases).
- **AC-3** — `POST /api/checkout` with an unknown product returns 400; with a valid product
  the amount equals the env price regardless of any amount sent by the client.
- **AC-4** — A checkout response and its session record carry the product; the job records
  the paid product only after the webhook.

**Pack purchase**

- **AC-5** — Paying $8.99 for a pack: the chosen style unlocks immediately, the three extra
  cards appear in loading state, become ready, and each download returns different bytes
  from the others; exactly three extra provider calls happen.
- **AC-6** — Paying $4.99 for a single: exactly one asset is unlocked, no extra generation
  call happens, and no pack asset is created.
- **AC-7** — Before payment, a pack job exposes only the chosen style's watermarked preview;
  the other three styles have no preview, no download URL and no full-res bytes reachable
  through `/api/assets` or `/api/download`.
- **AC-8** — The same webhook delivered twice generates no extra styles (three extra calls
  total, not six) and leaves the job unlocked once.
- **AC-9** — Two concurrent expand calls for the same job generate at most one asset each,
  never the same style twice, and the cron sweeper plus a client call together still
  produce exactly three extra assets.
- **AC-10** — With pending assets, `GET /api/cron/expand-packs` without `CRON_SECRET` is 401;
  with it, an eligible paid pack job is expanded and the job ends with all four assets ready.
- **AC-11** — One extra style failing twice leaves the other three ready, marks only that
  card failed with a retry action, and retrying does not regenerate the ready ones and does
  not consume the preview quota.
- **AC-12** — Pack assets are deleted with the job at the end of the retention window, and
  their download/share URLs return 410 afterwards.

**Share image**

- **AC-13** — A paid job exposes a share URL; fetching it returns a JPEG with the footer text
  containing the site host, and with two source images composed side by side (composite
  width noticeably larger than its height).
- **AC-14** — Portrait (600 × 900) and landscape (900 × 600) inputs both produce a composite
  whose two halves have equal height and no stretched content.
- **AC-15** — An unpaid or forged session gets no share URL, and requesting the endpoint
  directly returns 403/404; an expired share token returns 410.
- **AC-16** — The composite is at most 1600 px on its long edge and under 3 MB.
- **AC-17** — Clicking the share button emits `share_image_downloaded` exactly once.

**Turnstile**

- **AC-18** — With enforcement on and a rejecting verifier, `POST /api/generate` returns 400
  `captcha_failed`, calls no provider and leaves the per-IP quota untouched (a later valid
  request still succeeds).
- **AC-19** — With enforcement on and a passing verifier, generation works exactly as before.
- **AC-20** — With enforcement off (default when keys are absent) the widget is not rendered,
  requests need no token, and the whole flow still works.
- **AC-21** — A verifier timeout surfaces a friendly retryable error and does not unlock or
  charge anything.

**Admin**

- **AC-22** — `/admin` without a cookie shows the password form and no numbers; a wrong
  password returns 401 and repeated attempts are rate-limited with 429.
- **AC-23** — With the correct password the page shows today's previews, single sales, pack
  sales, revenue, estimated cost and margin, matching the counters after a scripted
  day (2 previews, 1 single, 1 pack → revenue $13.98, cost = generations × 4 cents).
- **AC-24** — The authenticated cookie is HttpOnly, SameSite=Lax and expires in 8 hours;
  logging out clears it and the numbers disappear again.
- **AC-25** — The admin page renders no job ids, storage keys or images.

**Quality and regression**

- **AC-26** — The full increment 1 suite still passes (73 unit/route/component tests and the
  e2e journeys) with no flaky test.
- **AC-27** — Pack purchase completes on the iPhone 13 and Pixel 7 Playwright profiles,
  including the four cards and one download.
- **AC-28** — Lighthouse mobile on `/` and `/create` stays at performance ≥ 85 and
  accessibility ≥ 90; axe reports no critical violations on `/`, `/create`, `/success` and
  `/admin`.
- **AC-29** — `npm run check:secrets` stays clean: `TURNSTILE_SECRET_KEY`, `ADMIN_PASSWORD`,
  prompts and download/share secrets never appear in `.next/static/**`.
- **AC-30** — Every `process.env` name read by the code appears in `.env.example`.

## Assumptions (please confirm in review)

1. **Pack = the chosen style plus three**, always four downloads at $8.99; no upgrade path
   from a $4.99 purchase (a buyer who wants the pack pays $8.99 again).
2. **Extra styles are generated after payment**, one style per request, driven by the
   success page and a cron sweeper for closed tabs.
3. **Pack checkout uses the same mock/Stripe adapter**; the mock checkout shows the product
   and amount, still labelled Test mode.
4. **Share image uses the chosen style** for both products, and is available only while the
   files exist (48 h).
5. **Turnstile is off unless `TURNSTILE_ENFORCED=true` and keys exist**; Cloudflare's
   published test keys are used in development and never in production.
6. **Admin is aggregates only**, password from env, no per-order data; it is a convenience
   view, not an accounting system. `GENERATION_COST_CENTS=4` is the default cost estimate.
7. **Cost model:** the pack costs up to 3 extra generations (~$0.12 at the assumed $0.04
   each) against $8.99, which stays inside the owner's $0.10-per-image budget.
8. **Storage/KV usage grows** (four assets per pack, plus a share composite generated on
   demand); the 48-hour retention and the existing cleanup cron cover all of it.

## Technical notes

### Data model changes

```ts
type Product = "single" | "pack";

interface Asset {
  styleId: StyleId;
  status: "pending" | "generating" | "ready" | "failed";
  fullKey?: string;
  previewKey?: string;
  error?: GenerateError;
}

interface Job {
  // ...existing fields
  product?: Product;
  assets?: Asset[];      // absent on increment 1 jobs
  paidAmountCents?: number;
}
```

`loadJob()` normalises an old job (no `assets`) into a single asset built from `styleId` +
`fullKey`/`previewKey`, so the change is backward compatible and the cleanup cron still
finds the keys. `purgeJobObjects()` must collect keys from every asset.

### New and changed routes

```
POST /api/checkout                       product: "single" | "pack"
GET  /api/jobs/:id                       adds product + assets[] (no keys)
POST /api/jobs/:id/expand?session=...    claim + generate one pending asset (paid only)
GET  /api/assets/:jobId/:styleId?session= inline full-res for a paid owner
GET  /api/download?token=...             unchanged, token now per asset
GET  /api/share?token=...                before/after composite (paid only)
GET  /api/cron/expand-packs              bearer CRON_SECRET, closed-tab sweeper
GET  /admin, POST /api/admin/login, POST /api/admin/logout
```

### Where the logic goes

```
lib/products.ts        Product ids, prices, packStyles(chosen)
lib/assets.ts          createAssets, claimPendingAsset, markReady/markFailed, normalisation
lib/expand.ts          claim + generate one asset (shared by the client route and cron)
lib/share.ts           composite builder (sharp + text overlay)
lib/captcha.ts         verifier interface + mock + turnstile
lib/stats.ts           day counters: previews, generations, sales, revenue
lib/admin.ts           password check, signed cookie, rate limit
components/success/*   asset cards, per-card states, share button
app/admin/*            password form and aggregate view
```

### Rules that keep the money path safe

- The amount and product come from the stored session record, never from the request body or
  the redirect.
- Only the webhook marks a job paid, and only the paid job creates pending assets. The
  chosen asset is never regenerated.
- `claimPendingAsset` is atomic in KV; the client route and the cron share it, so a race can
  cost at most one abandoned call, never a double charge or a duplicate image.
- Share/download tokens are HMAC-signed, bound to job + style + expiry, and issued only for
  paid sessions.
- When enforcement is off, the captcha verifier is the mock — no outbound calls in tests.

### Commands (unchanged)

```
npm run lint && npm run build && npm test && npm run check:secrets && npm run e2e
Lighthouse: $env:RUN_LIGHTHOUSE=1; npm run e2e -- --project=iphone
```

Tests use their own ports (Playwright serves on 3101); never port 4545.

### Testing strategy

- Unit: `packStyles` for all five styles, asset normalisation (old and new job shapes),
  claim atomicity, share layout maths (portrait/landscape), admin cookie signing and
  expiry, stats arithmetic.
- Route tests: checkout product handling, expand (paid/unpaid/concurrent), assets endpoint
  ownership, share endpoint ownership, captcha reject/pass/timeout, cron auth, admin login
  and rate limit.
- E2E: pack purchase on both viewports (AC-27), plus the increment 1 journeys unchanged.
- Fixtures: landscape and portrait inputs already exist for the share-image layout tests.

### Ordered task list (vertical slices)

1. **Products and composition** — `lib/products.ts`, env prices, `packStyles`, unit tests.
   Verify: AC-2.
2. **Checkout for two products** — checkout route, session record, mock checkout page.
   Verify: AC-1, AC-3, AC-4.
3. **Asset model + expand** — assets on the job, normalisation, atomic claim, expand route,
   per-asset download token. Verify: AC-7, AC-9 (unit/route level).
4. **Webhook → pack** — single vs pack unlock, asset creation on payment, idempotency with
   extras. Verify: AC-5, AC-6, AC-8.
5. **Success page cards** — per-card states, polling + expand loop, per-asset download.
   Verify: AC-5, AC-11, AC-27.
6. **Cron sweeper** — `/api/cron/expand-packs`. Verify: AC-10, AC-12.
7. **Share image** — composite builder, token, endpoint, button, analytics event.
   Verify: AC-13 to AC-17.
8. **Turnstile** — verifier, widget, server check, env wiring. Verify: AC-18 to AC-21.
9. **Stats and admin** — counters at the event sites, login/cookie/rate limit, page.
   Verify: AC-22 to AC-25.
10. **Pricing copy + quality pass** — landing/paywall copy, README, `CLAUDE.md`,
    `.env.example`, secret scan, a11y/Lighthouse, full regression. Verify: AC-26 to AC-30.

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Paid pack with a closed tab leaves styles ungenerated | High | Client-driven expand plus the cron sweeper; job state shows what is missing. |
| Double generation on retries/races | High | Atomic claim per asset; idempotent webhook; tests for concurrency. |
| Share composite with odd aspect ratios | Medium | Layout maths unit-tested for portrait and landscape; long-edge cap. |
| Turnstile blocking real buyers | High | Off by default, verified with test keys, friendly retry path, no quota consumed on rejection. |
| Admin password guessing | Medium | Timing-safe compare, per-IP attempt limit, HttpOnly signed cookie with 8 h TTL. |
| Pack margin eaten by retries | Medium | One automatic retry per style, no auto-retry loops, cost estimate visible in admin. |
| Regression on the merged single flow | High | Full increment 1 suite stays in the gate; AC-26. |
