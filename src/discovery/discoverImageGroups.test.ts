import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
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

  test("excludes generated images under a nested outputDirectory (single)", async () => {
    await touch("icons/out/sheet.png"); // simulated generated output

    const groups = await discoverImageGroups({
      assetDirectory: [join(root, "icons")],
      recursive: "yes",
      recursiveMethod: "single",
      outputDirectory: join(root, "icons", "out"),
    });

    expect(groups).toHaveLength(1);
    // a.png + social/b.jpg + social/nested/c.jpeg — but not out/sheet.png.
    expect(groups[0]?.images).toHaveLength(3);
    expect(groups[0]?.images.some((p) => p.endsWith("sheet.png"))).toBe(false);
  });

  test("does not create a group for a nested outputDirectory (directory)", async () => {
    await touch("icons/out/sheet.png");

    const groups = await discoverImageGroups({
      assetDirectory: [join(root, "icons")],
      recursive: "yes",
      recursiveMethod: "directory",
      outputDirectory: join(root, "icons", "out"),
    });

    const outputPaths = new Set(groups.map((group) => group.outputPath));
    expect(outputPaths.has("icons/out")).toBe(false);
    expect(outputPaths).toEqual(
      new Set(["icons", "icons/social", "icons/social/nested"]),
    );
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

  test("orders images and sheets by name, not readdir order (#25)", async () => {
    await touch("sorted/b.png");
    await touch("sorted/10.png");
    await touch("sorted/a.png");
    await touch("sorted/2.png");
    await touch("sorted/zeta/z.png");
    await touch("sorted/alpha/a.png");

    const groups = await discoverImageGroups({
      assetDirectory: [join(root, "sorted")],
      recursive: "yes",
      recursiveMethod: "directory",
    });

    expect(groups.map((group) => group.outputPath)).toEqual([
      "sorted",
      "sorted/alpha",
      "sorted/zeta",
    ]);
    expect(groups[0]?.images.map((image) => basename(image))).toEqual([
      "2.png",
      "10.png",
      "a.png",
      "b.png",
    ]);
  });

  test("rejects sheet names that differ only by case (#23)", async () => {
    await touch("a/Icons/red.png");
    await touch("b/icons/blue.png");

    await expect(
      discoverImageGroups({
        assetDirectory: [join(root, "a", "Icons"), join(root, "b", "icons")],
        recursive: "no",
        recursiveMethod: "single",
      }),
    ).rejects.toThrow(/case-insensitively/);
  });

  test("rejects sibling directories that differ only by case (#23)", async () => {
    await touch("tree/Social/a.png");
    await touch("tree/social/b.png");

    await expect(
      discoverImageGroups({
        assetDirectory: [join(root, "tree")],
        recursive: "yes",
        recursiveMethod: "directory",
      }),
    ).rejects.toThrow(/case-insensitively/);
  });

  describe("symlinks (#24)", () => {
    async function link(
      target: string,
      linkPath: string,
      type: "file" | "dir",
    ): Promise<boolean> {
      try {
        await symlink(join(root, target), join(root, linkPath), type);
        return true;
      } catch {
        return false; // symlinks unavailable on this platform
      }
    }

    test("follows in-tree links", async () => {
      await touch("tree2/real/pic.png");
      await touch("tree2/real/more/deep.png");
      if (
        !(await link("tree2/real/pic.png", "tree2/alias.png", "file")) ||
        !(await link("tree2/real/more", "tree2/dirlink", "dir"))
      ) {
        return;
      }

      const groups = await discoverImageGroups({
        assetDirectory: [join(root, "tree2")],
        recursive: "yes",
        recursiveMethod: "single",
      });

      const names = groups[0]?.images.map((image) => basename(image)) ?? [];
      expect(names.sort()).toEqual(["alias.png", "deep.png", "deep.png", "pic.png"]);
    });

    test("throws for a link that escapes the asset root", async () => {
      await touch("outside/secret.png");
      await mkdir(join(root, "inside"));
      if (!(await link("outside/secret.png", "inside/leak.png", "file"))) {
        return;
      }

      await expect(
        discoverImageGroups({
          assetDirectory: [join(root, "inside")],
          recursive: "no",
          recursiveMethod: "single",
        }),
      ).rejects.toThrow(/outside the asset directory/);
    });

    test("does not loop forever on a directory link to an ancestor", async () => {
      await touch("cycle/a.png");
      if (!(await link("cycle", "cycle/self", "dir"))) {
        return;
      }

      const groups = await discoverImageGroups({
        assetDirectory: [join(root, "cycle")],
        recursive: "yes",
        recursiveMethod: "single",
      });

      expect(groups[0]?.images).toHaveLength(1);
    });
  });
});
