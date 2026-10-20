interface Level {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  /** Bytes per pixel: 4 for the photo itself (RGBA), 3 for the smaller levels (RGB). */
  stride: number;
  scale: number;
}

/**
 * Downsampled copies of the photo (each level half the size of the previous one), used to look
 * up the average color around any point cheaply: a smooth blur for "local color" painting and
 * block averages for mosaic.
 */
export class ColorPyramid {
  private readonly levels: Level[] = [];

  constructor(rgba: Uint8ClampedArray, width: number, height: number) {
    // The full-size level is the photo itself, so only the smaller levels use extra memory.
    let level: Level = { width, height, data: rgba, stride: 4, scale: 1 };
    this.levels.push(level);
    while (level.width > 1 || level.height > 1) {
      level = halve(level);
      this.levels.push(level);
    }
  }

  get depth(): number {
    return this.levels.length;
  }

  /** Average color within roughly `radius` pixels of (x, y), written to `out`. */
  smooth(x: number, y: number, radius: number, out: Float32Array): void {
    const index = Math.min(
      this.levels.length - 1,
      Math.max(0, Math.round(Math.log2(Math.max(1, radius)))),
    );
    this.bilinear(this.levels[index] as Level, x, y, out);
  }

  /** Average color of the `block`-sized mosaic cell containing (x, y), written to `out`. */
  block(x: number, y: number, block: number, out: Float32Array): void {
    const b = Math.max(2, block);
    const cx = (Math.floor(x / b) + 0.5) * b;
    const cy = (Math.floor(y / b) + 0.5) * b;
    this.smooth(cx, cy, b, out);
  }

  private bilinear(level: Level, x: number, y: number, out: Float32Array): void {
    const { width, height, data, stride, scale } = level;
    let u = (x + 0.5) / scale - 0.5;
    let v = (y + 0.5) / scale - 0.5;
    if (u < 0) u = 0;
    else if (u > width - 1) u = width - 1;
    if (v < 0) v = 0;
    else if (v > height - 1) v = height - 1;
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const fx = u - x0;
    const fy = v - y0;
    const a = (y0 * width + x0) * stride;
    const b = (y0 * width + x1) * stride;
    const c = (y1 * width + x0) * stride;
    const d = (y1 * width + x1) * stride;
    for (let k = 0; k < 3; k++) {
      const top =
        (data[a + k] as number) + ((data[b + k] as number) - (data[a + k] as number)) * fx;
      const bottom =
        (data[c + k] as number) + ((data[d + k] as number) - (data[c + k] as number)) * fx;
      out[k] = top + (bottom - top) * fy;
    }
  }
}

function halve(src: Level): Level {
  const width = Math.max(1, Math.ceil(src.width / 2));
  const height = Math.max(1, Math.ceil(src.height / 2));
  const data = new Uint8ClampedArray(width * height * 3);
  for (let y = 0; y < height; y++) {
    const sy0 = Math.min(src.height - 1, y * 2);
    const sy1 = Math.min(src.height - 1, y * 2 + 1);
    for (let x = 0; x < width; x++) {
      const sx0 = Math.min(src.width - 1, x * 2);
      const sx1 = Math.min(src.width - 1, x * 2 + 1);
      const o = (y * width + x) * 3;
      const st = src.stride;
      for (let k = 0; k < 3; k++) {
        data[o + k] =
          ((src.data[(sy0 * src.width + sx0) * st + k] as number) +
            (src.data[(sy0 * src.width + sx1) * st + k] as number) +
            (src.data[(sy1 * src.width + sx0) * st + k] as number) +
            (src.data[(sy1 * src.width + sx1) * st + k] as number)) /
          4;
      }
    }
  }
  return { width, height, data, stride: 3, scale: src.scale * 2 };
}
