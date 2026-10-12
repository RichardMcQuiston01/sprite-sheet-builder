import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import sharp from "sharp";
import { buildSpriteSheets, runPipeline } from "./buildSpriteSheets.ts";
import { validateConfig } from "./config/loadConfig.ts";
import type { ResolvedSpriteSheetConfig } from "./config/types.ts";
import {
  createFixtureDir,
  makeFixtureImage,
  makeOrientedJpeg,
  removeFixtureDir,
} from "./testing/imageFixtures.ts";

let root: string;

beforeEach(async () => {
  root = await createFixtureDir("sprite-sheet-builder-e2e-");
  await makeFixtureImage(root, "src/icons/social/star.png", 10, 10);
  await makeFixtureImage(root, "src/icons/social/moon.png", 12, 8);
  await makeFixtureImage(root, "src/icons/nav/menu.png", 20, 4);

  await writeFile(
    join(root, "spritesheet.config.json"),
    JSON.stringify({
      assetDirectory: [join(root, "src", "icons")],
      recursive: "yes",
      recursiveMethod: "directory",
      outputDirectory: join(root, "out"),
      generateCSSFile: "multiple",
    }),
  );
});

afterEach(async () => {
  await removeFixtureDir(root);
});

describe("buildSpriteSheets (end-to-end)", () => {
  test("packs each directory into a sheet with matching CSS", async () => {
    const result = await buildSpriteSheets(
      join(root, "spritesheet.config.json"),
    );

    const byOutputPath = new Map(
      result.sheets.map((sheet) => [sheet.outputPath, sheet]),
    );
    expect(byOutputPath.size).toBe(2);

    const social = byOutputPath.get("icons/social");
    expect(social?.images).toHaveLength(2);

    const socialSheetPath = join(root, "out", "icons", "social.png");
    const metadata = await sharp(socialSheetPath).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.channels).toBe(4);
    // Sheet must be large enough to fit both non-overlapping images,
    // regardless of whether the packer arranged them side-by-side or stacked.
    const area = (metadata.width ?? 0) * (metadata.height ?? 0);
    expect(area).toBeGreaterThanOrEqual(10 * 10 + 12 * 8);

    const cssContent = await readFile(
      join(root, "out", "icons", "social.css"),
      "utf-8",
    );
    expect(cssContent).toContain(".star {");
    expect(cssContent).toContain(".moon {");
    expect(cssContent).toContain('url("social.png")');

    const navCssContent = await readFile(
      join(root, "out", "icons", "nav.css"),
      "utf-8",
    );
    expect(navCssContent).toContain(".menu {");
  });

  test("throws when a single image exceeds the maximum sheet dimension", async () => {
    await makeFixtureImage(root, "big/huge.png", 5000, 10);
    await writeFile(
      join(root, "big.config.json"),
      JSON.stringify({
        assetDirectory: [join(root, "big")],
        outputDirectory: join(root, "out-big"),
        generateCSSFile: "off",
      }),
    );

    await expect(
      buildSpriteSheets(join(root, "big.config.json")),
    ).rejects.toThrow(/exceeding/i);
  });

  test("keeps output inside outputDirectory for a '..' directory name (#17)", async () => {
    await makeFixtureImage(root, "dots/.. /evil/a.png", 4, 4);
    const outputDirectory = join(root, "nested", "out");

    const result = await runPipeline(
      validateConfig({
        assetDirectory: [join(root, "dots")],
        recursive: "yes",
        recursiveMethod: "directory",
        outputDirectory,
        generateCSSFile: "multiple",
      }),
    );

    for (const sheet of result.sheets) {
      expect(sheet.imageFile.startsWith(outputDirectory + sep)).toBe(true);
    }
    expect(result.sheets).toHaveLength(1);
  });

  test("applies JPEG EXIF orientation to packed dimensions (#22)", async () => {
    await makeOrientedJpeg(root, "photos/side.jpg", 8, 4, 6);

    const result = await runPipeline(
      validateConfig({
        assetDirectory: [join(root, "photos")],
        outputDirectory: join(root, "out-photos"),
        generateCSSFile: "off",
      }),
    );

    const image = result.sheets[0]?.images[0];
    expect(image?.width).toBe(4);
    expect(image?.height).toBe(8);
  });

  describe("output cleanup (#21)", () => {
    function configFor(
      assetDirectory: string,
      outputDirectory: string,
      generateCSSFile: "off" | "single" | "multiple" = "multiple",
    ): ResolvedSpriteSheetConfig {
      return validateConfig({
        assetDirectory: [assetDirectory],
        recursive: "yes",
        recursiveMethod: "directory",
        outputDirectory,
        generateCSSFile,
      });
    }

    test("removes sheets and CSS for deleted directories but keeps unrelated files", async () => {
      const outputDirectory = join(root, "out-clean");
      const config = configFor(join(root, "src", "icons"), outputDirectory);
      await runPipeline(config);
      await writeFile(join(outputDirectory, "keep.txt"), "mine");
      expect(await readdir(join(outputDirectory, "icons"))).toContain(
        "nav.png",
      );

      await rm(join(root, "src", "icons", "nav"), { recursive: true });
      await runPipeline(config);

      const remaining = await readdir(join(outputDirectory, "icons"));
      expect(remaining).not.toContain("nav.png");
      expect(remaining).not.toContain("nav.css");
      expect(remaining).toContain("social.png");
      expect(await readFile(join(outputDirectory, "keep.txt"), "utf-8")).toBe(
        "mine",
      );
    });

    test("switching multiple to single CSS removes the old per-sheet CSS", async () => {
      const outputDirectory = join(root, "out-switch");
      await runPipeline(configFor(join(root, "src", "icons"), outputDirectory));
      await runPipeline(
        configFor(join(root, "src", "icons"), outputDirectory, "single"),
      );

      const files = await readdir(outputDirectory, { recursive: true });
      expect(files).toContain("sprites.css");
      expect(files.filter((file) => file.endsWith(".css"))).toEqual([
        "sprites.css",
      ]);
    });

    test("a failed build leaves the previous output untouched", async () => {
      const outputDirectory = join(root, "out-atomic");
      const config = configFor(join(root, "src", "icons"), outputDirectory);
      await runPipeline(config);
      const before = await readFile(
        join(outputDirectory, "icons", "social.css"),
        "utf-8",
      );

      // icon.png + icon.jpg sanitize to the same CSS class, so CSS generation throws.
      await makeFixtureImage(root, "src/icons/social/dup.png", 5, 5);
      await makeFixtureImage(root, "src/icons/social/dup.jpg", 5, 5);
      await expect(runPipeline(config)).rejects.toThrow(/Duplicate CSS class/);

      expect(
        await readFile(join(outputDirectory, "icons", "social.css"), "utf-8"),
      ).toBe(before);
      const leftovers = (await readdir(outputDirectory)).filter((name) =>
        name.startsWith(".staging-"),
      );
      expect(leftovers).toEqual([]);
    });
  });
});
