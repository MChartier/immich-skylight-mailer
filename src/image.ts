import sharp from "sharp";

const targetWidth = Number(process.env.TARGET_WIDTH || 1280);
const targetHeight = Number(process.env.TARGET_HEIGHT || 800);
const jpegQuality = Number(process.env.JPEG_QUALITY || 85);
const stripMetadata = process.env.STRIP_METADATA === "1";

/**
 * Converts an image buffer to a JPEG buffer with specific settings.
 * @param input The input image buffer.
 * @returns The processed JPEG buffer.
 */
export async function toFrameJpeg(input: Buffer): Promise<Buffer> {
  let img = sharp(input, { unlimited: false });

  // Resize to fit within target frame; keep aspect; no upscaling
  img = img.resize({
    width: targetWidth,
    height: targetHeight,
    fit: "inside",
    withoutEnlargement: true
  });

  if (stripMetadata) img = img.withMetadata({ orientation: undefined }); // drop metadata
  return img.jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer();
}
