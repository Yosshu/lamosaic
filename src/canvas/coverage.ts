export interface ThinPaintMap {
  /** Size of one cell in image pixels. */
  cell: number;
  cols: number;
  rows: number;
  /** Per cell 0..255: how strongly the photo still shows through the paint there. */
  values: Uint8Array;
  /** Number of cells flagged as thin. */
  count: number;
}

/**
 * Finds places inside painted areas where the photo still shows through. Each cell is judged by
 * its average paint opacity, ignoring the speckled fringe around strokes (cells that are only
 * partly painted), so the map highlights thin spots in the middle of the paint, such as a
 * single layer over the eyes.
 */
export function findThinPaint(
  paint: Uint8ClampedArray,
  width: number,
  height: number,
  cell = 6,
  target = 0.9,
): ThinPaintMap {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const values = new Uint8Array(cols * rows);
  let count = 0;
  for (let cy = 0; cy < rows; cy++) {
    const y0 = cy * cell;
    const y1 = Math.min(height, y0 + cell);
    for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * cell;
      const x1 = Math.min(width, x0 + cell);
      let sum = 0;
      let painted = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        let k = (y * width + x0) * 4 + 3;
        for (let x = x0; x < x1; x++, k += 4) {
          const a = paint[k] as number;
          sum += a;
          if (a > 0) painted++;
          n++;
        }
      }
      if (n === 0 || painted < n * 0.6) continue;
      const mean = sum / n / 255;
      if (mean >= target) continue;
      const strength = Math.min(1, (target - mean) / target / 0.5);
      values[cy * cols + cx] = Math.round(64 + strength * 191);
      count++;
    }
  }
  return { cell, cols, rows, values, count };
}
