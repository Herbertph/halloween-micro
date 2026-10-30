import { getConfigStatus } from "@/lib/config-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public readiness. Names and status only: never configuration values. */
export async function GET(): Promise<Response> {
  const status = getConfigStatus();
  if (!status.ready) {
    return Response.json(
      { ready: false, problems: status.problems },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    { ready: true, mode: status.mode },
    { headers: { "cache-control": "no-store" } },
  );
}
