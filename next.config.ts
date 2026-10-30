import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // HEIC conversion compiles bundled WebAssembly; Plausible is optional.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://plausible.io${
    isDev ? " 'unsafe-eval'" : ""
  }`,
  "worker-src 'self' blob:",
  `connect-src 'self' https://plausible.io${isDev ? " ws: http: https:" : ""}`,
].join("; ");

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
