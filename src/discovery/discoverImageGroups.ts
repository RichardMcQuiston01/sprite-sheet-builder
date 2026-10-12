import { readdir, realpath, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { isPathInside } from "../paths/pathContainment.ts";
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
    excludedDir !== undefined && isPathInside(excludedDir, path);

  for (const assetDirectory of config.assetDirectory) {
    const rootDir = resolve(assetDirectory);
    const rootName = sanitizeSegment(basename(rootDir));
    const rootRealDir = await realpath(rootDir);

    if (config.recursive === "no") {
      const images = await listImagesIn(rootDir, isExcluded, rootRealDir);
      if (images.length > 0) {
        groups.push({ outputPath: rootName, sourceDir: rootDir, images });
      }
      continue;
    }

    if (config.recursiveMethod === "single") {
      const images = await listImagesRecursively(rootDir, isExcluded, rootRealDir, [
        rootRealDir,
      ]);
      if (images.length > 0) {
        groups.push({ outputPath: rootName, sourceDir: rootDir, images });
      }
      continue;
    }

    // recursive: "yes", recursiveMethod: "directory" — one sheet per
    // directory, including the root itself for any images that sit
    // directly in it.
    await collectDirectoryGroups(rootDir, rootName, groups, isExcluded, rootRealDir, [
      rootRealDir,
    ]);
  }

  assertNoOutputPathCollisions(groups);
  return groups;
}

/** What a directory entry is once any symlink has been followed. */
type EntryKind = "file" | "directory";

interface ResolvedEntry {
  name: string;
  path: string;
  kind: EntryKind;
  /** Real path of the entry (differs from `path` for symlinks). */
  realPath: string;
}

/**
 * Deterministic name ordering: English collation with numeric segments
 * compared by value (`2.png` < `10.png`) and case ignored, with a code-unit
 * tiebreak so names differing only by case still have a fixed order.
 */
const nameCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function compareNames(left: string, right: string): number {
  const collated = nameCollator.compare(left, right);
  if (collated !== 0) {
    return collated;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Reads `dir`, follows symlinks that stay inside `rootRealDir`, and returns
 * the files and directories in sorted order (readdir order is not stable
 * across platforms).
 *
 * @throws {Error} if a symlinked image or directory points outside
 *   `rootRealDir`, or a symlinked image is broken.
 */
async function readSortedEntries(
  dir: string,
  rootRealDir: string,
): Promise<ResolvedEntry[]> {
  const dirents = await readdir(dir, { withFileTypes: true });
  const resolved: ResolvedEntry[] = [];

  for (const dirent of dirents) {
    const path = join(dir, dirent.name);
    if (dirent.isFile()) {
      resolved.push({ name: dirent.name, path, kind: "file", realPath: path });
    } else if (dirent.isDirectory()) {
      resolved.push({
        name: dirent.name,
        path,
        kind: "directory",
        realPath: path,
      });
    } else if (dirent.isSymbolicLink()) {
      const entry = await resolveSymlink(path, dirent.name, rootRealDir);
      if (entry !== null) {
        resolved.push(entry);
      }
    }
  }

  return resolved.sort((left, right) => compareNames(left.name, right.name));
}

async function resolveSymlink(
  path: string,
  name: string,
  rootRealDir: string,
): Promise<ResolvedEntry | null> {
  let realPath: string;
  let kind: EntryKind;
  try {
    realPath = await realpath(path);
    const targetStats = await stat(realPath);
    if (targetStats.isDirectory()) {
      kind = "directory";
    } else if (targetStats.isFile()) {
      kind = "file";
    } else {
      return null;
    }
  } catch (error) {
    if (isSupportedImage(name)) {
      throw new Error(
        `Symlink "${path}" could not be resolved (${error instanceof Error ? error.message : String(error)}). ` +
          `Fix or remove the broken link.`,
      );
    }
    return null;
  }

  if (kind === "file" && !isSupportedImage(name)) {
    return null;
  }
  if (!isPathInside(rootRealDir, realPath)) {
    throw new Error(
      `Symlink "${path}" points to "${realPath}", which is outside the asset directory ` +
        `"${rootRealDir}". Copy the target into the asset directory or remove the link.`,
    );
  }
  return { name, path, kind, realPath };
}

async function collectDirectoryGroups(
  dir: string,
  outputPath: string,
  groups: SheetGroup[],
  isExcluded: ExcludePredicate,
  rootRealDir: string,
  ancestors: readonly string[],
): Promise<void> {
  if (isExcluded(dir)) {
    return;
  }
  const entries = await readSortedEntries(dir, rootRealDir);
  const images = entries
    .filter(
      (entry) =>
        entry.kind === "file" &&
        isSupportedImage(entry.name) &&
        !isExcluded(entry.path),
    )
    .map((entry) => entry.path);

  if (images.length > 0) {
    groups.push({ outputPath, sourceDir: dir, images });
  }

  for (const subdirectory of entries) {
    if (
      subdirectory.kind !== "directory" ||
      isExcluded(subdirectory.path) ||
      ancestors.includes(subdirectory.realPath)
    ) {
      continue;
    }
    await collectDirectoryGroups(
      subdirectory.path,
      `${outputPath}/${sanitizeSegment(subdirectory.name)}`,
      groups,
      isExcluded,
      rootRealDir,
      [...ancestors, subdirectory.realPath],
    );
  }
}

async function listImagesIn(
  dir: string,
  isExcluded: ExcludePredicate,
  rootRealDir: string,
): Promise<string[]> {
  const entries = await readSortedEntries(dir, rootRealDir);
  return entries
    .filter(
      (entry) =>
        entry.kind === "file" &&
        isSupportedImage(entry.name) &&
        !isExcluded(entry.path),
    )
    .map((entry) => entry.path);
}

async function listImagesRecursively(
  dir: string,
  isExcluded: ExcludePredicate,
  rootRealDir: string,
  ancestors: readonly string[],
): Promise<string[]> {
  if (isExcluded(dir)) {
    return [];
  }
  const entries = await readSortedEntries(dir, rootRealDir);
  const images: string[] = [];
  for (const entry of entries) {
    if (isExcluded(entry.path)) {
      continue;
    }
    if (entry.kind === "file" && isSupportedImage(entry.name)) {
      images.push(entry.path);
    } else if (entry.kind === "directory" && !ancestors.includes(entry.realPath)) {
      images.push(
        ...(await listImagesRecursively(entry.path, isExcluded, rootRealDir, [
          ...ancestors,
          entry.realPath,
        ])),
      );
    }
  }
  return images;
}

/** Segments that `path.join` would collapse into a parent directory. */
const DOT_SEGMENT_REPLACEMENTS: Readonly<Record<string, string>> = {
  ".": "_",
  "..": "__",
};

function sanitizeSegment(segment: string): string {
  const trimmed = segment.trim().replace(/[\\/]+/g, "-");
  return DOT_SEGMENT_REPLACEMENTS[trimmed] ?? (trimmed || "root");
}

function assertNoOutputPathCollisions(groups: SheetGroup[]): void {
  // Compare case-insensitively on every platform: Windows and macOS volumes
  // are case-insensitive by default, and it keeps generated trees portable.
  const seen = new Map<string, string>();
  for (const group of groups) {
    const key = group.outputPath.normalize("NFC").toLowerCase();
    const existing = seen.get(key);
    if (existing !== undefined) {
      throw new Error(
        `Two source directories both resolve to sprite sheet "${group.outputPath}" ` +
          `(names are compared case-insensitively): ` +
          `"${existing}" and "${group.sourceDir}". Rename one of the directories to avoid the collision.`,
      );
    }
    seen.set(key, group.sourceDir);
  }
}
