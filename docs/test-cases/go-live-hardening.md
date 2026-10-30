# Test cases — Go-live hardening (increment 3)

- **Spec:** [`docs/specs/go-live-hardening.md`](../specs/go-live-hardening.md)
- **Branch:** `feature/go-live-hardening`
- **Commit under test:** `5dea564` (implementation `dbea4a4`, `fdf8733`, `dcf3c3a`; tests `4ad1c30`)
- **Test run:** full increment 3 test run with the increment 1 and 2 regressions
- **Frameworks:** Vitest + Testing Library (unit, route, component, stub-server integration), Playwright (iPhone 13 + Pixel 7), Lighthouse (opt-in), the manual `verify:providers` CLI

## Traceability summary

| Criterion | Test cases | Result |
|---|---|---|
| G3-AC-1 | G3-TC-1 | Pass |
| G3-AC-2 | G3-TC-2 | Pass |
| G3-AC-3 | G3-TC-3 | Pass for the specified mock demo; **FR-1/FR-3 edge fails (#14)** |
| G3-AC-4 | G3-TC-4 | Pass |
| G3-AC-5 | G3-TC-5 | Pass |
| G3-AC-6 | G3-TC-6 | Pass |
| G3-AC-7 | G3-TC-7 | Pass for the configured-pass case; **FR-4/FR-5 edge fails (#15)** |
| G3-AC-8 | G3-TC-8 | Pass |
| G3-AC-9 | G3-TC-9 | Pass |
| G3-AC-10 | G3-TC-10 | Pass for the listed operations; **FR-8 timeout gap (#16)** |
| G3-AC-11 | G3-TC-11 | Pass |
| G3-AC-12 | G3-TC-12 | Pass |
| G3-AC-13 | G3-TC-13 | Pass |
| G3-AC-14 | G3-TC-14 | Pass |
| G3-AC-15 | G3-TC-15 | Pass |
| FR-1/FR-3 demo safety | G3-TC-16 | **Fail (#14)** |
| FR-4/FR-5 verifier correctness | G3-TC-17 | **Fail (#15)** |
| FR-8 Upstash timeout | G3-TC-18 | **Fail (#16)** |

## Test cases

### G3-TC-1: Production with mock payments refuses checkout
- **Acceptance criterion:** G3-AC-1
- **Priority:** high
- **Type:** security
- **Preconditions:** `NODE_ENV=production`; `PAYMENT_PROVIDER=mock`; real image/storage/KV values; all secrets set.
- **Test data:** `POST /api/checkout { jobId: "job_x", product: "pack" }`.
- **Steps:**
  1. Call the checkout handler.
  2. Read the response and the captured console error.
- **Expected result:** 503 `misconfigured`; no session created (guard runs before the job/session work); no secret in the response or log.
- **Automated by:** `tests/routes/config-guard.test.ts` › `G3-AC-1: production with mock payments refuses checkout with 503 and leaks no secret`
- **Status:** Pass

### G3-TC-2: Production with mock image or local drivers refuses generation before writing
- **Acceptance criterion:** G3-AC-2
- **Priority:** high
- **Type:** security
- **Preconditions:** `NODE_ENV=production`; `IMAGE_PROVIDER=mock`, `STORAGE_DRIVER=local`, `KV_DRIVER=local`.
- **Test data:** A small JPEG-magic buffer, valid form fields.
- **Steps:**
  1. POST `/api/generate`.
  2. Read `DATA_DIR/storage`.
- **Expected result:** 503 `misconfigured`; nothing written to storage; no provider call.
- **Automated by:** `tests/routes/config-guard.test.ts` › `G3-AC-2: production with mock image or local drivers refuses generation before writing`
- **Status:** Pass

### G3-TC-3: A deliberate mock demo is labelled in the header, paywall and success page
- **Acceptance criterion:** G3-AC-3
- **Priority:** high
- **Type:** functional
- **Preconditions:** Production e2e server with `ALLOW_MOCK_PROVIDERS=true`, mock providers, local drivers.
- **Test data:** `/`, `/create` after a preview, `/checkout/mock`, `/success?session_id=cs_forged`.
- **Steps:**
  1. Check the header badge on `/`.
  2. Generate a preview; check the badge inside the paywall.
  3. Open the mock checkout; check Test mode.
  4. Open `/success`; check the badge.
- **Expected result:** "Demo — no real payment" is visible in the header, on the paywall and on success; generation and checkout work.
- **Automated by:** `e2e/hardening.spec.ts` › `G3-AC-3: demo mode labels the header, paywall and success page` (both viewports)
- **Status:** Pass for the specified mock-provider case. The real-payment edge is G3-TC-16.

### G3-TC-4: Live production configuration is healthy and leaks no key
- **Acceptance criterion:** G3-AC-4
- **Priority:** high
- **Type:** security
- **Preconditions:** Production with real provider/driver names and fake well-formed keys; no network.
- **Test data:** Stripe, Gemini, Vercel Blob and Upstash fake values; `NEXT_PUBLIC_SITE_URL=https://haunted.example`.
- **Steps:**
  1. Call `GET /api/health`.
  2. Scan the body for every fake secret.
- **Expected result:** 200 `{ ready: true, mode: "live" }`; no key echoed.
- **Automated by:** `tests/routes/config-guard.test.ts` › `G3-AC-4: live production config is ready and never echoes a key`
- **Status:** Pass

### G3-TC-5: A missing required variable makes health 503 and names it only
- **Acceptance criterion:** G3-AC-5
- **Priority:** high
- **Type:** negative
- **Preconditions:** Production live config with `GEMINI_API_KEY` removed.
- **Test data:** The same fake secrets for the other services.
- **Steps:**
  1. Call `GET /api/health`.
  2. Check the problem list and scan for secret values.
- **Expected result:** 503; `ready: false`; problems contain `GEMINI_API_KEY`; no other secret value printed.
- **Automated by:** `tests/routes/config-guard.test.ts` › `G3-AC-5: a missing required variable is 503 and names it without values`
- **Status:** Pass

### G3-TC-6: The verifier with nothing configured exits 0 and calls nothing
- **Acceptance criterion:** G3-AC-6
- **Priority:** high
- **Type:** functional
- **Preconditions:** Empty env; injectable HTTP counting calls.
- **Test data:** `env: {}`.
- **Steps:**
  1. Run `runVerifier` with no configured services.
  2. Check the result count/status and the HTTP call count.
- **Expected result:** Exit 0; five `SKIP` lines; zero HTTP calls.
- **Automated by:** `tests/integration/verify-providers.test.ts` › `G3-AC-6: nothing configured exits 0 with SKIP for every service and calls nothing`; `npm run verify:providers:dry` (all SKIP offline)
- **Status:** Pass

### G3-TC-7: The verifier passes all configured services against the stub and fails only the failing one
- **Acceptance criterion:** G3-AC-7
- **Priority:** high
- **Type:** functional
- **Preconditions:** All five services configured; injectable HTTP.
- **Test data:** Stub responses for Gemini (image), Stripe (session + expire), Blob (write/read/delete), Upstash (set/get/del), Turnstile (siteverify).
- **Steps:**
  1. Run with all passing; check exit 0 and five `PASS`.
  2. Make Stripe return 500; run again.
- **Expected result:** First run 0 and five PASS; second run exit 1 and only Stripe FAIL.
- **Automated by:** `tests/integration/verify-providers.test.ts` › `G3-AC-7: all configured services PASS against the stub, and one failure fails only that service`
- **Status:** Pass for the configured-pass case. The response-shape check is G3-TC-17.

### G3-TC-8: No verifier path prints a secret
- **Acceptance criterion:** G3-AC-8
- **Priority:** high
- **Type:** security
- **Preconditions:** Fake secrets in the env; pass, fail, verbose, crash and dry-run scenarios.
- **Test data:** The eight fake secrets in `tests/integration/verify-providers.test.ts`.
- **Steps:**
  1. Run each scenario.
  2. Search `JSON.stringify(results)`/lines for every secret.
- **Expected result:** No secret appears in any scenario.
- **Automated by:** `tests/integration/verify-providers.test.ts` › `G3-AC-8: pass, fail, verbose, crash and dry-run outputs never contain a secret`
- **Status:** Pass

### G3-TC-9: The Blob driver sends the expected requests, returns bytes, types a 403 and times out
- **Acceptance criterion:** G3-AC-9
- **Priority:** high
- **Type:** integration
- **Preconditions:** Ephemeral local HTTP stub on an ephemeral port.
- **Test data:** `jobs/probe.jpg`, probe bytes, a 403 stub and a hanging stub.
- **Steps:**
  1. Run the put/get/delete probe; assert method, path, auth and headers/body.
  2. Repeat against a 403 stub; repeat against a hanging stub with a 120 ms timeout.
- **Expected result:** PUT path/auth/content headers and body; GET returns the bytes; delete POST `/delete`; 403 → `StorageError` `http`/403/retryable; hang → `StorageError` `timeout` within 2 s.
- **Automated by:** `tests/integration/blob.test.ts` › the three G3-AC-9 tests
- **Status:** Pass

### G3-TC-10: The Upstash driver sends TTL/incr/set operations and handles the conditional-delete race
- **Acceptance criterion:** G3-AC-10
- **Priority:** high
- **Type:** integration
- **Preconditions:** Ephemeral local Upstash-shaped HTTP stub.
- **Test data:** `probe=value`, `EX 60`, `INCRBY 1`, set add/members/remove, `claim:job:witch` older/newer tokens.
- **Steps:**
  1. Run the set/incr/set operations; inspect the commands.
  2. Run `deleteIfValue` with a losing token, then a matching token.
- **Expected result:** `SET ... EX 60`, `INCRBY`, SADD/SMEMBERS/SREM commands; losing conditional delete leaves the newer claim, matching deletes.
- **Automated by:** `tests/integration/upstash.test.ts` › the two G3-AC-10 tests
- **Status:** Pass for the listed operations. The timeout gap is G3-TC-18.

### G3-TC-11: Sale recording is idempotent per session
- **Acceptance criterion:** G3-AC-11
- **Priority:** high
- **Type:** functional
- **Preconditions:** Temp KV.
- **Test data:** Session `cs_one` twice, `cs_two` once; pack and single amounts.
- **Steps:**
  1. Record the three sales.
  2. Read the day stats.
  3. Record a retry for the first session; read again.
- **Expected result:** One pack, one single, revenue 1398; the retry changes nothing.
- **Automated by:** `tests/unit/sale-idempotency.test.ts` › both G3-AC-11 tests
- **Status:** Pass

### G3-TC-12: The admin cookie is Secure only for an HTTPS site URL
- **Acceptance criterion:** G3-AC-12
- **Priority:** high
- **Type:** security
- **Preconditions:** `NEXT_PUBLIC_SITE_URL` HTTPS then HTTP.
- **Test data:** `https://haunted.example`, `http://localhost:3000`.
- **Steps:**
  1. Build the login and clear cookie headers for each URL.
- **Expected result:** HTTPS has `Secure`; HTTP does not; both always `HttpOnly` and `SameSite=Lax`.
- **Automated by:** `tests/unit/admin-cookie.test.ts` › `G3-AC-12: Secure on HTTPS, absent on HTTP, always HttpOnly and SameSite=Lax`
- **Status:** Pass

### G3-TC-13: EXIF-rotated share sources render upright
- **Acceptance criterion:** G3-AC-13
- **Priority:** high
- **Type:** boundary
- **Preconditions:** `tests/fixtures/rotated.jpg` (orientation 6, stored 900 × 600).
- **Test data:** Rotated portrait + landscape `valid.jpg`.
- **Steps:**
  1. Build the composite.
  2. Compare the output dimensions and the left half's tall/wide shape.
  3. Build a landscape/landscape composite.
- **Expected result:** The rotated source's half is upright (taller than wide); the output matches the layout; the landscape case stays landscape.
- **Automated by:** `tests/unit/share.test.ts` › `G3-AC-13: EXIF-rotated portrait sources are upright and landscape stays landscape`
- **Status:** Pass

### G3-TC-14: The increment 1 and 2 suites and the mobile budgets still pass
- **Acceptance criterion:** G3-AC-14
- **Priority:** high
- **Type:** regression
- **Preconditions:** Production build; mock providers; demo mode for e2e.
- **Test data:** The full Vitest suite, e2e journeys, Lighthouse and axe.
- **Steps:**
  1. Run `npm test`, `npm run e2e`, the opt-in Lighthouse spec and the axe checks.
  2. Complete a single purchase in the demo e2e.
- **Expected result:** All previous suites pass; Lighthouse performance ≥ 85 and accessibility ≥ 90 on `/` and `/create`; axe has no critical violations on `/`, `/create`, `/success`, `/admin`; the single journey completes.
- **Automated by:** the full suite; `e2e/hardening.spec.ts` › `G3-AC-14: the single purchase journey still works end to end`; `e2e/lighthouse.spec.ts`; `e2e/accessibility.spec.ts`
- **Status:** Pass

### G3-TC-15: Every env name is documented and the secret scan is clean
- **Acceptance criterion:** G3-AC-15
- **Priority:** high
- **Type:** security
- **Preconditions:** `next build`; source tree.
- **Test data:** `app/`, `lib/`, `components/`, `config/`; `.env.example`; `.next/static/**`.
- **Steps:**
  1. Extract every `process.env` name and compare with `.env.example`; check `ALLOW_MOCK_PROVIDERS` and `STRIPE_PRICE_*`.
  2. Run `npm run check:secrets`.
- **Expected result:** No missing name; the new names are present; the client bundle contains no secret or prompt text.
- **Automated by:** `tests/unit/env.test.ts` › `G3-AC-15: every env name is documented and the hardening vars are present`; `npm run check:secrets`; `tests/unit/bundle.test.ts`
- **Status:** Pass

### G3-TC-16: The demo opt-in cannot turn a real-payment deploy into a no-payment demo
- **Acceptance criterion:** FR-1/FR-3 (safety edge; G3-AC-3 is specified for mock providers)
- **Priority:** critical
- **Type:** security
- **Preconditions:** Pure `describeConfig()`/`isDemoMode()` env snapshots.
- **Test data:**
  - Real providers + `ALLOW_MOCK_PROVIDERS=true`.
  - Real payment + `ALLOW_MOCK_PROVIDERS=true` + local storage/KV.
- **Steps:**
  1. Describe the first config; check mode/demo.
  2. Describe the second; check readiness/demo.
- **Expected result:** Real providers → `mode: "live"`, no demo label; real payment + local drivers → not ready (or otherwise refused); the "no real payment" label never appears with a real payment provider.
- **Automated by:** `tests/routes/config-guard.test.ts` › `FR-1/FR-3: real providers are never labelled a no-payment demo` and `FR-1: the demo opt-in cannot allow local drivers with a real payment provider`
- **Status:** **Fail (#14)** — both configs are `ready` and `mode: "demo"`; the label is false for real Stripe and local drivers are allowed with real payments.

### G3-TC-17: The Gemini verifier fails a 200 response with no image
- **Acceptance criterion:** FR-4/FR-5 (the listed G3-AC-7 pass case is covered by G3-TC-7)
- **Priority:** major
- **Type:** integration
- **Preconditions:** Configured verifier; Gemini stub returns `{ candidates: [] }`; other services pass.
- **Test data:** Fake Gemini key; text-only/empty candidate response.
- **Steps:**
  1. Run `runVerifier`.
  2. Check the Gemini status and exit code.
- **Expected result:** Gemini `FAIL`; exit 1.
- **Automated by:** `tests/integration/verify-providers.test.ts` › `FR-4/FR-5: a Gemini response without an image is a verifier FAIL`
- **Status:** **Fail (#15)** — Gemini `PASS`, exit 0; the probe never inspects the response body.

### G3-TC-18: A hung Upstash request is bounded by a timeout
- **Acceptance criterion:** FR-8 (the G3-AC-10 listed operations are covered by G3-TC-10)
- **Priority:** major
- **Type:** integration
- **Preconditions:** Stub accepts a connection and never responds.
- **Test data:** Any `UpstashKV` command.
- **Steps:**
  1. Call a KV method against the hanging stub.
  2. Observe whether it rejects within a bounded timeout.
- **Expected result:** A typed timeout/network error within the configured budget, mirroring the Blob driver.
- **Automated by:** `tests/integration/upstash.test.ts` › `FR-8: a hanging Upstash request is bounded by a timeout` (a hanging stub with a short target timeout; the Blob equivalent is `tests/integration/blob.test.ts` › `G3-AC-9: a hanging response hits the timeout instead of blocking`).
- **Status:** **Fail (#16)** — `UpstashKV.command()` calls `fetch` with no signal/timeout; the hanging request stays pending past the target timeout.

## Not covered

- **Real Stripe, Gemini, Turnstile, Vercel Blob and Upstash** — no keys/accounts; the suite uses mock providers and local stub servers. The verifier's live path is a manual gate.
- **The actual Vercel deployment and plan duration** — `maxDuration` values and the synchronous FR-12 generation (#5) are deployment decisions; #5 remains open.
- **The storage-error route surface** — `StorageError` is translated to a 503 `storage_unavailable` in `/api/generate`; `/api/preview`, `/api/download`, `/api/share` and `/api/jobs/[id]/expand` do not catch it and would return 500. Reported as a residual, not an AC failure.
- **Missing `NEXT_PUBLIC_SITE_URL` in production** — `describeConfig()` does not require it, so health can be ready while OG/canonical/watermark use localhost and the admin cookie lacks `Secure`. Reported as a residual.
- **Real Upstash timeout** — see #16; no automated hang test because the driver has no timeout.
- **HTTPS cookie in a real browser** — the `Secure` attribute is unit-tested; the e2e site is HTTP.
- **The authenticated `/admin` and unlocked `/success` axe states** — axe covers `/success?session_id=cs_forged` and the logged-out `/admin`; the aggregate pages are simple text.
- **Multi-instance / load behaviour** — the stub servers and local KV are single-process.
- **The mock checkout page demo label** — the spec labels the header, paywall and success page; the mock checkout already says Test mode.
