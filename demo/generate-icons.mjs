// Generates the demo's source icons: original, simple geometric glyphs
// rasterised from inline SVG to PNG via sharp. Run once to (re)create the
// committed PNGs under demo/icons:
//
//   node demo/generate-icons.mjs
//
// The demo build then feeds these PNGs through sprite-sheet-builder itself.
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(here, "icons");

/**
 * Each icon is an original solid glyph on a transparent background. Sizes are
 * intentionally varied so the sprite packing visibly handles mixed dimensions.
 */
const icons = [
  { name: "star", size: 112, color: "#f59e0b", path: "M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z" },
  { name: "heart", size: 96, color: "#ef4444", path: "M12 21C6 16.5 3 13 3 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 9 2.5C21 13 18 16.5 12 21z" },
  { name: "bolt", size: 88, color: "#eab308", path: "M13 2L4 14h6l-1 8 9-12h-6z" },
  { name: "droplet", size: 80, color: "#3b82f6", path: "M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" },
  { name: "moon", size: 104, color: "#8b5cf6", path: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" },
  { name: "cloud", size: 120, color: "#0ea5e9", path: "M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 17 18z" },
  { name: "hexagon", size: 96, color: "#10b981", path: "M12 2l8.7 5v10L12 22l-8.7-5V7z" },
  { name: "triangle", size: 72, color: "#f97316", path: "M12 3l9 16H3z" },
  { name: "diamond", size: 84, color: "#ec4899", path: "M12 2l10 10-10 10L2 12z" },
  { name: "plus", size: 76, color: "#14b8a6", path: "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" },
  { name: "leaf", size: 100, color: "#22c55e", path: "M4 20C4 10 12 4 20 4c0 10-8 16-16 16zm2-2c6-1 10-5 12-10" },
  { name: "shield", size: 92, color: "#6366f1", path: "M12 2l8 3v6c0 5-3.5 8-8 11-4.5-3-8-6-8-11V5z" },
];

await mkdir(iconsDir, { recursive: true });

for (const icon of icons) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${icon.size}" height="${icon.size}" viewBox="0 0 24 24"><path d="${icon.path}" fill="${icon.color}"/></svg>`;
  const file = join(iconsDir, `${icon.name}.png`);
  await mkdir(dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(file);
  console.log(`wrote ${file} (${icon.size}x${icon.size})`);
}

console.log(`\nGenerated ${icons.length} demo icons in ${iconsDir}`);
