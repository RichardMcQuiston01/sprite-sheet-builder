import { basename, extname, join } from "node:path";
import { assertInsideDirectory } from "../paths/pathContainment.ts";
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
  const filePath = join(outputDirectory, `${sheet.outputPath}.css`);
  assertInsideDirectory(outputDirectory, filePath);
  return {
    filePath,
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

  const finalNames = new Map<string, string>();
  const blocks = perSheetRules.map(({ sheet, rules }) => {
    const imageUrl = `${sheet.outputPath}.png`;
    const disambiguated = rules.map((rule) => {
      const isColliding = (nameCounts.get(rule.className) ?? 0) > 1;
      const className = isColliding
        ? `${sanitize(sheet.outputPath.replace(/\//g, "-"))}-${rule.className}`
        : rule.className;
      // Sanitizing sheet paths is lossy (e.g. "foo.bar" and "foo-bar" both
      // collapse to "foo-bar"), so disambiguation can still collide. Reject
      // rather than silently letting one rule override another.
      const existing = finalNames.get(className);
      if (existing !== undefined && existing !== rule.image.sourcePath) {
        throw new Error(
          `Two images resolve to the same CSS class ".${className}" in single-file mode ` +
            `("${existing}" and "${rule.image.sourcePath}"). Rename one of the source ` +
            `directories or files to avoid the collision.`,
        );
      }
      finalNames.set(className, rule.image.sourcePath);
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
  const rules = sheet.images.map((image) => {
    const className = sanitize(basename(image.sourcePath, extname(image.sourcePath)));
    if (className === "") {
      throw new Error(
        `Source file "${image.sourcePath}" has no letters or digits in its name, so it ` +
          `produces an empty CSS class. Rename it to include at least one letter or digit.`,
      );
    }
    return { className, image };
  });
  assertUniqueWithinSheet(rules, sheet.outputPath);
  return rules;
}

function assertUniqueWithinSheet(
  rules: readonly ClassRule[],
  sheetName: string,
): void {
  const firstSourceByClass = new Map<string, string>();
  for (const rule of rules) {
    const firstSource = firstSourceByClass.get(rule.className);
    if (firstSource !== undefined) {
      throw new Error(
        `Duplicate CSS class name ".${rule.className}" within sprite sheet "${sheetName}" ` +
          `("${firstSource}" and "${rule.image.sourcePath}" both produce it). ` +
          `Rename one of the source files to avoid the collision.`,
      );
    }
    firstSourceByClass.set(rule.className, rule.image.sourcePath);
  }
}

/**
 * Escapes a string for safe use inside a double-quoted CSS `url("...")`.
 * Backslashes and quotes get a backslash escape; control characters,
 * non-printable/non-ASCII characters, and `<` (which could close an inlining
 * `<style>` block) become CSS hex escapes, so a hostile path can never end
 * the string or the declaration.
 */
function escapeCssUrl(url: string): string {
  let escaped = "";
  for (const character of url) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (character === "\\" || character === '"') {
      escaped += `\\${character}`;
    } else if (codePoint < 0x20 || codePoint > 0x7e || character === "<") {
      // A trailing space terminates the hex escape.
      escaped += `\\${codePoint.toString(16)} `;
    } else {
      escaped += character;
    }
  }
  return escaped;
}

function renderCss(rules: readonly ClassRule[], imageUrl: string): string {
  const url = escapeCssUrl(imageUrl);
  return rules
    .map(
      (rule) =>
        `.${rule.className} {\n` +
        `  display: inline-block;\n` +
        `  background-image: url("${url}");\n` +
        `  background-repeat: no-repeat;\n` +
        `  background-position: -${rule.image.x}px -${rule.image.y}px;\n` +
        `  width: ${rule.image.width}px;\n` +
        `  height: ${rule.image.height}px;\n` +
        `}`,
    )
    .join("\n\n");
}

/**
 * Turns a file or directory name into a valid CSS class identifier. Unicode
 * letters and digits are kept (so `étoile` stays `étoile` rather than losing
 * its first letter); everything else collapses to a single `-`. A result that
 * starts with a digit gets a `sprite-` prefix because identifiers cannot.
 */
function sanitize(name: string): string {
  const sanitized = name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return /^\p{N}/u.test(sanitized) ? `sprite-${sanitized}` : sanitized;
}
