import type { RGB } from '../brush/color';
import { BrushEngine, type PixelDocument } from '../brush/engine';
import type { BrushParams } from '../brush/params';
import { StrokePath } from '../input/strokePath';

const WIDTH = 160;
const HEIGHT = 64;
/** Skin and rose tones, like strokes picked from a face. */
const COLORS: RGB[] = [
  [232, 190, 176],
  [196, 140, 136],
];

/** A tiny dark "photo" (like hair) so light strokes show up clearly. */
function samplePhoto(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const t = x / WIDTH;
      const k = (y * WIDTH + x) * 4;
      px[k] = 112 + (70 - 112) * t;
      px[k + 1] = 80 + (50 - 80) * t;
      px[k + 2] = 74 + (48 - 74) * t;
      px[k + 3] = 255;
    }
  }
  return px;
}

/** Renders two sample strokes with the preset and returns the result as an image URL. */
export function renderPresetPreview(params: BrushParams): string {
  const originalPixels = samplePhoto();
  const doc: PixelDocument = {
    width: WIDTH,
    height: HEIGHT,
    originalPixels,
    paint: new Uint8ClampedArray(WIDTH * HEIGHT * 4),
  };
  const engine = new BrushEngine(doc, 3);
  const p = { ...params, size: Math.min(0.6, params.size * 4.2), smoothing: 0 };
  const strokes: Array<Array<[number, number]>> = [
    [
      [18, 46],
      [80, 38],
      [142, 30],
    ],
    [
      [10, 26],
      [76, 20],
      [150, 14],
    ],
  ];
  strokes.forEach((points, i) => {
    const path = new StrokePath(engine.widthFor(p) * p.spacing, 0);
    engine.begin(p, COLORS[i % COLORS.length] ?? null, i + 1);
    for (const [x, y] of points) engine.add(path.add({ x, y, pressure: 0.5 }));
    engine.add(path.finish());
    engine.end();
  });
  const out = new Uint8ClampedArray(originalPixels);
  for (let k = 0; k < out.length; k += 4) {
    const a = (doc.paint[k + 3] as number) / 255;
    for (let c = 0; c < 3; c++) {
      out[k + c] = (originalPixels[k + c] as number) * (1 - a) + (doc.paint[k + c] as number) * a;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.putImageData(new ImageData(out, WIDTH, HEIGHT), 0, 0);
  return canvas.toDataURL('image/png');
}
