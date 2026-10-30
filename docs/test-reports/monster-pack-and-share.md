# Test report — Monster Pack, share image, Turnstile and admin (increment 2)

- **Mode:** retest after the fixes for #9, #10, #11 and #12
- **Branch:** `feature/monster-pack-and-share`
- **Commit:** `4e1b114` (first pass `0fcd9cf`; fixes `0d10649`, `697b5b0`, `79c0d4b`, `ebb2f0b`; test/docs `9c327cc`)
- **Spec:** [`docs/specs/monster-pack-and-share.md`](../specs/monster-pack-and-share.md)
- **Test cases:** [`docs/test-cases/monster-pack-and-share.md`](../test-cases/monster-pack-and-share.md)
- **Date:** 2026-10-30
- **Environment:** Windows 11, Node 22.12.0, npm 11.0.0; mock image/payment providers, disk storage/KV; Playwright iPhone 13 (Chromium) and Pixel 7; Lighthouse 12. Cloudflare's published Turnstile test keys were used in a separate production probe.

## Verdict

**PASS**

All 30 increment 2 acceptance criteria pass, the full unit/route suite is green (**131/131**), both mobile e2e journeys pass (32 passed, 4 Lighthouse skips), and Lighthouse is green on `/` and `/create`. The four retest issues are verified fixed:

- **#9** — stale pack claims and crashed `generating` assets are reclaimed (MP-16/MP-17, including a new TTL-expiry test).
- **#10** — the expand-packs cron declares `maxDuration = 420` and is bounded to 3 assets per run (MP-39).
- **#11** — the webhook claims its event id atomically before any side effect; concurrent duplicates record one sale (MP-12).
- **#12** — `check:secrets` scans `TURNSTILE_SECRET_KEY` and `ADMIN_PASSWORD` (MP-36).

Increment 1 **#5** (synchronous FR-12 generation) remains the only open issue, a minor deferred to the Analyst. No critical or major issue is unresolved.

## Run results

| Gate | First pass `0fcd9cf` | Retest `4e1b114` |
|---|---|---|
| Lint (`npm run lint`) | Pass, clean | **Pass, clean** |
| Build (`npm run build`) | Pass | **Pass** (17 routes, no type errors) |
| Unit / route / component (`npm test`) | 126/130 (4 failed) | **131/131** |
| E2E (`npm run e2e`) | 32/36 (4 Lighthouse skips) | **32/36 (4 Lighthouse skips)** |
| Lighthouse (`RUN_LIGHTHOUSE=1 … --project=iphone`) | 2/2 | **2/2** (`/` and `/create`) |
| Secret scan (`npm run check:secrets`) | Pass but missing new secrets | **Pass and covers the new secrets** |
| Turnstile production probe (test keys) | Pass | Unchanged by the fixes; CSP still includes Cloudflare |

No flaky tests. The new TTL-claim test is deterministic; the original four failures were deterministic in the first pass.

## Retest verification

| Issue | Status at `4e1b114` | Evidence |
|---|---|---|
| #9 stale claim / `generating` | **Fixed** (`0d10649`) | `tests/routes/pack.test.ts` › MP-16 generating recovery, MP-17 TTL claim expiry and legacy-claim compatibility all pass. Per-style claims are `claim:<jobId>:<styleId>` keys with a TTL of `2 × GENERATION_TIMEOUT_MS + 30 s`; a `generating` asset older than one timeout is reclaimable; every terminal path releases or deliberately retains the claim. |
| #10 cron duration | **Fixed** (`79c0d4b`) | `app/api/cron/expand-packs/route.ts` declares `maxDuration = 420`; `MAX_EXPANSIONS_PER_RUN = 3`; the README documents the plan constraint and the claim-TTL recovery. MP-39 static check passes. |
| #11 webhook idempotency | **Fixed** (`697b5b0`) | The event id is claimed with `setIfAbsent` (`SET NX`, 7-day TTL) before `loadJob`/`saveJob`/`recordSale`; a losing concurrent delivery returns 200 ignored. MP-12 passes: one sale, revenue 899, job unlocked once. |
| #12 secret scan | **Fixed** (`ebb2f0b`) | `scripts/check-secrets.mjs` includes `TURNSTILE_SECRET_KEY` and `ADMIN_PASSWORD`; the new bundle assertion passes and the command is clean. MP-36 passes. |
| #5 FR-12 synchronous generation | **Open, deferred** | Increment 1 issue; unchanged by this branch. Minor backlog for the Analyst. |

