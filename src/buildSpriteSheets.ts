import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  commitStagedOutput,
  toManifestPath,
} from "./output/commitOutput.ts";
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

  // Build everything into a staging directory inside the output directory
  // (so watchers and discovery already ignore it), and only move it into
  // place once every sheet and CSS file has been produced. A failure leaves
  // the previous output untouched.
  await mkdir(outputDirectory, { recursive: true });
  const stagingDirectory = join(
    outputDirectory,
    `.staging-${randomUUID()}`,
  );
  try {
    const stagedSheets = await packSheets(groups, stagingDirectory);
    const sheets: PackedSheet[] = stagedSheets.map((sheet) => ({
      ...sheet,
      imageFile: join(outputDirectory, `${sheet.outputPath}.png`),
    }));
    const cssFiles = generateCss(sheets, outputDirectory, config.generateCSSFile);

    for (const cssFile of cssFiles) {
      const stagedPath = join(
        stagingDirectory,
        toManifestPath(outputDirectory, cssFile.filePath),
      );
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, cssFile.content, "utf-8");
    }

    await commitStagedOutput(stagingDirectory, outputDirectory, [
      ...sheets.map((sheet) => toManifestPath(outputDirectory, sheet.imageFile)),
      ...cssFiles.map((cssFile) =>
        toManifestPath(outputDirectory, cssFile.filePath),
      ),
    ]);

    return { config, sheets, cssFiles };
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
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
