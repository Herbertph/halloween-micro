// Regenerates the placeholder landing assets in public/.
// These are placeholders: the owner replaces them with real examples before launch.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve("public");

function portraitSvg(bg1, bg2, body, moon, hat = false) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="${bg1}"/>
        <stop offset="1" stop-color="${bg2}"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="34%" r="55%">
        <stop offset="0" stop-color="rgba(255,220,170,0.35)"/>
        <stop offset="1" stop-color="rgba(255,220,170,0)"/>
      </radialGradient>
    </defs>
    <rect width="600" height="600" fill="url(#bg)"/>
    <rect width="600" height="600" fill="url(#glow)"/>
    ${moon ? `<circle cx="452" cy="128" r="${moon.r}" fill="${moon.fill}" opacity="${moon.opacity}"/>` : ""}
    <circle cx="300" cy="252" r="96" fill="${body}"/>
    <path d="M150 600 C162 452 232 384 300 384 C368 384 438 452 450 600 Z" fill="${body}"/>
    ${hat ? `<path d="M300 96 L372 188 L228 188 Z" fill="${hat}" opacity="0.92"/><rect x="212" y="180" width="176" height="18" rx="9" fill="${hat}" opacity="0.92"/>` : ""}
    <rect x="0" y="520" width="600" height="80" fill="rgba(0,0,0,0.18)"/>
  </svg>`;
}

const examples = {
  "vampire-before": portraitSvg("#d8cbb9", "#9c8d7c", "#4a4038", null),
  "vampire-after": portraitSvg("#2a0d1c", "#0d0509", "#1a0d12", { r: 96, fill: "#f6d9a8", opacity: 0.8 }),
  "witch-before": portraitSvg("#d6ccbd", "#9a8b78", "#4b4139", null),
  "witch-after": portraitSvg("#231241", "#0b0616", "#1a1026", { r: 104, fill: "#c9a6ff", opacity: 0.55 }, "#4b2a72"),
  "pumpkin-before": portraitSvg("#dcd0be", "#a08f7a", "#4c4238", null),
  "pumpkin-after": portraitSvg("#3a1a06", "#100502", "#1e0e05", { r: 110, fill: "#ffb347", opacity: 0.65 }),
};

await mkdir(path.join(root, "examples"), { recursive: true });
for (const [name, svg] of Object.entries(examples)) {
  await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(path.join(root, "examples", `${name}.jpg`));
}

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <radialGradient id="g" cx="78%" cy="18%" r="60%">
      <stop offset="0" stop-color="rgba(255,122,24,0.35)"/>
      <stop offset="1" stop-color="rgba(255,122,24,0)"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#08060c"/>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="960" cy="170" r="120" fill="#f6d9a8" opacity="0.85"/>
  <text x="80" y="300" font-family="Georgia, serif" font-size="92" fill="#f6efe6">Haunted Portrait</text>
  <text x="82" y="380" font-family="sans-serif" font-size="34" fill="#ffb347">Turn your photo into Halloween art</text>
  <text x="82" y="470" font-family="sans-serif" font-size="26" fill="#cbbfae">Free preview · $4.99 full resolution · deleted after 48 hours</text>
</svg>`;
await sharp(Buffer.from(og)).png().toFile(path.join(root, "og.png"));

console.log("assets written");
