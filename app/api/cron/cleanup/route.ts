import { cleanupExpiredJobs } from "@/lib/job-service";
import { cronSecret } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel Cron entry point; also callable by hand with the bearer secret. */
export async function GET(request: Request): Promise<Response> {
  const secret = cronSecret();
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const removed = await cleanupExpiredJobs();
  return Response.json({ removed });
}
