import { getKv } from "@/lib/kv";
import type { Product } from "@/lib/types";

const TTL_SECONDS = 90 * 24 * 60 * 60;

export interface DayStats {
  previews: number;
  generations: number;
  salesSingle: number;
  salesPack: number;
  revenueCents: number;
}

const EMPTY: DayStats = {
  previews: 0,
  generations: 0,
  salesSingle: 0,
  salesPack: 0,
  revenueCents: 0,
};

/** UTC day key used by the admin view. */
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function key(day: string, metric: string): string {
  return `stats:${day}:${metric}`;
}

async function increment(day: string, metric: string, amount = 1): Promise<void> {
  if (amount <= 0) return;
  await getKv().incrBy(key(day, metric), amount, TTL_SECONDS);
}

export async function incrementPreviews(now: Date = new Date()): Promise<void> {
  await increment(dayKey(now), "previews");
}

export async function incrementGenerations(
  count = 1,
  now: Date = new Date(),
): Promise<void> {
  await increment(dayKey(now), "generations", count);
}

export async function recordSale(
  input: { product: Product; amountCents: number },
  now: Date = new Date(),
): Promise<void> {
  const day = dayKey(now);
  await increment(day, input.product === "pack" ? "sales_pack" : "sales_single");
  await increment(day, "revenue_cents", input.amountCents);
}

export async function readDayStats(day: string): Promise<DayStats> {
  const kv = getKv();
  const [previews, generations, salesSingle, salesPack, revenueCents] =
    await Promise.all([
      kv.get(key(day, "previews")),
      kv.get(key(day, "generations")),
      kv.get(key(day, "sales_single")),
      kv.get(key(day, "sales_pack")),
      kv.get(key(day, "revenue_cents")),
    ]);
  const number = (value: string | null) => {
    const parsed = Number(value ?? "0");
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    ...EMPTY,
    previews: number(previews),
    generations: number(generations),
    salesSingle: number(salesSingle),
    salesPack: number(salesPack),
    revenueCents: number(revenueCents),
  };
}

/** Estimated provider cost for a day, in cents. */
export function estimatedCostCents(
  stats: DayStats,
  costPerGenerationCents: number,
): number {
  return stats.generations * costPerGenerationCents;
}

export function marginCents(
  stats: DayStats,
  costPerGenerationCents: number,
): number {
  return stats.revenueCents - estimatedCostCents(stats, costPerGenerationCents);
}
