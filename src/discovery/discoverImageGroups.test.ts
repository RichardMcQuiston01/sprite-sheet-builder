import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverImageGroups } from "./discoverImageGroups.ts";

let root: string;

async function touch(relativePath: string): Promise<void> {
  const filePath = join(root, relativePath);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, "");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sprite-sheet-builder-discovery-"));
  await touch("icons/a.png");
  await touch("icons/notes.txt");
  await touch("icons/social/b.jpg");
  await touch("icons/social/nested/c.jpeg");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("discoverImageGroups", () => {
  test("recursive 'no' only looks at top-level images", async () => {
    const groups = await discoverImageGroups({
      assetDirectory: [join(root, "icons")],
      recursive: "no",
      recursiveMethod: "single",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.outputPath).toBe("icons");
    expect(groups[0]?.images).toHaveLength(1);
  });

  test("recursive 'yes' + 'single' flattens every image into one group", async () => {
    const groups = await discoverImageGroups({
      assetDirectory: [join(root, "icons")],
      recursive: "yes",
      recursiveMethod: "single",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.images).toHaveLength(3);
  });

  test("recursive 'yes' + 'directory' makes one group per directory, including the root", async () => {
    const groups = await discoverImageGroups({
      assetDirectory: [join(root, "icons")],
      recursive: "yes",
      recursiveMethod: "directory",
    });

    const byOutputPath = new Map(groups.map((group) => [group.outputPath, group]));
    expect(byOutputPath.size).toBe(3);
    expect(byOutputPath.get("icons")?.images).toHaveLength(1);
    expect(byOutputPath.get("icons/social")?.images).toHaveLength(1);
    expect(byOutputPath.get("icons/social/nested")?.images).toHaveLength(1);
  });

  test("throws when two assetDirectory entries collide on outputPath", async () => {
    await touch("other/icons/d.png");

    await expect(
      discoverImageGroups({
        assetDirectory: [join(root, "icons"), join(root, "other", "icons")],
        recursive: "no",
        recursiveMethod: "single",
      }),
    ).rejects.toThrow(/collision|resolve to sprite sheet/i);
  });
});
