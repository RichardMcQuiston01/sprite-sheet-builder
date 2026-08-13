#!/usr/bin/env node
import { resolve } from "node:path";
import { runPipeline } from "../src/buildSpriteSheets.ts";
import type { BuildResult } from "../src/buildSpriteSheets.ts";
import { loadConfig } from "../src/config/loadConfig.ts";
import { ConfigValidationError } from "../src/config/ConfigValidationError.ts";
import { watchSpriteSheets } from "../src/watch/watchSpriteSheets.ts";

const args = process.argv.slice(2);
const configArgIndex = args.indexOf("--config");
const configArg = configArgIndex !== -1 ? args[configArgIndex + 1] : undefined;
// A trailing `--config` (or one followed by another flag) is a usage error,
// not a cue to silently fall back to the default config path.
if (configArgIndex !== -1 && (configArg === undefined || configArg.startsWith("--"))) {
  console.error("--config requires a file path");
  process.exit(2);
}
const configPath = resolve(configArg ?? "spritesheet.config.json");
const watch = args.includes("--watch");

function reportBuild(result: BuildResult): void {
  console.log(`Generated ${result.sheets.length} sprite sheet(s):`);
  for (const sheet of result.sheets) {
    console.log(
      `  ${sheet.outputPath}.png (${sheet.width}x${sheet.height}, ${sheet.images.length} image(s))`,
    );
  }
  if (result.cssFiles.length > 0) {
    console.log(`Generated ${result.cssFiles.length} CSS file(s).`);
  }
}

function reportError(error: unknown): void {
  if (error instanceof ConfigValidationError) {
    console.error(error.message);
  } else {
    console.error(
      `sprite-sheet-builder failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

try {
  const config = await loadConfig(configPath);
  reportBuild(await runPipeline(config));

  if (watch) {
    const watcher = await watchSpriteSheets(config, {
      onRebuild: (result) => {
        const time = new Date().toLocaleTimeString();
        console.log(
          `[${time}] Rebuilt ${result.sheets.length} sprite sheet(s).`,
        );
      },
      onError: (error) => reportError(error),
    });

    console.log(
      `Watching ${config.assetDirectory.length} director${config.assetDirectory.length === 1 ? "y" : "ies"} for changes. Press Ctrl+C to stop.`,
    );

    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      watcher
        .close()
        .then(() => process.exit(0))
        .catch((error) => {
          reportError(error);
          process.exit(1);
        });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
} catch (error) {
  reportError(error);
  process.exit(1);
}
