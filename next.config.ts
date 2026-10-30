import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
