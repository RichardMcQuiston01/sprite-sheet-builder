import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { isSupportedImage } from "./supportedExtensions.ts";
import type { ResolvedSpriteSheetConfig } from "../config/types.ts";

/** A set of source images destined for one output sprite sheet. */
export interface SheetGroup {
  /**
   * POSIX-style path (relative to `outputDirectory`, without extension)
   * identifying this sheet, e.g. `"icons"` or `"icons/social"`.
   */
  outputPath: string;
  /** Absolute path to the source directory these images were found in. */
  sourceDir: string;
  /** Absolute paths of the images belonging to this group. */
  images: string[];
}

/**
 * Discovers and groups images from every `assetDirectory` entry per the
 * `recursive`/`recursiveMethod` config options. Groups with no matching
 * images are omitted.
 *
 * @throws {Error} if two groups resolve to the same `outputPath` (e.g. two
 *   `assetDirectory` entries share a basename).
 */
export async function discoverImageGroups(
  config: Pick<
    ResolvedSpriteSheetConfig,
    "assetDirectory" | "recursive" | "recursiveMethod"
  >,
): Promise<SheetGroup[]> {
  const groups: SheetGroup[] = [];

  for (const assetDirectory of config.assetDirectory) {
    const rootDir = resolve(assetDirectory);
    const rootName = sanitizeSegment(basename(rootDir));

    if (config.recursive === "no") {
      const images = await listImagesIn(rootDir);
      if (images.length > 0) {
        groups.push({ outputPath: rootName, sourceDir: rootDir, images });
      }
      continue;
    }

    if (config.recursiveMethod === "single") {
      const images = await listImagesRecursively(rootDir);
      if (images.length > 0) {
        groups.push({ outputPath: rootName, sourceDir: rootDir, images });
      }
      continue;
    }

    // recursive: "yes", recursiveMethod: "directory" — one sheet per
    // directory, including the root itself for any images that sit
    // directly in it.
    await collectDirectoryGroups(rootDir, rootName, groups);
  }

  assertNoOutputPathCollisions(groups);
  return groups;
}

async function collectDirectoryGroups(
  dir: string,
  outputPath: string,
  groups: SheetGroup[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  const images = entries
    .filter((entry) => entry.isFile() && isSupportedImage(entry.name))
    .map((entry) => join(dir, entry.name));

  if (images.length > 0) {
    groups.push({ outputPath, sourceDir: dir, images });
  }

  const subdirectories = entries.filter((entry) => entry.isDirectory());
  for (const subdirectory of subdirectories) {
    await collectDirectoryGroups(
      join(dir, subdirectory.name),
      `${outputPath}/${sanitizeSegment(subdirectory.name)}`,
      groups,
    );
  }
}

async function listImagesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isSupportedImage(entry.name))
    .map((entry) => join(dir, entry.name));
}

async function listImagesRecursively(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const images: string[] = [];
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isFile() && isSupportedImage(entry.name)) {
      images.push(entryPath);
    } else if (entry.isDirectory()) {
      images.push(...(await listImagesRecursively(entryPath)));
    }
  }
  return images;
}

function sanitizeSegment(segment: string): string {
  return segment.trim().replace(/[\\/]+/g, "-") || "root";
}

function assertNoOutputPathCollisions(groups: SheetGroup[]): void {
  const seen = new Map<string, string>();
  for (const group of groups) {
    const existing = seen.get(group.outputPath);
    if (existing !== undefined) {
      throw new Error(
        `Two source directories both resolve to sprite sheet "${group.outputPath}": ` +
          `"${existing}" and "${group.sourceDir}". Rename one of the directories to avoid the collision.`,
      );
    }
    seen.set(group.outputPath, group.sourceDir);
  }
}
