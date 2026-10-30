import { stylePrompt } from "@/config/styles";
import type { GenerateError } from "@/lib/types";

import type { ImageProvider, ImageProviderInput, ImageProviderResult } from "./types";

/**
 * Gemini image adapter. Implemented against the documented REST shape but not
 * exercised in this increment (there is no key yet). Misconfiguration fails
 * cleanly with `fatal` instead of throwing into the request.
 */
export class GeminiImageProvider implements ImageProvider {
  async generatePortrait(
    input: ImageProviderInput,
  ): Promise<ImageProviderResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { error: "fatal" };

    const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
    const base =
      process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com";
    const prompt = stylePrompt(input.styleId);

    let response: Response;
    try {
      response = await fetch(
        `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: "image/jpeg",
                      data: input.image.toString("base64"),
                    },
                  },
                ],
              },
            ],
          }),
        },
      );
    } catch {
      return { error: "transient" };
    }

    if (!response.ok) {
      return { error: errorForStatus(response.status) };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { error: "fatal" };
    }

    const candidate = (body as {
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ inlineData?: { data?: string } }> };
      }>;
    }).candidates?.[0];

    if (!candidate) return { error: "moderation" };
    if (
      candidate.finishReason === "SAFETY" ||
      candidate.finishReason === "PROHIBITED_CONTENT"
    ) {
      return { error: "moderation" };
    }

    const imagePart = candidate.content?.parts?.find(
      (part) => part.inlineData?.data,
    );
    if (!imagePart?.inlineData?.data) return { error: "fatal" };

    return { fullRes: Buffer.from(imagePart.inlineData.data, "base64") };
  }
}

function errorForStatus(status: number): GenerateError {
  if (status === 429) return "transient";
  if (status >= 500) return "transient";
  if (status === 400 || status === 404) return "fatal";
  return "fatal";
}
