# halloween-micro

Haunted Portrait — MVP Requirements

Built with a multi-agent pipeline: requirements analyst → developer → tester → pull request. A human reviews and merges every PR.

## Stack

- Next.js (App Router) + React 19 + TypeScript on Vercel.
- Tailwind CSS; no component library. Self-hosted fonts via Fontsource.
- `sharp` for decoding, EXIF stripping, resizing, watermarking and the mock provider.
- `heic2any` (browser only, dynamically imported) for HEIC conversion.
- Vitest + Testing Library for unit, route-handler and component tests.
- Playwright (+ axe-core) for end-to-end and accessibility tests.
- Storage/KV behind small interfaces: disk drivers for dev/tests, Vercel Blob + Upstash in production.

## Commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies (Node 22+). |
| `npm run dev` | Dev server at http://localhost:3000 (mock providers by default). |
| `npm run build` | Production build. |
| `npm start` | Serve the production build. |
| `npm run lint` | ESLint. |
| `npm test` | Vitest unit, route and component tests. |
| `npm run e2e` | Playwright e2e (build first; serves on port 3101, never 4545). |
| `npm run check:secrets` | Scan `.next/static` for secrets/prompt text (after build). |
| `npm run assets` | Regenerate placeholder landing/OG images. |
| `npm run fixtures` | Regenerate test fixtures. |

Full gate: `npm run lint && npm run build && npm test && npm run check:secrets && npm run e2e`.
Lighthouse budget (opt-in, median of 3): `RUN_LIGHTHOUSE=1 npx playwright test e2e/lighthouse.spec.ts --project=iphone`.

## Structure

```
app/                    routes: /, /create, /success, /privacy, /terms, /admin,
                        /checkout/mock, /api/generate, /api/jobs/[id],
                        /api/jobs/[id]/expand, /api/assets/[jobId]/[styleId],
                        /api/preview/[id], /api/checkout, /api/webhooks/payments,
                        /api/download, /api/share, /api/cron/cleanup,
                        /api/cron/expand-packs, /api/admin/login|logout
components/             landing chrome, upload/paywall form, success asset cards,
                        admin login
config/styles.ts        style ids, names, descriptions, prompts (server only)
lib/products.ts         product ids, env prices, pure pack composition
lib/assets.ts           asset normalisation (increment 1 jobs included)
lib/expand.ts           atomic claim + one-asset expansion, cron sweeper
lib/providers/          image (mock, gemini) and payments (mock, stripe) adapters
lib/storage/            storage interface + local disk and Vercel Blob drivers
lib/kv/                 kv interface + local disk and Upstash drivers (atomic ops)
lib/jobs.ts             pure job state machine, transitions, expiry
lib/job-service.ts      persistence, lazy retention, cleanup, public job view
lib/images.ts           EXIF strip, resize, watermark, featureless detection
lib/share.ts            before/after composite layout + rendering
lib/captcha.ts          mock/Turnstile verifiers, enforced only when configured
lib/stats.ts            UTC day counters (previews, generations, sales, revenue)
lib/admin.ts            password check, signed cookie, login rate limit
lib/generation.ts       timeout + retry generation boundary
lib/limits.ts           per-IP rolling window and global daily cap
lib/tokens.ts           HMAC download (per asset) and share tokens
lib/analytics.ts        Plausible events (no-op when unset)
lib/client/image.ts     browser validation, HEIC conversion, 1536 px resize
tests/                  unit, route, component tests and fixtures
e2e/                    Playwright journeys, axe checks, Lighthouse budget
scripts/                asset/fixture generators and the bundle secret scan
```

- `docs/specs/`: feature specs written by the requirements analyst
- `docs/test-cases/`: test cases (TC-n, with steps and expected results) written by the tester
- `docs/test-reports/`: test reports written by the tester
- Bugs found in testing are filed as GitHub issues labeled `bug` and `severity: *`. Fix commits reference the issue (`fix: ... (#12)`), and PRs close them with `Fixes #12`.

## Conventions

- Everything in the repository is written in English: code, comments, docs, commit messages, PR descriptions.
- Keep business logic in pure, testable functions, separate from UI code.
- Never render user input as HTML.
- Prefer accessible markup (labels, roles, `aria-*`). End-to-end tests locate elements with `getByRole`, `getByLabel` and `getByText` where possible.
- Name tests after behavior. Acceptance tests start with their criterion ID, for example `AC-2: rejects a blank title`.
- Commits follow Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`.
- Feature branches are named `feature/<slug>`, or keep the branch Claude Code created for a worktree session. Never commit to `main`.

## Project rules

- **Money comes from the server.** The client only names `product` (`single`/`pack`); the price is read from env and the product/amount are stored on the session record. The job records its paid product only in the webhook.
- **Pack extras are post-payment only.** Never generate, preview or store a pending style before the verified webhook. `claimPendingAsset` is atomic in KV; the success page and cron must keep sharing that path, and the chosen style is never regenerated.
- **Download and share tokens use separate HMAC contexts.** Download tokens are bound to job + style + expiry; share tokens are signed under a distinct context and only issued to paid sessions.
- **Turnstile secrets stay server-side.** `TURNSTILE_SITE_KEY` may be passed as a prop, but the secret is never logged, returned or bundled. Enforcement is off unless the flag and both keys are set, and verification happens before quota is consumed.
- **Admin is aggregate-only.** No job ids, photos, storage keys or per-customer data in `/admin`; the cookie is HttpOnly, SameSite=Lax, signed under the admin context and lasts 8 h.
- **Counters and indexes use atomic KV operations.** Never read-modify-write the per-IP window, the daily cap, the cleanup index or an asset claim: `lib/kv` exposes atomic primitives for exactly this reason.
- **Secrets stay server-side.** Only `NEXT_PUBLIC_*` variables may reach the browser. `config/styles.ts` and `lib/env.ts` are server-only; prompts are never serialised, logged or returned.
- **The full-resolution object never leaks.** Every asset has a random private key, is read only by `/api/download` or the paid-owner `/api/assets` route, and the preview is a separate watermarked object.
- **Every `process.env` read must be listed in `.env.example`.** `tests/unit/env.test.ts` enforces it.
- **Job transitions are one-way** and validated in `lib/jobs.ts`. Do not write statuses directly.
- **Tests own their ports and data.** Unit tests use a per-file temp `DATA_DIR`; Playwright serves on `E2E_PORT` (default 3101) and never touches 4545.
- **The CSP allows `'unsafe-eval'` on purpose.** `heic2any`'s WASM worker needs it; keep script origins locked to self + Plausible + Turnstile. The HEIC path has a timeout and a fallback message, so never make the decoder mandatory for the flow.
- **Marketing pages use plain anchors and images.** `/` and the shared chrome intentionally do full-page navigation to keep the static page free of router/image hydration; `@next/next/no-html-link-for-pages` is off for that reason. `experimental.inlineCss` keeps the mobile LCP fast.
- **Controllers stay thin.** Validation lives in `lib/api.ts`, orchestration in `lib/*-service` or route handlers, pure logic in `lib/`.
- **Mock providers are the default** so the flow is demoable offline. Stripe/Gemini ship wired but unverified; do not exercise them in CI.

## Definition of done

- Every acceptance criterion in the spec is covered by at least one test.
- Build, unit tests and end-to-end tests all pass.
- No unrelated changes in the diff.
