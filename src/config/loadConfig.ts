import { readFile } from "node:fs/promises";
import { ConfigValidationError } from "./ConfigValidationError.ts";
import type {
  GenerateCssFileOption,
  RecursiveMethod,
  RecursiveOption,
  ResolvedSpriteSheetConfig,
} from "./types.ts";

const RECURSIVE_OPTIONS: readonly RecursiveOption[] = ["yes", "no"];
const RECURSIVE_METHODS: readonly RecursiveMethod[] = ["single", "directory"];
const GENERATE_CSS_OPTIONS: readonly GenerateCssFileOption[] = [
  "off",
  "multiple",
  "single",
];

/**
 * Validates a raw, parsed config object and applies defaults.
 * Collects every problem found rather than failing on the first one.
 *
 * @throws {ConfigValidationError} if the config is missing required fields
 *   or has invalid values.
 */
export function validateConfig(raw: unknown): ResolvedSpriteSheetConfig {
  const issues: string[] = [];

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigValidationError([
      "config must be a JSON object",
    ]);
  }

  const config = raw as Record<string, unknown>;

  const assetDirectory = validateAssetDirectory(config.assetDirectory, issues);
  const outputDirectory = validateOutputDirectory(
    config.outputDirectory,
    issues,
  );
  const recursive = validateEnum(
    config.recursive,
    RECURSIVE_OPTIONS,
    "recursive",
    "no",
    issues,
  );
  const recursiveMethod = validateEnum(
    config.recursiveMethod,
    RECURSIVE_METHODS,
    "recursiveMethod",
    "single",
    issues,
  );
  const generateCSSFile = validateEnum(
    config.generateCSSFile,
    GENERATE_CSS_OPTIONS,
    "generateCSSFile",
    "multiple",
    issues,
  );

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return {
    assetDirectory,
    outputDirectory,
    recursive,
    recursiveMethod,
    generateCSSFile,
  };
}

/**
 * Reads and parses `spritesheet.config.json` from disk, then validates it.
 *
 * @throws {ConfigValidationError} if the config is invalid.
 * @throws {SyntaxError} if the file is not valid JSON.
 */
export async function loadConfig(
  configPath: string,
): Promise<ResolvedSpriteSheetConfig> {
  const raw = await readFile(configPath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  return validateConfig(parsed);
}

function validateAssetDirectory(
  value: unknown,
  issues: string[],
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push('"assetDirectory" is required and must be a non-empty array of strings');
    return [];
  }
  const invalidEntries = value.filter(
    (entry) => typeof entry !== "string" || entry.trim() === "",
  );
  if (invalidEntries.length > 0) {
    issues.push('"assetDirectory" entries must all be non-empty strings');
    return [];
  }
  return value as string[];
}

function validateOutputDirectory(value: unknown, issues: string[]): string {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push('"outputDirectory" is required and must be a non-empty string');
    return "";
  }
  return value;
}

function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string,
  defaultValue: T,
  issues: string[],
): T {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  issues.push(
    `"${fieldName}" must be one of ${allowed.map((option) => `"${option}"`).join(", ")}`,
  );
  return defaultValue;
}
