import { resolve, sep } from "node:path";
import { watch } from "chokidar";
import type { FSWatcher } from "chokidar";
import type { ResolvedSpriteSheetConfig } from "../config/types.ts";
import {
  createSpriteSheetRebuilder,
  type RebuilderHandlers,
} from "./spriteSheetRebuilder.ts";

/** A running sprite sheet watcher; call {@link SpriteSheetWatcher.close} to stop it. */
export interface SpriteSheetWatcher {
  /** Stops watching and awaits any in-flight rebuild. */
  close(): Promise<void>;
}

/**
 * Watches every `assetDirectory` for image changes and rebuilds the sprite
 * sheets (debounced, one at a time) via a shared
 * {@link createSpriteSheetRebuilder}. Does not run an initial build — callers
 * are expected to have already built once — it only reacts to later changes.
 *
 * The output directory subtree is excluded from watching so generated sheet
 * PNGs never trigger a rebuild of themselves.
 *
 * @returns once the watcher has finished its initial scan and is ready.
 */
export async function watchSpriteSheets(
  config: ResolvedSpriteSheetConfig,
  handlers: RebuilderHandlers = {},
): Promise<SpriteSheetWatcher> {
  const watchedDirectories = config.assetDirectory.map((dir) => resolve(dir));
  const resolvedOutputDirectory = resolve(config.outputDirectory);
  const rebuilder = createSpriteSheetRebuilder(config, handlers);

  const watcher: FSWatcher = watch(watchedDirectories, {
    ignoreInitial: true,
    ignored: (filePath) =>
      filePath === resolvedOutputDirectory ||
      filePath.startsWith(resolvedOutputDirectory + sep),
  });

  const handleFsEvent = (filePath: string): void => {
    rebuilder.notify(filePath);
  };
  watcher.on("add", handleFsEvent);
  watcher.on("change", handleFsEvent);
  watcher.on("unlink", handleFsEvent);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    watcher.once("ready", () => resolvePromise());
    watcher.once("error", (error) => rejectPromise(error));
  });

  return {
    async close(): Promise<void> {
      await watcher.close();
      await rebuilder.close();
    },
  };
}
