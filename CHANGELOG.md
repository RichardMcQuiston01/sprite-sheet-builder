# CHANGELOG

## [Unreleased]

## [0.2.0] - 2026-10-12

### Security

- `sharp` raised to `^0.35.5` (libvips/libheif/librsvg advisories GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w); unsupported decoders (TIFF, SVG, GIF, HEIF, ...) are blocked, and `bun run check:sharp` runs in CI, release, and `prepublishOnly`.
- Generated files can no longer be written outside `outputDirectory`: `.`/`..` source directory names are neutralized, and every write is checked by real path. Watchers and discovery share the same real-path containment check.
- Image URLs in generated CSS are fully escaped (newlines, control characters, non-ASCII, `<`).
- CI and release workflows pin actions to commit SHAs and Bun to `1.4.2`; Dependabot keeps them current.

### Changed

- The release workflow now runs the sharp check, typecheck, tests, lint, and build before publishing.
- Generated CSS rules include `display: inline-block` and `background-repeat: no-repeat`.
- Class names keep Unicode letters, and names starting with a digit get a `sprite-` prefix (`2x.png` becomes `.sprite-2x`). Duplicate-class errors name both source files.
- Discovery output is sorted by name (English collation, numeric-aware), so layouts are stable across platforms.
- Builds are staged and committed together; output from a previous build that this build no longer produces is removed (tracked in `.sprite-sheet-builder-manifest.json`, so unrelated files are never deleted), and a failed build leaves the previous output untouched.

### Fixed

- JPEG EXIF orientation is applied when packing, and sources are composited losslessly.
- Sheet names that differ only by case are rejected instead of silently overwriting each other.
- Symlinked images and directories inside the asset directory are included; links that escape it are an error; directory cycles are skipped.
- The Vite plugin tears down dev watching via `closeBundle`, so it works in middleware mode (`httpServer` is null).

## [0.1.1] - 2026-08-17

### Fixed

- Image discovery now excludes the resolved `outputDirectory` (and anything under it), so a generated sprite sheet written into a watched `assetDirectory` is never re-ingested as a source image on the next build.
- The Vite plugin now disposes its rebuilder when the dev server closes: it stops watching and guards against an in-flight rebuild sending a full-reload after shutdown.

## [0.1.0] - 2026-08-12

### Added

- Apache License, Version 2.0 full text in `LICENSE`.
- Initial sprite sheet builder implementation: config loading/validation, recursive image discovery, `sharp` + `maxrects-packer`-based sheet packing, CSS generation (`off`/`multiple`/`single` modes), and a `bunx sprite-sheet-builder` CLI entry point.
- Unit and end-to-end test coverage for config validation, image discovery grouping, CSS class generation/collision handling, and the full build pipeline.
- `vite` added as an optional peer dependency, so the Vite plugin subpath export can be built against it.
- Vite plugin `buildStart` hook (`@richardmcquiston01/sprite-sheet-builder/vite`): runs the sprite sheet pipeline once when a Vite build or dev server starts.
- Vite plugin dev-mode file watching: `vite dev` now rebuilds sprite sheets and triggers a full reload automatically when a configured `assetDirectory` image changes.
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) running `bun run typecheck`, `bun test`, and `bun run lint` on pushes to the integration branches and on every pull request.
- Pull request template (`.github/pull_request_template.md`) covering summary, changes, testing, and changelog/docs checklists.
- `bun run build` (tsup) that bundles a Node-consumable artifact into `dist/` — compiled ESM plus `.d.ts` type declarations for the CLI, the main entry, and the `/vite` subpath. Wired to run automatically on publish via `prepublishOnly`, and verified in CI.
- CLI `--watch` flag: builds once, then rebuilds automatically (debounced, one at a time) when a supported image under any `assetDirectory` is added, changed, or removed, until stopped with `Ctrl+C`. Backed by a new `chokidar` dependency.
- Programmatic `watchSpriteSheets(config, handlers)` export (and the underlying `createSpriteSheetRebuilder`) for driving the same watch/rebuild behavior from code.

### Changed

- Extracted `isSupportedImage`/`SUPPORTED_EXTENSIONS` into `src/discovery/supportedExtensions.ts` (internal refactor, no behavior change).
- Extracted shared test fixture helpers into `src/testing/imageFixtures.ts` (internal test infrastructure, no behavior change).
- Extracted `runPipeline` from `buildSpriteSheets` so the CLI and the Vite plugin share one pipeline implementation (internal refactor, no behavior change).
- Extracted the debounced, serialized rebuild logic into `createSpriteSheetRebuilder` (`src/watch/`), now shared by the CLI `--watch` mode and the Vite plugin's dev watching (internal refactor, no behavior change).
- README License section now references the Apache License 2.0 and links to `LICENSE`.
- README now documents installation, configuration fields, CLI usage, and development commands.
- `PLAN.md` rewritten from the original idea into a staged implementation plan.
- Package renamed to `@richardmcquiston01/sprite-sheet-builder` to match the author's npm scope, with `publishConfig.access` set to `public`.
- `package.json` now publishes the compiled `dist/` instead of raw `.ts` sources: `bin`, `exports` (with `types`), `main`/`module`/`types`, and `files` all point at `dist/`, so the package is consumable from Node (`engines.node` set to `>=18`) and not just Bun. The CLI shebang changed from `bun` to `node`.
