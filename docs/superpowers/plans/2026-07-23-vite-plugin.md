# Vite Plugin Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Vite plugin (`@richardmcquiston01/sprite-sheet-builder/vite`) that wraps the existing sprite sheet pipeline — running it once at build start, and in `vite dev`, watching source image directories and rebuilding + triggering a full reload on change.

**Architecture:** A thin wrapper only. The plugin reuses the exact same pipeline the CLI already calls (extracted into a new `runPipeline(config)` function) and produces identical plain-file output (PNG + CSS) — no Vite-native assets, virtual modules, or HMR. `vite` is an optional peer dependency so CLI-only consumers never need to install it.

**Tech Stack:** TypeScript, Bun (runtime + test runner), Vite plugin API (`Plugin`, `ViteDevServer`), existing `sharp` + `maxrects-packer` pipeline.

## Global Constraints

- Runtime: Bun. Run everything via `bun run <script>` / `bunx`, not `npm`/`node` directly.
- TypeScript strict mode with `verbatimModuleSyntax: true` — always use `import type { ... }` for type-only imports, and include the literal `.ts` extension in relative imports (matches every existing file in this repo).
- Style: 2-space indent, JSDoc on every exported function/type/interface, no other comments unless something is genuinely non-obvious (per the `typescript-style` skill).
- Tests are colocated as `<name>.test.ts` next to the module they cover, using `bun:test` (`describe`/`test`/`expect`, `beforeEach`/`afterEach`).
- Commit messages: Conventional Commits (`type(scope): summary`), summary ≤ 50 chars, blank line, body explains *why*.
- Before every commit in this plan: `bun run typecheck`, `bun run lint`, and `bun test` must all pass clean.
- `vite` must remain an *optional* peer dependency — never move it to `dependencies`.
- Branch: all work happens on `feature/vite-plugin` (already created, spec already committed there).

---

## Task 1: Extract a shared `isSupportedImage` util

**Files:**
- Create: `src/discovery/supportedExtensions.ts`
- Create: `src/discovery/supportedExtensions.test.ts`
- Modify: `src/discovery/discoverImageGroups.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `SUPPORTED_EXTENSIONS: Set<string>` and `isSupportedImage(filename: string): boolean`, both exported from `src/discovery/supportedExtensions.ts`. The Vite plugin's file watcher (Task 6) imports `isSupportedImage` from here.

- [ ] **Step 1: Write the failing test**

Create `src/discovery/supportedExtensions.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { isSupportedImage } from "./supportedExtensions.ts";

