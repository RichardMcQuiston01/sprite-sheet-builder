import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateCss } from "./css/generateCss.ts";
import type { CssFileOutput } from "./css/generateCss.ts";
import { loadConfig } from "./config/loadConfig.ts";
import type { ResolvedSpriteSheetConfig } from "./config/types.ts";
import { discoverImageGroups } from "./discovery/discoverImageGroups.ts";
import { packSheets } from "./pack/packSheets.ts";
import type { PackedSheet } from "./pack/packSheets.ts";

/** Summary of a completed sprite sheet build. */
export interface BuildResult {
  config: ResolvedSpriteSheetConfig;
  sheets: PackedSheet[];
  cssFiles: CssFileOutput[];
}

/**
 * Runs the full pipeline against an already-resolved config: discover
 * images, pack sheets, and generate CSS, writing all output under
 * `config.outputDirectory`.
 */
export async function runPipeline(
  config: ResolvedSpriteSheetConfig,
): Promise<BuildResult> {
  const outputDirectory = resolve(config.outputDirectory);

  const groups = await discoverImageGroups(config);
  const sheets = await packSheets(groups, outputDirectory);
  const cssFiles = generateCss(sheets, outputDirectory, config.generateCSSFile);

  for (const cssFile of cssFiles) {
    await mkdir(dirname(cssFile.filePath), { recursive: true });
    await writeFile(cssFile.filePath, cssFile.content, "utf-8");
  }

  return { config, sheets, cssFiles };
}

/**
 * Reads and validates `configPath` from disk, then runs {@link runPipeline}.
 */
export async function buildSpriteSheets(
  configPath: string,
): Promise<BuildResult> {
  const config = await loadConfig(configPath);
  return runPipeline(config);
}
