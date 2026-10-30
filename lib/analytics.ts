export const ANALYTICS_EVENTS = [
  "upload_started",
  "preview_generated",
  "checkout_clicked",
  "payment_succeeded",
  "download_clicked",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

type Plausible = (
  event: string,
  options?: { props?: Record<string, string | number> },
) => void;

/**
 * Plausible is optional: without the script (or without a browser) every event
 * is a no-op, so missing configuration can never break the page.
 */
export function track(
  event: AnalyticsEvent,
  props?: Record<string, string | number>,
): void {
  if (typeof window === "undefined") return;
  const plausible = (window as unknown as { plausible?: Plausible }).plausible;
  if (typeof plausible !== "function") return;
  plausible(event, props ? { props } : undefined);
}
