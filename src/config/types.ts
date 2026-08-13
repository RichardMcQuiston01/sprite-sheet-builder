/** Whether to recurse into subdirectories of an `assetDirectory` entry. */
export type RecursiveOption = "yes" | "no";

/**
 * How images are grouped into sprite sheets when `recursive` is `"yes"`.
 * `"single"` flattens every image under an `assetDirectory` into one sheet;
 * `"directory"` produces one sheet per directory (including the
 * `assetDirectory` root itself, for any images that sit directly in it).
 */
export type RecursiveMethod = "single" | "directory";

/** Controls whether/how companion CSS files are generated. */
export type GenerateCssFileOption = "off" | "multiple" | "single";

/** User-authored `spritesheet.config.json` shape, as parsed from disk. */
export interface SpriteSheetConfig {
  assetDirectory: string[];
  recursive?: RecursiveOption;
  recursiveMethod?: RecursiveMethod;
  outputDirectory: string;
  generateCSSFile?: GenerateCssFileOption;
}

/** {@link SpriteSheetConfig} with all defaults applied. */
export interface ResolvedSpriteSheetConfig {
  assetDirectory: string[];
  recursive: RecursiveOption;
  recursiveMethod: RecursiveMethod;
  outputDirectory: string;
  generateCSSFile: GenerateCssFileOption;
}
