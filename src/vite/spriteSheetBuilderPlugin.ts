import { resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { runPipeline } from "../buildSpriteSheets.ts";
import { validateConfig } from "../config/loadConfig.ts";
import type { SpriteSheetConfig } from "../config/types.ts";
import { isSupportedImage } from "../discovery/supportedExtensions.ts";

/** How long to wait after the last fs event before rebuilding, in ms. */
const DEBOUNCE_MS = 150;

/**
 * Vite plugin that runs the sprite sheet pipeline once at build start, and
 * in `vite dev` watches `assetDirectory` for image changes, rebuilding and
 * triggering a full reload on each change.
 *
 * @throws {ConfigValidationError} synchronously if `options` is invalid.
 */
export function spriteSheetBuilder(options: SpriteSheetConfig): Plugin {
  const config = validateConfig(options);
  const watchedDirectories = config.assetDirectory.map((dir) => resolve(dir));

  let rebuildPromise: Promise<void> | null = null;
  let pendingRebuild = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function isWatchedImage(filePath: string): boolean {
    return (
      isSupportedImage(filePath) &&
      watchedDirectories.some((dir) => filePath.startsWith(dir))
    );
  }

  async function runRebuild(server: ViteDevServer): Promise<void> {
    if (rebuildPromise) {
      pendingRebuild = true;
      return;
    }

    rebuildPromise = (async () => {
      try {
        await runPipeline(config);
        server.config.logger.info(
          "[sprite-sheet-builder] regenerated sprite sheet(s)",
          { timestamp: true },
        );
        server.ws.send({ type: "full-reload" });
      } catch (error) {
        server.config.logger.error(
          `[sprite-sheet-builder] rebuild failed: ${error instanceof Error ? error.message : String(error)}`,
          { timestamp: true },
        );
      } finally {
        rebuildPromise = null;
        if (pendingRebuild) {
          pendingRebuild = false;
          await runRebuild(server);
        }
      }
    })();

    return rebuildPromise;
  }

  function scheduleRebuild(server: ViteDevServer): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runRebuild(server);
    }, DEBOUNCE_MS);
  }

  return {
    name: "sprite-sheet-builder",

    async buildStart() {
      await runPipeline(config);
    },

    configureServer(server) {
      server.watcher.add(watchedDirectories);

      const handleFsEvent = (filePath: string) => {
        if (isWatchedImage(filePath)) {
          scheduleRebuild(server);
        }
      };

      server.watcher.on("add", handleFsEvent);
      server.watcher.on("change", handleFsEvent);
      server.watcher.on("unlink", handleFsEvent);
    },
  };
}
