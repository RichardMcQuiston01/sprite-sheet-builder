import { resolve, sep } from "node:path";
import { runPipeline } from "../buildSpriteSheets.ts";
import type { BuildResult } from "../buildSpriteSheets.ts";
import type { ResolvedSpriteSheetConfig } from "../config/types.ts";
import { isSupportedImage } from "../discovery/supportedExtensions.ts";

/** How long to wait after the last fs event before rebuilding, in ms. */
export const DEFAULT_DEBOUNCE_MS = 150;

/** Side-effect callbacks invoked after each rebuild attempt. */
export interface RebuilderHandlers {
  /** Called with the build result after a successful rebuild. */
  onRebuild?: (result: BuildResult) => void;
  /** Called with the thrown value if a rebuild fails (never rethrown). */
  onError?: (error: unknown) => void;
}

/**
 * Debounced, serialized rebuild driver shared by the CLI `--watch` mode and
 * the Vite plugin's dev watching. It owns the "which files matter" filter,
 * the debounce timer, and the guarantee that at most one rebuild runs at a
 * time (with a single coalesced follow-up if changes arrive mid-rebuild).
 * It is watcher-agnostic: callers feed it filesystem paths via {@link notify}
 * and react to results through {@link RebuilderHandlers}.
 */
export interface SpriteSheetRebuilder {
  /**
   * Whether `filePath` is a supported image inside a watched
   * `assetDirectory` and not part of the pipeline's own output.
   */
  isWatchedImage(filePath: string): boolean;
  /**
   * Report a filesystem event for `filePath`. Schedules a debounced rebuild
   * when the path is a watched image; ignores everything else.
   */
  notify(filePath: string): void;
  /**
   * Cancel any pending debounce and await an in-flight rebuild, if any, so
   * callers can shut down without leaving work running.
   */
  close(): Promise<void>;
}

/**
 * Creates a {@link SpriteSheetRebuilder} for an already-resolved config.
 *
 * Output paths are excluded from {@link SpriteSheetRebuilder.isWatchedImage}
 * so that a rebuild writing a sheet PNG into (or under) a watched
 * `assetDirectory` never re-triggers itself into an infinite loop.
 */
export function createSpriteSheetRebuilder(
  config: ResolvedSpriteSheetConfig,
  handlers: RebuilderHandlers = {},
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): SpriteSheetRebuilder {
  const watchedDirectories = config.assetDirectory.map((dir) => resolve(dir));
  const resolvedOutputDirectory = resolve(config.outputDirectory);

  let rebuildPromise: Promise<void> | null = null;
  let pendingRebuild = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function isWatchedImage(filePath: string): boolean {
    if (
      filePath === resolvedOutputDirectory ||
      filePath.startsWith(resolvedOutputDirectory + sep)
    ) {
      return false;
    }
    return (
      isSupportedImage(filePath) &&
      watchedDirectories.some(
        (dir) => filePath === dir || filePath.startsWith(dir + sep),
      )
    );
  }

  function runRebuild(): Promise<void> {
    // A rebuild is already running: remember that another is wanted and let
    // the in-flight one's `finally` chain to it, rather than starting a
    // second concurrent pipeline.
    if (rebuildPromise) {
      pendingRebuild = true;
      return rebuildPromise;
    }

    rebuildPromise = (async () => {
      try {
        const result = await runPipeline(config);
        handlers.onRebuild?.(result);
      } catch (error) {
        handlers.onError?.(error);
      } finally {
        rebuildPromise = null;
        if (pendingRebuild) {
          pendingRebuild = false;
          await runRebuild();
        }
      }
    })();

    return rebuildPromise;
  }

  function scheduleRebuild(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runRebuild();
    }, debounceMs);
  }

  return {
    isWatchedImage,
    notify(filePath: string): void {
      if (isWatchedImage(filePath)) {
        scheduleRebuild();
      }
    },
    async close(): Promise<void> {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (rebuildPromise) {
        await rebuildPromise;
      }
    },
  };
}
