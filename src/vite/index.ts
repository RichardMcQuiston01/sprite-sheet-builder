/**
 * Vite plugin subpath entry point (`@richardmcquiston01/sprite-sheet-builder/vite`).
 * Re-exports the {@link spriteSheetBuilder} plugin factory, which runs the
 * sprite sheet pipeline on build start and, in `vite dev`, watches configured
 * asset directories and rebuilds on image changes.
 */
export { spriteSheetBuilder } from "./spriteSheetBuilderPlugin.ts";
