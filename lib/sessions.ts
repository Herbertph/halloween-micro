import { randomUUID } from "node:crypto";

import { getKv } from "@/lib/kv";

export type SessionStatus = "pending" | "paid" | "declined";

export interface PaymentSession {
  id: string;
  jobId: string;
  amountCents: number;
  status: SessionStatus;
  createdAt: string;
}

const PREFIX = "session:";

export async function createSessionRecord(input: {
  id?: string;
  jobId: string;
  amountCents: number;
  now?: Date;
}): Promise<PaymentSession> {
  const session: PaymentSession = {
    id: input.id ?? `cs_mock_${randomUUID().replace(/-/g, "")}`,
    jobId: input.jobId,
    amountCents: input.amountCents,
    status: "pending",
    createdAt: (input.now ?? new Date()).toISOString(),
  };
  await getKv().set(`${PREFIX}${session.id}`, JSON.stringify(session), {
    exSeconds: 7 * 24 * 60 * 60,
  });
  return session;
}

export async function getSession(id: string): Promise<PaymentSession | null> {
  const raw = await getKv().get(`${PREFIX}${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PaymentSession;
  } catch {
    return null;
  }
}

export async function setSessionStatus(
  id: string,
  status: SessionStatus,
): Promise<PaymentSession | null> {
  const session = await getSession(id);
  if (!session) return null;
  const next = { ...session, status };
  await getKv().set(`${PREFIX}${id}`, JSON.stringify(next), {
    exSeconds: 7 * 24 * 60 * 60,
  });
  return next;
}
