"use client";

import Script from "next/script";

/** Only loaded when Turnstile is configured (dynamic import in CreateForm). */
export default function TurnstileField({ siteKey }: { siteKey: string }) {
  return (
    <div>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div className="cf-turnstile" data-sitekey={siteKey} data-theme="dark" />
      <p className="mt-2 text-xs text-bone/55">
        A quick Cloudflare check keeps the free previews for real people.
      </p>
    </div>
  );
}
