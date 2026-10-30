import type { Metadata } from "next";

import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { contactEmail, priceCents } from "@/lib/env";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Terms",
  description: "The rules for using Haunted Portrait, refunds and content limits.",
  alternates: { canonical: "/terms" },
};

export const dynamic = "force-dynamic";

export default function TermsPage() {
  const email = contactEmail();
  const price = formatPrice(priceCents());
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container-page max-w-3xl flex-1 py-12">
        <h1 className="font-display text-4xl sm:text-5xl">Terms</h1>
        <p className="mt-4 text-bone/70">
          One portrait costs {price}. You get a free watermarked preview first; paying
          unlocks the full-resolution download.
        </p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-bone/80">
          <section>
            <h2 className="font-display text-2xl text-bone">The service</h2>
            <p className="mt-2">
              Haunted Portrait turns a photo you upload into a Halloween-styled portrait
              using an AI image provider. Results vary and are provided as-is; we cannot
              guarantee a particular likeness or artistic outcome. There are no accounts
              and no order history.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-bone">Payment and refunds</h2>
            <p className="mt-2">
              Payment is a single charge of {price} per portrait, processed by our payment
              provider. If generation fails you are not charged. If you are unhappy with
              the result, email us within 7 days of purchase and we refund you, no
              questions asked.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-bone">Your photo and consent</h2>
            <p className="mt-2">
              You must own the photo or have permission from every person in it, and you
              confirm this with the required consent checkbox. You keep ownership of your
              photo; you give us permission to process it only to generate your portrait.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-bone">Prohibited content</h2>
            <p className="mt-2">
              Do not upload illegal content, sexual content, content that infringes
              copyright, or images of people who have not consented. Do not upload photos
              of minors without permission from a parent or guardian. We may refuse
              generation and delete anything that breaks these rules.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-bone">Retention</h2>
            <p className="mt-2">
              Your photo, the generated portrait and the preview are deleted after 48
              hours. Download links expire after 15 minutes, so save your file as soon as
              you unlock it. After 48 hours the files are gone and cannot be recovered.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-bone">Contact</h2>
            <p className="mt-2">
              Questions, refunds or content reports:{" "}
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
