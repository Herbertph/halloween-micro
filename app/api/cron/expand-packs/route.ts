import { cronSecret } from "@/lib/env";
import { sweepPacks } from "@/lib/expand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Closed-tab sweeper for paid packs; Vercel Cron calls it every few minutes. */
export async function GET(request: Request): Promise<Response> {
  const secret = cronSecret();
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sweepPacks();
  return Response.json(result);
}
