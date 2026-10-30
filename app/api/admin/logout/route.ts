import { clearAdminCookieHeader } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return new Response(null, {
    status: 303,
    headers: {
      location: "/admin",
      "set-cookie": clearAdminCookieHeader(),
    },
  });
}
