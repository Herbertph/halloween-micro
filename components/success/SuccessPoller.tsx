"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { track } from "@/lib/analytics";
import { formatDateTimeUtc } from "@/lib/format";
import type { PublicJob } from "@/lib/types";

interface JobResponse {
  job: PublicJob;
  payment?: "pending" | "paid" | "declined";
}

type State =
  | "waiting"
  | "processing"
  | "unlocked"
  | "declined"
  | "invalid"
  | "expired"
  | "failed"
  | "timeout";

const POLL_INTERVAL_MS = 1500;
const POLL_BUDGET_MS = 60_000;

export function SuccessPoller({
  sessionId,
  jobId,
}: {
  sessionId?: string;
  jobId?: string;
}) {
  const [state, setState] = useState<State>(
    sessionId && jobId ? "waiting" : "invalid",
  );
  const [job, setJob] = useState<PublicJob | null>(null);
  const trackedPayment = useRef(false);
  const trackedDownload = useRef(false);

  useEffect(() => {
    if (!sessionId || !jobId) return;
    let cancelled = false;
    const deadline = Date.now() + POLL_BUDGET_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (cancelled) return;
      try {
        const response = await fetch(
          `/api/jobs/${encodeURIComponent(jobId!)}?session=${encodeURIComponent(sessionId!)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;

        if (response.status === 410) {
          setState("expired");
          return;
        }
        if (!response.ok) {
          // Unknown/forged session: never unlock, never show a download URL.
          setState("invalid");
          return;
        }

        const data = (await response.json()) as JobResponse;
        setJob(data.job);

        if (data.job.status === "unlocked" || data.job.status === "paid") {
          // Only a paid job state unlocks, never the redirect alone.
          setState("unlocked");
          if (!trackedPayment.current) {
            trackedPayment.current = true;
            track("payment_succeeded", { style: data.job.styleId });
          }
          return;
        }
        if (data.payment === "declined") {
          setState("declined");
          return;
        }
        if (data.job.status === "failed") {
          setState("failed");
          return;
        }
        setState(
          data.job.status === "generating" || data.job.status === "created"
            ? "processing"
            : "waiting",
        );
      } catch {
        if (!cancelled) setState("waiting");
      }

      if (Date.now() >= deadline) {
        setState("timeout");
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, jobId]);

  if (state === "invalid") {
    return (
      <StatusCard title="We couldn't find that order">
        <p>
          That checkout link is unknown or has expired. If you were charged, contact us
          and we will find your portrait.
        </p>
        <Link href="/create" className="btn-secondary mt-6">
          Start a new portrait
        </Link>
      </StatusCard>
    );
  }

  if (state === "declined") {
    return (
      <StatusCard title="Payment declined">
        <p>
          Nothing was charged. You can try again with the same preview while it is still
          saved.
        </p>
        <Link href={jobId ? `/create?job=${jobId}&declined=1` : "/create"} className="btn-primary mt-6">
          Try payment again
        </Link>
      </StatusCard>
    );
  }

  if (state === "expired") {
    return (
      <StatusCard title="This portrait is gone">
        <p>
          The 48-hour retention window has passed and the files were deleted. Start a new
          portrait any time.
        </p>
        <Link href="/create" className="btn-secondary mt-6">
          Start a new portrait
        </Link>
      </StatusCard>
    );
  }

  if (state === "failed") {
    return (
      <StatusCard title="Generation failed">
        <p>Nothing was charged. Start again with the same photo or a new one.</p>
        <Link href="/create" className="btn-primary mt-6">
          Try again
        </Link>
      </StatusCard>
    );
  }

  if (state === "timeout") {
    return (
      <StatusCard title="Still waiting">
        <p>
          This is taking longer than usual. Payment may still be processing — refresh this
          page in a moment.
        </p>
        <button
          type="button"
          className="btn-secondary mt-6"
          onClick={() => window.location.reload()}
        >
          Refresh
        </button>
      </StatusCard>
    );
  }

  if (state === "unlocked" && job?.downloadUrl) {
    return (
      <StatusCard title="Your portrait is ready">
        <div className="mt-2 flex flex-col gap-6 sm:flex-row sm:items-start">
          {job.previewUrl ? (
            <Image
              src={job.previewUrl}
              alt="Your haunted portrait preview"
              width={220}
              height={220}
              unoptimized
              className="w-full max-w-[220px] rounded-2xl border border-white/10"
            />
          ) : null}
          <div>
            <a
              href={job.downloadUrl}
              className="btn-primary"
              onClick={() => {
                if (!trackedDownload.current) {
                  trackedDownload.current = true;
                  track("download_clicked", { style: job.styleId });
                }
              }}
            >
              Download HD portrait
            </a>
            <p className="mt-4 text-sm text-bone/80">
              Your images are deleted after 48 hours. Download them now.
            </p>
            <p className="mt-1 text-sm font-medium text-pumpkin">
              Deletion time: {formatDateTimeUtc(job.expiresAt)}
            </p>
            <p className="mt-3 text-xs text-bone/55">
              The download link is valid for 15 minutes. Save the file to your device.
            </p>
          </div>
        </div>
      </StatusCard>
    );
  }

  return (
    <StatusCard
      title={state === "processing" ? "Processing your portrait" : "Waiting for payment"}
    >
      <p aria-live="polite">
        {state === "processing"
          ? "Your preview is being prepared. This page updates automatically."
          : "If you have completed checkout, this page updates automatically. Keep it open."}
      </p>
      <p className="mt-4 text-xs text-bone/50">
        Checking every 1.5 seconds for up to a minute.
      </p>
    </StatusCard>
  );
}

function StatusCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-night/70 p-6 sm:p-9">
      <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
      <div className="mt-4 text-sm leading-relaxed text-bone/75">{children}</div>
    </section>
  );
}
