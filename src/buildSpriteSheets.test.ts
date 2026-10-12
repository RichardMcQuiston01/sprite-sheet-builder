import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import sharp from "sharp";
import { buildSpriteSheets, runPipeline } from "./buildSpriteSheets.ts";
import { validateConfig } from "./config/loadConfig.ts";
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
});
