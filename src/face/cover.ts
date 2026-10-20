import type { Point } from '../canvas/view';

export type CoverArea = 'eyes' | 'face';

export interface FaceInfo {
  box: { x: number; y: number; width: number; height: number };
  /** The 68 facial landmarks, when they were found. */
  landmarks: Point[] | null;
}

/** A rotated rectangle to cover: center, size along/across the face and its tilt. */
export interface CoverRegion {
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** Tilt of the eye line in radians. */
  angle: number;
}

export interface StrokePlan {
  /** Ribbon width in image pixels. */
  width: number;
  strokes: Point[][];
}

/** Strokes rise slightly to the right, like a quick right-handed swipe. */
const STROKE_TILT = -0.22;

function mean(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/** Bounds of points in a frame rotated by `angle` around `origin`. */
function alignedBounds(points: Point[], origin: Point, angle: number) {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    const x = dx * cos - dy * sin;
    const y = dx * sin + dy * cos;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function toImage(origin: Point, angle: number, x: number, y: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: origin.x + x * cos - y * sin, y: origin.y + x * sin + y * cos };
}

/** The area to paint over for one face. */
export function coverRegion(face: FaceInfo, area: CoverArea): CoverRegion {
  const { box } = face;
  const lm = face.landmarks;
  if (!lm || lm.length < 68) {
    // Without landmarks, estimate from the detection box.
    if (area === 'eyes') {
      return {
        cx: box.x + box.width / 2,
        cy: box.y + box.height * 0.38,
        width: box.width * 1.15,
        height: box.height * 0.5,
        angle: 0,
      };
    }
    return {
      cx: box.x + box.width / 2,
      cy: box.y + box.height * 0.42,
      width: box.width * 1.3,
      height: box.height * 1.45,
      angle: 0,
    };
  }
  const leftEye = mean(lm.slice(36, 42));
  const rightEye = mean(lm.slice(42, 48));
  const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const eyesCenter = mean([leftEye, rightEye]);

  if (area === 'eyes') {
    const pts = [...lm.slice(17, 27), ...lm.slice(36, 48)];
    const b = alignedBounds(pts, eyesCenter, angle);
    const w = (b.maxX - b.minX) * 1.35;
    const h = (b.maxY - b.minY) * 2.8;
    const c = toImage(eyesCenter, angle, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2 + h * 0.08);
    return { cx: c.x, cy: c.y, width: w, height: h, angle };
  }
  // Whole face: jaw line plus brows, extended upward to cover the forehead.
  const pts = [...lm.slice(0, 27)];
  const b = alignedBounds(pts, eyesCenter, angle);
  const w = (b.maxX - b.minX) * 1.25;
  const faceH = b.maxY - b.minY;
  const top = b.minY - faceH * 0.45;
  const bottom = b.maxY + faceH * 0.08;
  const c = toImage(eyesCenter, angle, (b.minX + b.maxX) / 2, (top + bottom) / 2);
  return { cx: c.x, cy: c.y, width: w, height: bottom - top, angle };
}

/**
 * Lays out rough, overlapping strokes across a region: parallel swipes in three layers, slightly
 * jittered, extending past the region's sides so the edges look hand-made.
 */
export function planStrokes(region: CoverRegion, area: CoverArea, rng: () => number): StrokePlan {
  const rows = area === 'eyes' ? 3 : 5;
  const width = region.height / (rows * 0.78);
  const tilt = region.angle + STROKE_TILT;
  const origin = { x: region.cx, y: region.cy };
  const half = region.width / 2 / Math.cos(STROKE_TILT);
  const strokes: Point[][] = [];
  // Three layers, each shifted by a third of the row spacing, so no gap survives all of them.
  const step = width * 0.78;
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < rows; i++) {
      const across =
        (i - (rows - 1) / 2) * step + ((layer - 1) * step) / 3 + (rng() - 0.5) * width * 0.2;
      const start = -half - width * (0.05 + rng() * 0.5);
      const end = half + width * (0.05 + rng() * 0.5);
      const bend = (rng() - 0.5) * width * 0.2;
      const angle = tilt + (rng() - 0.5) * 0.18;
      // The across offset is measured in the face frame, the swipe runs along the tilted line.
      const base = toImage(origin, region.angle, 0, across);
      strokes.push([
        toImage(base, angle, start, 0),
        toImage(base, angle, (start + end) / 2, bend),
        toImage(base, angle, end, 0),
      ]);
    }
  }
  return { width, strokes };
}
