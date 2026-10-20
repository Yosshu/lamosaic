import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/brush/noise';
import { coverRegion, planStrokes, type FaceInfo } from '../../src/face/cover';

/** A synthetic upright face: 68 landmarks laid out like the iBUG scheme. */
function face(cx: number, cy: number, s: number, tilt = 0): FaceInfo {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 17; i++) {
    const a = Math.PI * (i / 16);
    pts.push([-Math.cos(a) * s, Math.sin(a) * s * 1.1 - s * 0.1]); // jaw 0-16
  }
  for (let i = 0; i < 5; i++) pts.push([-s * 0.75 + i * s * 0.12, -s * 0.45]); // left brow 17-21
  for (let i = 0; i < 5; i++) pts.push([s * 0.27 + i * s * 0.12, -s * 0.45]); // right brow 22-26
  for (let i = 0; i < 9; i++) pts.push([0, -s * 0.3 + i * s * 0.06]); // nose 27-35
  for (const ex of [-s * 0.42, s * 0.42]) {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      pts.push([ex + Math.cos(a) * s * 0.15, -s * 0.25 + Math.sin(a) * s * 0.06]); // eyes 36-47
    }
  }
  for (let i = 0; i < 20; i++) pts.push([-s * 0.3 + (i % 10) * s * 0.066, s * 0.45]); // mouth 48-67
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const landmarks = pts.map(([x, y]) => ({ x: cx + x * cos - y * sin, y: cy + x * sin + y * cos }));
  return { box: { x: cx - s, y: cy - s, width: s * 2, height: s * 2 }, landmarks };
}

describe('coverRegion', () => {
  it('centers the eye region on the eyes and keeps the mouth out', () => {
    const r = coverRegion(face(500, 500, 100), 'eyes');
    expect(r.cx).toBeCloseTo(500, 0);
    expect(r.cy).toBeLessThan(500);
    expect(r.cy + r.height / 2).toBeLessThan(500 + 45);
    expect(r.width).toBeGreaterThan(110);
  });

  it('covers the forehead to the chin for the whole face', () => {
    const r = coverRegion(face(500, 500, 100), 'face');
    expect(r.cy - r.height / 2).toBeLessThan(500 - 100);
    expect(r.cy + r.height / 2).toBeGreaterThan(500 + 90);
  });

  it('follows a tilted head', () => {
    const r = coverRegion(face(500, 500, 100, 0.3), 'eyes');
    expect(r.angle).toBeCloseTo(0.3, 2);
  });

  it('falls back to the detection box without landmarks', () => {
    const r = coverRegion(
      { box: { x: 0, y: 0, width: 200, height: 200 }, landmarks: null },
      'eyes',
    );
    expect(r.cx).toBe(100);
    expect(r.angle).toBe(0);
  });
});

describe('planStrokes', () => {
  it('lays three layers of strokes that span past the region', () => {
    const region = { cx: 500, cy: 400, width: 300, height: 120, angle: 0 };
    const plan = planStrokes(region, 'eyes', createRng(1));
    expect(plan.strokes).toHaveLength(9);
    for (const stroke of plan.strokes) {
      const xs = stroke.map((p) => p.x);
      expect(Math.min(...xs)).toBeLessThan(350);
      expect(Math.max(...xs)).toBeGreaterThan(650);
    }
    // Strokes cover the region's height.
    const ys = plan.strokes.map((s) => s[1]!.y);
    expect(Math.min(...ys)).toBeLessThan(400 - 120 / 4);
    expect(Math.max(...ys)).toBeGreaterThan(400 + 120 / 4);
  });
});
