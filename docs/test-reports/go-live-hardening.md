# Test report — Go-live hardening (increment 3)

- **Mode:** full test run (increment 3) with the increment 1 and 2 regressions
- **Branch:** `feature/go-live-hardening`
- **Commit:** `5dea564` (implementation `dbea4a4`, `fdf8733`, `dcf3c3a`; tests `4ad1c30`)
- **Spec:** [`docs/specs/go-live-hardening.md`](../specs/go-live-hardening.md)
- **Test cases:** [`docs/test-cases/go-live-hardening.md`](../test-cases/go-live-hardening.md)
- **Date:** 2026-10-30
- **Environment:** Windows 11, Node 22.12.0, npm 11.0.0; mock providers, disk storage/KV, ephemeral local stub servers; Playwright iPhone 13 (Chromium) and Pixel 7; Lighthouse 12.

## Verdict

**FAIL**

All fifteen `G3-AC-1..G3-AC-15` criteria have a passing automated test, the increment 1 and 2 suites still pass, the e2e journeys pass on both viewports, and Lighthouse/axe are green. **Three hardening defects** remain, found by negative/edge cases:

- **#14 (critical)** — `ALLOW_MOCK_PROVIDERS=true` bypasses **all** production checks. A real-Stripe deploy with the flag is `ready`, `mode: "demo"` and labelled "Demo — no real payment"; with `STORAGE_DRIVER=local`/`KV_DRIVER=local` it also permits real payments to be written to ephemeral disk.
- **#15 (major)** — `verify:providers` reports Gemini `PASS` for any HTTP 200, even a response with no image, so the go-live gate can certify a broken image provider.
- **#16 (major)** — the Upstash driver has no request timeout; a hung Redis can block every route that touches sessions, jobs, limits, stats or claims.

The full suite is **149/153**: the four failures are the new negative tests for these defects. The G3 acceptance criteria themselves pass for their specified conditions.

## Run results

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **Pass**, no warnings/errors |
| Build | `npm run build` | **Pass** (25 routes including `/api/health`, no type errors) |
| Unit / route / component / integration | `npm test` | **Fail** — 37 files, 153 tests: 149 passed, 4 failed |
| E2E | `npm run e2e` | **Pass** — 40 tests: 36 passed, 4 skipped (Lighthouse opt-in) |
| Lighthouse | `RUN_LIGHTHOUSE=1 npx playwright test e2e/lighthouse.spec.ts --project=iphone` | **Pass** — 2/2 (`/`, `/create`) |
| Secret scan | `npm run check:secrets` | **Pass** |
| Verifier dry run | `npm run verify:providers:dry` | **Pass** — five `SKIP not configured`, exit 0 |
| Real providers | n/a | No keys; all tests offline with mocks/stubs |

**No flaky tests.** The four failures are deterministic negative tests for #14/#15/#16; the demos and regression suites ran clean.

## Traceability and results

