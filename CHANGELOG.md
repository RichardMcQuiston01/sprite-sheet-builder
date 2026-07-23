# CHANGELOG

## [Unreleased]

### Added

- Apache License, Version 2.0 full text in `LICENSE`.
- Initial sprite sheet builder implementation: config loading/validation, recursive image discovery, `sharp` + `maxrects-packer`-based sheet packing, CSS generation (`off`/`multiple`/`single` modes), and a `bunx sprite-sheet-builder` CLI entry point.
- Unit and end-to-end test coverage for config validation, image discovery grouping, CSS class generation/collision handling, and the full build pipeline.

### Changed

- Extracted `isSupportedImage`/`SUPPORTED_EXTENSIONS` into `src/discovery/supportedExtensions.ts` (internal refactor, no behavior change).
- Extracted shared test fixture helpers into `src/testing/imageFixtures.ts` (internal test infrastructure, no behavior change).
- README License section now references the Apache License 2.0 and links to `LICENSE`.
- README now documents installation, configuration fields, CLI usage, and development commands.
- `PLAN.md` rewritten from the original idea into a staged implementation plan.
- Package renamed to `@richardmcquiston01/sprite-sheet-builder` to match the author's npm scope, with `publishConfig.access` set to `public`.
