# Test report — Go-live hardening (increment 3)

- **Mode:** retest after the fixes for #14, #15 and #16
- **Branch:** `feature/go-live-hardening`
- **Commit:** `66f2eee` (first pass `5dea564`; fixes `73cd8f8`, `ca74d9e`, `1370c56`; test/docs `63219f4`)
- **Spec:** [`docs/specs/go-live-hardening.md`](../specs/go-live-hardening.md)
- **Test cases:** [`docs/test-cases/go-live-hardening.md`](../test-cases/go-live-hardening.md)
- **Date:** 2026-10-30
- **Environment:** Windows 11, Node 22.12.0, npm 11.0.0; mock providers, disk storage/KV, ephemeral local stub servers; Playwright iPhone 13 (Chromium) and Pixel 7; Lighthouse 12.

## Verdict

**PASS**

All fifteen `G3-AC-1..G3-AC-15` criteria pass, the increment 1 and 2 regressions pass, the negative hardening cases pass, and the full gate is green:

- **#14** — demo mode now requires `PAYMENT_PROVIDER=mock`; a real-payment deploy stays `mode: "live"`, shows no “no real payment” label, and local drivers are refused with a real payment provider.
- **#15** — the Gemini probe parses candidates/parts and requires a non-empty inline image; an empty/text-only response is `FAIL`.
- **#16** — `UpstashKV` now has a configurable timeout (default 10 s) and typed `KVError`s; the hanging-stub test rejects instead of staying pending.

**#5** (increment 1, FR-12 synchronous generation) remains the only open issue, a minor deferred to the Analyst. No critical or major issue is unresolved.

## Run results

| Gate | First pass `5dea564` | Retest `66f2eee` |
|---|---|---|
| Lint (`npm run lint`) | Pass | **Pass** |
| Build (`npm run build`) | Pass | **Pass** (25 routes) |
| Unit / route / component / integration (`npm test`) | 149/153 (4 failed) | **153/153** |
| E2E (`npm run e2e`) | 36/40 (4 Lighthouse skips) | **36/40 (4 Lighthouse skips)** |
| Lighthouse (`RUN_LIGHTHOUSE=1 … --project=iphone`) | 2/2 | **2/2** |
| Secret scan (`npm run check:secrets`) | Pass | **Pass** |
| Verifier dry run (`npm run verify:providers:dry`) | Pass (5 SKIP) | **Pass (5 SKIP, no network)** |

No flaky tests. The three first-pass failures and the added Upstash hang test are deterministic; the retest is fully green.

## Retest verification

| Issue | Status at `66f2eee` | Evidence |
|---|---|---|
| #14 demo/real-payment bypass | **Fixed** (`73cd8f8`) | `tests/routes/config-guard.test.ts` › `FR-1/FR-3: real providers are never labelled a no-payment demo` and `FR-1: the demo opt-in cannot allow local drivers with a real payment provider` pass. `describeConfig()` now computes `demo = ALLOW_MOCK_PROVIDERS && PAYMENT_PROVIDER=mock`; `isDemoMode()` mirrors it; the normal real-provider/local-driver checks apply when payment is real. |
| #15 Gemini verifier false PASS | **Fixed** (`ca74d9e`) | `tests/integration/verify-providers.test.ts` › `FR-4/FR-5: a Gemini response without an image is a verifier FAIL` passes; the probe parses `candidates[].content.parts[].inlineData.data` and requires a non-empty image. The G3-AC-7 passing stub returns an image and still passes. |
| #16 Upstash timeout | **Fixed** (`1370c56`) | `tests/integration/upstash.test.ts` › `FR-8: a hanging Upstash request is bounded by a timeout` passes. `UpstashKV` accepts a configurable timeout (default 10 s), aborts the fetch, and throws typed `KVError` timeout/network/http errors. |
| #5 FR-12 synchronous generation | **Open, deferred** | Increment 1 issue; unchanged by this branch and explicitly out of increment 3 scope. Minor backlog for the Analyst. |

## Traceability and results

