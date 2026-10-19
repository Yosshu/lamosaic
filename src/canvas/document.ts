import type { Rect } from './rect';

/**
 * The image being edited: the untouched original plus a transparent paint layer on top.
 * The paint layer lives in a CPU-side RGBA buffer (straight alpha) that the brush writes into;
 * changed regions are pushed to `paintCanvas` for display.
 */
export class PaintDocument {
  readonly width: number;
  readonly height: number;
  readonly original: HTMLCanvasElement;
  /** RGBA pixels of the original image, used for color sampling. */
  readonly originalPixels: Uint8ClampedArray;
  /** RGBA pixels of the paint layer (straight alpha). */
  readonly paint: Uint8ClampedArray;
  readonly paintCanvas: HTMLCanvasElement;
  private readonly paintCtx: CanvasRenderingContext2D;

  constructor(original: HTMLCanvasElement) {
    this.width = original.width;
    this.height = original.height;
    this.original = original;
    const octx = original.getContext('2d', { willReadFrequently: true });
    if (!octx) throw new Error('Canvas 2D is not available');
    this.originalPixels = octx.getImageData(0, 0, this.width, this.height).data;
    this.paint = new Uint8ClampedArray(this.width * this.height * 4);
    this.paintCanvas = document.createElement('canvas');
    this.paintCanvas.width = this.width;
    this.paintCanvas.height = this.height;
    const pctx = this.paintCanvas.getContext('2d');
    if (!pctx) throw new Error('Canvas 2D is not available');
    this.paintCtx = pctx;
  }

  /** Copies a region of the paint buffer to the display canvas. */
  flush(rect: Rect): void {
    if (rect.width <= 0 || rect.height <= 0) return;
    const image = this.paintCtx.createImageData(rect.width, rect.height);
    const rowBytes = rect.width * 4;
    for (let row = 0; row < rect.height; row++) {
      const start = ((rect.y + row) * this.width + rect.x) * 4;
      image.data.set(this.paint.subarray(start, start + rowBytes), row * rowBytes);
    }
    this.paintCtx.putImageData(image, rect.x, rect.y);
  }

  /** Renders the original with the paint layer on top, at full resolution. */
  composite(): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = this.width;
    out.height = this.height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    ctx.drawImage(this.original, 0, 0);
    ctx.drawImage(this.paintCanvas, 0, 0);
    return out;
  }
}
