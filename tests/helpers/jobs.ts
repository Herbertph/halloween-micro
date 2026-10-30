import { createJob, saveJob } from "@/lib/job-service";
import { transition } from "@/lib/jobs";
import type { Job } from "@/lib/types";

/** Builds a persisted job that already has a generated preview. */
export async function makePreviewJob(overrides: Partial<Job> = {}): Promise<Job> {
  const created = await createJob({ styleId: "pumpkin", ipHash: "test-ip" });
  let job = transition(created, "generating");
  job.originalKey = "blobs/original.jpg";
  job.fullKey = "blobs/full.jpg";
  job.previewKey = "blobs/preview.jpg";
  job = transition(job, "preview_ready");
  job = { ...job, ...overrides };
  await saveJob(job);
  return job;
}

export async function makePaidJob(
  fullBytes: Buffer,
  overrides: Partial<Job> = {},
): Promise<Job> {
  const job = await makePreviewJob(overrides);
  const { getStorage } = await import("@/lib/storage");
  await getStorage().put(job.fullKey!, fullBytes);
  const paid = transition(job, "awaiting_payment");
  const unlocked = transition(transition(paid, "paid"), "unlocked");
  await saveJob(unlocked);
  return unlocked;
}

export function imageForm(
  buffer: Buffer,
  options: {
    consent?: string | null;
    styleId?: string;
    type?: string;
    filename?: string;
  } = {},
): FormData {
  const form = new FormData();
  if (options.consent !== null) {
    form.set("consent", options.consent ?? "true");
  }
  form.set("styleId", options.styleId ?? "pumpkin");
  form.set(
    "image",
    new File([new Uint8Array(buffer)], options.filename ?? "photo.jpg", {
      type: options.type ?? "image/jpeg",
    }),
  );
  return form;
}

export function jsonRequest(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
