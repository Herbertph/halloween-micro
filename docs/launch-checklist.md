# Launch checklist — Haunted Portrait

Everything that stands between this repository and a site that takes real money. Split in
two: what only the owner can do (accounts, keys, domain, content) and what the team does
around it. Nothing here needs a terminal on the owner's side.

Last updated: 2026-10-30.

## 1. Owner: accounts and keys

Do these in order; each one produces values that go into the Vercel environment settings.

### 1.1 Stripe (money)

1. Create/activate the Stripe account (business details, bank account). Test mode works
   immediately; live mode needs the account activated.
2. In **Product catalogue**, create two one-time prices:
   - `Haunted Portrait — single`, USD 4.99 → copy the **price id** (`price_...`).
   - `Haunted Portrait — Monster Pack`, USD 8.99 → copy the **price id**.
3. In **Developers → API keys**, copy the **secret key** (`sk_test_...` or `sk_live_...`).
4. In **Developers → Webhooks**, add an endpoint `https://<your-domain>/api/webhooks/payments`
   with the event `checkout.session.completed`; copy the **signing secret** (`whsec_...`).
5. In **Settings → Payments**, confirm Apple Pay / Google Pay are enabled for Checkout.
6. Set the receipt email so buyers get a Stripe receipt (Checkout collects the email).

### 1.2 Gemini image model (the actual portrait)

1. Create the key in Google AI Studio (`GEMINI_API_KEY`).
2. Set a **billing cap** on the project: one preview + up to three pack images per sale, so
   the cap should be roughly `DAILY_GENERATION_CAP × $0.04 × 2`.
3. Copy the exact image-model id shown in the dashboard into `GEMINI_IMAGE_MODEL`. The
   default in `.env.example` is a starting guess and must be confirmed before launch.

### 1.3 Turnstile (bot protection)

1. Cloudflare dashboard → Turnstile → add site with your domain.
2. Copy the **site key** and **secret key**; set `TURNSTILE_ENFORCED=true` once both are in
   place. Without them the widget is not rendered and no token is checked.

### 1.4 Hosting and storage

1. Vercel → **Add new project** → import `Herbertph/halloween-micro` → framework is detected
   as Next.js → deploy.
2. Add the storage: **Blob** store (`BLOB_READ_WRITE_TOKEN`) and **Upstash Redis** via the
   Vercel integration (`KV_REST_URL`, `KV_REST_TOKEN`).
3. Environment variables (production): the full list is in `.env.example`. The ones that
   must not stay at the dev defaults are `NEXT_PUBLIC_SITE_URL`, `CONTACT_EMAIL`,
   `PAYMENT_PROVIDER=stripe`, `IMAGE_PROVIDER=gemini`, `STORAGE_DRIVER=vercel-blob`,
   `KV_DRIVER=upstash`, both Stripe price ids, `DOWNLOAD_SIGNING_SECRET`,
   `MOCK_WEBHOOK_SECRET`, `CRON_SECRET`, `ADMIN_PASSWORD`.
4. Check the function duration limit of the plan. The preview request can run up to ~130 s
   and the pack cron declares 420 s. If the plan caps lower, tell the team before launch:
   the fallback is moving generation to a job queue.
5. Cron entries already ship in `vercel.json` (`cleanup` hourly, `expand-packs` every 5 min).
6. Buy the domain, point it at the deployment, then set `NEXT_PUBLIC_SITE_URL` to it and
   redeploy — the watermark, canonical URLs and Open Graph tags read that value.

### 1.5 Content the team cannot create

1. Replace the placeholder before/after cards on the landing page with real or licensed
   images.
2. Write the refund contact address for `CONTACT_EMAIL` and reply within 7 days.

## 2. Owner: verify before announcing

1. Open the deployed site on a phone. Generate a preview with your own photo: it must look
   like a real Halloween portrait, not a colour filter (a filter means the mock provider is
   still active).
2. Buy the $4.99 portrait with a real card, confirm the HD download, then refund it from
   the Stripe dashboard.
3. Buy the $8.99 pack: four styles, four downloads, share image included.
4. Open `/admin` and check that the two sales appear with the right revenue.
5. Wait for or trigger the cleanup cron and confirm an old job's files are gone.
6. Only then post the videos.

## 3. Team: what ships before launch

- A production safety guard that refuses to run with mock providers or local disk storage in
  production, so a deploy can never sell "nothing" or lose photos (increment 3).
- `npm run verify:providers`, one command that checks Gemini, Stripe, Blob, Upstash and
  Turnstile with the configured keys and prints a pass/fail table without printing secrets
  (increment 3).
- Integration tests for the production storage and KV drivers, which have never run against
  a real service (increment 3).
- Hardening backlog: idempotent sale recording, `Secure` cookie, EXIF-rotated share images,
  and the async generation contract (#5).

## 4. Known gaps at the time of writing

- No keys exist on the machine, so every provider runs in mock mode: the preview is a
  colour-graded copy of the photo with a "MOCK" label, not an AI portrait.
- Nothing is deployed; the only way to look at the site is the local dev server.
- The landing examples are placeholders.
- `#5` (synchronous generation) is still open and depends on the hosting plan's duration
  limit.
