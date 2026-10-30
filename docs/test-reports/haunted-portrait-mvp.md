# Test report — Haunted Portrait MVP (increment 1)

- **Mode:** full test run (first QA pass)
- **Branch:** `feature/haunted-portrait-mvp`
- **Commit:** `23e9426`
- **Spec:** [`docs/specs/haunted-portrait-mvp.md`](../specs/haunted-portrait-mvp.md)
- **Test cases:** [`docs/test-cases/haunted-portrait-mvp.md`](../test-cases/haunted-portrait-mvp.md)
- **Date:** 2026-10-30
- **Environment:** Windows 11, Node 22.12.0, npm 11.0.0; mock image/payment providers, disk storage/KV; Playwright iPhone 13 (Chromium) and Pixel 7 profiles; Lighthouse 12 on the iPhone project.

## Verdict

**FAIL**

All 28 acceptance criteria were exercised. 24 pass. Four fail:

- **AC-16 / AC-17** — the per-IP limit and the daily cap are bypassed by parallel requests (critical, #2).
- **AC-20** — concurrent jobs are lost from the cleanup index, so their photos are never deleted after 48 h (critical, #1).
- **AC-25** — keyboard focus on the photo upload control is invisible (major, #3).

Two further spec deviations are open as minor issues: corrupt-image 4xx handling (#4) and the inline generation flow in FR-12 (#5), plus a security-header hardening gap (#6).

The happy path itself is solid: the whole upload → preview → pay → unlock → download journey passes on both mobile viewports, the mock preview is watermarked and ≤512 px, no full-resolution key or URL leaks, the webhook is signed and idempotent, and the 48-hour single-job cleanup works.

## Run results

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | Pass (exit 0; 1 warning: unused `_input` in `lib/providers/payments/mock.ts:43`) |
| Build | `npm run build` | **Pass** (17 routes compiled, no type errors) |
| Unit / route / component | `npm test` | **Fail** — 18 files, 73 tests: 69 passed, 4 failed |
| E2E | `npm run e2e` | **Fail** — 22 tests (2 projects): 18 passed, 2 failed, 2 skipped (Lighthouse is opt-in) |
| Lighthouse | `RUN_LIGHTHOUSE=1 npx playwright test e2e/lighthouse.spec.ts --project=iphone` | **Pass** (perf ≥ 85, a11y ≥ 90) |
| Secret scan | `npm run check:secrets` | **Pass** |

The 4 Vitest failures and the 2 Playwright failures are deterministic: the failing unit/route tests were re-run and failed again, and the focus test fails on both the iPhone and Android projects. **No flaky tests** were observed.

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
| AC-16 | TC-20, TC-31 | **Fail (#2)** |
| AC-17 | TC-21, TC-32 | **Fail (#2)** |
| AC-18 | TC-22 | Pass |
| AC-19 | TC-23 | Pass |
| AC-20 | TC-24, TC-33 | **Fail (#1)** |
| AC-21 | TC-25 | Pass |
| AC-22 | TC-26 | Pass |
| AC-23 | TC-27 | Pass |
| AC-24 | TC-28 | Pass (opt-in) |
| AC-25 | TC-29, TC-30 | **Fail (#3)** |
| AC-26 | TC-34 | Pass (iPhone 13 + Pixel 7) |
| AC-27 | TC-35 | Pass |
| AC-28 | TC-36 | Pass |
| FR-9 | TC-37 | **Fail (#4)** |
| FR-12 | TC-38 | **Fail (#5)** |
| Security headers | TC-39 | **Fail (#6)** |

The full test-case detail, data and automation mapping is in [`docs/test-cases/haunted-portrait-mvp.md`](../test-cases/haunted-portrait-mvp.md).

## Issues opened

| Issue | Severity | Summary |
|---|---|---|
| #1 | critical | Concurrent generations are lost from the cleanup index, so their photos are never deleted after 48 h |
| #2 | critical | Parallel requests bypass the per-IP preview limit and the daily generation cap |
| #3 | major | Keyboard focus on the upload control is invisible |
| #4 | minor | A corrupt image with valid magic bytes returns 500 instead of a typed 4xx |
| #5 | minor | Generation runs inline in `POST /api/generate` instead of as a polled job (FR-12 deviation) |
| #6 | minor | Production responses have no security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy) |

No duplicates existed before filing. No pre-existing issues were commented on or closed. Issues #1–#5 each received one follow-up comment correcting the test-case number quoted in the filed body (the test paths and names were correct); the mapping in the table above and in the test-case document is authoritative.

## Root-cause notes for the developer

### #1 — cleanup index race (AC-20, FR-31)
`addToIndex()` in `lib/job-service.ts` reads `jobs:index`, appends, and writes the whole array. Concurrent `POST /api/generate` calls overwrite each other. Reproduced with 20 concurrent `createJob()` calls: 1 id indexed, 19 jobs invisible to `cleanupExpiredJobs()`. The lost jobs' objects are only purged if a visitor happens to access the job again — which most visitors never do. The same race exists with Upstash (`GET` + `SET`). Suggested direction: make the index append atomic in the KV interface (`RPUSH`/`SADD` for Upstash, an append-only file per job locally), or store a per-job retention key and give the sweeper an enumerable source of truth. Also consider removing ids after purge so the index does not grow forever.

### #2 — limits are not atomic (AC-16, AC-17, FR-29, FR-30)
`consumePreviewAttempt()` and `consumeDailyGeneration()` both do `get` → compute → `set`. Ten parallel calls all see the old value: 10/10 allowed with a limit of 3 (both counters). A burst of uploads from one IP (or one attacker) reaches the image provider for every request, defeating the budget protection that the spec calls a success criterion. Make the KV boundary expose an atomic operation: `INCR` + `EXPIRE` for the daily cap, and a Redis sorted set / Lua script (or a per-attempt key + atomic count) for the rolling 24 h window. The existing sequential tests are good; keep them and add the parallel ones.

### #3 — invisible focus
`components/create/CreateForm.tsx` hides the real file input with `sr-only`. The global `:focus-visible` outline is clipped with the 1 × 1 px input, and the label only styles `hover`. Add `focus-within:` styling to the label (border/ring) or make the input visible on focus. The test asserts that either the input has a perceivable box or the visible label changes.

## Code review (branch vs `main`)

Reviewed the full diff of `feature/haunted-portrait-mvp` against `main` (6 commits, 111 files) with the five-axis checklist.

**Correctness**
- The job state machine is one-way and validated; the public job projection never includes storage keys; the download token is HMAC-signed over job id, key and expiry, and the download route re-checks ownership, payment, expiry and key equality. Good.
- The webhook is signature-verified and idempotent by event id before any state change; unknown jobs/events are ignored with 200. Good.
- The concurrency defects above (#1, #2) are the main correctness findings.
- The corrupt-decode path (#4) violates FR-9's typed-4xx rule.
- `RetentionHours` is read at job creation, so changing the env later does not move existing expiries. That matches the spec (retention from upload) and is fine.

**Architecture**
- The provider boundaries and the style config match the spec's contracts; `server-only` is used on `config/styles.ts` and `lib/env.ts`; prompts are not imported by client modules.
- The KV interface is too weak for the limits and the cleanup index. This is the structural cause of #1 and #2, not two independent bugs. Add atomic primitives instead of trying to lock inside `lib/limits.ts`.
- `lib/webhooks.ts` trusts `job_id` from the signed event metadata without checking that the event's session belongs to that job. With the mock checkout the two are created together, and with Stripe the metadata is written by our own adapter, so it is not exploitable today; still worth binding `sessionId` to `job.sessionId` as defense in depth.
- `app/api/checkout/route.ts` also accepts `awaiting_payment` so a declined visitor can retry. This is a deliberate extension of FR-20; it is required by AC-12 and is documented in a comment.

**Security**
- No secret or prompt text reached `.next/static`; `check:secrets` and the bundle test pass.
- No full-resolution URL or storage key appears before payment. The paid download token embeds the key in its signed payload by design (FR-27); it is not a resolvable storage URL.
- EXIF/GPS is stripped before storage and before the provider; verified at the route level.
- Rate limiting keys on the first `x-forwarded-for` entry. Behind a proxy that does not overwrite the header this is spoofable, and the README does not document the required proxy setting (the spec's risk table asks for this). Add a deployment note.
- No security headers (#6).
- No `npm audit` gate in CI; consider adding one before launch.

**Performance**
- Inline generation (#5) holds the request for the provider duration and is the main production risk once Gemini is enabled.
- The cleanup index is O(n) over every job ever created and is never pruned; a day at the 2000 cap is fine, but it grows without bound if the product runs longer. Prune ids after purge.
- The preview endpoint caches for 60 s; the job/success endpoints use `no-store`. Fine.

**Readability / nits (reported, not filed as issues)**
- `lib/env.ts` exports `DOWNLOAD_TOKEN_TTL_SECONDS` (15 min) which is unused; `lib/tokens.ts` defines `DOWNLOAD_TOKEN_TTL_MS` separately. Keep one source of truth.
- Lint warning: `_input` unused in `lib/providers/payments/mock.ts:43`.
- `e2e/journey.spec.ts:31` comments the expiry-notice block as "AC-28"; the expiry notice is FR-28 and AC-28 is the env-variable check. Fix the comment.
- `/privacy` and `/terms` inherit `alternates.canonical: "/"` from the root layout and thus declare the home page as their canonical. They are also statically rendered, so `NEXT_PUBLIC_SITE_URL` is baked in at build time (observed: `/` used the runtime `127.0.0.1:3200`, `/privacy` used the build-time `localhost:3000`). Give each page its own canonical and make sure the production build sets the site URL.
- `CreateForm.tsx` is 400+ lines; it is cohesive today, but if the inline-generation flow (#5) becomes polling, extract the polling/checkout state into a hook rather than growing it further.

## Spec issues

1. **FR-12 contradicts the implementation and has no acceptance criterion.** The spec requires 202 *while generating* plus client polling; the code returns 202 only after generation and the client never polls. AC-26 and AC-19 still pass with the fast mock. This needs a decision: implement FR-12 (and add an AC), or amend the spec to the synchronous design and set a serverless-safe `maxDuration`. Filed as #5.
2. **AC-25 "visible focus" has no measurable definition.** I used the standard interpretation: the focused control must either have a perceivable box on screen or its visible wrapper must change on focus. The file input fails that; the rest of the controls pass. Worth putting that definition in the spec.
3. **AC-16 / AC-17 do not say whether concurrent requests count.** Read sequentially they pass; read as "the limit protects the budget", they fail. I have treated the FR-29/FR-30 intent as authoritative. Clarify in the spec.
4. **FR-27 says an expired or deleted token returns 410 "with a clear message".** The deleted-object case returns a human message; the expired-token case returns only `{"error":"token_expired"}`. Decide whether a machine code is enough.
5. **AC-27's test is only as strong as the environment that runs it.** The bundle test scans for secret *values* present in the test process (and only checks prompt text when they are absent). A CI run without secret values would not detect a hard-coded default secret. Running `check:secrets` with representative fake values in CI closes the gap.
6. **Assumption 8 mentions a "countdown"** but the feature is a static server-rendered banner; the spec's FR-2 wording is the one implemented. No action needed beyond wording.

## Flaky tests

None. The failures above reproduced on re-run. The full suite was run once for the final numbers; the failing unit/route tests were re-run once to rule out flakiness, and the focus e2e test failed on both viewport projects.

## Next step

Fix or explicitly defer the open issues, then send the branch back for a retest:

- Must fix before merge: **#1**, **#2**, **#3**.
- Decide before launch: **#4**, **#5**, **#6** (minor; #5 in particular before `IMAGE_PROVIDER=gemini` is enabled).
