# Spec: Go-live hardening (increment 3)

- **Branch:** `feature/go-live-hardening`
- **Status:** implemented in this branch; QA verdict PASS (see `docs/test-reports/go-live-hardening.md`).
  Amended after QA: demo mode requires a mock payment provider (FR-1/FR-3), the Gemini probe
  must receive an image part (FR-4/FR-5), the Upstash request timeout (FR-8), which routes map
  `StorageError` (FR-7), `NEXT_PUBLIC_SITE_URL` readiness (FR-2), the flag-with-real-provider
  combination (G3-AC-3/4) and the `STRIPE_PRICE_*` note (FR-4).
- **Builds on:** increments 1 (#8) and 2 (#13), both merged
- **Why now:** the code sells a product it cannot yet produce. Every provider is a mock, and
  the moment the repository is deployed to production with the current defaults, a visitor
  could "buy" a colour-graded copy of their own photo — or worse, the app could run with
  disk storage on a read-only serverless filesystem and lose paid images. This increment
  makes that impossible to do by accident and gives the owner one command to prove the real
  providers work the moment the keys exist.

## Context

The owner has no Stripe, Gemini or Turnstile key yet, so the team cannot test the real
paths. Two risks follow from that:

1. **Silent mock in production.** `PAYMENT_PROVIDER=mock` still creates a checkout page and
   "unlocks" downloads; `IMAGE_PROVIDER=mock` produces a tinted copy. A deploy with the
   example env file looks like a working shop while delivering nothing of value.
2. **Untested production drivers.** `lib/storage/vercel-blob.ts` and `lib/kv/upstash.ts`
   have never spoken to a real service. Their request shapes, error handling and timeouts
   are unverified, and they are the two components that decide whether a paid photo exists
   after 48 hours.

This increment closes both gaps without needing keys, plus three hardening items QA found.

## Scope

### In scope

- Production safety guard: mock providers and disk drivers are refused in production unless
  the owner explicitly opts in for a demo deploy, with a health endpoint that reports
  readiness without leaking configuration values.
- `npm run verify:providers`: one command that checks each configured external service with
  a real call, prints a pass/fail table and never prints a secret.
- Integration tests for the Blob and Upstash drivers against a local HTTP stub, covering
  success, 4xx and timeout paths and the atomic operations the money path depends on.
- Hardening: idempotent sale recording per session, `Secure` admin cookie, EXIF-rotated
  share composites.
- New criteria are numbered `G3-AC-n` from the start (the increment 1/2 `AC-n` collision).

### Out of scope

- Switching to real providers (owner supplies keys), the actual deployment, the domain.
- The async generation contract (#5) — still a documented decision, its own future work.
- Any new user-facing feature; the site must look and behave exactly as it does today.

## Functional requirements

- **FR-1** — `lib/config-check.ts` exposes `assertProductionConfig()`: in production (as
  reported by the runtime, not by an env var the client can set) it refuses to operate when
  `PAYMENT_PROVIDER=mock`, `IMAGE_PROVIDER=mock`, `STORAGE_DRIVER=local` or
  `KV_DRIVER=local`, unless `ALLOW_MOCK_PROVIDERS=true` **and** `PAYMENT_PROVIDER=mock` are
  both set for a deliberate demo deploy. With a real payment provider the flag changes
  nothing: mock image and local drivers stay refused. Refusal means `/api/generate` and
  `/api/checkout` answer 503 `misconfigured`, and the reason is logged once at start-up.
- **FR-2** — `GET /api/health` returns 200 with `{ ready: true, mode: "live" | "demo" }` when
  the configuration is acceptable, and 503 with `{ ready: false, problems: string[] }` when it
  is not. It lists driver names and missing variable names only — never values, never secrets.
  `NEXT_PUBLIC_SITE_URL` is **not** part of readiness in this increment (it is checked by the
  launch checklist); making it a required production variable is backlog.
- **FR-3** — When running as a demo (`ALLOW_MOCK_PROVIDERS=true` **and**
  `PAYMENT_PROVIDER=mock`) the site shows a small, unmistakable "Demo — no real payment" label
  in the header, on the paywall and on the success page, so a link can never be mistaken for a
  shop that charges. The label is production-only and never appears on a live deployment.
- **FR-4** — `npm run verify:providers` checks, per service, only what is configured:
  Gemini (one short image call with a fixed tiny prompt, **which must return a non-empty
  inline image part** — a 200 with text only, no candidate or a blocked response is a FAIL),
  Stripe (create and expire a test Checkout Session with the configured price id), Vercel Blob
  (write, read, delete a probe object), Upstash (set, get, delete a probe key) and Turnstile
  (siteverify with a dummy token). Each line prints `PASS`, `FAIL` or `SKIP (not configured)`
  with a one-line reason. The Stripe price ids are used by the verifier only: the app's
  Checkout builds inline `price_data` from `PRICE_*_CENTS`, which is why changing the price
  needs no Stripe dashboard step. Switching Checkout to the configured price ids is backlog.
- **FR-5** — The verifier never prints a key, token or secret, including in error messages,
  stack traces or the `--verbose` output; it exits non-zero if any configured service fails
  and zero when everything configured passes (skips are not failures).
- **FR-6** — The verifier's HTTP layer is injectable so the automated suite can exercise the
  pass/fail/redaction logic without network access. A `--dry-run` flag validates env shape
  only, calls nothing, and still redacts.
- **FR-7** — The Blob driver is covered by integration tests against a local stub server:
  `put` sends the expected path, method, headers and body; `get` returns the bytes; `delete`
  is issued; a 4xx becomes a typed error; a hanging request times out instead of blocking a
  function. `/api/generate` maps that typed error to a friendly 503; the other routes
  (`/api/preview`, `/api/download`, `/api/share`, `/api/jobs/:id/expand`) still answer an
  untyped 500 on a storage failure — documented backlog, not a blocker.
- **FR-8** — The Upstash driver is covered the same way for `get`, `set` (with TTL), `incr`,
  set add/members/remove and the atomic conditional-delete used by pack claims, including the
  case where the conditional delete loses the race and must not remove a newer claim. Every
  request is bounded by a configurable timeout (default 10 s) and surfaces a typed `KVError`
  (timeout, network, HTTP) instead of hanging. Route-level mapping of `KVError` to 503 is
  backlog, like the Blob case above.
- **FR-9** — Recording a sale is idempotent per payment session: replaying the webhook or a
  retry after a partial failure counts the revenue once. The admin numbers must not drift.
- **FR-10** — The admin session cookie sets `Secure` when the configured site URL is HTTPS,
  and keeps `HttpOnly` and `SameSite=Lax`.
- **FR-11** — The share composite applies EXIF orientation to both source images before
  measuring them, so a phone photo stored landscape-with-rotation renders upright and the
  composite is not stretched or swapped.
- **FR-12** — README and `docs/launch-checklist.md` describe the guard, the health endpoint,
  the verifier command and the demo-mode label; `.env.example` gains `ALLOW_MOCK_PROVIDERS`
  and keeps every name the code reads.

## Acceptance criteria

Criteria are prefixed `G3-AC-n`; automated test titles must use that prefix. Everything runs
offline with the mock providers and the stub servers.

- **G3-AC-1** — Given production with `PAYMENT_PROVIDER=mock`, when `/api/checkout` is
  called, then it answers 503 `misconfigured`, no session is created and the response, logs
  and page contain no secret values.
- **G3-AC-2** — Given production with `IMAGE_PROVIDER=mock` or a `local` storage/KV driver,
  when `/api/generate` is called, then it answers 503 `misconfigured` and nothing is written
  to storage.
- **G3-AC-3** — Given production with `ALLOW_MOCK_PROVIDERS=true` **and**
  `PAYMENT_PROVIDER=mock`, when the pages render, then generation and checkout work and the
  "Demo — no real payment" label appears in the header, on the paywall and on the success page.
  Given the same flag with a real payment provider, the label never appears, `mode` is `live`,
  and mock image or local drivers are still refused.
- **G3-AC-4** — Given production with real providers and real drivers configured (fake but
  well-formed values, no network) and any value of `ALLOW_MOCK_PROVIDERS`, then `/api/health`
  returns 200 `{ ready: true, mode: "live" }` and never echoes a key.
- **G3-AC-5** — Given a missing required variable in production, `/api/health` returns 503 and
  names the missing variable, without printing any other value.
- **G3-AC-6** — The verifier with nothing configured exits 0, prints `SKIP` for every
  service and calls nothing.
- **G3-AC-7** — The verifier with all services configured against the stub HTTP layer exits
  0 and prints `PASS` for each; with one service failing it exits non-zero and prints `FAIL`
  only for that service.
- **G3-AC-8** — In every verifier path (pass, fail, verbose, crash), the fake secrets used by
  the test do not appear in the output.
- **G3-AC-9** — Blob driver against the stub: the probe flow issues the expected requests and
  returns the written bytes; a 403 becomes a typed error; a hanging response hits the timeout
  and rejects instead of hanging the test.
- **G3-AC-10** — Upstash driver against the stub: `set` sends the TTL, `incr` returns the
  incremented value, the conditional delete removes a matching claim, and a losing
  conditional delete leaves the newer claim intact.
- **G3-AC-11** — Two sale records for the same session id count once; two different sessions
  count twice; a webhook retry after a partial failure does not double the revenue.
- **G3-AC-12** — The admin cookie is `Secure` for an HTTPS site URL and not for an HTTP one,
  and stays `HttpOnly` + `SameSite=Lax`.
- **G3-AC-13** — A portrait photo stored with EXIF rotation produces an upright composite
  whose halves are taller than wide; the landscape fixture still produces a landscape
  composite.
- **G3-AC-14** — The full increment 1 and 2 suites still pass, and Lighthouse/a11y on `/`,
  `/create` and `/success` stay at the previous budget.
- **G3-AC-15** — Every `process.env` name read by the code appears in `.env.example`, and the
  secret scan still finds nothing in the client bundle.

## Assumptions (please confirm in review)

1. **Production is detected from the runtime**, not from a variable: `NODE_ENV ===
   "production"` as set by `next build`/`next start` on the host.
2. **A demo deploy is allowed but labelled.** `ALLOW_MOCK_PROVIDERS=true` keeps the current
   mock behaviour and adds the demo label; it is meant for showing the site on a phone before
   the keys exist, never for selling.
3. **The verifier is a manual gate**, not part of CI: it needs live credentials. CI keeps
   running the offline suites.
4. **`GENERATION_TIMEOUT_MS` and plan duration are unchanged**: the preview request stays
   synchronous; #5 remains open with its documented deployment requirement.
5. **No new dependency** for the verifier, the stub servers or the config check if the
   standard library and the existing test stack can do it.
6. **Health endpoint is public** but returns only readiness, mode and variable names.

## Technical notes

### Where the logic goes

```
lib/config-check.ts        assertProductionConfig, describeConfig, missing variables
app/api/health/route.ts    readiness JSON
lib/demo.ts                demo-mode flag (server) + label data
components/DemoBadge.tsx   the visible label
scripts/verify-providers.mjs  (or .ts run through tsx/vitest) pass/fail table
tests/providers-blob.test.ts, tests/providers-upstash.test.ts  stub-server integration
tests/support/stub-http.ts    tiny local HTTP server used by those tests
lib/stats.ts               recordSale made idempotent by session id
lib/admin.ts               Secure cookie when the site URL is https
lib/share.ts               EXIF orientation before measuring
```

### Rules

- The config check must be one pure function over an env snapshot, so it is unit-testable
  without touching the real process env (`describeConfig(env)`), with a thin wrapper that
  reads `process.env` at the call sites.
- Refusal happens **before** any provider call and before any storage write.
- The verifier prints variable **names** and HTTP status codes; on an HTTP error it prints the
  status and the first line of the provider's message after redaction.
- The stub servers listen on ephemeral ports and are torn down per test; they never touch
  ports 3000, 3101 or 4545.

### Commands

```
npm run lint && npm run build && npm test && npm run check:secrets && npm run e2e
npm run verify:providers          # manual, needs keys; --dry-run validates shape only
```

### Ordered task list (vertical slices)

1. **Config check + health** — pure `describeConfig`, production guard on generate/checkout,
   `/api/health`, tests. Verify: G3-AC-1, G3-AC-2, G3-AC-4, G3-AC-5.
2. **Demo mode label** — `ALLOW_MOCK_PROVIDERS`, badge in header/paywall/success, tests.
   Verify: G3-AC-3.
3. **Verifier** — injectable HTTP layer, per-service probes, redaction, `--dry-run`, npm
   script. Verify: G3-AC-6, G3-AC-7, G3-AC-8.
4. **Blob driver tests** — stub server, success/4xx/timeout. Verify: G3-AC-9.
5. **Upstash driver tests** — stub server, TTL/incr/conditional delete race. Verify:
   G3-AC-10.
6. **Sale idempotency** — record by session id, migrate the counter reads, tests. Verify:
   G3-AC-11.
7. **Cookie + share orientation** — `Secure` cookie rule, EXIF before measuring, tests.
   Verify: G3-AC-12, G3-AC-13.
8. **Docs and quality pass** — README, launch checklist cross-links, `.env.example`, full
   regression, Lighthouse/a11y, secret scan. Verify: G3-AC-14, G3-AC-15.

### Residual hardening (not blockers)

- Only `/api/generate` maps `StorageError` to 503; `/api/preview`, `/api/download`,
  `/api/share` and `/api/jobs/:id/expand` still answer an untyped 500 on a storage failure, and
  no route maps `KVError`. Fine for launch, backlog for the next pass.
- `NEXT_PUBLIC_SITE_URL` is not a readiness requirement, so health can be green while the
  watermark, canonical URLs and the `Secure` cookie fall back to localhost. The launch
  checklist is the guard; making it required is backlog.
- The demo badge is production-only by design; in development with the flag the mode can read
  `demo` while the badge is absent.
- The Upstash stub does not exercise `setIfAbsent` (webhook claim) or the rolling-window
  script; the local driver covers those semantics.
- Lighthouse covers `/` and `/create` only; `/success` is axe-covered.
- The `Secure` cookie rule is unit-tested; the e2e server is plain HTTP.
- Checkout uses inline `price_data`; the Stripe price ids are verifier-only. Switching to
  price ids is backlog and would require a dashboard step per price change.
- #5 (synchronous preview generation) is unchanged by this increment.

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Guard blocks a legitimate demo deploy | Medium | Explicit opt-in flag, visible label, documented in the checklist. |
| Stub tests certify a wrong request shape | Medium | Assert on method, path, auth header and body JSON exactly as the providers' REST docs specify. |
| Sale-idempotency change loses existing counts | High | New per-session marker next to the existing counter, migration-free: the marker gates the increment. |
| Verifier leaks a key in an error message | High | Central redaction applied to every printed string; dedicated test with fake secrets. |
| Share orientation change breaks the tested layouts | Low | Portrait/landscape fixtures stay in the suite; add one EXIF-rotated fixture. |
