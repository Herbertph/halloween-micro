import type { Job, JobStatus, PublicJob } from "@/lib/types";

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  created: ["generating", "expired"],
  generating: ["preview_ready", "failed", "expired"],
  preview_ready: ["awaiting_payment", "expired"],
  awaiting_payment: ["paid", "expired"],
  paid: ["unlocked", "expired"],
  unlocked: ["expired"],
  failed: ["expired"],
  expired: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: JobStatus,
    public readonly to: JobStatus,
  ) {
    super(`Invalid job transition: ${from} -> ${to}`);
  }
}

/** Returns a new job in the target status; never mutates the input. */
export function transition(
  job: Job,
  to: JobStatus,
  now: Date = new Date(),
): Job {
  if (!canTransition(job.status, to)) {
    throw new InvalidTransitionError(job.status, to);
  }
  const next: Job = { ...job, status: to };
  if (to === "paid") next.paidAt = now.toISOString();
  if (to === "unlocked") next.unlockedAt = now.toISOString();
  return next;
}

export function expiresAtFor(createdAt: Date, hours: number): string {
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function isExpired(job: Job, now: Date = new Date()): boolean {
  return job.status === "expired" || new Date(job.expiresAt).getTime() <= now.getTime();
}

export function isPaid(job: Job): boolean {
  return job.status === "paid" || job.status === "unlocked";
}

/**
 * The only public projection of a job. Callers may attach a signed download
 * URL, but never a storage key.
 */
export function toPublicJob(job: Job): PublicJob {
  const publicJob: PublicJob = {
    id: job.id,
    status: job.status,
    styleId: job.styleId,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
  };
  if (job.error) publicJob.error = job.error;
  if (job.previewKey) publicJob.previewUrl = `/api/preview/${job.id}`;
  return publicJob;
}
