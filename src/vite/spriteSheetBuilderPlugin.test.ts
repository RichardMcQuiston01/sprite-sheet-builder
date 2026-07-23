import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ConfigValidationError } from "../config/ConfigValidationError.ts";
import {
  createFixtureDir,
  makeFixtureImage,
  removeFixtureDir,
} from "../testing/imageFixtures.ts";
import { spriteSheetBuilder } from "./spriteSheetBuilderPlugin.ts";

/**
 * Vite typically types plugin hooks as `Fn | { handler: Fn }`. This repo's
 * plugin always assigns plain functions, so this pulls the callable back
 * out regardless of which member of that union TS infers.
 */
function extractHook(
  hook: unknown,
): (...args: unknown[]) => unknown {
  if (typeof hook === "function") {
    return hook as (...args: unknown[]) => unknown;
  }
  if (hook && typeof hook === "object" && "handler" in hook) {
    return (hook as { handler: (...args: unknown[]) => unknown }).handler;
  }
  throw new Error("expected a plugin hook to be defined");
}

describe("spriteSheetBuilder", () => {
  test("throws for an invalid config", () => {
    expect(() =>
      spriteSheetBuilder({ assetDirectory: [], outputDirectory: "" }),
    ).toThrow(ConfigValidationError);
  });

  test("buildStart runs the pipeline against the configured directories", async () => {
    const root = await createFixtureDir(
      "sprite-sheet-builder-vite-buildstart-",
    );
    try {
      await makeFixtureImage(root, "assets/icons/star.png", 10, 10);
      const outputDirectory = join(root, "out");

      const plugin = spriteSheetBuilder({
        assetDirectory: [join(root, "assets", "icons")],
        outputDirectory,
      });

      const buildStart = extractHook(plugin.buildStart);
      await buildStart.call({});

      const cssContent = await readFile(
        join(outputDirectory, "icons.css"),
        "utf-8",
      );
      expect(cssContent).toContain(".star {");
    } finally {
      await removeFixtureDir(root);
    }
  });

  test("buildStart propagates pipeline errors", async () => {
    const root = await createFixtureDir(
      "sprite-sheet-builder-vite-buildstart-error-",
    );
    try {
      await makeFixtureImage(root, "a/icons/star.png", 10, 10);
      await makeFixtureImage(root, "b/icons/moon.png", 8, 8);

      const plugin = spriteSheetBuilder({
        assetDirectory: [join(root, "a", "icons"), join(root, "b", "icons")],
        outputDirectory: join(root, "out"),
      });

      const buildStart = extractHook(plugin.buildStart);
      await expect(buildStart.call({})).rejects.toThrow(
        /resolve to sprite sheet/i,
      );
    } finally {
      await removeFixtureDir(root);
    }
  });
});
