import { basename, extname, join } from "node:path";
import type { GenerateCssFileOption } from "../config/types.ts";
import type { PackedImage, PackedSheet } from "../pack/packSheets.ts";

/** A CSS file to be written to disk. */
export interface CssFileOutput {
  filePath: string;
  content: string;
}

interface ClassRule {
  className: string;
  image: PackedImage;
}

/**
 * Generates companion CSS for the given packed sheets, per the
 * `generateCSSFile` config option. Returns `[]` when the option is `"off"`.
 *
 * @throws {Error} if two images in the same sheet sanitize to the same CSS
 *   class name (e.g. `icon.png` and `icon.jpg` side by side).
 */
export function generateCss(
  sheets: readonly PackedSheet[],
  outputDirectory: string,
  mode: GenerateCssFileOption,
): CssFileOutput[] {
  if (mode === "off") {
    return [];
  }
  if (mode === "multiple") {
    return sheets.map((sheet) => buildMultipleFile(sheet, outputDirectory));
  }
  return [buildSingleFile(sheets, outputDirectory)];
}

function buildMultipleFile(
  sheet: PackedSheet,
  outputDirectory: string,
): CssFileOutput {
  const rules = classRulesForSheet(sheet);
  const imageUrl = `${basename(sheet.outputPath)}.png`;
  return {
    filePath: join(outputDirectory, `${sheet.outputPath}.css`),
    content: renderCss(rules, imageUrl),
  };
}

function buildSingleFile(
  sheets: readonly PackedSheet[],
  outputDirectory: string,
): CssFileOutput {
  const perSheetRules = sheets.map((sheet) => ({
    sheet,
    rules: classRulesForSheet(sheet),
  }));

  const nameCounts = new Map<string, number>();
  for (const { rules } of perSheetRules) {
    for (const rule of rules) {
      nameCounts.set(
        rule.className,
        (nameCounts.get(rule.className) ?? 0) + 1,
      );
    }
  }

  const blocks = perSheetRules.map(({ sheet, rules }) => {
    const imageUrl = `${sheet.outputPath}.png`;
    const disambiguated = rules.map((rule) => {
      const isColliding = (nameCounts.get(rule.className) ?? 0) > 1;
      const className = isColliding
        ? `${sanitize(sheet.outputPath.replace(/\//g, "-"))}-${rule.className}`
        : rule.className;
      return { className, image: rule.image };
    });
    return renderCss(disambiguated, imageUrl);
  });

  return {
    filePath: join(outputDirectory, "sprites.css"),
    content: blocks.join("\n"),
  };
}

function classRulesForSheet(sheet: PackedSheet): ClassRule[] {
  const rules = sheet.images.map((image) => ({
    className: sanitize(basename(image.sourcePath, extname(image.sourcePath))),
    image,
  }));
  assertUniqueWithinSheet(rules, sheet.outputPath);
  return rules;
}

function assertUniqueWithinSheet(
  rules: readonly ClassRule[],
  sheetName: string,
): void {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.className)) {
      throw new Error(
        `Duplicate CSS class name ".${rule.className}" within sprite sheet "${sheetName}" ` +
          `(from "${rule.image.sourcePath}"). Rename the source file to avoid the collision.`,
      );
    }
    seen.add(rule.className);
  }
}

function renderCss(rules: readonly ClassRule[], imageUrl: string): string {
  return rules
    .map(
      (rule) =>
        `.${rule.className} {\n` +
        `  background-image: url("${imageUrl}");\n` +
        `  background-position: -${rule.image.x}px -${rule.image.y}px;\n` +
        `  width: ${rule.image.width}px;\n` +
        `  height: ${rule.image.height}px;\n` +
        `}`,
    )
    .join("\n\n");
}

function sanitize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
