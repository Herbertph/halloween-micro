"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";

import { track } from "@/lib/analytics";
import {
  prepareImage,
  UPLOAD_ACCEPT,
  UPLOAD_MESSAGES,
  validateUploadFile,
  type UploadErrorCode,
} from "@/lib/client/image";
import { formatDateTimeUtc } from "@/lib/format";
import type { Product } from "@/lib/products";
import type { PublicStyle, StyleId } from "@/lib/types";

const TurnstileField = dynamic(() => import("./TurnstileField"), { ssr: false });

type Phase = "idle" | "preparing" | "generating" | "preview" | "failed";

interface RestoredJob {
  id: string;
  status: string;
  previewUrl?: string;
  expiresAt?: string;
}

interface CreateFormProps {
  styles: PublicStyle[];
  priceLabel: string;
  packPriceLabel?: string;
  turnstileSiteKey?: string;
  initialJob?: RestoredJob;
  declined?: boolean;
  cancelled?: boolean;
}

const PROVIDER_MESSAGES: Record<string, string> = {
  no_subject:
    "We couldn't find a face or pet in that photo. Try a brighter, closer picture.",
  moderation: "That photo can't be used. Try a different one.",
  timeout: "Generation took too long. Try again — it's free.",
  transient: "Something hiccuped while we haunted your photo. Try again — it's free.",
  fatal: "Generation failed. Try again — it's free.",
};

const API_MESSAGES: Record<string, string> = {
  file_too_large: UPLOAD_MESSAGES.file_too_large,
  unsupported_format: UPLOAD_MESSAGES.unsupported_format,
  invalid_image: "We couldn't read that photo. Try a JPG, PNG or WEBP.",
  consent_required: "Please confirm you own the photo or have permission to use it.",
  invalid_style: "Pick one of the five styles.",
  capacity: "We're at capacity today. Please come back tomorrow.",
  captcha_failed: "Please complete the quick check and try again.",
  captcha_timeout: "The quick check timed out. Try again in a moment.",
  invalid_product: "That product is not available.",
};

function rateLimitedMessage(retryAt: unknown): string {
  if (typeof retryAt === "string") {
    return `You've used all your free previews for today. Try again after ${formatDateTimeUtc(retryAt)}.`;
  }
  return "You've used all your free previews for today. Try again tomorrow.";
}

