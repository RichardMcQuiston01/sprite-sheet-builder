import { extname } from "node:path";

/** File extensions treated as sprite sheet source images (case-insensitive). */
export const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

/** Whether `filename` has a supported image extension. */
export function isSupportedImage(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(filename).toLowerCase());
}
