export function formatPrice(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Deterministic UTC formatting, so server and client agree. */
export function formatDateTimeUtc(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}, ${hours}:${minutes} UTC`;
}

export type BannerTone = "today" | "tomorrow";

/** Oct 31 and Oct 30 only, computed from the server date in UTC. */
export function bannerForDate(date: Date): { tone: BannerTone; text: string } | null {
  if (date.getUTCMonth() !== 9) return null;
  const day = date.getUTCDate();
  if (day === 31) {
    return { tone: "today", text: "Halloween is today — get yours before midnight" };
  }
  if (day === 30) {
    return { tone: "tomorrow", text: "Halloween is tomorrow — get yours before the rush" };
  }
  return null;
}
