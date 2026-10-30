import { DemoBadge } from "@/components/DemoBadge";
import { contactEmail } from "@/lib/env";
import { isDemoMode } from "@/lib/demo";

export function SiteHeader() {
  const demo = isDemoMode();
  return (
    <header className="border-b hairline">
      <div className="container-page flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="font-display text-xl tracking-wide text-bone"
            aria-label="Haunted Portrait home"
          >
            Haunted Portrait
          </a>
          {demo ? <DemoBadge /> : null}
        </div>
        <nav aria-label="Main" className="flex items-center gap-5 text-sm">
          <a href="/#how-it-works" className="hidden text-bone/80 hover:text-pumpkin sm:inline">
            How it works
          </a>
          <a href="/#pricing" className="hidden text-bone/80 hover:text-pumpkin sm:inline">
            Pricing
          </a>
          <a
            href="/create"
            className="rounded-full border border-ember/60 px-4 py-2 font-medium text-pumpkin hover:bg-ember/10"
          >
            Start
          </a>
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
            <a className="link" href="/privacy">
              Privacy
            </a>
            <a className="link" href="/terms">
              Terms
            </a>
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
