/**
 * iOS Safari refuses to allocate canvases above ~16.7M pixels, and large canvases make the
 * brush slow on phones. Images are scaled down to stay inside these limits.
 */
export const MAX_PIXELS = 12_000_000;
export const MAX_SIDE = 4096;

export interface Size {
  width: number;
  height: number;
}

/** Returns the largest size with the same aspect ratio that fits within the limits. */
export function fitWithinLimits(
  size: Size,
  maxPixels: number = MAX_PIXELS,
  maxSide: number = MAX_SIDE,
): Size {
  const { width, height } = size;
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid image size: ${width}x${height}`);
  }
  const scale = Math.min(
    1,
    maxSide / width,
    maxSide / height,
    Math.sqrt(maxPixels / (width * height)),
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}
