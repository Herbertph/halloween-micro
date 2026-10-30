import { cookies } from "next/headers";

import { AdminLogin } from "@/components/admin/AdminLogin";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { ADMIN_COOKIE, verifyAdminCookieValue } from "@/lib/admin";
import { generationCostCents } from "@/lib/env";
import { formatPrice } from "@/lib/format";
import {
  dayKey,
  estimatedCostCents,
  marginCents,
  readDayStats,
} from "@/lib/stats";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const cookieStore = await cookies();
  const authed = verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE)?.value);

  if (!authed) {
    return (
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="container-page flex-1 py-12 sm:py-16">
          <AdminLogin />
        </main>
        <SiteFooter />
      </div>
    );
  }

  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const [stats, yesterdayStats] = await Promise.all([
    readDayStats(today),
    readDayStats(yesterday),
  ]);
  const cost = estimatedCostCents(stats, generationCostCents());
  const margin = marginCents(stats, generationCostCents());
  const revenue = formatPrice(stats.revenueCents);

  const cards = [
    { label: "Previews generated", value: String(stats.previews) },
    { label: "Single sales", value: String(stats.salesSingle) },
    { label: "Pack sales", value: String(stats.salesPack) },
    { label: "Revenue", value: revenue },
    {
      label: "Estimated generation cost",
      value: formatPrice(cost),
    },
    { label: "Margin", value: formatPrice(margin) },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container-page flex-1 py-12 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl">Today</h1>
            <p className="mt-2 text-sm text-bone/60">{today} · UTC · aggregates only</p>
          </div>
          <form action="/api/admin/logout" method="post">
            <button type="submit" className="btn-secondary">
              Sign out
            </button>
          </form>
        </div>

        <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-white/10 bg-night/60 p-5"
            >
              <dt className="text-sm text-bone/60">{card.label}</dt>
              <dd className="mt-2 font-display text-3xl text-bone">{card.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 rounded-2xl border border-white/10 bg-night/40 p-5">
          <h2 className="font-display text-2xl">Yesterday</h2>
          <p className="mt-2 text-sm text-bone/70">
            Revenue: {formatPrice(yesterdayStats.revenueCents)} · Single sales:{" "}
            {yesterdayStats.salesSingle} · Pack sales: {yesterdayStats.salesPack}
          </p>
        </div>

        <p className="mt-8 text-xs text-bone/45">
          Estimated cost uses {formatPrice(generationCostCents())} per generation
          attempt. This view is a convenience, not an accounting system.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
