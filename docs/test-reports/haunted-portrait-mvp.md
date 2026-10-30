# Test report — Haunted Portrait MVP (increment 1)

- **Mode:** retest after the fixes for #1, #2, #3, #4 and #6
- **Branch:** `feature/haunted-portrait-mvp`
- **Commit:** `85537c7` (first QA pass was `23e9426`; first-pass tests are in `6ea73af`)
- **Spec:** [`docs/specs/haunted-portrait-mvp.md`](../specs/haunted-portrait-mvp.md)
- **Test cases:** [`docs/test-cases/haunted-portrait-mvp.md`](../test-cases/haunted-portrait-mvp.md)
- **Date:** 2026-10-30
- **Environment:** Windows 11, Node 22.12.0, npm 11.0.0; mock image/payment providers, disk storage/KV; Playwright iPhone 13 (Chromium) and Pixel 7 profiles; Lighthouse 12 on the iPhone project.

## Verdict

**FAIL**

The five fixes requested for retest are verified: **#1, #2, #3, #4 and #6 are fixed**, and all 28 acceptance criteria now pass. The full unit/route suite is green (73/73), and the e2e suite is green apart from one new regression.

The new CSP from #6 (`a771baa`) blocks `heic2any`'s WASM worker in production. A real HEIC upload now hangs on "Getting your photo ready…" indefinitely, with no preview and no fallback message (issue **#7**, major). The same fixture converts correctly in `next dev`, where the CSP allows `'unsafe-eval'`. The new test `e2e/heic.spec.ts` reproduces it on both viewports, so the e2e suite fails.

**#5** remains open by design: FR-12 generation is still synchronous, now bounded by `maxDuration = 120` and documented in the README. It waits for the Analyst's decision.

## Retest verification

| Issue | Status at `85537c7` | Evidence |
|---|---|---|
| #1 cleanup index race | **Fixed** | `tests/routes/cleanup-concurrency.test.ts` › `AC-20/FR-31: cleanup deletes the objects of every expired job created at the same time` passes (20/20 jobs swept); index is an atomic set and ids are pruned after purge. |
| #2 parallel limits | **Fixed** | `tests/unit/limits.test.ts` › `AC-16: parallel attempts…` and `AC-17: parallel requests…` each allow exactly 3 of 10. Atomic rolling-window add (disk lock / Upstash Lua) and atomic `INCR`. |
| #3 invisible focus | **Fixed** | `e2e/accessibility.spec.ts` › `AC-25: keyboard focus is visible on the upload control` passes on both viewports; the label now has `focus-within` border + ring. |
| #4 corrupt image 500 | **Fixed** | `tests/routes/generate.test.ts` › `FR-9: a corrupt JPEG…` passes with 400 `invalid_image`; decode happens before quota is consumed; provider not called. |
| #5 FR-12 synchronous generation | **Open, deferred** | Still synchronous; `maxDuration = 120` and a README section were added in `05a0c24`. No AC regression (AC-19/AC-26 pass). Awaiting the Analyst. |
| #6 security headers | **Fixed** | `e2e/security.spec.ts` passes; headers present on both viewports. The CSP caused the new #7 regression. |
| #7 HEIC + CSP (new) | **Open** | `e2e/heic.spec.ts` fails on both viewports: upload hangs; console `EvalError` on `new Function`; the same fixture previews in dev. |

## Run results

