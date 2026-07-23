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
```

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

Or wire it into your build, e.g. in `package.json`:

```json
{
  "scripts": {
    "prebuild": "sprite-sheet-builder",
    "build": "tsc"
  }
}
```

## Development

```
bun run typecheck   # tsc --noEmit
bun run test         # bun test
bun run lint         # eslint .
```

See [PLAN.md](PLAN.md) for the full design and staged implementation roadmap.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).

## Copyright

Copyright (c) 2026 Richard McQuiston.
