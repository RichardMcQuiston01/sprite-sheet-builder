import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Creates a fresh temp directory for test fixtures.
 * Callers must clean it up with {@link removeFixtureDir}.
 */
export async function createFixtureDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** Recursively deletes a directory created by {@link createFixtureDir}. */
export async function removeFixtureDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** Writes a solid-color PNG fixture image at `<root>/<relativePath>`. */
export async function makeFixtureImage(
  root: string,
  relativePath: string,
  width: number,
  height: number,
): Promise<void> {
  const filePath = join(root, relativePath);
  await mkdir(join(filePath, ".."), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toFile(filePath);
}
