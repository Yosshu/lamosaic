import { describe, expect, it } from 'vitest';
import { fitWithinLimits } from '../../src/io/limits';

describe('fitWithinLimits', () => {
  it('keeps small images unchanged', () => {
    expect(fitWithinLimits({ width: 1170, height: 2532 })).toEqual({ width: 1170, height: 2532 });
  });

  it('caps the longest side', () => {
    expect(fitWithinLimits({ width: 8000, height: 2000 }, 1e9, 4000)).toEqual({
      width: 4000,
      height: 1000,
    });
  });

  it('caps the pixel count while keeping the aspect ratio', () => {
    const out = fitWithinLimits({ width: 4032, height: 3024 }, 6_000_000, 10_000);
    expect(out.width * out.height).toBeLessThanOrEqual(6_000_000);
    expect(out.width / out.height).toBeCloseTo(4032 / 3024, 2);
  });

  it('rejects empty images', () => {
    expect(() => fitWithinLimits({ width: 0, height: 10 })).toThrow();
  });
});
