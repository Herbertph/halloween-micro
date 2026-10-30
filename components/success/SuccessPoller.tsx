"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { track } from "@/lib/analytics";
import { formatDateTimeUtc } from "@/lib/format";
import type { PublicAsset, PublicJob, PublicStyle } from "@/lib/types";

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
const EXPAND_DELAY_MS = 300;

function isPending(asset: PublicAsset): boolean {
  return asset.status === "pending" || asset.status === "generating";
}

export function SuccessPoller({
  sessionId,
  jobId,
  styles,
}: {
  sessionId?: string;
  jobId?: string;
  styles: PublicStyle[];
}) {
  const [state, setState] = useState<State>(
    sessionId && jobId ? "waiting" : "invalid",
  );
  const [job, setJob] = useState<PublicJob | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [expandTick, setExpandTick] = useState(0);
  const trackedPayment = useRef(false);

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

  // Pack expansion: one asset per call, chained while a paid job has pending
  // cards. The server claim is atomic, so a concurrent cron cannot duplicate it.
  useEffect(() => {
    if (state !== "unlocked" || !job || !sessionId) return;
    if (job.product !== "pack") return;
    if (!(job.assets ?? []).some(isPending)) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/jobs/${encodeURIComponent(job.id)}/expand?session=${encodeURIComponent(sessionId)}`,
          { method: "POST" },
        );
        if (cancelled) return;
        if (response.ok) {
          const data = (await response.json()) as { job: PublicJob };
          setJob(data.job);
        } else {
          setExpandTick((tick) => tick + 1);
        }
      } catch {
        if (!cancelled) setExpandTick((tick) => tick + 1);
      }
    }, EXPAND_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, job, sessionId, expandTick]);

  async function retryAsset(styleId: string) {
    if (!job || !sessionId) return;
    setRetrying(styleId);
    try {
      const response = await fetch(
        `/api/jobs/${encodeURIComponent(job.id)}/expand?session=${encodeURIComponent(sessionId)}&style=${encodeURIComponent(styleId)}`,
        { method: "POST" },
      );
      if (response.ok) {
        const data = (await response.json()) as { job: PublicJob };
        setJob(data.job);
      }
    } finally {
      setRetrying(null);
    }
  }

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

  if (state === "unlocked" && job) {
    const isPack = job.product === "pack" && (job.assets?.length ?? 0) > 1;
    return (
      <section className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-night/70 p-6 sm:p-9">
        <h1 className="font-display text-3xl sm:text-4xl">
          {isPack ? "Your Monster Pack is ready" : "Your portrait is ready"}
        </h1>

        {isPack ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {(job.assets ?? []).map((asset) => (
              <AssetCard
                key={asset.styleId}
                asset={asset}
                styleName={
                  styles.find((style) => style.id === asset.styleId)?.name ??
                  asset.styleId
                }
                jobId={job.id}
                sessionId={sessionId}
                retrying={retrying === asset.styleId}
                onRetry={() => void retryAsset(asset.styleId)}
              />
            ))}
          </div>
        ) : (
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
              {job.downloadUrl ? (
                <a
                  href={job.downloadUrl}
                  className="btn-primary"
                  onClick={() => track("download_clicked", { style: job.styleId })}
                >
                  Download HD portrait
                </a>
              ) : null}
            </div>
          </div>
        )}

        <div className="mt-8 border-t hairline pt-5">
          <p className="text-sm text-bone/80">
            Your images are deleted after 48 hours. Download them now.
          </p>
          <p className="mt-1 text-sm font-medium text-pumpkin">
            Deletion time: {formatDateTimeUtc(job.expiresAt)}
          </p>
          <p className="mt-3 text-xs text-bone/55">
            Download links are valid for 15 minutes. Save the files to your device.
          </p>
          {job.shareUrl ? (
            <a
              href={job.shareUrl}
              download="haunted-portrait-before-after.jpg"
              className="btn-secondary mt-5"
              onClick={() => track("share_image_downloaded", { style: job.styleId })}
            >
              Download before/after image
            </a>
          ) : null}
        </div>
      </section>
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

function AssetCard({
  asset,
  styleName,
  jobId,
  sessionId,
  retrying,
  onRetry,
}: {
  asset: PublicAsset;
  styleName: string;
  jobId: string;
  sessionId?: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  const ready = asset.status === "ready";
  const failed = asset.status === "failed";
  return (
    <article
      aria-label={`${styleName} portrait`}
      className="rounded-2xl border border-white/10 bg-ink/40 p-4"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-night/60">
        {ready && sessionId ? (
          <Image
            src={`/api/assets/${encodeURIComponent(jobId)}/${asset.styleId}?session=${encodeURIComponent(sessionId)}`}
            alt={`${styleName} portrait`}
            width={400}
            height={400}
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-bone/55">
            {failed
              ? "This style failed."
              : asset.status === "generating"
                ? "Haunting this style…"
                : "Waiting for its turn…"}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-bone">{styleName}</p>
        {ready && asset.downloadUrl ? (
          <a
            href={asset.downloadUrl}
            className="btn-secondary min-h-0 px-4 py-2 text-sm"
            onClick={() => track("download_clicked", { style: asset.styleId })}
          >
            Download {styleName}
          </a>
        ) : failed ? (
          <button
            type="button"
            className="btn-secondary min-h-0 px-4 py-2 text-sm"
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? "Retrying…" : `Retry ${styleName}`}
          </button>
        ) : (
          <span aria-live="polite" className="text-xs text-bone/55">
            {asset.status === "generating" ? "Generating…" : "Pending"}
          </span>
        )}
      </div>
    </article>
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
