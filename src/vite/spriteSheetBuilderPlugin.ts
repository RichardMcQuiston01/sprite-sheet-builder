import type { Plugin } from "vite";
import { runPipeline } from "../buildSpriteSheets.ts";
import { validateConfig } from "../config/loadConfig.ts";
import type { SpriteSheetConfig } from "../config/types.ts";

/**
 * Vite plugin that runs the sprite sheet pipeline once at build start.
 *
 * @throws {ConfigValidationError} synchronously if `options` is invalid.
 */
export function spriteSheetBuilder(options: SpriteSheetConfig): Plugin {
  const config = validateConfig(options);

  return {
    name: "sprite-sheet-builder",

    async buildStart() {
      await runPipeline(config);
    },
  };
}
