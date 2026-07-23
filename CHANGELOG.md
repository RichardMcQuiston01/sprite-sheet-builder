# CHANGELOG

## [Unreleased]

### Added

- Apache License, Version 2.0 full text in `LICENSE`.
- Initial sprite sheet builder implementation: config loading/validation, recursive image discovery, `sharp` + `maxrects-packer`-based sheet packing, CSS generation (`off`/`multiple`/`single` modes), and a `bunx sprite-sheet-builder` CLI entry point.
- Unit and end-to-end test coverage for config validation, image discovery grouping, CSS class generation/collision handling, and the full build pipeline.
- `vite` added as an optional peer dependency, in preparation for the Vite plugin subpath export.
- Vite plugin `buildStart` hook (`@richardmcquiston01/sprite-sheet-builder/vite`): runs the sprite sheet pipeline once when a Vite build or dev server starts.

### Changed

- Extracted `isSupportedImage`/`SUPPORTED_EXTENSIONS` into `src/discovery/supportedExtensions.ts` (internal refactor, no behavior change).
- Extracted shared test fixture helpers into `src/testing/imageFixtures.ts` (internal test infrastructure, no behavior change).
- Extracted `runPipeline` from `buildSpriteSheets` so the CLI and the upcoming Vite plugin share one pipeline implementation (internal refactor, no behavior change).
- README License section now references the Apache License 2.0 and links to `LICENSE`.
- README now documents installation, configuration fields, CLI usage, and development commands.
- `PLAN.md` rewritten from the original idea into a staged implementation plan.
- Package renamed to `@richardmcquiston01/sprite-sheet-builder` to match the author's npm scope, with `publishConfig.access` set to `public`.