export function CreateForm({
  styles,
  priceLabel,
  packPriceLabel = "$8.99",
  turnstileSiteKey,
  initialJob,
  declined = false,
  cancelled = false,
}: CreateFormProps) {
  const restoredPreview =
    initialJob &&
    (initialJob.status === "preview_ready" || initialJob.status === "awaiting_payment")
      ? initialJob
      : undefined;

  const [file, setFile] = useState<File | null>(null);
  const [styleId, setStyleId] = useState<StyleId>("pumpkin");
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>(restoredPreview ? "preview" : "idle");
  const [error, setError] = useState<string | null>(
    declined
      ? "Payment was declined. Nothing was charged — try again."
      : cancelled
        ? "Checkout was cancelled. Nothing was charged."
        : null,
  );
  const [jobId, setJobId] = useState<string | undefined>(restoredPreview?.id);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(
    restoredPreview?.previewUrl,
  );
  const [expiresAt, setExpiresAt] = useState<string | undefined>(
    restoredPreview?.expiresAt,
  );
  const [checkoutPending, setCheckoutPending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = phase === "preparing" || phase === "generating";
  const canGenerate = Boolean(file) && consent && Boolean(styleId) && !busy;

  function handleFile(selected: File | null) {
    if (!selected) return;
    const result = validateUploadFile(selected);
    if (!result.ok) {
      setFile(null);
      setError(result.message);
      setPhase("idle");
      return;
    }
    setFile(selected);
    setError(null);
    track("upload_started", { style: styleId });
  }

  async function generate() {
    if (!file || !consent) return;
    setError(null);
    setPhase("preparing");

    let prepared: File;
    try {
      prepared = await prepareImage(file);
    } catch (cause) {
      const code = (cause as { code?: string; message?: string }).code ?? "decode_failed";
      setError(UPLOAD_MESSAGES[code as UploadErrorCode] ?? UPLOAD_MESSAGES.decode_failed);
      setPhase("idle");
      return;
    }

    setPhase("generating");
    const body = new FormData();
    body.set("image", prepared);
    body.set("styleId", styleId);
    body.set("consent", "true");
    if (turnstileSiteKey) {
      const token = (
        document.querySelector(
          'input[name="cf-turnstile-response"]',
        ) as HTMLInputElement | null
      )?.value;
      body.set("turnstileToken", token ?? "");
    }

    try {
      const response = await fetch("/api/generate", { method: "POST", body });
      const data = (await response.json()) as {
        jobId?: string;
        status?: string;
        previewUrl?: string;
        expiresAt?: string;
        error?: string;
        retryAt?: string;
      };

      if (response.status === 202 && data.previewUrl) {
        setJobId(data.jobId);
        setPreviewUrl(data.previewUrl);
        setExpiresAt(data.expiresAt);
        setPhase("preview");
        track("preview_generated", { style: styleId });
        return;
      }

      if (data.status === "failed" && data.error) {
        setJobId(data.jobId);
        setError(PROVIDER_MESSAGES[data.error] ?? PROVIDER_MESSAGES.fatal);
        setPhase("failed");
        return;
      }

      if (data.error === "rate_limited") {
        setError(rateLimitedMessage(data.retryAt));
        setPhase("failed");
        return;
      }

      setError(API_MESSAGES[data.error ?? ""] ?? "Something went wrong. Try again.");
      setPhase("idle");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setPhase("failed");
    }
  }

  async function checkout(product: Product) {
    if (!jobId) return;
    setCheckoutPending(true);
    setError(null);
    track("checkout_clicked", { style: styleId, product });
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId, product }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (response.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setError("Checkout is unavailable right now. Try again in a moment.");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setCheckoutPending(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
      <div className="rounded-3xl border border-white/10 bg-night/70 p-5 sm:p-7">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          Haunt your photo
        </h1>
        <p className="mt-3 text-sm text-bone/70">
          One photo, one style, one free preview. The full-resolution portrait unlocks
          after payment.
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-ember/40 bg-ember/10 px-4 py-3 text-sm text-pumpkin"
          >
            {error}
          </p>
        ) : null}

        {phase === "preview" && previewUrl ? (
          <section aria-label="Your preview" className="mt-6" data-testid="paywall">
            <div className="overflow-hidden rounded-2xl border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Watermarked preview of your haunted portrait"
                width={512}
                height={512}
                className="w-full object-cover"
              />
            </div>
            <p className="mt-3 text-sm text-bone/70">
              Watermark removed in the HD download.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => void checkout("single")}
                disabled={checkoutPending}
              >
                {checkoutPending ? "Opening checkout…" : `Unlock HD — ${priceLabel}`}
              </button>
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => void checkout("pack")}
                disabled={checkoutPending}
              >
                Get the Monster Pack — {packPriceLabel}
              </button>
              <p className="text-center text-xs text-bone/55">
                Monster Pack: 4 styles, one download each.
              </p>
              <button
                type="button"
                className="text-sm text-bone/60 underline underline-offset-4 hover:text-pumpkin"
                onClick={() => {
                  setPhase("idle");
                  setPreviewUrl(undefined);
                  setJobId(undefined);
                  setError(null);
                }}
              >
                Try another style
              </button>
            </div>
            {expiresAt ? (
              <p className="mt-4 text-xs text-bone/55">
                This preview is kept until {formatDateTimeUtc(expiresAt)}.
              </p>
            ) : null}
          </section>
        ) : (
          <form
            className="mt-6 space-y-7"
            onSubmit={(event) => {
              event.preventDefault();
              if (canGenerate) void generate();
            }}
          >
            <div>
              <label
                htmlFor="photo"
                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/25 bg-ink/50 px-5 py-10 text-center hover:border-ember/60 focus-within:border-ember focus-within:ring-2 focus-within:ring-ember/50 focus-within:ring-offset-2 focus-within:ring-offset-ink"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  handleFile(event.dataTransfer.files?.[0] ?? null);
                }}
              >
                <span className="text-base font-medium text-bone">
                  {file ? file.name : "Choose a photo or drop it here"}
                </span>
                <span className="mt-2 max-w-xs text-xs text-bone/60">
                  JPG, PNG or WEBP up to 10 MB. iPhone HEIC is converted in your browser
                  when your browser supports it.
                </span>
                <input
                  ref={fileInput}
                  id="photo"
                  name="photo"
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-bone">Pick a style</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {styles.map((style) => {
                  const selected = styleId === style.id;
                  return (
                    <label
                      key={style.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                        selected
                          ? "border-ember bg-ember/10"
                          : "border-white/15 hover:border-white/30"
                      }`}
                    >
                      <input
                        type="radio"
                        name="style"
                        value={style.id}
                        checked={selected}
                        onChange={() => setStyleId(style.id)}
                        className="mt-1 h-4 w-4"
                      />
                      <span>
                        <span className="block text-sm font-medium text-bone">
                          {style.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-bone/60">
                          {style.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex items-start gap-3">
              <input
                id="consent"
                name="consent"
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <label htmlFor="consent" className="text-sm text-bone/80">
                I own this photo or have permission from the people in it
              </label>
            </div>

            {turnstileSiteKey ? <TurnstileField siteKey={turnstileSiteKey} /> : null}

            <div className="flex flex-col gap-3">
              <button type="submit" className="btn-primary w-full" disabled={!canGenerate}>
                {busy ? "Haunting your photo…" : "Generate free preview"}
              </button>
              {busy ? (
                <p aria-live="polite" className="text-sm text-bone/70">
                  {phase === "preparing"
                    ? "Getting your photo ready…"
                    : "This can take up to a minute. Keep this tab open."}
                </p>
              ) : null}
              <p className="text-xs text-bone/55">
                You will see a watermarked preview before paying anything.
              </p>
            </div>
          </form>
        )}

        {phase === "failed" ? (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button type="button" className="btn-primary" onClick={() => void generate()}>
              Try again
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setPhase("idle");
                setError(null);
              }}
            >
              Pick another photo
            </button>
          </div>
        ) : null}
      </div>

      <aside className="space-y-6">
        <div className="rounded-3xl border border-white/10 bg-night/50 p-5">
          <h2 className="font-display text-2xl">What you get</h2>
          <ul className="mt-3 space-y-2 text-sm text-bone/75">
            <li>Free watermarked preview of your portrait.</li>
            <li>Full-resolution JPEG for {priceLabel} when you unlock it.</li>
            <li>
              Monster Pack for {packPriceLabel}: four styles, one download each.
            </li>
            <li>Photos deleted automatically after 48 hours.</li>
            <li>7-day refund policy if you are not happy.</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-white/10 bg-night/50 p-5 text-sm text-bone/70">
          <h2 className="font-display text-2xl text-bone">Privacy</h2>
          <p className="mt-3">
            Your photo is processed by an AI image provider only to create your portrait.
            It is stored privately, never shown in a gallery and never reused.{" "}
            <a href="/privacy" className="link">
              Read the privacy policy
            </a>
            .
          </p>
        </div>
      </aside>
    </div>
  );
}
