import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^server-only$/, replacement: path.resolve(__dirname, "tests/stubs/server-only.ts") },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "$1") },
    ],
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: true,
  },
});
