# PLAN

## Overview

A publishable TypeScript/Node CLI tool that scans directories of images, packs them into sprite sheet(s), and generates companion CSS, intended to be run as a pre-build step in a TypeScript project (with a bundler plugin wrapper as a later milestone, not v1).

## Config shape (v1)

A JSON config file (`spritesheet.config.json` at the consuming project's root):

```ts
interface SpriteSheetConfig {
  assetDirectory: string[]; // required
  recursive?: "yes" | "no"; // default "no"
  recursiveMethod?: "single" | "directory"; // default "single"; only meaningful when recursive is "yes"
  outputDirectory: string; // required
  generateCSSFile?: "off" | "multiple" | "single"; // default "multiple"
}
```

- Image formats (v1): raster only — PNG/JPG input, always composited to PNG output (needed for alpha transparency between sprites, which JPG can't represent).
- When `recursive: "yes"` and `recursiveMethod: "directory"`: images sitting directly in `assetDirectory` (not in a subfolder) get their own sheet too — the root directory is treated like any other directory in the recursion.
- Output mirrors the source subdirectory structure under `outputDirectory` when using `"directory"` method (also avoids collisions between same-named subdirectories under different `assetDirectory` entries).
- CSS class names are derived from the sanitized (kebab-case, extension stripped) source filename. In `"single"` CSS mode, classes are disambiguated across sheets using their relative source path as a prefix; an unresolved collision after that is a hard validation error, not a silent overwrite.

## Staged implementation

1. **Scaffolding** — `package.json` (bun), `tsconfig.json`, folder layout (`src/config`, `src/discovery`, `src/pack`, `src/css`, `src/cli`, `tests/`). Wire `bun run typecheck` / `bun test` / lint.
2. **Config loading & validation** — parse `spritesheet.config.json` into `SpriteSheetConfig`, apply defaults, and produce clear validation errors for missing required fields or invalid enum values.
3. **Image discovery** — walk each `assetDirectory` per `recursive`/`recursiveMethod`, filter to supported extensions (`.png`, `.jpg`, `.jpeg`), and group files into sheet units (one group per target sheet, including the root-as-its-own-sheet case above).
4. **Packing & compositing** — for each group, compute placement with `maxrects-packer` and composite the atlas with `sharp`, writing PNGs under `outputDirectory` (mirroring source structure). Record each image's offset/dimensions for the CSS stage.
5. **CSS generation** — emit `background-position`/`width`/`height` rules per class, honoring `generateCSSFile: "off" | "multiple" | "single"` and the collision-disambiguation rule above.
6. **CLI entry point** — `bin/` script runnable via `bunx`, intended to be wired into a consuming project as e.g. `"prebuild": "sprite-sheet-builder"`; add it to this repo's own `package.json` as the reference example.
7. **Tests** — unit tests per module (config validation, discovery grouping incl. root-as-own-sheet, packing math, CSS class generation/collisions) with `bun test` against fixture image trees, plus one end-to-end integration test asserting the generated output files and CSS content.
8. **Publish readiness** — fill in `package.json` publish fields (`bin`, `exports`, `files`, `keywords`), finalize README usage docs and CHANGELOG entries, verify a clean `bunx sprite-sheet-builder` run.

## Key libraries

- `sharp` — image decode/compositing (native bindings, well-maintained, standard choice).
- `maxrects-packer` — pure-JS rectangle bin-packing for sheet layout.

## Future Development

- Bundler plugin wrapper (Vite/webpack/esbuild) around the core pipeline.
- SVG symbol-sprite support.
- Auto-detect pages that reference images and automatically include the relevant CSS file(s).