| Criterion | Test cases | Result |
|---|---|---|
| G3-AC-1 | G3-TC-1 | Pass |
| G3-AC-2 | G3-TC-2 | Pass |
| G3-AC-3 | G3-TC-3 | Pass (FR-1/FR-3 edge fixed #14) |
| G3-AC-4 | G3-TC-4 | Pass |
| G3-AC-5 | G3-TC-5 | Pass |
| G3-AC-6 | G3-TC-6 | Pass |
| G3-AC-7 | G3-TC-7 | Pass (FR-4/FR-5 edge fixed #15) |
| G3-AC-8 | G3-TC-8 | Pass |
| G3-AC-9 | G3-TC-9 | Pass |
| G3-AC-10 | G3-TC-10 | Pass (FR-8 timeout fixed #16) |
| G3-AC-11 | G3-TC-11 | Pass |
| G3-AC-12 | G3-TC-12 | Pass |
| G3-AC-13 | G3-TC-13 | Pass |
| G3-AC-14 | G3-TC-14 | Pass |
| G3-AC-15 | G3-TC-15 | Pass |
| FR-1/FR-3 demo safety | G3-TC-16 | Pass (fixed #14) |
| FR-4/FR-5 verifier correctness | G3-TC-17 | Pass (fixed #15) |
| FR-8 Upstash timeout | G3-TC-18 | Pass (fixed #16) |

Full detail: [`docs/test-cases/go-live-hardening.md`](../test-cases/go-live-hardening.md).

## Issues

| Issue | Severity | Summary | Status at `66f2eee` |
|---|---|---|---|
| #14 | critical | `ALLOW_MOCK_PROVIDERS` bypassed every production check, so a real-payment deploy could show “no real payment” and use local storage | **Verified fixed** (comment) |
| #15 | major | `verify:providers` reported Gemini PASS for a 200 response with no image | **Verified fixed** (comment) |
| #16 | major | Upstash driver had no request timeout | **Verified fixed** (comment) |
| #5 | minor | Increment 1 FR-12 synchronous generation | **Open, deferred** — Analyst |

No issue was closed (merging does that). The three increment 3 issues received verification comments with the commit, test names and gate result.

## Fix review

- **Demo safety (`lib/config-check.ts`, `lib/demo.ts`)** — `demo` is now `allowMock && payment === "mock"`; `mode` is demo only for a mock-payment deploy; `isDemoMode()` requires the same. With a real payment provider the normal checks still refuse `IMAGE_PROVIDER=mock`, `STORAGE_DRIVER=local` and `KV_DRIVER=local`, so the flag cannot relax paid-data protection. The README and launch checklist now say `ALLOW_MOCK_PROVIDERS=true` **and** `PAYMENT_PROVIDER=mock` for a demo. This is the correct boundary.
- **Gemini verifier (`scripts/verify-providers.mjs`)** — `probeGemini` now parses the JSON, flattens all candidates' parts and requires a non-empty `inlineData.data`; a 200 with no candidate/text-only/blocked response is FAIL. The failure reason is redacted by the existing `runVerifier` path. The G3-AC-7 stub now supplies an image, and the negative case covers the empty candidate.
- **Upstash timeout (`lib/kv/upstash.ts`, `lib/kv/types.ts`)** — `KVError` mirrors the Blob `StorageError` (code/status/retryable); every `command` is wrapped in an `AbortController` with a configurable timeout (default 10 s), aborts body reads too, and maps HTTP/network/timeout failures. The 100 ms hanging-stub test passes. The integration suite still covers the TTL/incr/conditional-delete paths.
- **No regression** in the increment 1/2 suites, the e2e journeys, the demo label, the security headers or the admin/sale/share tests.

**Residual, non-blocking**
- `StorageError` is mapped to a 503 only in `/api/generate`; `/api/preview`, `/api/download`, `/api/share` and `/api/jobs/[id]/expand` still return an untyped 500 on a Blob failure. A paid download/share retry is therefore not a friendly message.
- `KVError` is typed at the driver but not mapped by the routes; a timed-out KV call still becomes a 500 after the 10 s bound. The important hang is fixed; a route-level 503 would complete the error story.
- `describeConfig()` still does not require `NEXT_PUBLIC_SITE_URL`; health can be ready while canonical/OG/watermark default to localhost and the admin cookie lacks `Secure`. The launch checklist asks for the URL, but readiness does not enforce it.
- `isDemoMode()` is false in development with the flag while `describeConfig().mode` can be demo; the badge is production-only by design. Minor.
- The Upstash stub does not cover `setIfAbsent` (webhook claim) or the rolling-window Lua; the local driver covers those.
- `/success` is axe-covered but not Lighthouse-covered; the budget remains `/` and `/create`.
- The HTTPS `Secure` cookie is unit-tested; the e2e site is HTTP.
- `STRIPE_PRICE_*` are verifier-only; the app Checkout still uses inline `price_data`. The docs should be explicit, or the adapter should use the configured price IDs.
- Increment 1 **#5** remains: preview generation is synchronous; G3 does not change it.

## Spec issues

1. **FR-1/FR-3 should state the payment condition.** The docs now say demo = `ALLOW_MOCK_PROVIDERS=true` **and** `PAYMENT_PROVIDER=mock`; put that in the spec so the label/mode rule is testable.
2. **FR-4/FR-5 should require a Gemini image part**, not just a successful HTTP call. The verifier now does; add it to the spec and the passing stub expectation.
3. **FR-8 should make the Upstash timeout explicit**, as it does for Blob; G3-AC-10 only listed the set/incr/conditional-delete operations.
4. **FR-7's "caller surfaces a retryable error"** should name which routes must map `StorageError`; only `/api/generate` does.
5. **FR-2 should say whether `NEXT_PUBLIC_SITE_URL` is a required production variable** (cookie `Secure`, canonical/OG, watermark).
6. **AC-3/AC-4 should define the flag + real-provider combination** (the code now treats it as live; the spec is silent).
7. **`STRIPE_PRICE_*` are verifier-only** while Checkout uses inline `price_data`; document the difference or use the price IDs in the adapter.
8. **#5 (FR-12)** remains the documented synchronous-generation decision.

## Flaky tests

None. The full suite (153), e2e (40 including 4 Lighthouse skips) and Lighthouse (2) were each run once; the new negative tests are deterministic and the stub servers use ephemeral ports torn down per test.

## Next step

PASS. Hand off to the Analyst with:

- Branch `feature/go-live-hardening`, implementation `66f2eee`, test/docs `63219f4` + this retest commit.
- All G3 ACs and the increment 1/2 regression pass; full gate green.
- Only **#5** is open (increment 1, minor, deferred); the residual hardening notes above are non-blocking.
