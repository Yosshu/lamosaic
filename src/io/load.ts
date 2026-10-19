import { fitWithinLimits } from './limits';

export class UnsupportedImageError extends Error {
  constructor() {
    super('この画像は開けませんでした。JPEG・PNG・WebP などの画像を選んでください。');
  }
}

/**
 * Decodes an image file into a canvas, applying the EXIF orientation and scaling it down to
 * the canvas limits. The pixels are re-drawn, so no metadata from the file survives.
 */
export async function loadImageFile(file: Blob): Promise<HTMLCanvasElement> {
  const source = await decode(file);
  try {
    const size = fitWithinLimits({ width: source.width, height: source.height });
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, size.width, size.height);
    return canvas;
  } finally {
    if ('close' in source) source.close();
  }
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older Safari: fall back to <img>, which applies EXIF orientation by default.
    return decodeWithImageElement(file);
  }
}

function decodeWithImageElement(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new UnsupportedImageError());
    };
    img.src = url;
  });
}

/** Picks the first image out of a drop or paste payload. */
export function firstImageFile(items: DataTransfer | null): File | null {
  if (!items) return null;
  for (const file of Array.from(items.files)) {
    if (file.type.startsWith('image/')) return file;
  }
  return null;
}
