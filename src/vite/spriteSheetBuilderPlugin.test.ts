import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { ConfigValidationError } from "../config/ConfigValidationError.ts";
import {
  createFixtureDir,
  makeFixtureImage,
  removeFixtureDir,
} from "../testing/imageFixtures.ts";
import { spriteSheetBuilder } from "./spriteSheetBuilderPlugin.ts";

/**
 * Vite typically types plugin hooks as `Fn | { handler: Fn }`. This repo's
 * plugin always assigns plain functions, so this pulls the callable back
 * out regardless of which member of that union TS infers.
 */
function extractHook(
  hook: unknown,
): (...args: unknown[]) => unknown {
  if (typeof hook === "function") {
    return hook as (...args: unknown[]) => unknown;
  }
  if (hook && typeof hook === "object" && "handler" in hook) {
    return (hook as { handler: (...args: unknown[]) => unknown }).handler;
  }
  throw new Error("expected a plugin hook to be defined");
}

describe("spriteSheetBuilder", () => {
  test("throws for an invalid config", () => {
    expect(() =>
      spriteSheetBuilder({ assetDirectory: [], outputDirectory: "" }),
    ).toThrow(ConfigValidationError);
  });

  test("buildStart runs the pipeline against the configured directories", async () => {
    const root = await createFixtureDir(
      "sprite-sheet-builder-vite-buildstart-",
    );
    try {
      await makeFixtureImage(root, "assets/icons/star.png", 10, 10);
      const outputDirectory = join(root, "out");

      const plugin = spriteSheetBuilder({
        assetDirectory: [join(root, "assets", "icons")],
        outputDirectory,
      });

      const buildStart = extractHook(plugin.buildStart);
      await buildStart.call({});

      const cssContent = await readFile(
        join(outputDirectory, "icons.css"),
        "utf-8",
      );
      expect(cssContent).toContain(".star {");
    } finally {
      await removeFixtureDir(root);
    }
  });

  test("buildStart propagates pipeline errors", async () => {
    const root = await createFixtureDir(
      "sprite-sheet-builder-vite-buildstart-error-",
    );
    try {
      await makeFixtureImage(root, "a/icons/star.png", 10, 10);
      await makeFixtureImage(root, "b/icons/moon.png", 8, 8);

      const plugin = spriteSheetBuilder({
        assetDirectory: [join(root, "a", "icons"), join(root, "b", "icons")],
        outputDirectory: join(root, "out"),
      });

      const buildStart = extractHook(plugin.buildStart);
      await expect(buildStart.call({})).rejects.toThrow(
        /resolve to sprite sheet/i,
      );
    } finally {
      await removeFixtureDir(root);
    }
  });
});

interface FakeServer {
  watcher: EventEmitter & { add: (paths: string[]) => void };
  ws: { send: (payload: unknown) => void };
  config: { logger: { info: (msg: string) => void; error: (msg: string) => void } };
}

