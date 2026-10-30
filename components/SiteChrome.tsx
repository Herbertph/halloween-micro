import Link from "next/link";

import { contactEmail } from "@/lib/env";

export function SiteHeader() {
  return (
    <header className="border-b hairline">
      <div className="container-page flex h-16 items-center justify-between">
        <Link
          href="/"
          className="font-display text-xl tracking-wide text-bone"
          aria-label="Haunted Portrait home"
        >
          Haunted Portrait
        </Link>
        <nav aria-label="Main" className="flex items-center gap-5 text-sm">
          <Link href="/#how-it-works" className="hidden text-bone/80 hover:text-pumpkin sm:inline">
            How it works
          </Link>
          <Link href="/#pricing" className="hidden text-bone/80 hover:text-pumpkin sm:inline">
            Pricing
          </Link>
          <Link
            href="/create"
            className="rounded-full border border-ember/60 px-4 py-2 font-medium text-pumpkin hover:bg-ember/10"
          >
            Start
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const email = contactEmail();
  return (
    <footer className="mt-24 border-t hairline py-12">
      <div className="container-page grid gap-8 text-sm text-bone/70 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="font-display text-lg text-bone">Haunted Portrait</p>
          <p className="max-w-sm">
            A one-day Halloween shop. Photos are processed by an AI image provider and
            deleted automatically after 48 hours.
          </p>
          <p>
            Contact:{" "}
            <a className="link" href={`mailto:${email}`}>
              {email}
            </a>
          </p>
        </div>
        <div className="space-y-3 sm:text-right">
          <p>
            Not happy with your portrait? Email us within 7 days of purchase and we
            refund you.
          </p>
          <div className="flex gap-4 sm:justify-end">
            <Link className="link" href="/privacy">
              Privacy
            </Link>
            <Link className="link" href="/terms">
              Terms
            </Link>
          </div>
          <p className="text-xs text-bone/50">
            &copy; {new Date().getUTCFullYear()} Haunted Portrait. Placeholder examples
            are not customer photos.
          </p>
        </div>
      </div>
    </footer>
  );
}
