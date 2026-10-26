import { describe, expect, it } from 'vitest';
import { BrushEngine, type PixelDocument } from '../../src/brush/engine';
import { DEFAULT_PARAMS } from '../../src/brush/params';
import { StrokePath } from '../../src/input/strokePath';

function makeDoc(
  width = 200,
  height = 200,
  rgb: [number, number, number] = [200, 150, 140],
): PixelDocument {
  const originalPixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < originalPixels.length; i += 4) {
    originalPixels.set([...rgb, 255], i);
  }
  return { width, height, originalPixels, paint: new Uint8ClampedArray(width * height * 4) };
}

function stroke(engine: BrushEngine, points: Array<[number, number]>, seed = 1) {
  const params = { ...DEFAULT_PARAMS, size: 0.2 };
  const path = new StrokePath(engine.widthFor(params) * params.spacing, 0);
  engine.begin(params, null, seed);
  for (const [x, y] of points) engine.add(path.add({ x, y, pressure: 0.5 }));
  engine.add(path.finish());
  return engine.end();
}

function alphaSum(doc: PixelDocument) {
  let sum = 0;
  for (let i = 3; i < doc.paint.length; i += 4) sum += doc.paint[i] as number;
  return sum;
}

describe('BrushEngine', () => {
  it('paints along the stroke with a color picked from the photo', () => {
    const doc = makeDoc();
    const engine = new BrushEngine(doc);
    stroke(engine, [
      [40, 100],
      [160, 100],
    ]);
    const k = (100 * doc.width + 100) * 4;
    expect(doc.paint[k + 3]).toBeGreaterThan(100);
    // Picked from the (200,150,140) photo, slightly lightened: still a warm, light color.
    expect(doc.paint[k]).toBeGreaterThan(doc.paint[k + 2] as number);
    expect(doc.paint[k]).toBeGreaterThan(180);
    // Far away from the stroke nothing is painted.
    expect(doc.paint[(10 * doc.width + 10) * 4 + 3]).toBe(0);
  });

  it('renders identically for the same seed', () => {
    const a = makeDoc();
    const b = makeDoc();
    const pts: Array<[number, number]> = [
      [30, 40],
      [90, 120],
      [170, 90],
    ];
    stroke(new BrushEngine(a), pts, 5);
    stroke(new BrushEngine(b), pts, 5);
    expect(a.paint).toEqual(b.paint);
  });

  it('does not darken where one stroke crosses itself', () => {
    const doc = makeDoc();
    const engine = new BrushEngine(doc);
    stroke(engine, [
      [40, 100],
      [160, 100],
      [100, 100],
    ]);
    const once = makeDoc();
    stroke(new BrushEngine(once), [
      [40, 100],
      [160, 100],
    ]);
    const k = (100 * doc.width + 70) * 4 + 3;
    expect(Math.abs((doc.paint[k] as number) - (once.paint[k] as number))).toBeLessThanOrEqual(1);
  });

  it('returns backups of the touched tiles that restore the previous state', () => {
    const doc = makeDoc(300, 300);
    const engine = new BrushEngine(doc);
    const record = stroke(engine, [
      [20, 150],
      [280, 150],
    ]);
    expect(record.size).toBeGreaterThan(0);
    expect(alphaSum(doc)).toBeGreaterThan(0);
    for (const [index, data] of record) engine.grid.write(doc.paint, index, data);
    expect(alphaSum(doc)).toBe(0);
  });

  it('cancel restores the paint layer', () => {
    const doc = makeDoc();
    const engine = new BrushEngine(doc);
    const params = { ...DEFAULT_PARAMS, size: 0.2 };
    const path = new StrokePath(5, 0);
    engine.begin(params);
    engine.add(path.add({ x: 20, y: 20, pressure: 0.5 }));
    engine.add(path.add({ x: 180, y: 180, pressure: 0.5 }));
    expect(alphaSum(doc)).toBeGreaterThan(0);
    engine.cancel();
    expect(alphaSum(doc)).toBe(0);
  });
});

