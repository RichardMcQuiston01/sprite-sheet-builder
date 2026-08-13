import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { generateCss } from "./generateCss.ts";
import type { PackedSheet } from "../pack/packSheets.ts";

function sheet(
  outputPath: string,
  images: { sourcePath: string; x: number; y: number; width: number; height: number }[],
): PackedSheet {
  return {
    outputPath,
    imageFile: `/out/${outputPath}.png`,
    width: 100,
    height: 100,
    images,
  };
}

describe("generateCss", () => {
  test("'off' produces no files", () => {
    const sheets = [
      sheet("icons", [
        { sourcePath: "/src/icons/star.png", x: 0, y: 0, width: 10, height: 10 },
      ]),
    ];

    expect(generateCss(sheets, "/out", "off")).toEqual([]);
  });

  test("'multiple' produces one file per sheet referencing its own image", () => {
    const sheets = [
      sheet("icons", [
        { sourcePath: "/src/icons/star.png", x: 0, y: 0, width: 10, height: 10 },
        { sourcePath: "/src/icons/moon.png", x: 10, y: 0, width: 12, height: 12 },
      ]),
    ];

    const files = generateCss(sheets, "/out", "multiple");

    expect(files).toHaveLength(1);
    expect(files[0]?.filePath).toBe(join("/out", "icons.css"));
    expect(files[0]?.content).toContain(".star {");
    expect(files[0]?.content).toContain('url("icons.png")');
    expect(files[0]?.content).toContain("background-position: -10px -0px;");
    expect(files[0]?.content).toContain("width: 12px;");
  });

  test("'single' disambiguates class names that collide across sheets", () => {
    const sheets = [
      sheet("icons/social", [
        { sourcePath: "/src/icons/social/star.png", x: 0, y: 0, width: 10, height: 10 },
      ]),
      sheet("icons/nav", [
        { sourcePath: "/src/icons/nav/star.png", x: 0, y: 0, width: 8, height: 8 },
        { sourcePath: "/src/icons/nav/menu.png", x: 8, y: 0, width: 8, height: 8 },
      ]),
    ];

    const files = generateCss(sheets, "/out", "single");

    expect(files).toHaveLength(1);
    expect(files[0]?.filePath).toBe(join("/out", "sprites.css"));
    const content = files[0]?.content ?? "";
    expect(content).toContain(".icons-social-star {");
    expect(content).toContain(".icons-nav-star {");
    // "menu" is unique across sheets, so it keeps its plain name.
    expect(content).toContain(".menu {");
  });

  test("throws on duplicate class names within the same sheet", () => {
    const sheets = [
      sheet("icons", [
        { sourcePath: "/src/icons/star.png", x: 0, y: 0, width: 10, height: 10 },
        { sourcePath: "/src/icons/star.jpg", x: 10, y: 0, width: 10, height: 10 },
      ]),
    ];

    expect(() => generateCss(sheets, "/out", "multiple")).toThrow(/duplicate/i);
  });

  test("throws when a filename has no letters or digits to form a class", () => {
    const sheets = [
      sheet("icons", [
        { sourcePath: "/src/icons/___.png", x: 0, y: 0, width: 10, height: 10 },
      ]),
    ];

    expect(() => generateCss(sheets, "/out", "multiple")).toThrow(
      /empty CSS class/i,
    );
  });

  test("'single' throws when disambiguated class names still collide after sanitizing", () => {
    // "foo.bar" and "foo-bar" both sanitize to "foo-bar", so both star rules
    // would become ".foo-bar-star" and silently override each other.
    const sheets = [
      sheet("foo.bar", [
        { sourcePath: "/src/foo.bar/star.png", x: 0, y: 0, width: 10, height: 10 },
      ]),
      sheet("foo-bar", [
        { sourcePath: "/src/foo-bar/star.png", x: 0, y: 0, width: 8, height: 8 },
      ]),
    ];

    expect(() => generateCss(sheets, "/out", "single")).toThrow(
      /same CSS class/i,
    );
  });

  test("escapes quotes in the generated image URL", () => {
    const sheets = [
      sheet('a"b', [
        { sourcePath: '/src/a"b/star.png', x: 0, y: 0, width: 10, height: 10 },
      ]),
    ];

    const files = generateCss(sheets, "/out", "multiple");
    expect(files[0]?.content).toContain('url("a\\"b.png")');
  });
});
