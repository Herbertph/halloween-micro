import Image from "next/image";
import Link from "next/link";

import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { priceCents } from "@/lib/env";
import { bannerForDate, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

const EXAMPLES = [
  {
    style: "Vampire",
    before: "/examples/vampire-before.jpg",
    after: "/examples/vampire-after.jpg",
    alt: "Placeholder example: portrait before and after the vampire style",
  },
  {
    style: "Witch",
    before: "/examples/witch-before.jpg",
    after: "/examples/witch-after.jpg",
    alt: "Placeholder example: portrait before and after the witch style",
  },
  {
    style: "Pumpkin",
    before: "/examples/pumpkin-before.jpg",
    after: "/examples/pumpkin-after.jpg",
    alt: "Placeholder example: portrait before and after the pumpkin style",
  },
];

const STEPS = [
  {
    title: "Pick one photo",
    body: "A person, a pet or the whole group. JPG, PNG or WEBP up to 10 MB. We resize it in your browser before it leaves your phone.",
  },
  {
    title: "See it haunted for free",
    body: "Choose a style and get a watermarked preview in seconds. Your full-resolution portrait stays locked until you pay.",
  },
  {
    title: "Unlock the HD file",
    body: "Pay $4.99 once with a card and download the full-resolution portrait immediately. No account, no email.",
  },
];

const FAQS = [
  {
    q: "What happens to my photo?",
    a: "Your upload is processed by our AI image provider to create the portrait, stored privately and deleted automatically after 48 hours. It is never shown publicly or reused in marketing.",
  },
  {
    q: "Can I haunt my pet?",
    a: "Yes. The same styles work for people, pets and groups — the portrait keeps the pose and framing of the photo.",
  },
  {
    q: "What about kids?",
    a: "Children can be in the photo, but whoever uploads it must own the photo or have permission from the people in it. That consent checkbox is required.",
  },
  {
    q: "What is the refund policy?",
    a: "Email us within 7 days of purchase and we refund you, no questions asked. If generation fails you are never charged.",
  },
  {
    q: "Do I need an account?",
    a: "No. No sign-up, no email and no order history. Your download link is valid for 15 minutes, so save the file.",
  },
];

export default function HomePage() {
  const banner = bannerForDate(new Date());
  const price = formatPrice(priceCents());

  return (
    <div className="flex min-h-dvh flex-col">
      {banner ? (
        <p
          className={`border-b px-4 py-2 text-center text-sm font-medium ${
            banner.tone === "today"
              ? "border-ember/40 bg-ember/15 text-pumpkin"
              : "border-hex/30 bg-hex/10 text-bone"
          }`}
          role="status"
        >
          {banner.text}
        </p>
      ) : null}

      <SiteHeader />

      <main className="flex-1">
        <section className="container-page grid items-center gap-12 pb-16 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="max-w-xl">
            <h1 className="font-display text-5xl leading-[0.95] tracking-tight text-bone sm:text-6xl lg:text-7xl">
              Your photo, delightfully haunted.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-bone/80">
              Upload a photo, pick a Halloween style and see a free preview. Pay{" "}
              {price} only if you love it — the full-resolution portrait downloads
              straight to your phone.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/create" className="btn-primary">
                Haunt my photo
              </Link>
              <span className="text-sm text-bone/60">
                Under 90 seconds on a phone. No account needed.
              </span>
            </div>
            <ul className="mt-10 grid gap-3 text-sm text-bone/70 sm:grid-cols-3">
              <li className="border-t hairline pt-3">Photos deleted after 48 hours</li>
              <li className="border-t hairline pt-3">Free watermarked preview</li>
              <li className="border-t hairline pt-3">7-day refund policy</li>
            </ul>
          </div>

          <figure className="haunt-in relative rounded-[2rem] border border-white/10 bg-night/80 p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
            <div className="relative overflow-hidden rounded-[1.4rem]">
              <Image
                src="/examples/vampire-after.jpg"
                alt="Placeholder example of a haunted portrait in the vampire style"
                width={600}
                height={600}
                priority
                sizes="(max-width: 1024px) 90vw, 480px"
                className="aspect-square w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-ink/90 to-transparent p-4">
                <figcaption className="text-sm text-bone/80">
                  Vampire style · placeholder example
                </figcaption>
                <span className="rounded-full border border-white/20 px-3 py-1 text-xs text-bone/80">
                  Sample
                </span>
              </div>
            </div>
          </figure>
        </section>

        <section aria-labelledby="examples-heading" className="container-page py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="examples-heading" className="font-display text-3xl sm:text-4xl">
              Before / after
            </h2>
            <p className="max-w-sm text-sm text-bone/60">
              Placeholder examples for now — they are not customer photos and will be
              replaced before launch.
            </p>
          </div>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {EXAMPLES.map((example) => (
              <li
                key={example.style}
                className="rounded-2xl border border-white/10 bg-night/60 p-3"
              >
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative overflow-hidden rounded-xl border border-white/10">
                    <Image
                      src={example.before}
                      alt={example.alt.replace("before and after", "before")}
                      width={400}
                      height={400}
                      sizes="(max-width: 640px) 42vw, 200px"
                      className="aspect-square w-full object-cover"
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-bone/70">
                      Before
                    </span>
                  </div>
                  <div className="relative overflow-hidden rounded-xl border border-ember/30">
                    <Image
                      src={example.after}
                      alt={example.alt.replace("before and after", "after")}
                      width={400}
                      height={400}
                      sizes="(max-width: 640px) 42vw, 200px"
                      className="aspect-square w-full object-cover"
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-ember/90 px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-[#1a0d02]">
                      After
                    </span>
                  </div>
                </div>
                <p className="mt-3 px-1 pb-1 text-sm text-bone/75">{example.style} style</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="border-y hairline bg-night/40 py-16"
        >
          <div className="container-page">
            <h2 id="how-heading" className="font-display text-3xl sm:text-4xl">
              How it works
            </h2>
            <ol className="mt-8 grid gap-8 md:grid-cols-3">
              {STEPS.map((step) => (
                <li key={step.title} className="border-t border-ember/40 pt-5">
                  <h3 className="font-display text-2xl">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-bone/70">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pricing" aria-labelledby="pricing-heading" className="container-page py-16">
          <h2 id="pricing-heading" className="font-display text-3xl sm:text-4xl">
            One portrait, one price
          </h2>
          <div className="mt-8 grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <p className="text-6xl font-semibold text-pumpkin">{price}</p>
            <div>
              <ul className="grid gap-3 text-base text-bone/80 sm:grid-cols-2">
                <li>Five Halloween styles</li>
                <li>Watermarked preview free</li>
                <li>Full-resolution JPEG download</li>
                <li>Payment once, no subscription</li>
                <li>No account or email required</li>
                <li>7-day refund policy</li>
              </ul>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link href="/create" className="btn-primary">
                  Haunt my photo — {price}
                </Link>
                <span className="text-sm text-bone/60">
                  Charged once. Photos deleted after 48 hours.
                </span>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="container-page pb-8">
          <h2 id="faq-heading" className="font-display text-3xl sm:text-4xl">
            Questions
          </h2>
          <div className="mt-6 divide-y divide-white/10 border-y hairline">
            {FAQS.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-bone marker:hidden">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="text-pumpkin transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-bone/70">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
