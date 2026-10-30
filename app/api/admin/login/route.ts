import { NextResponse } from "next/server";

import {
  adminCookieHeader,
  clearAdminCookieHeader,
  consumeLoginAttempt,
  createAdminCookieValue,
  passwordMatches,
} from "@/lib/admin";
import { clientIpHash } from "@/lib/request-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readPassword(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { password?: unknown };
      return typeof body.password === "string" ? body.password : null;
    }
    const form = await request.formData();
    const password = form.get("password");
    return typeof password === "string" ? password : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const ipHash = clientIpHash(request);
  const attempt = await consumeLoginAttempt(ipHash);
  if (!attempt.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const password = await readPassword(request);
  if (!password || !passwordMatches(password)) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set("set-cookie", adminCookieHeader(createAdminCookieValue()));
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function DELETE(): Promise<Response> {
  const response = NextResponse.json({ ok: true });
  response.headers.set("set-cookie", clearAdminCookieHeader());
  return response;
}
