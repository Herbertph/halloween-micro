# Test report — Monster Pack, share image, Turnstile and admin (increment 2)

- **Mode:** full test run (increment 2) with the increment 1 regression
- **Branch:** `feature/monster-pack-and-share`
- **Commit:** `0fcd9cf` (implementation `0335fc1` + `26a965d`; acceptance tests `e1e194f`)
- **Spec:** [`docs/specs/monster-pack-and-share.md`](../specs/monster-pack-and-share.md)
- **Test cases:** [`docs/test-cases/monster-pack-and-share.md`](../test-cases/monster-pack-and-share.md)
- **Date:** 2026-10-30
- **Environment:** Windows 11, Node 22.12.0, npm 11.0.0; mock image/payment providers, disk storage/KV; Playwright iPhone 13 (Chromium) and Pixel 7; Lighthouse 12 on the iPhone project. A separate production probe ran Cloudflare's published Turnstile test keys.

## Verdict

**FAIL**

The core increment 2 flows work: pack composition and checkout, the chosen-ready/three-pending asset model, the client + cron expansion path on the happy path, per-asset downloads, the share composite, Turnstile off-by-default and the test-key widget, and the admin view. **Two major defects** remain and **three acceptance criteria fail**:

- **AC-8** — two simultaneous deliveries of the same webhook record the sale twice (major, #11).
- **AC-10** — a crash during pack expansion permanently strands a style: a `generating` asset or a stale claim is never reclaimed (major, #9).
- **AC-29** — `npm run check:secrets` does not scan `TURNSTILE_SECRET_KEY` or `ADMIN_PASSWORD` (minor, #12).
- The expand-packs cron has no `maxDuration` while expanding up to four assets per request (minor, #10), which compounds #9.

The full increment 1 suite and journeys still pass; the four failing tests are the new increment 2 cases.

## Run results

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **Pass**, no warnings/errors |
| Build | `npm run build` | **Pass** (17 routes, no type errors) |
| Unit / route / component | `npm test` | **Fail** — 31 files, 130 tests: 126 passed, 4 failed |
| E2E (increment 1 + 2) | `npm run e2e` | **Pass** — 36 tests: 32 passed, 4 skipped (Lighthouse opt-in) |
| Lighthouse | `RUN_LIGHTHOUSE=1 npx playwright test e2e/lighthouse.spec.ts --project=iphone` | **Pass** — 2/2 (`/` and `/create`) |
| Secret scan | `npm run check:secrets` | Pass (but see #12: it does not scan the new secrets) |
| Turnstile production probe | manual, production build with Cloudflare test keys | **Pass** — widget/token present, preview generated, no CSP errors |

The four failures are deterministic and reproduced on re-run (the pack tests and the bundle test were run twice). **No flaky tests** were observed.

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
| AC-8 | MP-11, MP-12 | **Fail (#11)** |
| AC-9 | MP-13, MP-14 | Pass |
| AC-10 | MP-15, MP-16, MP-17 | **Fail (#9)** |
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
| AC-29 | MP-36 | **Fail (#12)** |
| AC-30 | MP-41 | Pass |
| FR-9 (operational) | MP-39 | **Fail (#10)** |

Full detail: [`docs/test-cases/monster-pack-and-share.md`](../test-cases/monster-pack-and-share.md).

## Issues opened

| Issue | Severity | Summary |
|---|---|---|
| #9 | major | A crashed pack expansion strands the paid style forever (no stale claim or `generating` recovery) |
| #11 | major | Two simultaneous deliveries of the same payment webhook record the sale twice |
| #10 | minor | The expand-packs cron has no `maxDuration` while expanding up to four assets per request |
| #12 | minor | `check:secrets` does not scan `TURNSTILE_SECRET_KEY` or `ADMIN_PASSWORD` |

No duplicates existed. No issue was commented on, closed or edited.

## Evidence and root causes

### #9 — crashed pack expansion (AC-10)
`expandJob()` filters candidates to `pending`; an asset left `generating` by a killed function is never a candidate. The claim is a member of a permanent set (`claims:<jobId>`) with no TTL; a crash after the claim but before the status update leaves a `pending` asset that `setAddIfAbsent` will never claim again. `updateAsset()` also does not release the claim when the final ready/failed write fails. The buyer sees "Haunting this style…" forever with no retry button. Tests:

```
FAIL tests/routes/pack.test.ts > pack purchase > AC-10: the sweeper recovers a pack asset left generating by a crashed worker
FAIL tests/routes/pack.test.ts > pack purchase > AC-10: a stale claim left by a crash does not strand a pending style
```

### #11 — concurrent duplicate webhook (AC-8/FR-25)
`handlePaymentWebhook()` checks `webhook:<eventId>` at line 41 and only writes the marker after `recordSale()` at line 80. Two simultaneous deliveries both pass the check and both record the sale; the job is still unlocked once and no extra provider call happens, but `salesPack` becomes 2 and revenue 1798. Test:

```
FAIL tests/routes/pack.test.ts > pack purchase > AC-8: two simultaneous deliveries of the same event record one sale
AssertionError: expected 2 to be 1
```

### #10 — cron duration (FR-9)
The client expand route sets `maxDuration = 120`; the cron route has no `maxDuration` and `sweepPacks()` can expand `MAX_EXPANSIONS_PER_RUN = 4` assets in one request, each with up to 2 × 60 s. A serverless run can be killed mid-generation, which triggers #9. Static evidence only; no local route test can exercise the platform limit.

### #12 — secret scan gap (AC-29)
`scripts/check-secrets.mjs` `secretNames` does not include `TURNSTILE_SECRET_KEY` or `ADMIN_PASSWORD`; the command can report clean without scanning them. The unit bundle test scans fake values for both, so no actual leak is present. Test added:

```
FAIL tests/unit/bundle.test.ts > client bundle > AC-29: the check:secrets script scans the increment 2 secrets
```

## Code review (increment 2)

**Correctness**
- Pack composition is a pure function and matches the spec for all five chosen styles; the chosen style is first and four distinct styles are always returned.
- The asset model normalises increment 1 jobs and `purgeJobObjects()` collects every asset key; retention covers pack assets (tested).
- The chosen asset is ready from the preview; extras are created `pending` at checkout and only generated after a paid webhook. Before payment no extra preview/download/full-res is reachable (tested, including the chosen asset endpoint).
- Pack concurrency on the normal path is sound: atomic per-style claim + a short per-job edit lock; the three concurrent-expand test and cron+client test pass with exactly three calls.
- The crash paths are the exception: stale claims and `generating` assets are not reclaimable (#9).
- The webhook is signature-verified, uses the session-record product/amount, and is sequentially idempotent; concurrent delivery double-counts the sale (#11).
- Per-asset download tokens bind job + key + style; share tokens use a separate HMAC context and cannot be replayed as download tokens. Share URLs are paid-only and expire (tested).
- Share layout scales both halves to the same height and caps the long edge at 1600; the synthetic portrait/landscape test confirms both halves are filled. The footer host affects the output.
- Turnstile enforcement requires the flag **and** both keys, runs before quota/provider work, and returns typed `captcha_failed`/`captcha_timeout`; the production CSP allows the widget (script + frame) and the test-key probe succeeded.
- Admin login is timing-safe, rate-limited per IP, and the cookie is HttpOnly/SameSite=Lax/signed with a distinct context/8 h. The signed-in view shows only aggregates and no job ids/images.

**Security**
- The CSP still allows `'unsafe-eval'` for the HEIC decoder (increment 1, documented) and now adds `https://challenges.cloudflare.com` to `script-src`/`frame-src`; the security-header test passes.
- `TURNSTILE_SECRET_KEY`, `ADMIN_PASSWORD`, prompts and download/share secrets are not in `.next/static` (bundle test with fake values).
- The admin cookie has no `Secure` attribute; the spec does not require it, but it should be set on the HTTPS-only deployment. The cookie is HttpOnly/SameSite, so the risk is limited.
- The admin/login and share endpoints have no CSRF token; the admin cookie is SameSite=Lax, and the share endpoint is a signed bearer URL. Acceptable for this scope, worth a note.
- `x-forwarded-for` remains the rate-limit key; the README documents the trusted-proxy assumption.

**Performance / operations**
- The cron route has no `maxDuration` and expands up to four assets per invocation (#10). The cleanup cron is unchanged and can also be long with many jobs.
- The success page's expansion loop is client-driven and stops when no pending assets remain; a stuck `generating` asset turns it into a 300 ms retry loop (same as #9).
- The generate route's `maxDuration = 120` covers two 60 s attempts but not the 5 s Turnstile verification that now runs before them; a verifier timeout plus two slow attempts can exceed the route budget. Raise `maxDuration` or lower `GENERATION_TIMEOUT_MS` when Turnstile is enforced.
- Share composites are built on demand and not cached; acceptable at this volume.

**Test quality**
- `e2e/pack.spec.ts` does not assert the initial chosen-ready/extras-pending state or distinct bytes; the route test now covers the initial state and distinct downloads.
- AC-13's footer was only checked for non-flat pixels; MP-21 now proves the site host changes the composite.
- AC-14's layout maths was tested but not the actual output; MP-23 now builds a portrait/landscape composite and checks both halves.
- AC-18/19/21 use a mocked verifier in the route tests; the real Turnstile verifier is only exercised by the manual test-key probe. Consider a fetch-level unit test for the 5 s timeout path.
- The axe test covers `/success` with a forged session and `/admin` before login; an authenticated admin / unlocked success axe pass would be a useful addition.
- AC-23's admin test seeds the day counters manually; a route-level "generate, checkout, webhook" integration test would catch counter wiring regressions.
- Increment 1 and increment 2 both use AC-1..AC-30, so test names collide. Adding a spec prefix (for example `M2-AC-12`) would remove the ambiguity.

## Spec issues

1. **AC numbering is reused between specs.** Both increment 1 and increment 2 define AC-1..AC-30; a test name alone no longer identifies the criterion. Prefix the increment 2 ACs (or the test names) in the next revision.
2. **AC-10/FR-9 do not define crash recovery.** "Pending assets older than 60 s" does not cover a `generating` asset or a stale claim. The closed-tab risk implies recovery; state the reclaim timeout and claim semantics.
3. **AC-8/FR-25 do not state concurrent idempotency.** Sequential duplicate delivery is covered; the concurrent case must be atomic. Add "including simultaneous deliveries".
4. **AC-29 names `npm run check:secrets` but the script was not extended.** The spec should require the command's secret list to be updated with every new server secret, or the command should read the list from one shared source.
5. **FR-9's "bounded to a small number of styles per run"** has no time/function budget. State whether the cron expands one asset per invocation or sets a platform `maxDuration`.
6. **AC-23's "scripted day"** does not say whether generation attempts include failed attempts and pack extras; the test seeds 5. Clarify the counting rule.
7. **AC-28's axe coverage** does not say which `/admin` and `/success` states are in scope (logged-in/out, locked/unlocked). Define them.
8. **Increment 1 issue #5 (FR-12 synchronous generation)** remains open and is unchanged by this branch; the increment 2 pack expand route has its own 120 s bound, but the preview route still holds the request.

## Flaky tests

None. The four failures reproduced deterministically; the e2e suite and Lighthouse were green.

## Next step

Fix or explicitly defer the open issues, then retest:

- Must fix before merge: **#9** (stale claim/`generating` recovery) and **#11** (atomic webhook idempotency); they fail AC-10 and AC-8.
- Fix with the same change: **#10** (cron duration bound) and **#12** (secret-scan list).
- Increment 1's **#5** remains a deferred minor for the Analyst; no increment 2 AC depends on it.
