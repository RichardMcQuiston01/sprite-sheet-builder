# CHANGELOG

## [Unreleased]

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

### Changed

- Extracted `isSupportedImage`/`SUPPORTED_EXTENSIONS` into `src/discovery/supportedExtensions.ts` (internal refactor, no behavior change).
- Extracted shared test fixture helpers into `src/testing/imageFixtures.ts` (internal test infrastructure, no behavior change).
- Extracted `runPipeline` from `buildSpriteSheets` so the CLI and the Vite plugin share one pipeline implementation (internal refactor, no behavior change).
- README License section now references the Apache License 2.0 and links to `LICENSE`.
- README now documents installation, configuration fields, CLI usage, and development commands.
- `PLAN.md` rewritten from the original idea into a staged implementation plan.
- Package renamed to `@richardmcquiston01/sprite-sheet-builder` to match the author's npm scope, with `publishConfig.access` set to `public`.
- `package.json` now publishes the compiled `dist/` instead of raw `.ts` sources: `bin`, `exports` (with `types`), `main`/`module`/`types`, and `files` all point at `dist/`, so the package is consumable from Node (`engines.node` set to `>=18`) and not just Bun. The CLI shebang changed from `bun` to `node`.
