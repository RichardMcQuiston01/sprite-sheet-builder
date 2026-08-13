// Builds the demo's static site into demo/public:
//   1. runs sprite-sheet-builder over demo/icons (dogfooding the tool), and
//   2. copies the page shell into place.
//
// Expects the library's dist to be built first (npm run build / bun run
// build), since it imports the compiled entry:
//
//   npm run build && node demo/build.mjs
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runPipeline } from "../dist/index.js";

const demoDir = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(demoDir, "icons");
const publicDir = join(demoDir, "public");
const spritesDir = join(publicDir, "sprites");

await mkdir(spritesDir, { recursive: true });

const result = await runPipeline({
  assetDirectory: [iconsDir],
  recursive: "no",
  recursiveMethod: "single",
  generateCSSFile: "multiple",
  outputDirectory: spritesDir,
});

for (const sheet of result.sheets) {
  console.log(
    `packed ${sheet.images.length} icons into ${sheet.outputPath}.png (${sheet.width}x${sheet.height})`,
  );
}

await cp(join(demoDir, "index.html"), join(publicDir, "index.html"));
console.log(`\nDemo built into ${publicDir}`);
