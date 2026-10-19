import { describe, expect, it } from 'vitest';
import { StrokePath } from '../../src/input/strokePath';

describe('StrokePath', () => {
  it('emits evenly spaced samples along a straight line', () => {
    const path = new StrokePath(5, 0);
    const samples = [
      ...path.add({ x: 0, y: 0, pressure: 0.5 }),
      ...path.add({ x: 50, y: 0, pressure: 0.5 }),
      ...path.finish(),
    ];
    expect(samples[0]).toMatchObject({ x: 0, y: 0, distance: 0 });
    expect(samples).toHaveLength(11);
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!;
      const b = samples[i]!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(5, 5);
      expect(b.angle).toBeCloseTo(0, 5);
    }
  });

  it('reports the direction of travel', () => {
    const path = new StrokePath(2, 0);
    const samples = [
      ...path.add({ x: 0, y: 0, pressure: 0.5 }),
      ...path.add({ x: 0, y: 20, pressure: 0.5 }),
    ];
    expect(samples.at(-1)!.angle).toBeCloseTo(Math.PI / 2, 5);
  });

  it('smooths jitter while still reaching the end point', () => {
    const path = new StrokePath(1, 0.7);
    const out = [...path.add({ x: 0, y: 0, pressure: 0.5 })];
    for (let i = 1; i <= 40; i++) {
      out.push(...path.add({ x: i * 2, y: i % 2 === 0 ? 3 : -3, pressure: 0.5 }));
    }
    out.push(...path.finish());
    const maxDeviation = Math.max(...out.slice(5, -5).map((s) => Math.abs(s.y)));
    expect(maxDeviation).toBeLessThan(2);
    expect(out.at(-1)!.x).toBeGreaterThan(78);
  });

  it('leaves a single sample for a tap', () => {
    const path = new StrokePath(5, 0.5);
    const samples = [...path.add({ x: 10, y: 10, pressure: 0.5 }), ...path.finish()];
    expect(samples).toHaveLength(1);
  });
});
