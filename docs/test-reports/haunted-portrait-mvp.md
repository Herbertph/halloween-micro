# Test report — Haunted Portrait MVP (increment 1)

- **Mode:** retest (second) after the #7 fix
- **Branch:** `feature/haunted-portrait-mvp`
- **Commit:** `3149ccc` (first pass `23e9426`, first retest `85537c7`; test commits `6ea73af` and `18f3d02`)
- **Spec:** [`docs/specs/haunted-portrait-mvp.md`](../specs/haunted-portrait-mvp.md)
- **Test cases:** [`docs/test-cases/haunted-portrait-mvp.md`](../test-cases/haunted-portrait-mvp.md)
- **Date:** 2026-10-30
- **Environment:** Windows 11, Node 22.12.0, npm 11.0.0; mock image/payment providers, disk storage/KV; Playwright iPhone 13 (Chromium) and Pixel 7 profiles; Lighthouse 12 on the iPhone project.

## Verdict

**PASS**

Every acceptance criterion (AC-1..AC-28) has at least one passing test, the full suite is green, and no unresolved critical or major issue remains. The two previous blockers — the cleanup-index race (#1) and the parallel-limit bypass (#2) — and the focus failure (#3), corrupt-image 500 (#4), missing security headers (#6) and HEIC/CSP regression (#7) are all verified fixed. **#5** (FR-12 synchronous generation) remains open as a minor, explicitly deferred decision for the Analyst.

The HEIC fix is confirmed end to end in production: `e2e/heic.spec.ts` passes on both viewports, and a manual production probe with `tests/fixtures/heic/example.heic` returns the paywall preview (512 × 342, complete, no page errors). The CSP includes `'unsafe-eval'` and `'wasm-unsafe-eval'`; the `e2e/security.spec.ts` header assertion still passes.

## Run results

| Gate | First pass `23e9426` | Retest 1 `85537c7` | Retest 2 `3149ccc` |
|---|---|---|---|
| Lint (`npm run lint`) | Pass, 1 warning | Pass, clean | **Pass, clean** |
| Build (`npm run build`) | Pass | Pass | **Pass** (17 routes, no type errors) |
| Unit / route / component (`npm test`) | 69/73 | 73/73 | **73/73** |
| E2E (`npm run e2e`) | 18/22 (2 failed, 2 skipped) | 22/26 (2 failed #7, 2 skipped) | **24/26 (2 skipped: Lighthouse opt-in)** |
| Lighthouse (`RUN_LIGHTHOUSE=1 … --project=iphone`) | Pass | Pass | **Pass** (perf ≥ 85, a11y ≥ 90) |
| Secret scan (`npm run check:secrets`) | Pass | Pass | **Pass** |

No flaky tests. The HEIC test passed on both viewport projects on the first run after the fix; no retries were needed.

## Retest verification

| Issue | Status at `3149ccc` | Evidence |
|---|---|---|
| #1 cleanup index race | **Fixed** (verified `85537c7`) | `tests/routes/cleanup-concurrency.test.ts` › `AC-20/FR-31: cleanup deletes the objects of every expired job created at the same time` passes (20/20 concurrent jobs swept). Atomic set add/read, ids pruned after purge. |
| #2 parallel limits | **Fixed** (verified `85537c7`) | `tests/unit/limits.test.ts` › `AC-16: parallel attempts…` and `AC-17: parallel requests…` each allow exactly 3 of 10. Atomic rolling-window add and atomic `INCR`. |
| #3 invisible focus | **Fixed** (verified `85537c7`) | `e2e/accessibility.spec.ts` › `AC-25: keyboard focus is visible on the upload control` passes on both viewports. |
| #4 corrupt image 500 | **Fixed** (verified `85537c7`) | `tests/routes/generate.test.ts` › `FR-9: a corrupt JPEG…` passes with 400 `invalid_image`, no provider call, no quota consumed. |
| #5 FR-12 synchronous generation | **Open, deferred** | Still synchronous; `maxDuration = 120` and README section from `05a0c24`. No AC regression. Awaiting the Analyst; minor backlog. |
| #6 security headers | **Fixed** (verified `85537c7`) | `e2e/security.spec.ts` confirms CSP, nosniff, X-Frame-Options, Referrer-Policy and Permissions-Policy on both viewports. |
| #7 HEIC + CSP | **Fixed** (verified `3149ccc`) | `e2e/heic.spec.ts` › `TC-40` passes on both viewports; production probe returns a 512 × 342 preview with no page errors; the 20 s timeout maps a blocked decoder to the export-as-JPG fallback. |

## Traceability and results

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
| AC-16 | TC-20, TC-31 | Pass (fixed #2) |
| AC-17 | TC-21, TC-32 | Pass (fixed #2) |
| AC-18 | TC-22 | Pass |
| AC-19 | TC-23 | Pass |
| AC-20 | TC-24, TC-33 | Pass (fixed #1) |
| AC-21 | TC-25 | Pass |
| AC-22 | TC-26 | Pass |
| AC-23 | TC-27 | Pass |
| AC-24 | TC-28 | Pass (opt-in Lighthouse) |
| AC-25 | TC-29, TC-30 | Pass (fixed #3) |
| AC-26 | TC-34 | Pass (iPhone 13 + Pixel 7) |
| AC-27 | TC-35 | Pass |
| AC-28 | TC-36 | Pass |
| FR-9 | TC-37 | Pass (fixed #4) |
| FR-7 | TC-40 | Pass (fixed #7) |
| FR-12 | TC-38 | **Fail (#5)** — open, deferred for the Analyst |
| Security headers | TC-39 | Pass (fixed #6) |

Full detail, data and automation mapping: [`docs/test-cases/haunted-portrait-mvp.md`](../test-cases/haunted-portrait-mvp.md).

## Issues

| Issue | Severity | Summary | Status at `3149ccc` |
|---|---|---|---|
| #1 | critical | Concurrent generations lost from the cleanup index | **Verified fixed** (`85537c7`) |
| #2 | critical | Parallel requests bypass the per-IP limit and daily cap | **Verified fixed** (`85537c7`) |
| #3 | major | Keyboard focus on the upload control is invisible | **Verified fixed** (`85537c7`) |
| #4 | minor | Corrupt image with valid magic bytes returns 500 | **Verified fixed** (`85537c7`) |
| #5 | minor | Generation runs inline instead of as a polled job (FR-12) | **Open, deferred** — Analyst decision |
| #6 | minor | Production responses had no security headers | **Verified fixed** (`85537c7`) |
| #7 | major | CSP blocked the HEIC decoder in production | **Verified fixed** (`3149ccc`) |

No issue was closed (merging the PR does that). All issues except #5 are verified fixed and carry a retest comment with the commit and test name; #5 remains open by design.

## #7 fix review

The fix in `3149ccc` does three things:

1. **Production CSP allows `'unsafe-eval'`** (`next.config.ts`). `heic2any`'s Emscripten worker uses `new Function`; `'wasm-unsafe-eval'` alone only permits WebAssembly compilation. Script origins remain `'self'` plus Plausible, `object-src 'none'`, `frame-ancestors 'none'` and `form-action 'self'`; the app renders no user HTML, so the trade-off is documented and acceptable for this one-page product. This is the one deliberate security concession in the final build and should be visible to the Reviewer.
2. **Native decode first** (`lib/client/image.ts`). Safari can decode HEIC through `createImageBitmap`; the WASM decoder is skipped when native decoding works.
3. **A 20 s timeout and fallback.** A blocked or broken `heic2any` worker now rejects as `decode_failed` after 20 s, and the existing CreateForm handler shows "iPhone photos in HEIC can't be read here — export as JPG…". The abandoned promise is handled, so there is no unhandled rejection and no endless "Getting your photo ready…".

The trade-off and the fallback contract are documented in `README.md` ("Security headers and the HEIC decoder") and `CLAUDE.md`.

## Final code review notes

- **Correctness:** the atomic KV operations, the decode-before-quota order and the HEIC timeout all behave as intended. The production HEIC probe returned a complete 512 × 342 preview with no console errors. The full journey, decline, forged-session and featureless-image paths still pass on both viewports.
- **Security:** no secret or prompt text in `.next/static`; `check:secrets` clean. The CSP now includes `'unsafe-eval'` (documented), while `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`, nosniff, X-Frame-Options and Referrer-Policy remain. The mock checkout redirects are relative, so `form-action 'self'` still works.
- **Residual, non-blocking:**
  - Over-quota requests still perform the sharp decode before the limit is checked, so CPU (not provider) work is not rate-limited. Consider a header-only `sharp.metadata()` pre-check before the quota if CPU abuse becomes a concern.
  - `consumeDailyGeneration()` increments before the cap check, so refused attempts keep incrementing the counter (it expires after 48 h; the cap itself is still enforced).
  - `MockPaymentsProvider.createSession()` no longer declares its unused input parameter; the interface arity still matches.
  - The HEIC fixture is 718 KB (MIT, landscape, no people; provenance in `tests/fixtures/heic/README.md`).
  - No `npm audit` gate in CI; recommended before launch.
- **Nits:** none that block merge. The earlier canonical, dead-constant, lint and e2e-comment nits are fixed.

## Spec issues

1. **FR-12 remains the deferred deviation (#5).** The code is synchronous, bounded by `maxDuration = 120`; the Analyst must decide whether to implement the async job + polling contract or amend the spec. No acceptance criterion fails.
2. **FR-7 was underspecified for policy-blocked conversion.** It now works via `'unsafe-eval'` and has a bounded fallback. The spec should state that a decoder blocked by browser policy must also surface the fallback message.
3. **AC-16 / AC-17 should say "including concurrent requests".** The first pass found the parallel bypass; the fix now enforces the limit atomically. Adding the wording prevents a future regression from passing sequentially.
4. **AC-25 "visible focus" still has no measurable definition.** The implementation and the e2e test use the standard "the focused control or its visible wrapper changes" interpretation; write it into the spec.
5. **FR-27's expired-token response** still returns only `{"error":"token_expired"}` (no human message), unlike the deleted-object case. Decide whether a machine code is enough.
6. **AC-27's bundle test** is only as strong as the secret values present in the test environment; consider seeding representative fake values in CI.
7. **Assumption 8's "countdown"** wording does not match the static banner implemented by FR-2.

## Flaky tests

None. The retest ran the full suite once; the HEIC test passed both viewport projects without retries, and the two skipped tests are the opt-in Lighthouse runs (executed separately and passing).

## Next step

PASS. Send the branch to the Reviewer with:

- Branch `feature/haunted-portrait-mvp`, implementation `3149ccc`, retest tests/docs `18f3d02` + this commit.
- All ACs pass; full gate green.
- Minor open: **#5** (FR-12 synchronous generation, deferred to the Analyst). No critical/major open.
- Review focus: the deliberate `'unsafe-eval'` CSP concession for the HEIC decoder, and the 20 s fallback path.
