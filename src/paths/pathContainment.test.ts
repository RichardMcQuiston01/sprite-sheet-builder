import { describe, expect, test } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { createFixtureDir, removeFixtureDir } from "../testing/imageFixtures.ts";
import { assertInsideDirectory, isPathInside } from "./pathContainment.ts";

describe("isPathInside", () => {
  test("accepts the directory itself and descendants", () => {
    expect(isPathInside("/a/out", "/a/out")).toBe(true);
    expect(isPathInside("/a/out", "/a/out/x/y.png")).toBe(true);
  });

  test("rejects siblings sharing a name prefix and parents", () => {
    expect(isPathInside("/a/out", "/a/out-other/x.png")).toBe(false);
    expect(isPathInside("/a/out", "/a/x.png")).toBe(false);
  });

  test("treats a symlinked alias of the directory as the same directory", async () => {
    const root = await createFixtureDir("sprite-sheet-builder-paths-");
    try {
      await mkdir(join(root, "real"));
      try {
        await symlink(join(root, "real"), join(root, "alias"), "dir");
      } catch {
        return; // symlinks unavailable on this platform
      }
      expect(isPathInside(join(root, "real"), join(root, "alias", "x.png"))).toBe(
        true,
      );
    } finally {
      await removeFixtureDir(root);
    }
  });
});

describe("assertInsideDirectory", () => {
  test("throws a descriptive error for an escaping path", () => {
    expect(() => assertInsideDirectory("/a/out", "/a/evil.png")).toThrow(
      /outside the output directory/,
    );
  });

  test("allows a file inside the directory", () => {
    expect(() => assertInsideDirectory("/a/out", "/a/out/x.png")).not.toThrow();
  });
});
