// Fails the build when a server secret or a style prompt lands in the client
// bundle. Run after `npm run build` (the unit suite also covers this).
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const staticDir = path.join(process.cwd(), ".next", "static");

try {
  await access(staticDir);
} catch {
  console.log("No .next/static yet — run `npm run build` first.");
  process.exit(0);
}

async function walk(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, files);
    else files.push(full);
  }
  return files;
}

const secretNames = [
  "DOWNLOAD_SIGNING_SECRET",
  "MOCK_WEBHOOK_SECRET",
  "GEMINI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CRON_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "KV_REST_TOKEN",
  "TURNSTILE_SECRET_KEY",
  "ADMIN_PASSWORD",
];

const values = secretNames
  .map((name) => process.env[name])
  .filter((value) => typeof value === "string" && value.length >= 8);

const promptFragments = [
  "Reimagine the person or animal in the photo",
  "Keep the subject's identity, pose and framing",
  "Family-friendly",
];

const files = await walk(staticDir);
const leaks = [];
for (const file of files) {
  if (!/\.(js|css|json|html|txt)$/.test(file)) continue;
  const content = await readFile(file, "utf8");
  for (const value of values) if (content.includes(value)) leaks.push(`${file}: secret`);
  for (const fragment of promptFragments) {
    if (content.toLowerCase().includes(fragment.toLowerCase())) {
      leaks.push(`${file}: prompt text`);
    }
  }
}

if (leaks.length > 0) {
  console.error("Server-only content leaked into the client bundle:");
  for (const leak of leaks) console.error(` - ${leak}`);
  process.exit(1);
}

console.log("Client bundle clean: no secrets or prompt text found.");
