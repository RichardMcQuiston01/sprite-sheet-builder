import { describe, expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { BuildResult } from "../buildSpriteSheets.ts";
import type { ResolvedSpriteSheetConfig } from "../config/types.ts";
import {
  createFixtureDir,
  makeFixtureImage,
  removeFixtureDir,
} from "../testing/imageFixtures.ts";
import { createSpriteSheetRebuilder } from "./spriteSheetRebuilder.ts";

function makeConfig(
  overrides: Partial<ResolvedSpriteSheetConfig> & {
    assetDirectory: string[];
    outputDirectory: string;
  },
): ResolvedSpriteSheetConfig {
  return {
    recursive: "no",
    recursiveMethod: "single",
    generateCSSFile: "multiple",
    ...overrides,
  };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor: timed out waiting for condition");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("createSpriteSheetRebuilder", () => {
  test("rebuilds when a watched image change is reported", async () => {
    const root = await createFixtureDir("sprite-sheet-rebuilder-");
    try {
      const assetDir = join(root, "assets", "icons");
      await makeFixtureImage(root, "assets/icons/star.png", 10, 10);
      const outputDirectory = join(root, "out");

      const results: BuildResult[] = [];
      const rebuilder = createSpriteSheetRebuilder(
        makeConfig({ assetDirectory: [assetDir], outputDirectory }),
        { onRebuild: (result) => results.push(result) },
      );
      try {
        await makeFixtureImage(root, "assets/icons/moon.png", 8, 8);
        rebuilder.notify(join(assetDir, "moon.png"));

        await waitFor(() => results.length > 0);

        const cssContent = await readFile(
          join(outputDirectory, "icons.css"),
          "utf-8",
        );
        expect(cssContent).toContain(".moon {");
      } finally {
        await rebuilder.close();
      }
    } finally {
      await removeFixtureDir(root);
    }
  });

  test("coalesces rapid-fire changes into a single rebuild", async () => {
    const root = await createFixtureDir("sprite-sheet-rebuilder-debounce-");
    try {
      const assetDir = join(root, "assets", "icons");
      await makeFixtureImage(root, "assets/icons/star.png", 10, 10);
      const outputDirectory = join(root, "out");

      let rebuilds = 0;
      const rebuilder = createSpriteSheetRebuilder(
        makeConfig({ assetDirectory: [assetDir], outputDirectory }),
        { onRebuild: () => rebuilds++ },
      );
      try {
        const imagePath = join(assetDir, "star.png");
        rebuilder.notify(imagePath);
        rebuilder.notify(imagePath);
        rebuilder.notify(imagePath);

        await waitFor(() => rebuilds > 0);
        await new Promise((r) => setTimeout(r, 200)); // no late extra rebuild

        expect(rebuilds).toBe(1);
      } finally {
        await rebuilder.close();
      }
    } finally {
      await removeFixtureDir(root);
    }
  });

  test("reports errors via onError without throwing, and keeps no result", async () => {
    const root = await createFixtureDir("sprite-sheet-rebuilder-error-");
    try {
      const assetDir = join(root, "assets", "icons");
      await makeFixtureImage(root, "assets/icons/star.png", 10, 10);
      const outputDirectory = join(root, "out");

      const errors: unknown[] = [];
      let rebuilds = 0;
      const rebuilder = createSpriteSheetRebuilder(
        makeConfig({ assetDirectory: [assetDir], outputDirectory }),
        {
          onRebuild: () => rebuilds++,
          onError: (error) => errors.push(error),
        },
      );
      try {
        // Delete the asset directory so the next rebuild's discovery fails.
        await rm(assetDir, { recursive: true, force: true });
        rebuilder.notify(join(assetDir, "star.png"));

        await waitFor(() => errors.length > 0);

        expect(rebuilds).toBe(0);
        expect(errors[0]).toBeInstanceOf(Error);
      } finally {
        await rebuilder.close();
      }
    } finally {
      await removeFixtureDir(root);
    }
  });

  describe("isWatchedImage", () => {
    test("matches supported images inside a watched directory", () => {
      const root = "/tmp/example";
      const assetDir = join(root, "assets", "icons");
      const rebuilder = createSpriteSheetRebuilder(
        makeConfig({
          assetDirectory: [assetDir],
          outputDirectory: join(root, "out"),
        }),
      );

      expect(rebuilder.isWatchedImage(join(assetDir, "star.png"))).toBe(true);
      expect(rebuilder.isWatchedImage(join(assetDir, "nested", "moon.jpg"))).toBe(
        true,
      );
      // Unsupported extension.
      expect(rebuilder.isWatchedImage(join(assetDir, "notes.txt"))).toBe(false);
      // Outside the watched directory.
      expect(rebuilder.isWatchedImage(join(root, "other", "star.png"))).toBe(
        false,
      );
      // Sibling directory that merely shares a name prefix.
      expect(
        rebuilder.isWatchedImage(
          join(root, "assets", "icons-archive", "old.png"),
        ),
      ).toBe(false);
    });

    test("excludes the output directory subtree nested inside an asset directory", () => {
      const root = "/tmp/example";
      const assetDir = join(root, "assets", "icons");
      const outputDirectory = join(assetDir, "out");
      const rebuilder = createSpriteSheetRebuilder(
        makeConfig({ assetDirectory: [assetDir], outputDirectory }),
      );

      expect(rebuilder.isWatchedImage(join(assetDir, "star.png"))).toBe(true);
      expect(rebuilder.isWatchedImage(join(outputDirectory, "icons.png"))).toBe(
        false,
      );
    });
  });
});
