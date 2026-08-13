import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runPipeline } from "../buildSpriteSheets.ts";
import type { ResolvedSpriteSheetConfig } from "../config/types.ts";
import {
  createFixtureDir,
  makeFixtureImage,
  removeFixtureDir,
} from "../testing/imageFixtures.ts";
import { watchSpriteSheets } from "./watchSpriteSheets.ts";

function makeConfig(
  assetDirectory: string[],
  outputDirectory: string,
): ResolvedSpriteSheetConfig {
  return {
    assetDirectory,
    outputDirectory,
    recursive: "no",
    recursiveMethod: "single",
    generateCSSFile: "multiple",
  };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor: timed out waiting for condition");
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("watchSpriteSheets", () => {
  test(
    "rebuilds when a new image appears, and stops after close",
    async () => {
      const root = await createFixtureDir("sprite-sheet-watch-cli-");
      try {
        const assetDir = join(root, "assets", "icons");
        await makeFixtureImage(root, "assets/icons/star.png", 10, 10);
        const outputDirectory = join(root, "out");
        const config = makeConfig([assetDir], outputDirectory);

        // Initial build (the watcher itself does not build on start).
        await runPipeline(config);

        let rebuilds = 0;
        const watcher = await watchSpriteSheets(config, {
          onRebuild: () => rebuilds++,
        });

        await makeFixtureImage(root, "assets/icons/moon.png", 8, 8);
        await waitFor(() => rebuilds > 0);

        const cssContent = await readFile(
          join(outputDirectory, "icons.css"),
          "utf-8",
        );
        expect(cssContent).toContain(".moon {");

        // After close, further changes must not trigger rebuilds.
        await watcher.close();
        const rebuildsAtClose = rebuilds;
        await makeFixtureImage(root, "assets/icons/heart.png", 12, 12);
        await new Promise((r) => setTimeout(r, 400));
        expect(rebuilds).toBe(rebuildsAtClose);
      } finally {
        await removeFixtureDir(root);
      }
    },
    15000,
  );
});
