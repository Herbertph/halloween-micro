import type { Metadata } from "next";

import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { contactEmail } from "@/lib/env";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Haunted Portrait stores, for how long and who processes your photo.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const email = contactEmail();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container-page max-w-3xl flex-1 py-12">
        <h1 className="font-display text-4xl sm:text-5xl">Privacy</h1>
        <p className="mt-4 text-bone/70">
          Short version: your photo is processed to make your portrait, kept private for
          48 hours and then deleted. No account, no email and no public gallery.
        </p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-bone/80">
          <section>
            <h2 className="font-display text-2xl text-bone">What we store</h2>
            <p className="mt-2">
              The photo you upload, the generated full-resolution portrait, the
              watermarked preview and a small job record (status, style, timestamps).
              Stored files sit in private object storage under random keys. We do not
              store your name, email address or payment card details.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-bone">How long we keep it</h2>
            <p className="mt-2">
              Everything about a portrait — the original photo, the result and the
              preview — is deleted automatically after 48 hours. The 48-hour retention
              applies from the moment you upload, not from the moment you pay. Expired
              downloads return an error instead of an image.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-bone">Who processes your photo</h2>
            <p className="mt-2">
              Your image is sent to our AI image provider to generate the portrait. In
              this release the provider is Google Gemini (Gemini image API). We send only
              the image and a style prompt; we never send your name or contact details.
              Payment is handled by our payment provider (Stripe in production, a test
              checkout while no live keys exist).
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-bone">Consent and prohibited use</h2>
            <p className="mt-2">
              You must own the photo or have permission from every person in it. Do not
              upload photos of people who have not agreed, illegal content, or content
              that infringes someone else&apos;s rights. We may refuse generation and the
              consent checkbox is required before any upload is sent.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-bone">Analytics</h2>
            <p className="mt-2">
              When configured we load Plausible, a privacy-friendly analytics script that
              records page views and a few product events without cookies or personal
              identifiers. Without configuration no analytics script is loaded.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-bone">Refunds and contact</h2>
            <p className="mt-2">
              Not happy with your portrait? Email us within 7 days of purchase and we
              refund you, no questions asked. Contact:{" "}
              <a className="link" href={`mailto:${email}`}>
                {email}
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
