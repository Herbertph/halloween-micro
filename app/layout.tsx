import type { Metadata } from "next";
import Script from "next/script";

import "@fontsource-variable/inter";
import "@fontsource/im-fell-english/400.css";
import "./globals.css";

import { plausibleDomain, siteUrl } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Haunted Portrait — turn your photo into Halloween art",
    template: "%s — Haunted Portrait",
  },
  description:
    "Upload one photo, pick a Halloween style, see a free preview and unlock the full-resolution portrait for $4.99. No account needed. Photos are deleted after 48 hours.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl(),
    siteName: "Haunted Portrait",
    title: "Haunted Portrait — turn your photo into Halloween art",
    description:
      "One photo, one Halloween style, one $4.99 download. Free watermarked preview first. Photos are deleted after 48 hours.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Haunted Portrait" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Haunted Portrait — turn your photo into Halloween art",
    description:
      "Free watermarked preview, $4.99 to unlock the full-resolution portrait. Photos are deleted after 48 hours.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const domain = plausibleDomain();
  return (
    <html lang="en">
      <body className="font-body">
        {children}
        {domain ? (
          <Script
            defer
            data-domain={domain}
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  );
}
