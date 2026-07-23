import { describe, expect, test } from "bun:test";
import { ConfigValidationError } from "./ConfigValidationError.ts";
import { validateConfig } from "./loadConfig.ts";

describe("validateConfig", () => {
  test("applies defaults for optional fields", () => {
    const config = validateConfig({
      assetDirectory: ["assets/icons"],
      outputDirectory: "dist/sprites",
    });

    expect(config).toEqual({
      assetDirectory: ["assets/icons"],
      outputDirectory: "dist/sprites",
      recursive: "no",
      recursiveMethod: "single",
      generateCSSFile: "multiple",
    });
  });

  test("accepts explicit values for optional fields", () => {
    const config = validateConfig({
      assetDirectory: ["assets/icons"],
      outputDirectory: "dist/sprites",
      recursive: "yes",
      recursiveMethod: "directory",
      generateCSSFile: "single",
    });

    expect(config.recursive).toBe("yes");
    expect(config.recursiveMethod).toBe("directory");
    expect(config.generateCSSFile).toBe("single");
  });

  test("rejects a non-object config", () => {
    expect(() => validateConfig(null)).toThrow(ConfigValidationError);
    expect(() => validateConfig([])).toThrow(ConfigValidationError);
    expect(() => validateConfig("nope")).toThrow(ConfigValidationError);
  });

  test("requires assetDirectory", () => {
    expect(() =>
      validateConfig({ outputDirectory: "dist/sprites" }),
    ).toThrow(ConfigValidationError);
  });

  test("rejects an empty assetDirectory array", () => {
    expect(() =>
      validateConfig({ assetDirectory: [], outputDirectory: "dist/sprites" }),
    ).toThrow(ConfigValidationError);
  });

  test("requires outputDirectory", () => {
    expect(() =>
      validateConfig({ assetDirectory: ["assets/icons"] }),
    ).toThrow(ConfigValidationError);
  });

  test("rejects invalid enum values", () => {
    expect(() =>
      validateConfig({
        assetDirectory: ["assets/icons"],
        outputDirectory: "dist/sprites",
        recursive: "maybe",
      }),
    ).toThrow(ConfigValidationError);
  });

  test("collects every issue in a single error", () => {
    try {
      validateConfig({ recursive: "maybe", recursiveMethod: "nope" });
      throw new Error("expected validateConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const issues = (error as ConfigValidationError).issues;
      expect(issues.length).toBeGreaterThanOrEqual(4);
    }
  });
});
