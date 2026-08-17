import { readdir } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { isSupportedImage } from "./supportedExtensions.ts";
import type { ResolvedSpriteSheetConfig } from "../config/types.ts";

/** Predicate: is `path` the output directory, or inside it? */
type ExcludePredicate = (path: string) => boolean;

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
  > & { outputDirectory?: string },
): Promise<SheetGroup[]> {
  const groups: SheetGroup[] = [];

  // Never treat the pipeline's own output as source images. When
  // outputDirectory sits inside (or equals) an assetDirectory, recursive
  // discovery would otherwise re-ingest generated sheet PNGs on the next
  // build.
  const excludedDir = config.outputDirectory
    ? resolve(config.outputDirectory)
    : undefined;
  const isExcluded: ExcludePredicate = (path) =>
    excludedDir !== undefined &&
    (path === excludedDir || path.startsWith(excludedDir + sep));

  for (const assetDirectory of config.assetDirectory) {
    const rootDir = resolve(assetDirectory);
    const rootName = sanitizeSegment(basename(rootDir));

    if (config.recursive === "no") {
      const images = await listImagesIn(rootDir, isExcluded);
      if (images.length > 0) {
        groups.push({ outputPath: rootName, sourceDir: rootDir, images });
      }
      continue;
    }

    if (config.recursiveMethod === "single") {
      const images = await listImagesRecursively(rootDir, isExcluded);
      if (images.length > 0) {
        groups.push({ outputPath: rootName, sourceDir: rootDir, images });
      }
      continue;
    }

    // recursive: "yes", recursiveMethod: "directory" — one sheet per
    // directory, including the root itself for any images that sit
    // directly in it.
    await collectDirectoryGroups(rootDir, rootName, groups, isExcluded);
  }

  assertNoOutputPathCollisions(groups);
  return groups;
}

async function collectDirectoryGroups(
  dir: string,
  outputPath: string,
  groups: SheetGroup[],
  isExcluded: ExcludePredicate,
): Promise<void> {
  if (isExcluded(dir)) {
    return;
  }
  const entries = await readdir(dir, { withFileTypes: true });
  const images = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        isSupportedImage(entry.name) &&
        !isExcluded(join(dir, entry.name)),
    )
    .map((entry) => join(dir, entry.name));

  if (images.length > 0) {
    groups.push({ outputPath, sourceDir: dir, images });
  }

  const subdirectories = entries.filter((entry) => entry.isDirectory());
  for (const subdirectory of subdirectories) {
    const subdirectoryPath = join(dir, subdirectory.name);
    if (isExcluded(subdirectoryPath)) {
      continue;
    }
    await collectDirectoryGroups(
      subdirectoryPath,
      `${outputPath}/${sanitizeSegment(subdirectory.name)}`,
      groups,
      isExcluded,
    );
  }
}

async function listImagesIn(
  dir: string,
  isExcluded: ExcludePredicate,
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        isSupportedImage(entry.name) &&
        !isExcluded(join(dir, entry.name)),
    )
    .map((entry) => join(dir, entry.name));
}

async function listImagesRecursively(
  dir: string,
  isExcluded: ExcludePredicate,
): Promise<string[]> {
  if (isExcluded(dir)) {
    return [];
  }
  const entries = await readdir(dir, { withFileTypes: true });
  const images: string[] = [];
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (isExcluded(entryPath)) {
      continue;
    }
    if (entry.isFile() && isSupportedImage(entry.name)) {
      images.push(entryPath);
    } else if (entry.isDirectory()) {
      images.push(...(await listImagesRecursively(entryPath, isExcluded)));
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
