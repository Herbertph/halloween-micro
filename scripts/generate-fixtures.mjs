// Generates the test fixtures in tests/fixtures/. No real people or cards.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import piexif from "piexifjs";
import sharp from "sharp";

const root = path.resolve("tests/fixtures");
await mkdir(root, { recursive: true });

const scene = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b2f4a"/>
      <stop offset="0.55" stop-color="#a8724a"/>
      <stop offset="1" stop-color="#e2c39a"/>
    </linearGradient>
  </defs>
  <rect width="900" height="700" fill="url(#bg)"/>
  <circle cx="330" cy="470" r="150" fill="#5c3d2e"/>
  <circle cx="590" cy="260" r="90" fill="#f4e0b8"/>
  <rect x="120" y="90" width="240" height="160" fill="#26313d" opacity="0.7"/>
  <path d="M0 700 L240 380 L460 700 Z" fill="#1c2430" opacity="0.6"/>
</svg>`;

const valid = await sharp(Buffer.from(scene)).jpeg({ quality: 88 }).toBuffer();
await writeFile(path.join(root, "valid.jpg"), valid);
await writeFile(path.join(root, "valid.png"), await sharp(Buffer.from(scene)).png().toBuffer());

const blank = await sharp({
  create: { width: 400, height: 400, channels: 3, background: "#ffffff" },
})
  .jpeg({ quality: 90 })
  .toBuffer();
await writeFile(path.join(root, "blank.jpg"), blank);

const gpsExif = piexif.dump({
  "0th": {
    [piexif.ImageIFD.Make]: "Fixture Camera",
    [piexif.ImageIFD.Orientation]: 1,
  },
  Exif: {
    [piexif.ExifIFD.DateTimeOriginal]: "2026:10:30 20:00:00",
  },
  GPS: {
    [piexif.GPSIFD.GPSLatitudeRef]: "N",
    [piexif.GPSIFD.GPSLatitude]: [
      [51, 1],
      [30, 1],
      [0, 1],
    ],
    [piexif.GPSIFD.GPSLongitudeRef]: "W",
    [piexif.GPSIFD.GPSLongitude]: [
      [0, 1],
      [7, 1],
      [0, 1],
    ],
  },
  "1st": {},
  thumbnail: null,
});

const gpsJpeg = Buffer.from(
  piexif.insert(gpsExif, `data:image/jpeg;base64,${valid.toString("base64")}`).split(",")[1],
  "base64",
);
await writeFile(path.join(root, "gps.jpg"), gpsJpeg);

console.log("fixtures written");
