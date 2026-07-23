# Vite Plugin Wrapper — Design

## Context

`sprite-sheet-builder` v1 shipped as a standalone CLI (`bin/sprite-sheet-builder.ts`) that reads `spritesheet.config.json`, runs the discover → pack → generate-CSS pipeline (`src/buildSpriteSheets.ts`), and writes plain PNG + CSS output. That decision (standalone CLI first, bundler plugin later) was made explicitly during the original feature planning, deferring "bundler plugin wrapper" to future development.

This spec covers that deferred item: a Vite plugin that wraps the existing pipeline, chosen over webpack/esbuild because it has the simplest modern plugin API and the widest overlap with TypeScript projects. The integration is a **thin wrapper** — it reuses the exact pipeline logic the CLI already uses and produces identical plain-file output (PNG + CSS); it does not introduce Vite-native assets, virtual modules, or HMR. That deeper integration remains a possible future upgrade, not part of this work.

## Rejected alternatives

- **Shell out to the CLI binary from a generic hook** — extra process-spawn overhead per rebuild, no typed config, no access to Vite's dev-server watcher. Rejected.
- **Vite-native assets (emitFile + virtual CSS modules + HMR)** — more idiomatic long-term, but a materially bigger feature that changes how consumers reference sprites and diverges from the CLI's plain-file output. Explicitly deferred past this iteration.

## Package structure & config API

- New module `src/vite/spriteSheetBuilderPlugin.ts`, exposed via a new `"./vite"` subpath export in `package.json`. `vite` becomes an optional peer dependency (`peerDependenciesMeta.vite.optional = true`) so CLI-only consumers never need to install it.
- Small refactor to `src/buildSpriteSheets.ts`: extract `runPipeline(config: ResolvedSpriteSheetConfig): Promise<BuildResult>` (discover → pack → write CSS), so both the CLI's file-based `buildSpriteSheets(configPath)` and the new plugin share the exact same pipeline. `buildSpriteSheets` becomes `loadConfig(configPath)` followed by `runPipeline(config)` — behavior for existing CLI/programmatic callers is unchanged.
- The plugin takes a plain `SpriteSheetConfig` object (idiomatic for Vite config authored in TypeScript) rather than a JSON file path, reusing the existing `validateConfig()` (which only cares that it receives a parsed object, regardless of source):

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

- `spriteSheetBuilder(options)` validates eagerly (synchronously, at call time) via `validateConfig`, so a bad config fails immediately with the same error messages as the CLI, before Vite starts.

## Build/dev lifecycle & error handling

- **`buildStart`** hook (fires for both `vite build` and `vite dev`): runs `runPipeline(config)` once. **Throws on error** — matches the CLI: a bad config or unpackable images fails the build/dev-server startup loudly.
- **`configureServer(server)`** hook (only invoked by Vite in dev/serve mode): registers a watcher on each `assetDirectory` using Vite's own dev-server watcher (`server.watcher`, an already-running chokidar instance — no new dependency). Listens for `add`/`change`/`unlink`, filtered to the same supported image extensions the pipeline uses. Extract `isSupportedImage()`/`SUPPORTED_EXTENSIONS` out of `discoverImageGroups.ts` into a new `src/discovery/supportedExtensions.ts`, imported by both `discoverImageGroups.ts` and the new watcher, so the two can't drift out of sync.
- Rapid-fire fs events (multi-file saves, temp+rename writes) are debounced (~150ms) and coalesced: if a rebuild is already in flight when new events arrive, exactly one follow-up run happens after it finishes — never an unbounded queue.
- On a successful watch-triggered rebuild: log a short message via Vite's logger and call `server.ws.send({ type: "full-reload" })` so the browser picks up the new PNG/CSS.
- On a **watch-triggered** rebuild that errors: catch and log via Vite's logger, but do not crash the dev server or throw — a transient bad save shouldn't kill the dev session. This is the one place errors are swallowed rather than thrown; the initial `buildStart` run always throws.

## Testing approach

- Extract the fixture-image-creation helper currently inline in `buildSpriteSheets.test.ts` into `src/testing/imageFixtures.ts` (not itself a test file — a helper both test suites import), and refactor the existing test to use it.
- **Config validation**: `spriteSheetBuilder({...invalid})` throws `ConfigValidationError` synchronously at call time.
- **`buildStart`**: call the hook directly (a plain async function, no real Vite instance needed) against a fixture asset tree; assert output files/CSS as in the existing end-to-end test, and assert it throws on a broken fixture/config.
- **Dev watching**: build a minimal fake `ViteDevServer`-shaped object for `configureServer` — a real Node `EventEmitter` standing in for `server.watcher` (so tests can `.emit('change', path)`), plus stub `ws.send` and `config.logger` spies.
  - Emit a change event, wait past the debounce window, assert the pipeline reran, `ws.send({type: "full-reload"})` fired, and `logger.info` was called.
  - Emit several rapid-fire events, assert the pipeline only reran once.
  - Simulate a rebuild failure, assert `logger.error` fired, `full-reload` was *not* sent, and nothing throws out of the event handler.

## Out of scope

- webpack/esbuild plugins.
- Vite-native assets, virtual modules, HMR-granular updates (full-reload only).
- SVG symbol-sprite support and auto-detection of referencing pages (separate, still-undesigned future-development items).