| Gate | First pass `23e9426` | Retest `85537c7` |
|---|---|---|
| Lint | Pass (1 warning: unused `_input`) | **Pass**, no warnings or errors |
| Build | Pass | **Pass** (17 routes, no type errors) |
| Unit / route / component | Fail — 73 tests: 69 passed, 4 failed | **Pass** — 73/73 |
| E2E | Fail — 22 tests: 18 passed, 2 failed, 2 skipped | **Fail** — 26 tests: 22 passed, 2 failed (`TC-40`, #7), 2 skipped (Lighthouse opt-in) |
| Lighthouse | Pass | **Pass** (`RUN_LIGHTHOUSE=1 … --project=iphone`) |
| Secret scan | Pass | **Pass** |

The two e2e failures are the same deterministic HEIC test on both viewports. For the record, the first pass also ran Lighthouse separately (pass); no run produced a flaky result.

## Traceability and results

| AC | Test cases | First pass | Retest `85537c7` |
|---|---|---|---|
| AC-1 | TC-1 | Pass | Pass |
| AC-2 | TC-2, TC-3 | Pass | Pass |
| AC-3 | TC-4 | Pass | Pass |
| AC-4 | TC-5, TC-6 | Pass | Pass |
| AC-5 | TC-7, TC-8 | Pass | Pass |
| AC-6 | TC-9, TC-10 | Pass | Pass |
| AC-7 | TC-11 | Pass | Pass |
| AC-8 | TC-12 | Pass | Pass |
| AC-9 | TC-13 | Pass | Pass |
| AC-10 | TC-14 | Pass | Pass |
| AC-11 | TC-15 | Pass | Pass |
| AC-12 | TC-16 | Pass | Pass |
| AC-13 | TC-17 | Pass | Pass |
| AC-14 | TC-18 | Pass | Pass |
| AC-15 | TC-19 | Pass | Pass |
| AC-16 | TC-20, TC-31 | **Fail (#2)** | **Pass** |
| AC-17 | TC-21, TC-32 | **Fail (#2)** | **Pass** |
| AC-18 | TC-22 | Pass | Pass |
| AC-19 | TC-23 | Pass | Pass |
| AC-20 | TC-24, TC-33 | **Fail (#1)** | **Pass** |
| AC-21 | TC-25 | Pass | Pass |
| AC-22 | TC-26 | Pass | Pass |
| AC-23 | TC-27 | Pass | Pass |
| AC-24 | TC-28 | Pass | Pass |
| AC-25 | TC-29, TC-30 | **Fail (#3)** | **Pass** |
| AC-26 | TC-34 | Pass | Pass (iPhone 13 + Pixel 7) |
| AC-27 | TC-35 | Pass | Pass |
| AC-28 | TC-36 | Pass | Pass |
| FR-9 | TC-37 | **Fail (#4)** | **Pass** |
| FR-7 | TC-40 | not covered | **Fail (#7)** |
| FR-12 | TC-38 | **Fail (#5)** | **Fail (#5)**, deferred |
| Security headers | TC-39 | **Fail (#6)** | **Pass** |

Full detail, data and automation mapping: [`docs/test-cases/haunted-portrait-mvp.md`](../test-cases/haunted-portrait-mvp.md).

## Issues

| Issue | Severity | Summary | Status at `85537c7` |
|---|---|---|---|
| #1 | critical | Concurrent generations are lost from the cleanup index, so their photos are never deleted after 48 h | **Verified fixed** (comment) |
| #2 | critical | Parallel requests bypass the per-IP preview limit and the daily generation cap | **Verified fixed** (comment) |
| #3 | major | Keyboard focus on the upload control is invisible | **Verified fixed** (comment) |
| #4 | minor | A corrupt image with valid magic bytes returns 500 instead of a typed 4xx | **Verified fixed** (comment) |
| #5 | minor | Generation runs inline in `POST /api/generate` instead of as a polled job (FR-12 deviation) | **Open, deferred** (comment; Analyst decision) |
| #6 | minor | Production responses have no security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy) | **Verified fixed** (comment), but caused #7 |
| #7 | major | CSP blocks the HEIC decoder in production, so HEIC uploads hang with no fallback | **Open** (new regression from #6) |

No issue was closed (merging the PR does that). Issues #1–#5 each received one first-pass comment correcting the test-case number quoted in the filed body. The retest added a verification comment to #1–#4 and #6, a deferral comment to #5, and filed #7.

## #7 — HEIC + CSP regression (TC-40, FR-7)

`next.config.ts` sets `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' …` in production. `'wasm-unsafe-eval'` permits WebAssembly compilation but not `new Function`, which `heic2any`'s Emscripten worker uses. On a production build, uploading `tests/fixtures/heic/example.heic` leaves the form on "Getting your photo ready…" forever; the worker throws `EvalError` and the outer `heic2any` promise never settles, so the `prepareImage` catch never shows the fallback. The identical fixture previews correctly in `next dev`, where the dev CSP adds `'unsafe-eval'`.

Two viable fixes: allow the decoder (`'unsafe-eval'`, documented trade-off) or keep the strict CSP and make the HEIC path fail safely (try native `createImageBitmap` first, add a timeout around `heic2any`, and show the existing `decode_failed` message). Either way, keep `e2e/heic.spec.ts` green on both viewports.

## First-pass findings (now fixed)

These are retained for history; the fixes are in commits `a44aa2e`, `565c470`, `4bcdbf6`, `a771baa`, `05a0c24` and `85537c7`.

- **#1 — cleanup index race (AC-20, FR-31).** `addToIndex()` read-modify-wrote a single `jobs:index` JSON array; concurrent jobs overwrote each other. 20 concurrent `createJob()` calls left 1 id indexed and 19 jobs invisible to `cleanupExpiredJobs()`. Fixed with an atomic set add, an atomic set membership read for the sweeper and id pruning after purge.
- **#2 — non-atomic limits (AC-16, AC-17, FR-29, FR-30).** `consumePreviewAttempt()` and `consumeDailyGeneration()` did `get` → compute → `set`; 10 parallel calls all passed a limit of 3. Fixed with `addToRollingWindow` (in-process lock for disk, Lua for Redis) and atomic `INCR`.
- **#3 — invisible focus.** The `sr-only` input's focus ring was clipped and the label had no focus styling. Fixed with `focus-within` border/ring.
- **#4 — corrupt image.** `stripMetadata()` threw after the counters were consumed and the route returned 500 `fatal`. Fixed by decoding/stripping before quota and returning 400 `invalid_image`.
- **#6 — security headers.** No CSP/XFO/nosniff/Referrer-Policy. Fixed in `next.config.ts` and `e2e/security.spec.ts`, but the CSP caused #7.

## Fix review (`6ea73af`..`85537c7`)

**Correctness**
- The atomic operations are implemented at the KV boundary, which is the right layer: disk uses a per-key lock and `wx` set files; Upstash uses `SADD`/`SREM`/`SMEMBERS` and a Lua script for the rolling window. The existing sequential tests still pass, and the parallel tests now pass.
- `getKv()` caches the driver per `DATA_DIR`/URL signature; fresh temp directories get a fresh instance. This is necessary for the lock map to work in tests.
- The corrupt-image path now decodes before consuming quota, but **over-quota requests still perform the sharp decode** before they are rejected. A large/decompression-bomb upload from one IP can therefore consume CPU even after its limit is exhausted. This is a residual DoS consideration, not a filed regression; the provider budget is still protected.
- `consumeDailyGeneration()` now increments first and allows while `current <= cap`. Refused attempts keep incrementing the counter (it resets by TTL), so the cap is still enforced; only the counter's value differs from the previous semantics.
- CSP is applied globally. The journey, checkout redirects and success polling all still work; only the HEIC worker is blocked (#7).

**Architecture / quality**
- The atomic primitives make the limits and index code shorter and remove the read-modify-write pattern from application code. The rule is documented in `CLAUDE.md`.
- The advertized `maxDuration = 120` is a real bound for the synchronous route; the README documents the FR-12 deviation and the proxy/XFF assumption. Good.
- Canonicals are now per page; `/success` is `noindex`; the unused `DOWNLOAD_TOKEN_TTL_SECONDS`, the `_input` lint warning and the mislabelled AC-28 e2e comment are gone.

**Security**
- CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy are present; the mock checkout redirects use relative `Location` values so `form-action 'self'` does not block them.
- The CSP's `script-src` uses `'unsafe-inline'` (needed by Next's inline bootstrap) and `'wasm-unsafe-eval'` (needed by WASM); it deliberately omits `'unsafe-eval'`, which is what breaks `heic2any`.
- No secret or prompt text in `.next/static`; `check:secrets` clean.
- The XFF handling is now documented, which closes the first-pass documentation gap.
- No `npm audit` gate in CI; still recommended before launch.

**Nits**
- `lib/env.ts` has a stray double blank line where the dead constant was removed.
- `MockPaymentsProvider.createSession()` no longer declares its unused parameter; fine by interface arity, but it keeps the provider's contract less explicit than the Stripe adapter's.
- The HEIC fixture is 718 KB. It is MIT-licensed (libheif examples) and documented in `tests/fixtures/heic/README.md`.

## Spec issues

1. **FR-12 remains the known deviation (#5).** The spec requires 202 *while generating* plus client polling; the code is synchronous, now bounded by `maxDuration = 120`. The Analyst must decide whether to implement the async contract or amend the spec. No AC fails today.
2. **AC-25 now passes.** The first pass asked for a measurable definition of "visible focus"; the fix uses the standard "the focused control or its visible wrapper changes" interpretation. Worth writing that definition into the spec.
3. **AC-16 / AC-17 did not state concurrency semantics.** The first pass applied the FR-29/FR-30 intent (the limit must protect the budget), and the fix now enforces it under parallel requests. Add "including concurrent requests" to the ACs.
4. **FR-7 does not say what happens when conversion is blocked by policy.** It says HEIC is best effort with a clear fallback when the browser cannot decode. #7 is a policy/CSP failure rather than a codec failure, and the current code neither converts nor shows the fallback. We treat it as a decoder failure and require the fallback.
5. **FR-27 says an expired or deleted token returns 410 "with a clear message".** The deleted-object case returns a human message; the expired-token case returns only `{"error":"token_expired"}`. Unchanged from the first pass.
6. **AC-27's test is only as strong as the environment that runs it.** It scans for secret values present in the test process; a CI run without values only checks prompt text. Unchanged.
7. **Assumption 8 mentions a "countdown"** while FR-2 implements a static banner. Wording only.

## Flaky tests

None. The two retest e2e failures are the same deterministic HEIC failure on both viewport projects; the Vitest suite is fully green.

## Next step

- Fix **#7** (HEIC + CSP) and keep `e2e/heic.spec.ts` green on both viewports.
- **#5** stays open for the Analyst's decision; no code change is required for the current ACs.
- **#1, #2, #3, #4, #6** are verified fixed and can be closed by merging the PR.
