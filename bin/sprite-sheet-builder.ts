#!/usr/bin/env bun
import { resolve } from "node:path";
import { buildSpriteSheets } from "../src/buildSpriteSheets.ts";
import { ConfigValidationError } from "../src/config/ConfigValidationError.ts";

const configArgIndex = process.argv.indexOf("--config");
const configArg =
  configArgIndex !== -1 ? process.argv[configArgIndex + 1] : undefined;
const configPath = resolve(configArg ?? "spritesheet.config.json");

try {
  const result = await buildSpriteSheets(configPath);
  console.log(`Generated ${result.sheets.length} sprite sheet(s):`);
  for (const sheet of result.sheets) {
    console.log(
      `  ${sheet.outputPath}.png (${sheet.width}x${sheet.height}, ${sheet.images.length} image(s))`,
    );
  }
  if (result.cssFiles.length > 0) {
    console.log(`Generated ${result.cssFiles.length} CSS file(s).`);
  }
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error(error.message);
  } else {
    console.error(
      `sprite-sheet-builder failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  process.exit(1);
}
