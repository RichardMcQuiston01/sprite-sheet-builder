import { resolve } from "node:path";
import type { Plugin } from "vite";
import { runPipeline } from "../buildSpriteSheets.ts";
import { validateConfig } from "../config/loadConfig.ts";
import type { SpriteSheetConfig } from "../config/types.ts";
import { createSpriteSheetRebuilder } from "../watch/spriteSheetRebuilder.ts";

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

  return {
    name: "sprite-sheet-builder",

    async buildStart() {
      await runPipeline(config);
    },

    configureServer(server) {
      server.watcher.add(watchedDirectories);

      let closed = false;
      const rebuilder = createSpriteSheetRebuilder(config, {
        onRebuild: () => {
          if (closed) {
            return;
          }
          server.config.logger.info(
            "[sprite-sheet-builder] regenerated sprite sheet(s)",
            { timestamp: true },
          );
          server.ws.send({ type: "full-reload" });
        },
        onError: (error) => {
          if (closed) {
            return;
          }
          server.config.logger.error(
            `[sprite-sheet-builder] rebuild failed: ${error instanceof Error ? error.message : String(error)}`,
            { timestamp: true },
          );
        },
      });

      const handleFsEvent = (filePath: string) => {
        if (!closed) {
          rebuilder.notify(filePath);
        }
      };

      server.watcher.on("add", handleFsEvent);
      server.watcher.on("change", handleFsEvent);
      server.watcher.on("unlink", handleFsEvent);

      // Vite has no dedicated plugin teardown hook; the documented way to
      // clean up resources created in configureServer is to listen for the
      // httpServer "close" event. Stop watching and dispose the rebuilder so
      // an in-flight rebuild can't send a reload after the server is gone.
      server.httpServer?.once("close", () => {
        closed = true;
        server.watcher.off("add", handleFsEvent);
        server.watcher.off("change", handleFsEvent);
        server.watcher.off("unlink", handleFsEvent);
        void rebuilder.close();
      });
    },
  };
}