function createFakeServer(): {
  server: FakeServer;
  sentMessages: unknown[];
  logs: { level: "info" | "error"; msg: string }[];
} {
  const watcher = Object.assign(new EventEmitter(), {
    add: () => {},
  });
  const sentMessages: unknown[] = [];
  const logs: { level: "info" | "error"; msg: string }[] = [];
  const server: FakeServer = {
    watcher,
    ws: { send: (payload) => sentMessages.push(payload) },
    config: {
      logger: {
        info: (msg) => logs.push({ level: "info", msg }),
        error: (msg) => logs.push({ level: "error", msg }),
      },
    },
  };
  return { server, sentMessages, logs };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor: timed out waiting for condition");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("spriteSheetBuilder dev watching", () => {
  test("rebuilds and triggers a full reload when a watched image changes", async () => {
    const root = await createFixtureDir("sprite-sheet-builder-vite-watch-");
    try {
      const assetDir = join(root, "assets", "icons");
      await makeFixtureImage(root, "assets/icons/star.png", 10, 10);
      const outputDirectory = join(root, "out");

      const plugin = spriteSheetBuilder({
        assetDirectory: [assetDir],
        outputDirectory,
      });
      await extractHook(plugin.buildStart).call({});

      const { server, sentMessages, logs } = createFakeServer();
      extractHook(plugin.configureServer)(server);

      await makeFixtureImage(root, "assets/icons/moon.png", 8, 8);
      server.watcher.emit("add", join(assetDir, "moon.png"));

      await waitFor(() => sentMessages.length > 0);

      expect(sentMessages).toContainEqual({ type: "full-reload" });
      expect(logs.some((log) => log.level === "info")).toBe(true);

      const cssContent = await readFile(
        join(outputDirectory, "icons.css"),
        "utf-8",
      );
      expect(cssContent).toContain(".moon {");
    } finally {
      await removeFixtureDir(root);
    }
  });

  test("coalesces rapid-fire changes into a single rebuild", async () => {
    const root = await createFixtureDir("sprite-sheet-builder-vite-debounce-");
    try {
      const assetDir = join(root, "assets", "icons");
      await makeFixtureImage(root, "assets/icons/star.png", 10, 10);
      const outputDirectory = join(root, "out");

      const plugin = spriteSheetBuilder({
        assetDirectory: [assetDir],
        outputDirectory,
      });
      await extractHook(plugin.buildStart).call({});

      const { server, sentMessages } = createFakeServer();
      extractHook(plugin.configureServer)(server);

      const imagePath = join(assetDir, "star.png");
      server.watcher.emit("change", imagePath);
      server.watcher.emit("change", imagePath);
      server.watcher.emit("change", imagePath);

      await waitFor(() => sentMessages.length > 0);
      await new Promise((r) => setTimeout(r, 200)); // confirm no extra late rebuild

      expect(sentMessages).toHaveLength(1);
    } finally {
      await removeFixtureDir(root);
    }
  });

  test("logs an error and skips reload when a rebuild fails, without throwing", async () => {
    const root = await createFixtureDir(
      "sprite-sheet-builder-vite-watch-error-",
    );
    try {
      const assetDir = join(root, "assets", "icons");
      await makeFixtureImage(root, "assets/icons/star.png", 10, 10);
      const outputDirectory = join(root, "out");

      const plugin = spriteSheetBuilder({
        assetDirectory: [assetDir],
        outputDirectory,
      });
      await extractHook(plugin.buildStart).call({});

      const { server, sentMessages, logs } = createFakeServer();
      extractHook(plugin.configureServer)(server);

      await rm(assetDir, { recursive: true, force: true });
      server.watcher.emit("unlink", join(assetDir, "star.png"));

      await waitFor(() => logs.some((log) => log.level === "error"));

      expect(sentMessages).toHaveLength(0);
    } finally {
      await removeFixtureDir(root);
    }
  });

  test(
    "coalesces a change fired mid-rebuild into exactly one follow-up rebuild",
    async () => {
      const root = await createFixtureDir(
        "sprite-sheet-builder-vite-overlap-",
      );
      try {
        const assetDir = join(root, "assets", "icons");
        // A large real fixture (400 images) so a real `runPipeline` call
        // takes ~900-1000ms on this machine - comfortably longer than the
        // ~550ms mark below where the second debounce timer fires, so the
        // first rebuild is still genuinely in flight and this exercises
        // `pendingRebuild` coalescing rather than two timers that never
        // actually race a running rebuild.
        for (let i = 0; i < 400; i++) {
          await makeFixtureImage(root, `assets/icons/icon${i}.png`, 100, 100);
        }
        const outputDirectory = join(root, "out");

        const plugin = spriteSheetBuilder({
          assetDirectory: [assetDir],
          outputDirectory,
        });
        await extractHook(plugin.buildStart).call({});

        const { server, sentMessages } = createFakeServer();
        extractHook(plugin.configureServer)(server);

        const imagePath = join(assetDir, "icon0.png");

        // Fire the first change and wait 400ms - comfortably past the
        // debounce's nominal 150ms fire time (a 250ms margin) so that the
        // rebuild has *definitely* started before we fire the second event
        // below, even under GC pauses or CPU contention from the sharp
        // work this test itself generates. A tight margin here (e.g. the
        // ~30ms this test used to leave) risks the second event landing
        // before the first debounce timer fires, which would just reset
        // that timer and collapse both events into a single rebuild
        // instead of exercising the mid-rebuild overlap this test targets.
        server.watcher.emit("change", imagePath);
        await new Promise((r) => setTimeout(r, 400));

        // Fire a second change while the first rebuild is still in flight.
        // Its own debounce timer fires ~150ms later (~550ms total since the
        // first change), well before the first rebuild (~900-1000ms) is
        // done, so this must be coalesced via pendingRebuild rather than
        // starting a second concurrent runPipeline call.
        server.watcher.emit("change", imagePath);

        // Settle: one full-reload for the in-flight rebuild, then a second
        // for the coalesced follow-up rebuild that runs after it.
        await waitFor(() => sentMessages.length >= 2, 8000);
        await new Promise((r) => setTimeout(r, 200)); // confirm no extra late rebuild

        expect(sentMessages).toHaveLength(2);
        expect(sentMessages).toEqual([
          { type: "full-reload" },
          { type: "full-reload" },
        ]);
      } finally {
        await removeFixtureDir(root);
      }
    },
    20000,
  );

  test("ignores events for unrelated files", async () => {
    const root = await createFixtureDir("sprite-sheet-builder-vite-ignore-");
    try {
      const assetDir = join(root, "assets", "icons");
      await makeFixtureImage(root, "assets/icons/star.png", 10, 10);
      const outputDirectory = join(root, "out");

      const plugin = spriteSheetBuilder({
        assetDirectory: [assetDir],
        outputDirectory,
      });
      await extractHook(plugin.buildStart).call({});

      const { server, sentMessages } = createFakeServer();
      extractHook(plugin.configureServer)(server);

      server.watcher.emit("change", join(root, "unrelated.txt"));
      server.watcher.emit("change", join(root, "other", "star.png"));

      await new Promise((r) => setTimeout(r, 250));

      expect(sentMessages).toHaveLength(0);
    } finally {
      await removeFixtureDir(root);
    }
  });

  test("ignores a sibling directory sharing a name prefix", async () => {
    const root = await createFixtureDir(
      "sprite-sheet-builder-vite-prefix-",
    );
    try {
      const assetDir = join(root, "assets", "icons");
      await makeFixtureImage(root, "assets/icons/star.png", 10, 10);
      // A sibling directory whose name merely starts with the watched
      // directory's name, but is not inside it. The old buggy match used a
      // bare `string.startsWith(dir)` check, which would have treated
      // "assets/icons-archive" as a prefix match for watched dir
      // "assets/icons" (since "icons-archive".startsWith("icons")) and
      // incorrectly triggered a rebuild for changes here.
      await makeFixtureImage(
        root,
        "assets/icons-archive/old-star.png",
        10,
        10,
      );
      const outputDirectory = join(root, "out");

      const plugin = spriteSheetBuilder({
        assetDirectory: [assetDir],
        outputDirectory,
      });
      await extractHook(plugin.buildStart).call({});

      const { server, sentMessages } = createFakeServer();
      extractHook(plugin.configureServer)(server);

      server.watcher.emit(
        "change",
        join(root, "assets", "icons-archive", "old-star.png"),
      );

      await new Promise((r) => setTimeout(r, 250));

      expect(sentMessages).toHaveLength(0);
    } finally {
      await removeFixtureDir(root);
    }
  });

  test("ignores changes under an outputDirectory nested inside assetDirectory", async () => {
    const root = await createFixtureDir(
      "sprite-sheet-builder-vite-nested-output-",
    );
    try {
      const assetDir = join(root, "assets", "icons");
      await makeFixtureImage(root, "assets/icons/star.png", 10, 10);
      // outputDirectory deliberately nested inside the watched assetDirectory
      // - the pipeline's own sheet PNGs land here, so a naive watcher would
      // treat its own output as a fresh change and rebuild forever.
      const outputDirectory = join(assetDir, "out");

      const plugin = spriteSheetBuilder({
        assetDirectory: [assetDir],
        outputDirectory,
      });
      await extractHook(plugin.buildStart).call({});

      const { server, sentMessages } = createFakeServer();
      extractHook(plugin.configureServer)(server);

      server.watcher.emit("change", join(outputDirectory, "icons.png"));

      await new Promise((r) => setTimeout(r, 250));

      expect(sentMessages).toHaveLength(0);
    } finally {
      await removeFixtureDir(root);
    }
  });
});
