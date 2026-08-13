/** Thrown when a `spritesheet.config.json` file fails validation. */
export class ConfigValidationError extends Error {
  /** All validation problems found, reported together rather than one at a time. */
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      `Invalid sprite sheet config:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`,
    );
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}
