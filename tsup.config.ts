import { defineConfig } from "tsup";

/**
 * Builds the Node-consumable, published artifact under `dist/`.
 *
 * The source is Bun-native (`.ts` import specifiers, run directly), so a
 * plain `tsc` emit can't produce runnable JS from it. tsup bundles each
 * entry to ESM, resolving the `.ts` imports, and emits `.d.ts` declarations
 * alongside. Runtime dependencies (`sharp`, `maxrects-packer`) and the
 * optional `vite` peer are left external and resolved by the consumer.
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "vite/index": "src/vite/index.ts",
    "sprite-sheet-builder": "bin/sprite-sheet-builder.ts",
  },
  format: ["esm"],
  target: "node18",
  platform: "node",
  dts: true,
  clean: true,
  sourcemap: false,
  splitting: false,
  // Never bundle test files into the published output.
  external: [/\.test\.ts$/],
});
