import { mkdir, readFile, rename, rmdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { assertInsideDirectory } from "../paths/pathContainment.ts";

/** Name of the file recording which outputs the previous build produced. */
export const MANIFEST_FILE_NAME = ".sprite-sheet-builder-manifest.json";

interface Manifest {
  files: string[];
}

/** Converts an absolute path under `directory` to a POSIX relative path. */
export function toManifestPath(directory: string, filePath: string): string {
  return relative(directory, filePath).split(sep).join("/");
}

/**
 * Moves freshly staged files into `outputDirectory` and removes files that
 * the previous build produced but this one did not.
 *
 * Only files listed in the previous build's manifest are ever deleted, so
 * unrelated files that happen to live in the output directory are left
 * alone. Call this only after every output has been staged successfully:
 * a failed build then leaves the previous good output untouched.
 *
 * @param stagingDirectory directory holding the new files at the same
 *   relative paths they will have inside `outputDirectory`
 * @param producedFiles POSIX paths (relative to the output directory) of
 *   every file this build produced
 */
export async function commitStagedOutput(
  stagingDirectory: string,
  outputDirectory: string,
  producedFiles: readonly string[],
): Promise<void> {
  const previousFiles = await readManifest(outputDirectory);
  const produced = new Set(producedFiles);

  for (const relativePath of producedFiles) {
    const destination = join(outputDirectory, relativePath);
    assertInsideDirectory(outputDirectory, destination);
    await mkdir(dirname(destination), { recursive: true });
    await rename(join(stagingDirectory, relativePath), destination);
  }

  for (const relativePath of previousFiles) {
    if (produced.has(relativePath)) {
      continue;
    }
    const stalePath = join(outputDirectory, relativePath);
    try {
      assertInsideDirectory(outputDirectory, stalePath);
    } catch {
      continue; // ignore tampered manifest entries that escape the output dir
    }
    await rm(stalePath, { force: true });
    await removeEmptyParents(dirname(stalePath), outputDirectory);
  }

  const manifestStagingPath = join(stagingDirectory, MANIFEST_FILE_NAME);
  const manifest: Manifest = { files: [...producedFiles].sort() };
  await writeFile(manifestStagingPath, JSON.stringify(manifest, null, 2), "utf-8");
  await rename(manifestStagingPath, join(outputDirectory, MANIFEST_FILE_NAME));
}

async function readManifest(outputDirectory: string): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(outputDirectory, MANIFEST_FILE_NAME), "utf-8"),
    );
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "files" in parsed &&
      Array.isArray(parsed.files)
    ) {
      return parsed.files.filter(
        (entry): entry is string => typeof entry === "string",
      );
    }
  } catch {
    // No manifest yet (first build) or an unreadable one: nothing to clean.
  }
  return [];
}

/** Removes now-empty directories from `directory` up to (not including) `stopAt`. */
async function removeEmptyParents(
  directory: string,
  stopAt: string,
): Promise<void> {
  let current = resolve(directory);
  const stop = resolve(stopAt);
  while (current !== stop && current.startsWith(stop + sep)) {
    try {
      await rmdir(current); // fails if not empty, which is what we want
    } catch {
      return;
    }
    current = dirname(current);
  }
}