describe('BrushEngine dirty tracking', () => {
  it('keeps unflushed changes when the next stroke starts', () => {
    const doc = makeDoc();
    const engine = new BrushEngine(doc);
    stroke(engine, [
      [40, 60],
      [160, 60],
    ]);
    // Start another stroke before the previous end was flushed to the screen.
    engine.begin({ ...DEFAULT_PARAMS });
    const dirty = engine.takeDirty();
    expect(dirty).not.toBeNull();
    expect(dirty!.x + dirty!.width).toBeGreaterThan(160);
  });
});

describe('BrushEngine local color', () => {
  it('takes the color under each part of the stroke', () => {
    // Left half red, right half blue.
    const doc = makeDoc(240, 120);
    for (let y = 0; y < 120; y++) {
      for (let x = 0; x < 240; x++) {
        doc.originalPixels.set(
          x < 120 ? [220, 40, 40, 255] : [40, 60, 220, 255],
          (y * 240 + x) * 4,
        );
      }
    }
    const engine = new BrushEngine(doc);
    const params = {
      ...DEFAULT_PARAMS,
      size: 0.25,
      colorSource: 'local' as const,
      mute: 0,
      lighten: 0,
    };
    const path = new StrokePath(engine.widthFor(params) * params.spacing, 0);
    engine.begin(params, null, 1);
    engine.add(path.add({ x: 20, y: 60, pressure: 0.5 }));
    engine.add(path.add({ x: 220, y: 60, pressure: 0.5 }));
    engine.add(path.finish());
    engine.end();
    const px = (x: number) =>
      Array.from(doc.paint.slice((60 * 240 + x) * 4, (60 * 240 + x) * 4 + 3));
    expect(px(40)[0]).toBeGreaterThan(px(40)[2]!);
    expect(px(200)[2]).toBeGreaterThan(px(200)[0]!);
  });

  it('keeps one color along the stroke with the start color', () => {
    const doc = makeDoc(240, 120);
    for (let y = 0; y < 120; y++) {
      for (let x = 0; x < 240; x++) {
        doc.originalPixels.set(
          x < 120 ? [220, 40, 40, 255] : [40, 60, 220, 255],
          (y * 240 + x) * 4,
        );
      }
    }
    const engine = new BrushEngine(doc);
    const params = { ...DEFAULT_PARAMS, size: 0.25, colorSource: 'start' as const };
    const path = new StrokePath(engine.widthFor(params) * params.spacing, 0);
    engine.begin(params, null, 1);
    engine.add(path.add({ x: 20, y: 60, pressure: 0.5 }));
    engine.add(path.add({ x: 220, y: 60, pressure: 0.5 }));
    engine.add(path.finish());
    engine.end();
    const k = (60 * 240 + 200) * 4;
    expect(doc.paint[k]).toBeGreaterThan(doc.paint[k + 2]!);
  });
});

describe('BrushEngine textured presets', () => {
  it.each(['crayon', 'soft', 'pastel', 'mottled'] as const)(
    '%s keeps the center of a stroke dense enough to hide the photo',
    async (id) => {
      const { presetById } = await import('../../src/brush/presets');
      const doc = makeDoc(300, 200);
      const engine = new BrushEngine(doc);
      const params = { ...presetById(id).params, size: 0.3 };
      const path = new StrokePath(engine.widthFor(params) * params.spacing, 0);
      engine.begin(params, null, 2);
      engine.add(path.add({ x: 30, y: 100, pressure: 0.5 }));
      engine.add(path.add({ x: 270, y: 100, pressure: 0.5 }));
      engine.add(path.finish());
      engine.end();
      let sum = 0;
      let n = 0;
      for (let y = 95; y < 105; y++) {
        for (let x = 120; x < 180; x++) {
          sum += doc.paint[(y * 300 + x) * 4 + 3] as number;
          n++;
        }
      }
      expect(sum / n / 255).toBeGreaterThan(0.85);
    },
  );
});
