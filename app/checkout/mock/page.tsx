import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatPrice } from "@/lib/format";
import { mockCheckoutEnabled } from "@/lib/payments-ui";
import { getSession } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function MockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  if (!mockCheckoutEnabled()) notFound();

  const params = await searchParams;
  const session =
    typeof params.session === "string" ? await getSession(params.session) : null;
  if (!session) notFound();

  const settled = session.status !== "pending";

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-night/80 p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-xl">Haunted Portrait</p>
          <span className="rounded-full border border-ember/50 bg-ember/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-pumpkin">
            Test mode
          </span>
        </div>

        <h1 className="mt-6 text-sm font-medium text-bone/70">Order summary</h1>
        <div className="mt-2 flex items-baseline justify-between border-b hairline pb-4">
          <span className="text-base text-bone">
            {session.product === "pack"
              ? "Monster Pack — 4 styles"
              : "Full-resolution portrait"}
          </span>
          <span className="text-2xl font-semibold text-bone">
            {formatPrice(session.amountCents)}
          </span>
        </div>

        <p className="mt-4 rounded-xl bg-hex/10 px-3 py-2 text-xs text-bone/70">
          This is a mock hosted checkout. No card is charged, no card details are
          collected, and the payment is simulated end to end.
        </p>

        {settled ? (
          <div className="mt-6 space-y-4 text-sm">
            <p role="status" className="text-bone/80">
              This session is already {session.status}.
            </p>
            <Link href={`/success?session_id=${encodeURIComponent(session.id)}`} className="btn-primary w-full">
              View your portrait
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <form action="/checkout/mock/complete" method="post">
              <input type="hidden" name="session" value={session.id} />
              <button type="submit" className="btn-primary w-full">
                Pay {formatPrice(session.amountCents)}
              </button>
            </form>
            <form action="/checkout/mock/decline" method="post">
              <input type="hidden" name="session" value={session.id} />
              <button type="submit" className="btn-secondary w-full">
                Decline payment
              </button>
            </form>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-bone/45">
          Set <span className="font-mono">PAYMENT_PROVIDER=stripe</span> to use the real
          checkout.
        </p>
      </div>
    </main>
  );
}
