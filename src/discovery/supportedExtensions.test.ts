import { describe, expect, test } from "bun:test";
import { isSupportedImage } from "./supportedExtensions.ts";

describe("isSupportedImage", () => {
  test("accepts .png, .jpg, and .jpeg", () => {
    expect(isSupportedImage("star.png")).toBe(true);
    expect(isSupportedImage("star.jpg")).toBe(true);
    expect(isSupportedImage("star.jpeg")).toBe(true);
  });

  test("is case-insensitive", () => {
    expect(isSupportedImage("STAR.PNG")).toBe(true);
    expect(isSupportedImage("star.JPG")).toBe(true);
  });

  test("rejects unsupported extensions", () => {
    expect(isSupportedImage("notes.txt")).toBe(false);
    expect(isSupportedImage("icon.svg")).toBe(false);
    expect(isSupportedImage("noextension")).toBe(false);
  });
});
