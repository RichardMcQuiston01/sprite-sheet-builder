# Sprite Sheet Builder

## Description

Generates sprite sheet image(s) and companion CSS from directories of images, so they can be used efficiently on a website. Ships as a CLI that runs as a pre-build step in a TypeScript/Node project.

## Tech Stack

- TypeScript / Bun

## Installation

To work on this repo:

```
bun install
```

To use it in another project, once published:

```
bun add -d @richardmcquiston01/sprite-sheet-builder
# or
npm install -D @richardmcquiston01/sprite-sheet-builder
```

The published package ships compiled JavaScript and type declarations, so it
runs under Node (≥18) as well as Bun — the `sprite-sheet-builder` CLI works
with `npx`, and both `@richardmcquiston01/sprite-sheet-builder` and its
`/vite` subpath are importable from Node ESM projects.

## Configuration

Create a `spritesheet.config.json` in your project root:

```json
{
  "assetDirectory": ["assets/icons"],
  "recursive": "yes",
  "recursiveMethod": "directory",
  "outputDirectory": "dist/sprites",
  "generateCSSFile": "multiple"
}
```

| Field              | Type                                 | Default      | Description                                                                                                                                                                             |
| ------------------ | ------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assetDirectory`   | `string[]`                           | _(required)_ | One or more directories to scan for images (`.png`, `.jpg`, `.jpeg`).                                                                                                                    |
| `outputDirectory`  | `string`                             | _(required)_ | Where generated sprite sheets and CSS files are written.                                                                                                                                 |
| `recursive`        | `"yes" \| "no"`                      | `"no"`       | Whether to look inside subdirectories of each `assetDirectory` entry.                                                                                                                    |
| `recursiveMethod`  | `"single" \| "directory"`            | `"single"`   | Only used when `recursive` is `"yes"`. `"single"` flattens every image under `assetDirectory` into one sheet. `"directory"` creates one sheet per directory, including the root itself. |
| `generateCSSFile`  | `"off" \| "multiple" \| "single"`    | `"multiple"` | `"off"` skips CSS generation. `"multiple"` writes one CSS file per sheet. `"single"` writes one combined CSS file for all sheets.                                                        |

Generated CSS classes are the sanitized (kebab-case) source filename, e.g. `icons/star.png` becomes `.star { ... }`. In `"single"` mode, class names that collide across sheets are prefixed with their sheet path (e.g. `.icons-social-star`); a collision that remains after that (two files with the same name in the same directory) is a build error.

## Usage

```
bunx sprite-sheet-builder --config spritesheet.config.json
```

### Watch mode

Pass `--watch` to keep the CLI running and rebuild automatically whenever a supported image is added, changed, or removed under any `assetDirectory`:

```
bunx sprite-sheet-builder --config spritesheet.config.json --watch
```

It builds once on startup, then watches for changes (debounced, one rebuild at a time) until you stop it with `Ctrl+C`. This is the CLI equivalent of the Vite plugin's `vite dev` rebuilding, for projects that don't use Vite. Generated sheets written under a watched directory are ignored, so a rebuild never re-triggers itself.

Or wire it into your build, e.g. in `package.json`:

```json
{
  "scripts": {
    "prebuild": "sprite-sheet-builder",
    "build": "tsc"
  }
}
```

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

## Development

```
bun run typecheck   # tsc --noEmit
bun run test         # bun test
bun run lint         # eslint .
bun run build        # tsup — emit the publishable dist/ (JS + .d.ts)
```

The source runs directly under Bun; `bun run build` (also run automatically
on `npm publish` via `prepublishOnly`) bundles the Node-consumable artifact
into `dist/`, which is what gets published.

### Releasing

Publishing is automated via GitHub Actions (`.github/workflows/release.yml`):

1. Bump the `version` in `package.json` and move the `CHANGELOG.md`
   `[Unreleased]` entries under a new version heading.
2. Publish a GitHub Release whose tag matches that version, prefixed with
   `v` (e.g. `v0.1.0`). The workflow verifies the tag matches
   `package.json` before publishing.
3. The workflow builds and runs `npm publish --provenance --access public`.

This requires an `NPM_TOKEN` repository secret (an npm automation token with
publish rights to the `@richardmcquiston01` scope). npm provenance also
requires the repository to be public. To publish manually instead, run
`npm publish --access public` after `npm login`.

See [PLAN.md](PLAN.md) for the full design and staged implementation roadmap.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).

## Copyright

Copyright (c) 2026 Richard McQuiston.
