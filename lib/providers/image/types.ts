import type { GenerateError, StyleId } from "@/lib/types";

export interface ImageProviderInput {
  image: Buffer;
  styleId: StyleId;
}

export type ImageProviderResult = { fullRes: Buffer } | { error: GenerateError };

export interface ImageProvider {
  generatePortrait(input: ImageProviderInput): Promise<ImageProviderResult>;
}
