import "server-only";

import type { PublicStyle, StyleId } from "@/lib/types";

interface StyleDefinition extends PublicStyle {
  prompt: string;
}

const SUBJECT = "the person or animal in the photo";

/**
 * The five styles live here and nowhere else. Prompts are server-only: this
 * module is never imported by a client component and never serialised.
 */
const STYLES: Record<StyleId, StyleDefinition> = {
  vampire: {
    id: "vampire",
    name: "Vampire",
    description: "Moonlit count with a velvet cape and a polite smile.",
    prompt: `Reimagine ${SUBJECT} as a classic Halloween vampire count for a
      friendly seasonal portrait. Keep the subject's identity, pose and framing
      intact. Velvet cape, candlelit castle background, warm moon glow. No blood,
      no gore, no weapons, no frightening detail. Family-friendly.`,
  },
  zombie: {
    id: "zombie",
    name: "Zombie",
    description: "Friendly undead with stage make-up, not nightmare fuel.",
    prompt: `Reimagine ${SUBJECT} as a playful cartoon zombie for a family
      Halloween portrait. Keep the subject's identity, pose and framing intact.
      Pale stage make-up, torn-but-covered clothes, gentle fog. No blood, no
      gore, no wounds, no weapons. Family-friendly.`,
  },
  witch: {
    id: "witch",
    name: "Witch",
    description: "Pointed hat, purple haze and a cauldron of sweets.",
    prompt: `Reimagine ${SUBJECT} as a friendly Halloween witch for a seasonal
      portrait. Keep the subject's identity, pose and framing intact. Pointed
      hat, purple moonlit haze, small cauldron of sweets. No gore, no weapons,
      no nudity. Family-friendly.`,
  },
  skeleton: {
    id: "skeleton",
    name: "Skeleton",
    description: "Glowing bone styling that keeps the face recognisable.",
    prompt: `Reimagine ${SUBJECT} as a friendly skeleton with glowing bone
      styling for a Halloween portrait. Keep the subject's identity, pose and
      framing intact. The face stays recognisable and kind. No gore, no blood,
      no weapons. Family-friendly.`,
  },
  pumpkin: {
    id: "pumpkin",
    name: "Pumpkin",
    description: "Carved-lantern glow and an autumnal harvest backdrop.",
    prompt: `Reimagine ${SUBJECT} as a pumpkin-themed Halloween portrait with
      carved-lantern glow and an autumnal harvest backdrop. Keep the subject's
      identity, pose and framing intact. Warm orange light. No gore, no blood,
      no weapons. Family-friendly.`,
  },
};

export function getStyle(id: StyleId): StyleDefinition {
  return STYLES[id];
}

export function stylePrompt(id: StyleId): string {
  return STYLES[id].prompt.replace(/\s+/g, " ").trim();
}

export function publicStyles(): PublicStyle[] {
  return Object.values(STYLES).map(({ id, name, description }) => ({
    id,
    name,
    description,
  }));
}
