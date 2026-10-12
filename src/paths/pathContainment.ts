import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Resolves `path` to an absolute path with symlinks expanded. Unlike
 * `realpathSync`, the path does not need to exist: the deepest existing
 * ancestor is resolved and the missing remainder is appended unchanged.
 */
export function resolveRealPath(path: string): string {
  const absolutePath = resolve(path);
  const missingSegments: string[] = [];
  let current: string = absolutePath;
  for (;;) {
    try {
      return join(realpathSync(current), ...missingSegments);
    } catch {
      const parent: string = dirname(current);
      if (parent === current) {
        return absolutePath;
      }
      missingSegments.unshift(basename(current));
      current = parent;
    }
  }
}

/**
 * Whether `childPath` is `parentPath` itself or lies inside it. Both sides
 * are compared by real path, so a symlinked alias or a different drive-letter
 * casing of the same directory is treated as the same location.
 */
export function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = relative(
    resolveRealPath(parentPath),
    resolveRealPath(childPath),
  );
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath))
  );
}

/**
 * Throws unless `filePath` is strictly inside `directory`.
 *
 * @throws {Error} naming both paths when the file would land outside.
 */
export function assertInsideDirectory(
  directory: string,
  filePath: string,
): void {
  if (
    resolve(directory) === resolve(filePath) ||
    !isPathInside(directory, filePath)
  ) {
    throw new Error(
      `Refusing to write "${resolve(filePath)}": it is outside the output directory ` +
        `"${resolve(directory)}". Check source directory names for ".." or similar segments.`,
    );
  }
}