| Criterion | Test cases | Result |
|---|---|---|
| G3-AC-1 | G3-TC-1 | Pass |
| G3-AC-2 | G3-TC-2 | Pass |
| G3-AC-3 | G3-TC-3 | Pass for the specified mock demo; FR-1/FR-3 edge **Fail (#14)** |
| G3-AC-4 | G3-TC-4 | Pass |
| G3-AC-5 | G3-TC-5 | Pass |
| G3-AC-6 | G3-TC-6 | Pass |
| G3-AC-7 | G3-TC-7 | Pass for the configured-pass case; FR-4/FR-5 edge **Fail (#15)** |
| G3-AC-8 | G3-TC-8 | Pass |
| G3-AC-9 | G3-TC-9 | Pass |
| G3-AC-10 | G3-TC-10 | Pass for the listed operations; FR-8 timeout **Fail (#16)** |
| G3-AC-11 | G3-TC-11 | Pass |
| G3-AC-12 | G3-TC-12 | Pass |
| G3-AC-13 | G3-TC-13 | Pass |
| G3-AC-14 | G3-TC-14 | Pass |
| G3-AC-15 | G3-TC-15 | Pass |
| FR-1/FR-3 demo safety | G3-TC-16 | **Fail (#14)** |
| FR-4/FR-5 verifier correctness | G3-TC-17 | **Fail (#15)** |
| FR-8 Upstash timeout | G3-TC-18 | **Fail (#16)** |

Full detail: [`docs/test-cases/go-live-hardening.md`](../test-cases/go-live-hardening.md).

## Issues opened

| Issue | Severity | Summary |
|---|---|---|
| #14 | critical | `ALLOW_MOCK_PROVIDERS` bypasses every production check, so a real-payment deploy can show "no real payment" and use local storage |
| #15 | major | `verify:providers` reports Gemini PASS for a 200 response with no image |
| #16 | major | Upstash driver has no request timeout; a hung Redis can block every request |

No duplicates existed; no issue was commented on, closed or edited. Increment 1 **#5** (FR-12 synchronous generation) remains open and deferred to the Analyst; the G3 docs still treat it as a documented deployment decision.

## Evidence and root causes

### #14 — demo opt-in bypasses all production checks
`describeConfig()` sets `mode` from `allowMock` alone and skips every production check when `allowMock` is true:

```
const allowMock = env.ALLOW_MOCK_PROVIDERS === "true";
const mode = allowMock ? "demo" : "live";
if (!allowMock) { /* refuse mocks and local drivers */ }
```

`isDemoMode()` is `production && ALLOW_MOCK_PROVIDERS=true`, so the badge is shown even when `PAYMENT_PROVIDER=stripe`. Our tests show:

```
FR-1/FR-3: real providers are never labelled a no-payment demo
  expected 'demo' to be 'live'
FR-1: the demo opt-in cannot allow local drivers with a real payment provider
  expected true to be false
```

Consequences: a real Stripe checkout can be presented under "Demo — no real payment"; a real-payment deploy can write paid images to local/ephemeral storage. The demo label is only truthful when the payment provider is mock. Fix: tie demo mode to `PAYMENT_PROVIDER=mock` (and keep the normal real-provider/local-driver checks when payment is real), or refuse `ALLOW_MOCK_PROVIDERS=true` unless all providers are mock.

### #15 — Gemini verifier false PASS
`probeGemini()` checks `response.ok` and drains the body; it never parses `candidates[].content.parts[].inlineData`. The passing stub returns `{ "candidates": [] }`, which the current verifier accepts. A real key/model that returns text, a safety block or no candidate would pass the command. The adapter (`lib/providers/image/gemini.ts`) does check for an image part, so the verifier and the app disagree.

Test:

```
FR-4/FR-5: a Gemini response without an image is a verifier FAIL
  expected 'PASS' to be 'FAIL'
```

Fix: parse the response and require a non-empty inline image; fail otherwise. Update the passing stub to return an image and add the text-only negative.

### #16 — Upstash has no timeout
`UpstashKV.command()` (`lib/kv/upstash.ts:42-58`) calls `fetch` without an `AbortSignal` or timeout. The Blob driver (`lib/storage/vercel-blob.ts:18-37`) aborts after 10 s and throws a typed `StorageError("timeout")`; the Upstash integration test has no hanging case. The KV adapter is on every request path (sessions, jobs, rate limits, stats, pack claims); a hung Redis blocks the request until the platform kills it.

The new stub test (`tests/integration/upstash.test.ts` › `FR-8: a hanging Upstash request is bounded by a timeout`) returns `pending` instead of `rejected`. Fix: add a configurable request timeout (default ~10 s) and a typed error, mirroring the Blob suite. Severity is major because this is an availability failure on the money path.

## Code review (increment 3)

**Strengths**
- The config check is a pure `describeConfig(env)` with a thin `assertProductionConfig()` wrapper; the guard runs at the top of `/api/generate` and `/api/checkout`, before parsing, quotas, providers or storage. `/api/health` returns readiness/mode and no values; the 503 problems list names variables, not secrets.
- The demo badge is server-rendered in the shared header, the paywall and the success page; the production e2e runs with `ALLOW_MOCK_PROVIDERS=true` and the mock providers, so the label is exercised on both viewports.
- The verifier is injectable, redacts every output path (pass/fail/verbose/crash/dry), prints a clear table, supports `--dry-run` and returns exit codes for CI/manual use. The `verify:providers:dry` run is clean and offline.
- The Blob driver now has a bounded timeout, typed `StorageError`s with status/retryable, and stub tests for success, 403 and a hang. `generate` maps `StorageError` to 503 `storage_unavailable`.
- Sale recording is idempotent per session via a KV marker before the counters; the webhook and the event-id claim make duplicate deliveries safe.
- The admin cookie adds `Secure` for an HTTPS site URL while keeping HttpOnly/SameSite=Lax; the share builder normalises EXIF orientation before measuring, and the rotated fixture is covered.
- The new G3 AC tests are broad and mostly strong, and the increment 1/2 regressions are untouched.

**Findings (all filed)**
- **#14** is the highest-risk one: the demo flag is a blanket bypass, not a mock-provider opt-in. It undermines the very guard this increment added.
- **#15** makes the manual go-live gate unreliable for the image provider.
- **#16** leaves the KV path unbounded while the Blob path was hardened.

**Residual, non-blocking**
- `StorageError` is only translated in `/api/generate`; `/api/preview`, `/api/download`, `/api/share` and `/api/jobs/[id]/expand` would return an untyped 500 if Blob fails. The spec's "caller surfaces a retryable error" is satisfied for upload but not for the paid download/share/preview paths.
- `describeConfig()` does not require `NEXT_PUBLIC_SITE_URL` in production; health can be ready while canonical/OG/watermark use `localhost` and the admin cookie lacks `Secure`. Consider requiring it or refusing the cookie without an HTTPS site URL.
- `isDemoMode()` (and `describeConfig().mode`) is true in development with the flag while no badge is rendered (because `isDemoMode` requires production); health in dev could say demo with no label. Minor.
- `probeGemini` sends a tiny prompt but does not check quotas/cost; the verifier is a reachability/shape gate, not a load test.
- The Upstash integration stub does not exercise `setIfAbsent` (used by the webhook event claim) or the rolling-window Lua; the local driver covers those paths.
- `G3-AC-15`'s automated test checks env documentation; the secret scan is the separate `npm run check:secrets` (run and clean).
- `G3-AC-14`'s Lighthouse budget covers `/` and `/create`; `/success` is covered by axe, not Lighthouse. The spec's "Lighthouse/a11y on `/success`" is interpreted as axe for the page.
- Increment 1 #5 remains: preview generation is synchronous; the G3 branch does not change it.

## Spec issues

1. **`ALLOW_MOCK_PROVIDERS` semantics are contradictory in practice.** FR-1 says the flag permits mock providers/local drivers in production; FR-3 says a demo has mock providers and the label. The code reads the flag as "demo mode" even with real payment. The spec should say explicitly that the flag is invalid with a real payment provider, or that the label/mode must require `PAYMENT_PROVIDER=mock`.
2. **FR-4/FR-5 do not say the Gemini probe must validate an image response.** The verifier's job is to prove the provider works; the acceptance test's empty-candidate stub certifies a false PASS. Require an inline image (and a negative test).
3. **FR-8 says "covered the same way" as the Blob driver**, which includes a timeout, but G3-AC-10 lists no timeout and the driver has none. Make the timeout explicit in both.
4. **FR-7's "caller surfaces a retryable user error"** does not name the routes; only `/api/generate` maps `StorageError`. Decide whether preview/download/share/expand must also return a typed 503.
5. **FR-2 readiness does not define whether `NEXT_PUBLIC_SITE_URL` is required.** It drives canonical/OG/watermark and the cookie `Secure` flag; a production health check should not pass with localhost defaults.
6. **G3-AC-3/AC-4 conditions leave the flag + real providers combination undefined**, which is exactly the unsafe edge. Add it.
7. **`STRIPE_PRICE_*` are verifier-only**; the app's Checkout still uses inline `price_data`. The README/launch checklist should say so, or the adapter should use the configured price IDs.
8. **#5 (FR-12)** remains a documented deployment decision; G3 assumes it unchanged.

## Flaky tests

None. The full suite, e2e and Lighthouse were each run once; the four failures are deterministic negative cases. The stub servers use ephemeral ports and are torn down per test.

## Next step

Fix or explicitly defer before go-live:

- Must fix: **#14** (critical demo/real-payment bypass), **#15** (Gemini verifier false PASS), **#16** (Upstash timeout).
- Increment 1 **#5** remains the Analyst's deferred decision.
- Residual hardening (storage errors on non-generate routes, site-URL readiness) can be tracked as minor backlog.

Hand back to the Senior Dev with the issue numbers; the full test report and test-case document are the evidence.
