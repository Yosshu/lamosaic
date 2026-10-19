import { describe, expect, it } from 'vitest';
import { oklabToRgb, rgbToOklab, styleColor } from '../../src/brush/color';

describe('color', () => {
  it('round-trips through OKLab', () => {
    for (const rgb of [
      [0, 0, 0],
      [255, 255, 255],
      [200, 150, 140],
      [40, 60, 220],
    ] as const) {
      const back = oklabToRgb(rgbToOklab([...rgb]));
      back.forEach((c, i) => expect(Math.abs(c - (rgb[i] as number))).toBeLessThanOrEqual(1));
    }
  });

  it('makes colors lighter and duller', () => {
    const src: [number, number, number] = [180, 90, 80];
    const out = styleColor(src, { lighten: 0.08, mute: 0.4, warmth: 0 });
    const a = rgbToOklab(src);
    const b = rgbToOklab(out);
    expect(b.L).toBeGreaterThan(a.L);
    expect(Math.hypot(b.a, b.b)).toBeLessThan(Math.hypot(a.a, a.b));
  });
});