## Traceability and results

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
| AC-26 | MP-37 | Pass (increment 1 regression) |
| AC-27 | MP-38 | Pass (iPhone 13 + Pixel 7) |
| AC-28 | MP-40 | Pass (Lighthouse + axe) |
| AC-29 | MP-36 | Pass (fixed #12) |
| AC-30 | MP-41 | Pass |
| FR-9 (operational) | MP-39 | Pass (fixed #10) |

Full detail: [`docs/test-cases/monster-pack-and-share.md`](../test-cases/monster-pack-and-share.md).

## Issues

| Issue | Severity | Summary | Status at `4e1b114` |
|---|---|---|---|
| #9 | major | A crashed pack expansion strands the paid style forever | **Verified fixed** (comment) |
| #11 | major | Two simultaneous duplicate webhooks record the sale twice | **Verified fixed** (comment) |
| #10 | minor | The expand-packs cron had no `maxDuration` | **Verified fixed** (comment) |
| #12 | minor | `check:secrets` omitted the new secrets | **Verified fixed** (comment) |
| #5 | minor | Increment 1 FR-12 synchronous generation | **Open, deferred** — Analyst |

No issue was closed (merging does that). The four increment 2 issues each received a verification comment with the commit, test names and suite result.

## Fix review

- **Claims (`lib/expand.ts`)** — per-style `claim:<jobId>:<styleId>` keys replace the permanent set. The TTL is `2 × GENERATION_TIMEOUT_MS + 30 s`; `isReclaimable()` accepts `pending`, and `generating` with no `startedAt` or one older than `GENERATION_TIMEOUT_MS`. The claim is released with a token-safe `deleteIfValue` on every failure path; on success it is intentionally retained until the TTL so a late racing caller cannot regenerate a ready style. Storage failures mark the asset failed `transient`; a failed ready-write releases the claim. This is the right shape and the new TTL/legacy tests cover it.
- **Webhook (`lib/webhooks.ts`)** — `setIfAbsent("webhook:<eventId>", "processing", 7d)` happens before `loadJob`, `saveJob`, `recordSale` and `setSessionStatus`; a losing concurrent delivery returns 200 `ignored: duplicate`. On any thrown processing error the claim is deleted if it is still `"processing"`, so a provider retry can still succeed. The job/sale side effects are unchanged for a single delivery.
- **Cron (`app/api/cron/expand-packs/route.ts`)** — `maxDuration = 420`; `MAX_EXPANSIONS_PER_RUN = 3` (3 × 2 × 60 s + overhead); a killed run is recoverable through the claim TTL. The README explains the plan-duration trade-off.
- **Secret scan (`scripts/check-secrets.mjs`)** — the two new names are in `secretNames`; the bundle test asserts the list stays in sync.

**Residual, non-blocking**
- If `recordSale()` throws after `saveJob()` succeeds, the catch deletes the event claim and rethrows; a provider retry sees a paid job with `product` set and will not record the sale again. The payment and download are correct, but that sale can be missing from the admin view. The admin is explicitly a convenience view; a future change could record the sale idempotently by event/session.
- The admin cookie still lacks `Secure`; the spec requires HttpOnly/SameSite/signature/TTL, and the cookie is only sent over the production HTTPS origin. Set `Secure` before launch if the cookie is reused outside a secure context.
- `maxDuration = 420` may exceed a low Vercel plan cap; the README tells the operator to lower `GENERATION_TIMEOUT_MS` or `MAX_EXPANSIONS_PER_RUN`. The generate route's 120 s budget also does not include the 5 s Turnstile verification; a plan/config review is advisable when Turnstile is enforced.
- The share composite reads source dimensions before applying EXIF orientation; portrait/landscape without EXIF are tested, rotated phone photos are not.
- Increment 1 and increment 2 both use AC-1..AC-30; test names collide across specs. A spec prefix would remove the ambiguity.
- The real Turnstile verifier is exercised by the production test-key probe, not by the automated suite (the Playwright server runs it off by design); the mocked route tests cover reject/pass/timeout semantics.

## Spec issues

1. **AC-1..AC-30 are reused by both specs.** Test names alone no longer identify the criterion; prefix the increment 2 ACs (or test names) in the next revision.
2. **AC-10/FR-9 now have a recovery contract in the code** (claim TTL, stale `generating`), but the spec does not state it. Add the reclaim timeout/claim semantics so future changes cannot regress it.
3. **AC-8/FR-25 now enforce concurrent idempotency**, but the spec only describes duplicate delivery generically. State "including simultaneous deliveries".
4. **AC-29's `check:secrets` list is now in sync**; require the script and the bundle test to share the list (or update both together) in the spec.
5. **FR-9's "bounded to a small number of styles per run"** is now 3 + `maxDuration = 420`; put the time budget in the spec so the next provider timeout change is checked against it.
6. **AC-23's generation-count rule** (attempts vs successes; previews vs pack extras) is still implicit; the admin view is a convenience, but the counting rule should be stated.
7. **AC-28's axe states** (logged-out admin vs authenticated, forged vs unlocked success) are still implicit; define the coverage.
8. **Increment 1 #5 (FR-12)** remains open: the preview path is synchronous; the pack expand route is bounded separately. The Analyst still needs to decide whether to implement polling or amend the spec.

## Flaky tests

None. The retest ran the full suite once (131/131), the e2e suite once (32 passed / 4 skips) and Lighthouse once (2/2). The new TTL-claim test waits 1.2 s for a 1 s claim; it passed consistently.

## Next step

PASS. Hand off to the Analyst with:

- Branch `feature/monster-pack-and-share`, implementation `4e1b114`, retest test/docs `9c327cc` + this commit.
- All 30 increment 2 ACs pass; increment 1 regression passes; full gate green.
- Only **#5** is open (increment 1, minor, deferred); the Analyst should decide whether to implement the async FR-12 contract or amend the spec.
- The residual notes above (recordSale on a transient failure, admin cookie `Secure`, plan `maxDuration`, EXIF-rotated shares, AC naming) are backlog/hardening, not blockers.