describe("isSupportedImage", () => {
  test("accepts .png, .jpg, and .jpeg", () => {
    expect(isSupportedImage("star.png")).toBe(true);
    expect(isSupportedImage("star.jpg")).toBe(true);
    expect(isSupportedImage("star.jpeg")).toBe(true);
  });

  test("is case-insensitive", () => {
    expect(isSupportedImage("STAR.PNG")).toBe(true);
    expect(isSupportedImage("star.JPG")).toBe(true);
  });

  test("rejects unsupported extensions", () => {
    expect(isSupportedImage("notes.txt")).toBe(false);
    expect(isSupportedImage("icon.svg")).toBe(false);
    expect(isSupportedImage("noextension")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/discovery/supportedExtensions.test.ts`
Expected: FAIL — `Cannot find module './supportedExtensions.ts'` (or similar module-resolution error), since the module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/discovery/supportedExtensions.ts`:

```ts
import { extname } from "node:path";

/** File extensions treated as sprite sheet source images (case-insensitive). */
export const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

/** Whether `filename` has a supported image extension. */
export function isSupportedImage(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(filename).toLowerCase());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/discovery/supportedExtensions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Update `discoverImageGroups.ts` to use the shared util**

In `src/discovery/discoverImageGroups.ts`, replace the top of the file (current lines 1–5):

```ts
import { readdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { ResolvedSpriteSheetConfig } from "../config/types.ts";

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
```

with:

```ts
import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { isSupportedImage } from "./supportedExtensions.ts";
import type { ResolvedSpriteSheetConfig } from "../config/types.ts";
```

Then delete the now-duplicate local function near the bottom of the file:

```ts
function isSupportedImage(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(filename).toLowerCase());
}
```

(Nothing else in the file changes — every call site already just calls `isSupportedImage(...)`.)

- [ ] **Step 6: Run the full test suite and verify nothing regressed**

Run: `bun run typecheck && bun run lint && bun test`
Expected: typecheck and lint produce no errors; all existing tests plus the 3 new ones pass (20 total).

- [ ] **Step 7: Update CHANGELOG.md**

In `CHANGELOG.md`, under the existing `### Changed` list in `## [Unreleased]`, add:

```md
- Extracted `isSupportedImage`/`SUPPORTED_EXTENSIONS` into `src/discovery/supportedExtensions.ts` (internal refactor, no behavior change).
```

- [ ] **Step 8: Commit**

```bash
git add src/discovery/supportedExtensions.ts src/discovery/supportedExtensions.test.ts src/discovery/discoverImageGroups.ts CHANGELOG.md
git commit -m "refactor(discovery): extract isSupportedImage

Pulls the extension check out of discoverImageGroups.ts so the
upcoming Vite plugin file watcher can filter fs events the same way,
without duplicating the extension list."
```

---

## Task 2: Extract a shared image-fixture test helper

**Files:**
- Create: `src/testing/imageFixtures.ts`
- Modify: `src/buildSpriteSheets.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `createFixtureDir(prefix: string): Promise<string>`, `removeFixtureDir(dir: string): Promise<void>`, `makeFixtureImage(root: string, relativePath: string, width: number, height: number): Promise<void>` — all exported from `src/testing/imageFixtures.ts`. Tasks 5 and 6's plugin tests reuse these.

This task is a pure refactor of test infrastructure — no new runtime behavior, so there's no new failing-test step. The "test" for this task is that the existing end-to-end suite keeps passing unchanged after moving its fixture helpers into a shared module.

- [ ] **Step 1: Create the shared fixture helper**

Create `src/testing/imageFixtures.ts`:

```ts
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Creates a fresh temp directory for test fixtures.
 * Callers must clean it up with {@link removeFixtureDir}.
 */
export async function createFixtureDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** Recursively deletes a directory created by {@link createFixtureDir}. */
export async function removeFixtureDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** Writes a solid-color PNG fixture image at `<root>/<relativePath>`. */
export async function makeFixtureImage(
  root: string,
  relativePath: string,
  width: number,
  height: number,
): Promise<void> {
  const filePath = join(root, relativePath);
  await mkdir(join(filePath, ".."), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toFile(filePath);
}
```

- [ ] **Step 2: Refactor `buildSpriteSheets.test.ts` to use the shared helper**

Replace the entire contents of `src/buildSpriteSheets.test.ts` with:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { buildSpriteSheets } from "./buildSpriteSheets.ts";
import {
  createFixtureDir,
  makeFixtureImage,
  removeFixtureDir,
} from "./testing/imageFixtures.ts";

let root: string;

beforeEach(async () => {
  root = await createFixtureDir("sprite-sheet-builder-e2e-");
  await makeFixtureImage(root, "src/icons/social/star.png", 10, 10);
  await makeFixtureImage(root, "src/icons/social/moon.png", 12, 8);
  await makeFixtureImage(root, "src/icons/nav/menu.png", 20, 4);

  await writeFile(
    join(root, "spritesheet.config.json"),
    JSON.stringify({
      assetDirectory: [join(root, "src", "icons")],
      recursive: "yes",
      recursiveMethod: "directory",
      outputDirectory: join(root, "out"),
      generateCSSFile: "multiple",
    }),
  );
});

afterEach(async () => {
  await removeFixtureDir(root);
});

describe("buildSpriteSheets (end-to-end)", () => {
  test("packs each directory into a sheet with matching CSS", async () => {
    const result = await buildSpriteSheets(
      join(root, "spritesheet.config.json"),
    );

    const byOutputPath = new Map(
      result.sheets.map((sheet) => [sheet.outputPath, sheet]),
    );
    expect(byOutputPath.size).toBe(2);

    const social = byOutputPath.get("icons/social");
    expect(social?.images).toHaveLength(2);

    const socialSheetPath = join(root, "out", "icons", "social.png");
    const metadata = await sharp(socialSheetPath).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.channels).toBe(4);
    // Sheet must be large enough to fit both non-overlapping images,
    // regardless of whether the packer arranged them side-by-side or stacked.
    const area = (metadata.width ?? 0) * (metadata.height ?? 0);
    expect(area).toBeGreaterThanOrEqual(10 * 10 + 12 * 8);

    const cssContent = await readFile(
      join(root, "out", "icons", "social.css"),
      "utf-8",
    );
    expect(cssContent).toContain(".star {");
    expect(cssContent).toContain(".moon {");
    expect(cssContent).toContain('url("social.png")');

    const navCssContent = await readFile(
      join(root, "out", "icons", "nav.css"),
      "utf-8",
    );
    expect(navCssContent).toContain(".menu {");
  });
});
```

(This is byte-for-byte the same test behavior as before — only the fixture setup/teardown now comes from the shared module instead of a local `makeImage` function.)

- [ ] **Step 3: Run the full test suite**

Run: `bun run typecheck && bun run lint && bun test`
Expected: no errors; same 20 tests pass as at the end of Task 1 (no count change — this task adds no new tests).

- [ ] **Step 4: Update CHANGELOG.md**

In `CHANGELOG.md`, under the existing `### Changed` list in `## [Unreleased]`, add:

```md
- Extracted shared test fixture helpers into `src/testing/imageFixtures.ts` (internal test infrastructure, no behavior change).
```

- [ ] **Step 5: Commit**

```bash
git add src/testing/imageFixtures.ts src/buildSpriteSheets.test.ts CHANGELOG.md
git commit -m "refactor(testing): extract fixture helpers

Moves the temp-dir + fixture-PNG helpers out of
buildSpriteSheets.test.ts into src/testing/imageFixtures.ts so the
upcoming Vite plugin tests can reuse them instead of duplicating
the setup."
```

---

## Task 3: Extract `runPipeline` from `buildSpriteSheets`

**Files:**
- Modify: `src/buildSpriteSheets.ts`
- Modify: `src/index.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `discoverImageGroups`, `packSheets`, `generateCss`, `loadConfig` (all already exist, signatures unchanged).
- Produces: `runPipeline(config: ResolvedSpriteSheetConfig): Promise<BuildResult>` — the Vite plugin (Task 5) calls this directly instead of going through a config file path.

- [ ] **Step 1: Refactor `buildSpriteSheets.ts`**

Replace the entire contents of `src/buildSpriteSheets.ts` with:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateCss } from "./css/generateCss.ts";
import type { CssFileOutput } from "./css/generateCss.ts";
import { loadConfig } from "./config/loadConfig.ts";
import type { ResolvedSpriteSheetConfig } from "./config/types.ts";
import { discoverImageGroups } from "./discovery/discoverImageGroups.ts";
import { packSheets } from "./pack/packSheets.ts";
import type { PackedSheet } from "./pack/packSheets.ts";

/** Summary of a completed sprite sheet build. */
export interface BuildResult {
  config: ResolvedSpriteSheetConfig;
  sheets: PackedSheet[];
  cssFiles: CssFileOutput[];
}

/**
 * Runs the full pipeline against an already-resolved config: discover
 * images, pack sheets, and generate CSS, writing all output under
 * `config.outputDirectory`.
 */
export async function runPipeline(
  config: ResolvedSpriteSheetConfig,
): Promise<BuildResult> {
  const outputDirectory = resolve(config.outputDirectory);

  const groups = await discoverImageGroups(config);
  const sheets = await packSheets(groups, outputDirectory);
  const cssFiles = generateCss(sheets, outputDirectory, config.generateCSSFile);

  for (const cssFile of cssFiles) {
    await mkdir(dirname(cssFile.filePath), { recursive: true });
    await writeFile(cssFile.filePath, cssFile.content, "utf-8");
  }

  return { config, sheets, cssFiles };
}

/**
 * Reads and validates `configPath` from disk, then runs {@link runPipeline}.
 */
export async function buildSpriteSheets(
  configPath: string,
): Promise<BuildResult> {
  const config = await loadConfig(configPath);
  return runPipeline(config);
}
```

- [ ] **Step 2: Export `runPipeline` from the public barrel**

In `src/index.ts`, change line 1–2 from:

```ts
export { buildSpriteSheets } from "./buildSpriteSheets.ts";
export type { BuildResult } from "./buildSpriteSheets.ts";
```

to:

```ts
export { buildSpriteSheets, runPipeline } from "./buildSpriteSheets.ts";
export type { BuildResult } from "./buildSpriteSheets.ts";
```

- [ ] **Step 3: Run the full test suite**

Run: `bun run typecheck && bun run lint && bun test`
Expected: no errors; the same 20 tests still pass (this is a pure refactor — `buildSpriteSheets`'s external behavior is unchanged, so the existing end-to-end test is sufficient coverage for `runPipeline`; Tasks 5–6 add direct coverage of it via the plugin).

- [ ] **Step 4: Update CHANGELOG.md**

In `CHANGELOG.md`, under the existing `### Changed` list in `## [Unreleased]`, add:

```md
- Extracted `runPipeline` from `buildSpriteSheets` so the CLI and the upcoming Vite plugin share one pipeline implementation (internal refactor, no behavior change).
```

- [ ] **Step 5: Commit**

```bash
git add src/buildSpriteSheets.ts src/index.ts CHANGELOG.md
git commit -m "refactor(core): extract runPipeline

Splits config-file loading from the actual discover/pack/CSS
pipeline so the upcoming Vite plugin can run the same pipeline
against an in-memory config object, without needing a
spritesheet.config.json file on disk."
```

---

## Task 4: Add `vite` as an optional peer dependency

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `vite` resolvable in `node_modules` for the next tasks' typecheck/tests; a new `"./vite"` subpath declared in `exports` (pointed at a file created in Task 5).

- [ ] **Step 1: Update `package.json`**

In `package.json`, change the `"exports"` field from:

```json
  "exports": {
    ".": "./src/index.ts"
  },
```

to:

```json
  "exports": {
    ".": "./src/index.ts",
    "./vite": "./src/vite/index.ts"
  },
```

Add a `peerDependencies`/`peerDependenciesMeta` block right after `"engines"` (before `"type"`):

```json
  "peerDependencies": {
    "vite": "^5.0.0 || ^6.0.0"
  },
  "peerDependenciesMeta": {
    "vite": {
      "optional": true
    }
  },
```

Add `"vite": "^6.0.0"` to `"devDependencies"` (alphabetical order, after `"typescript-eslint"`):

```json
  "devDependencies": {
    "@eslint/js": "^9.17.0",
    "@types/bun": "^1.1.14",
    "eslint": "^9.17.0",
    "typescript": "^5.7.2",
    "typescript-eslint": "^8.18.1",
    "vite": "^6.0.0"
  }
```

- [ ] **Step 2: Install and verify**

Run: `bun install`
Expected: exits 0, `vite` appears under `devDependencies` in the updated `bun.lock`.

Run: `bun run typecheck && bun run lint && bun test`
Expected: no errors (Task 5 hasn't created `src/vite/index.ts` yet, so nothing imports `vite` at this point — this step just confirms the dependency change itself didn't break anything).

- [ ] **Step 3: Update CHANGELOG.md**

In `CHANGELOG.md`, under the existing `### Added` list in `## [Unreleased]`, add:

```md
- `vite` added as an optional peer dependency, in preparation for the Vite plugin subpath export.
```

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock CHANGELOG.md
git commit -m "build: add vite as an optional peer dependency

Prepares for the Vite plugin subpath export. vite stays optional
(peerDependenciesMeta) so CLI-only consumers never need to install
it."
```

---

## Task 5: Implement the plugin's `buildStart` behavior

**Files:**
- Create: `src/vite/spriteSheetBuilderPlugin.ts`
- Create: `src/vite/index.ts`
- Create: `src/vite/spriteSheetBuilderPlugin.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `runPipeline(config)` from `../buildSpriteSheets.ts` (Task 3), `validateConfig(raw)` from `../config/loadConfig.ts`, `SpriteSheetConfig` from `../config/types.ts`.
- Produces: `spriteSheetBuilder(options: SpriteSheetConfig): Plugin`, exported from `src/vite/index.ts` (the `"./vite"` subpath entry point declared in Task 4). Task 6 adds `configureServer` to the same `Plugin` object.

- [ ] **Step 1: Write the failing tests**

Create `src/vite/spriteSheetBuilderPlugin.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/vite/spriteSheetBuilderPlugin.test.ts`
Expected: FAIL — `Cannot find module './spriteSheetBuilderPlugin.ts'` (module doesn't exist yet).

- [ ] **Step 3: Write the plugin implementation**

Create `src/vite/spriteSheetBuilderPlugin.ts`:

```ts
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
```

(Task 6 below rewrites this file's contents entirely to add dev-mode watching — the `resolve`/`ViteDevServer`/`isSupportedImage` imports it needs are introduced there, not here.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/vite/spriteSheetBuilderPlugin.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Create the public entry point**

Create `src/vite/index.ts`:

```ts
export { spriteSheetBuilder } from "./spriteSheetBuilderPlugin.ts";
```

- [ ] **Step 6: Run the full test suite**

Run: `bun run typecheck && bun run lint && bun test`
Expected: no errors; 23 tests total (20 from before + 3 new).

- [ ] **Step 7: Update CHANGELOG.md**

In `CHANGELOG.md`, under the existing `### Added` list in `## [Unreleased]`, add:

```md
- Vite plugin `buildStart` hook (`@richardmcquiston01/sprite-sheet-builder/vite`): runs the sprite sheet pipeline once when a Vite build or dev server starts.
```

- [ ] **Step 8: Commit**

```bash
git add src/vite/spriteSheetBuilderPlugin.ts src/vite/index.ts src/vite/spriteSheetBuilderPlugin.test.ts CHANGELOG.md
git commit -m "feat(vite): add spriteSheetBuilder buildStart

Runs the existing pipeline once at Vite build start, validating
config eagerly at plugin-creation time so a bad config fails before
Vite even starts. Dev-mode file watching lands in the next commit."
```

---

## Task 6: Implement dev-mode watching (`configureServer`)

**Files:**
- Modify: `src/vite/spriteSheetBuilderPlugin.ts`
- Modify: `src/vite/spriteSheetBuilderPlugin.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `isSupportedImage` from `../discovery/supportedExtensions.ts` (Task 1).
- Produces: the same `Plugin` object from Task 5, now with a `configureServer` hook. No new exports beyond what Task 5 already added.

- [ ] **Step 1: Write the failing tests**

Keep everything already in `src/vite/spriteSheetBuilderPlugin.test.ts` from Task 5 (the `extractHook` helper and the `describe("spriteSheetBuilder", ...)` block) — this step only adds to it.

First, update the import block at the top of the file to the following (adds `EventEmitter` and `rm`):

```ts
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
```

Then, after the existing `describe("spriteSheetBuilder", ...)` block (i.e. at the bottom of the file), append this helper and test block:

```ts
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/vite/spriteSheetBuilderPlugin.test.ts`
Expected: FAIL — `plugin.configureServer` is `undefined` (Task 5's plugin doesn't define it yet), so `extractHook(plugin.configureServer)` throws "expected a plugin hook to be defined".

- [ ] **Step 3: Implement `configureServer`**

Replace the entire contents of `src/vite/spriteSheetBuilderPlugin.ts` with:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/vite/spriteSheetBuilderPlugin.test.ts`
Expected: PASS (7 tests: 3 from Task 5 + 4 new)

- [ ] **Step 5: Run the full test suite**

Run: `bun run typecheck && bun run lint && bun test`
Expected: no errors; 27 tests total (23 from Task 5 + 4 new).

- [ ] **Step 6: Update CHANGELOG.md**

In `CHANGELOG.md`, under the existing `### Added` list in `## [Unreleased]` (directly below the Task 5 bullet), add:

```md
- Vite plugin dev-mode file watching: `vite dev` now rebuilds sprite sheets and triggers a full reload automatically when a configured `assetDirectory` image changes.
```

- [ ] **Step 7: Commit**

```bash
git add src/vite/spriteSheetBuilderPlugin.ts src/vite/spriteSheetBuilderPlugin.test.ts CHANGELOG.md
git commit -m "feat(vite): watch assets and rebuild in dev

Uses Vite's own dev-server watcher (chokidar) to detect image
add/change/unlink under the configured assetDirectory entries,
debounced and coalesced so a burst of fs events (or an in-flight
rebuild) only ever triggers one follow-up run. A successful
rebuild sends a full-reload; a failed one logs and is swallowed
so a bad intermediate save can't crash the dev server."
```

---

## Task 7: Document the Vite plugin

**Files:**
- Modify: `README.md`

**Interfaces:** None (docs only).

- [ ] **Step 1: Add a "Vite plugin" section to `README.md`**

After the existing `## Usage` section (which currently ends with the `prebuild`/`build` `package.json` example) and before `## Development`, insert:

````md
### Vite plugin

Instead of (or alongside) the CLI, use the Vite plugin to run the same pipeline as part of your Vite build, with automatic rebuilds in `vite dev`:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { spriteSheetBuilder } from "@richardmcquiston01/sprite-sheet-builder/vite";

export default defineConfig({
  plugins: [
    spriteSheetBuilder({
      assetDirectory: ["assets/icons"],
      recursive: "yes",
      recursiveMethod: "directory",
      outputDirectory: "public/sprites",
      generateCSSFile: "multiple",
    }),
  ],
});
```

The plugin takes the same config shape as `spritesheet.config.json` (see above), passed directly as a plain object instead of a file path. It runs the pipeline once when the build/dev server starts, and in `vite dev` it also watches `assetDirectory` for image changes, rebuilding and triggering a full page reload automatically. `vite` is an optional peer dependency — only installing it is required to use this subpath; the CLI works without it.
````

(No CHANGELOG step here — Tasks 5 and 6 already added their own `### Added` bullets covering the Vite plugin's build-start and dev-watching behavior. Adding a third summary bullet here would just duplicate them.)

- [ ] **Step 2: Final full verification**

Run: `bun run typecheck && bun run lint && bun test`
Expected: no errors; all 27 tests pass.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the Vite plugin usage

Adds a Vite plugin section to the README: config example and a
note that vite is an optional peer dependency."
```

---

## After all tasks

Push the branch and open a PR into `dev` (same flow as the core feature):

```bash
git push -u origin feature/vite-plugin
```

Then create the PR with `gh pr create --base dev --head feature/vite-plugin` (title/body summarizing the plugin, test count, and manual verification once done — mirroring the PR opened for the core feature).
