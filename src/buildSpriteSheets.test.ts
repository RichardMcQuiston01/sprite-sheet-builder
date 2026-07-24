import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { buildSpriteSheets } from "./buildSpriteSheets.ts";
import {
  createFixtureDir,
  makeFixtureImage,
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
});
