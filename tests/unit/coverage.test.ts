import { describe, expect, it } from 'vitest';
import { findThinPaint } from '../../src/canvas/coverage';

function paintWithAlpha(width: number, height: number, alpha: (x: number, y: number) => number) {
  const paint = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) paint[(y * width + x) * 4 + 3] = alpha(x, y);
  }
  return paint;
}

describe('findThinPaint', () => {
  it('flags see-through paint but not solid paint or bare photo', () => {
    // Left third bare, middle third thin paint, right third solid paint.
    const paint = paintWithAlpha(60, 12, (x) => (x < 20 ? 0 : x < 40 ? 140 : 255));
    const map = findThinPaint(paint, 60, 12, 6);
    const at = (x: number) => map.values[Math.floor(x / 6)] as number;
    expect(at(5)).toBe(0);
    expect(at(30)).toBeGreaterThan(0);
    expect(at(55)).toBe(0);
    expect(map.count).toBeGreaterThan(0);
  });

  it('ignores the speckled fringe of a stroke', () => {
    // Every other pixel painted: a partly painted cell is fringe, not a thin spot.
    const paint = paintWithAlpha(12, 12, (x, y) => ((x + y) % 2 === 0 ? 200 : 0));
    expect(findThinPaint(paint, 12, 12, 6).count).toBe(0);
  });
});
