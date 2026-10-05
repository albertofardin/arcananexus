import path from "node:path";
import sharp from "sharp";

const dir = path.join(process.cwd(), "public", "mobile");
const source = path.join(dir, "_original.png");

const targets = [
  { file: "apple-touch-icon.png", size: 180 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
];

for (const { file, size } of targets) {
  await sharp(source).resize(size, size).png().toFile(path.join(dir, file));
  console.log(`✓ ${file} (${size}x${size})`);
}
