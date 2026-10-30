import { imageProviderName } from "@/lib/env";

import { GeminiImageProvider } from "./gemini";
import { MockImageProvider } from "./mock";
import type { ImageProvider } from "./types";

export type {
  ImageProvider,
  ImageProviderInput,
  ImageProviderResult,
} from "./types";

export function getImageProvider(name = imageProviderName()): ImageProvider {
  switch (name) {
    case "mock":
      return new MockImageProvider();
    case "gemini":
      return new GeminiImageProvider();
    default:
      // Misconfiguration must fail cleanly as a provider error, not a crash.
      return {
        generatePortrait: async () => ({ error: "fatal" }),
      };
  }
}
