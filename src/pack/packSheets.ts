import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MaxRectsPacker } from "maxrects-packer";
import sharp from "sharp";
import type { SheetGroup } from "../discovery/discoverImageGroups.ts";

/** Placement + source info for one image within a packed sheet. */
export interface PackedImage {
  sourcePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One composited sprite sheet, written to disk. */
export interface PackedSheet {
  /** Matches the originating {@link SheetGroup.outputPath}. */
  outputPath: string;
  /** Absolute path to the written PNG. */
  imageFile: string;
  width: number;
  height: number;
  images: PackedImage[];
}

/** Maximum width/height of a single sprite sheet, in pixels. */
const MAX_SHEET_DIMENSION = 4096;
/** Spacing kept between packed images to avoid background bleed. */
const SPRITE_PADDING = 2;

interface PackRect {
  width: number;
  height: number;
  x: number;
  y: number;
  sourcePath: string;
}

/**
 * Packs and composites each {@link SheetGroup} into a single PNG sprite
 * sheet under `outputDirectory`.
 *
 * @throws {Error} if a group's images can't fit within one
 *   {@link MAX_SHEET_DIMENSION}-sized sheet.
 */
export async function packSheets(
  groups: readonly SheetGroup[],
  outputDirectory: string,
): Promise<PackedSheet[]> {
  const sheets: PackedSheet[] = [];
  for (const group of groups) {
    sheets.push(await packGroup(group, outputDirectory));
  }
  return sheets;
}

async function packGroup(
  group: SheetGroup,
  outputDirectory: string,
): Promise<PackedSheet> {
  const rects: PackRect[] = await Promise.all(
    group.images.map(async (sourcePath) => {
      const metadata = await sharp(sourcePath).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error(
          `Could not read image dimensions for "${sourcePath}"`,
        );
      }
      return {
        width: metadata.width,
        height: metadata.height,
        x: 0,
        y: 0,
        sourcePath,
      };
    }),
  );

  const packer = new MaxRectsPacker<PackRect>(
    MAX_SHEET_DIMENSION,
    MAX_SHEET_DIMENSION,
    SPRITE_PADDING,
    {
      smart: true,
      pot: false,
      square: false,
      allowRotation: false,
      border: 0,
    },
  );
  packer.addArray(rects);

  if (packer.bins.length === 0) {
    throw new Error(
      `No images to pack for sprite sheet "${group.outputPath}"`,
    );
  }
  if (packer.bins.length > 1) {
    throw new Error(
      `Sprite sheet "${group.outputPath}" needs ${packer.bins.length} bins to fit within ` +
        `${MAX_SHEET_DIMENSION}x${MAX_SHEET_DIMENSION}px. Split "${group.sourceDir}" into smaller directories.`,
    );
  }

  const bin = packer.bins[0]!;
  if (bin.width > MAX_SHEET_DIMENSION || bin.height > MAX_SHEET_DIMENSION) {
    throw new Error(
      `Sprite sheet "${group.outputPath}" is ${bin.width}x${bin.height}px, exceeding the ` +
        `${MAX_SHEET_DIMENSION}x${MAX_SHEET_DIMENSION}px limit. A single image in "${group.sourceDir}" is ` +
        `likely larger than the limit; shrink it or split the directory.`,
    );
  }
  const packedRects = bin.rects as unknown as PackRect[];
  const packedImages: PackedImage[] = packedRects.map((rect) => ({
    sourcePath: rect.sourcePath,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }));

  const imageFile = join(outputDirectory, `${group.outputPath}.png`);
  await mkdir(dirname(imageFile), { recursive: true });

  const composites = await Promise.all(
    packedImages.map(async (image) => ({
      input: await sharp(image.sourcePath).toBuffer(),
      left: image.x,
      top: image.y,
    })),
  );

  await sharp({
    create: {
      width: bin.width,
      height: bin.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(imageFile);

  return {
    outputPath: group.outputPath,
    imageFile,
    width: bin.width,
    height: bin.height,
    images: packedImages,
  };
}
