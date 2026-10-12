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

  // Set by configureServer; stops watching and disposes the rebuilder.
  // Idempotent, because both closeBundle and the httpServer "close" event
  // may invoke it for the same server.
  let teardownDevWatching: (() => Promise<void>) | undefined;

  return {
    name: "sprite-sheet-builder",

    async buildStart() {
      await runPipeline(config);
    },

    async closeBundle() {
      await teardownDevWatching?.();
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

      // Stop watching and dispose the rebuilder so an in-flight rebuild can't
      // send a reload after the server is gone.
      let teardownPromise: Promise<void> | undefined;
      const teardown = (): Promise<void> => {
        teardownPromise ??= (async () => {
          closed = true;
          server.watcher.off("add", handleFsEvent);
          server.watcher.off("change", handleFsEvent);
          server.watcher.off("unlink", handleFsEvent);
          await rebuilder.close();
        })();
        return teardownPromise;
      };
      teardownDevWatching = teardown;

      // `server.close()` runs every plugin's `closeBundle`, including in
      // middleware mode where `httpServer` is null. (A function returned from
      // `configureServer` is a post-middleware hook, not a teardown.) The
      // httpServer listener is kept as an early fallback.
      server.httpServer?.once("close", () => {
        void teardown();
      });
    },
  };
}
