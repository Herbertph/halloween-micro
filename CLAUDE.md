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
Lighthouse budget (opt-in): `RUN_LIGHTHOUSE=1 npx playwright test e2e/lighthouse.spec.ts`.

## Structure

```
app/                    routes: /, /create, /success, /privacy, /terms,
                        /checkout/mock, /api/generate, /api/jobs/[id],
                        /api/preview/[id], /api/checkout,
                        /api/webhooks/payments, /api/download, /api/cron/cleanup
components/             landing chrome, upload/paywall form, success poller
config/styles.ts        style ids, names, descriptions, prompts (server only)
lib/providers/          image (mock, gemini) and payments (mock, stripe) adapters
lib/storage/            storage interface + local disk and Vercel Blob drivers
lib/kv/                 kv interface + local disk and Upstash drivers
lib/jobs.ts             pure job state machine, transitions, expiry
lib/job-service.ts      persistence, lazy retention, cleanup, public job view
lib/images.ts           EXIF strip, resize, watermark, featureless detection
lib/generation.ts       timeout + one-retry generation boundary
lib/limits.ts           per-IP rolling window and global daily cap
lib/tokens.ts           HMAC download tokens (15 minutes)
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

- **Secrets stay server-side.** Only `NEXT_PUBLIC_*` variables may reach the browser. `config/styles.ts` and `lib/env.ts` are server-only; prompts are never serialised, logged or returned.
- **The full-resolution object never leaks.** It has a random private key, is read only by `/api/download`, and that route requires a paid job plus a valid 15-minute HMAC token. Keep preview and full-res as separate objects.
- **Every `process.env` read must be listed in `.env.example`.** `tests/unit/env.test.ts` enforces it.
- **Job transitions are one-way** and validated in `lib/jobs.ts`. Do not write statuses directly.
- **Tests own their ports and data.** Unit tests use a per-file temp `DATA_DIR`; Playwright serves on `E2E_PORT` (default 3101) and never touches 4545.
- **Controllers stay thin.** Validation lives in `lib/api.ts`, orchestration in `lib/*-service` or route handlers, pure logic in `lib/`.
- **Mock providers are the default** so the flow is demoable offline. Stripe/Gemini ship wired but unverified; do not exercise them in CI.

## Definition of done

- Every acceptance criterion in the spec is covered by at least one test.
- Build, unit tests and end-to-end tests all pass.
- No unrelated changes in the diff.
