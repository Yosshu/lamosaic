import type { PaintDocument } from '../canvas/document';
import { TILE_SIZE, TileGrid, type TileSet } from '../canvas/history';
import { clipToBounds, union, type Rect } from '../canvas/rect';
import type { StrokeSample } from '../input/strokePath';
import { jitterColor, mixRgb, styleColor, type RGB } from './color';
import {
  cloudTexture,
  createRng,
  noise1D,
  paperTexture,
  TEXTURE_SIZE,
  type Texture,
} from './noise';
import type { BrushParams } from './params';

const BRISTLE_LENGTH = 512;
const WOBBLE_LENGTH = 1024;

interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Half widths at both ends. */
  ha: number;
  hb: number;
  /** Arc length at both ends. */
  sa: number;
  sb: number;
  color: RGB;
  /** Whether this is the first segment (gets the start fade). */
  first: boolean;
}

/**
 * Paints one stroke at a time into the document's paint layer.
 *
 * A stroke is a flat ribbon swept along the path. Rasterising produces a coverage value per
 * pixel (max-combined, so overlapping parts of one stroke do not get darker); the paint
 * deposited from that coverage depends on the paper texture, so the low-coverage edges and ends
 * break up into crayon-like speckles. Each pixel is shaded from the stroke-start backup of the
 * paint layer, which also becomes the undo record.
 */
export class BrushEngine {
  private readonly doc: PaintDocument;
  readonly grid: TileGrid;
  private readonly paper: Texture;
  private readonly cloud: Texture;
  private readonly shortSide: number;

  private params: BrushParams | null = null;
  private rng: () => number = Math.random;
  private backup: TileSet = new Map();
  private coverage = new Map<number, Uint8Array>();
  private samples: StrokeSample[] = [];
  private color: RGB = [0, 0, 0];
  private halfWidth = 0;
  private bristles: Float32Array = new Float32Array(BRISTLE_LENGTH);
  private wobbleL: Float32Array = new Float32Array(WOBBLE_LENGTH);
  private wobbleR: Float32Array = new Float32Array(WOBBLE_LENGTH);
  private grainOffsetX = 0;
  private grainOffsetY = 0;
  private dirty: Rect | null = null;
  private strokeCount = 0;

  constructor(doc: PaintDocument, seed = 1) {
    this.doc = doc;
    this.grid = new TileGrid(doc.width, doc.height);
    this.paper = paperTexture(seed);
    this.cloud = cloudTexture(seed + 7);
    this.shortSide = Math.min(doc.width, doc.height);
  }

  get active(): boolean {
    return this.params !== null;
  }

  /** Brush width in image pixels for the given parameters. */
  widthFor(params: BrushParams): number {
    return Math.max(2, params.size * this.shortSide);
  }

  begin(params: BrushParams, seed = ++this.strokeCount): void {
    this.params = params;
    this.rng = createRng(seed * 7919 + 17);
    this.backup = new Map();
    this.coverage = new Map();
    this.samples = [];
    this.dirty = null;
    this.halfWidth = this.widthFor(params) / 2;
    this.grainOffsetX = this.rng() * TEXTURE_SIZE;
    this.grainOffsetY = this.rng() * TEXTURE_SIZE;
    this.bristles = noise1D(
      this.rng,
      BRISTLE_LENGTH,
      BRISTLE_LENGTH / Math.max(1, params.bristleCount),
    );
    this.wobbleL = noise1D(this.rng, WOBBLE_LENGTH, 24);
    this.wobbleR = noise1D(this.rng, WOBBLE_LENGTH, 24);
  }

  /** Adds samples to the current stroke. */
  add(samples: StrokeSample[]): void {
    const params = this.params;
    if (!params) return;
    for (const sample of samples) {
      const prev = this.samples[this.samples.length - 1];
      this.samples.push(sample);
      if (!prev) {
        this.color = this.startColor(sample, params);
        continue;
      }
      if (params.pickup > 0) {
        const under = this.sampleColor(sample.x, sample.y, this.halfWidth * 0.5, params);
        const step = Math.min(
          1,
          (params.pickup * (sample.distance - prev.distance)) / this.halfWidth,
        );
        this.color = mixRgb(this.color, styleColor(under, params), step);
      }
      this.drawSegment(prev, sample, this.samples.length === 2);
    }
  }

  /**
   * Replaces the whole stroke with new samples (used for straight-line strokes, whose shape
   * changes as the pointer moves).
   */
  replace(samples: StrokeSample[]): void {
    if (!this.params) return;
    this.restoreBackup();
    this.coverage = new Map();
    const seedState = this.samples.length > 0;
    this.samples = [];
    if (seedState) {
      // Keep the color picked at the first sample so the stroke does not flicker.
      const color = this.color;
      this.add(samples.slice(0, 1));
      this.color = color;
      this.add(samples.slice(1));
    } else {
      this.add(samples);
    }
  }

  /** Ends the stroke and returns the undo record. A single tap leaves a short dab. */
  end(): TileSet {
    const params = this.params;
    if (params && this.samples.length === 1) {
      const s = this.samples[0] as StrokeSample;
      const len = this.halfWidth * 0.6;
      this.drawSegment(
        { ...s, x: s.x - Math.cos(s.angle) * len * 0.5, y: s.y - Math.sin(s.angle) * len * 0.5 },
        {
          ...s,
          x: s.x + Math.cos(s.angle) * len * 0.5,
          y: s.y + Math.sin(s.angle) * len * 0.5,
          distance: len,
        },
        true,
      );
    }
    const record = this.backup;
    this.params = null;
    this.backup = new Map();
    this.coverage = new Map();
    this.samples = [];
    return record;
  }

  /** Aborts the stroke and restores the paint layer. Returns the region to redraw. */
  cancel(): Rect | null {
    if (!this.params) return null;
    let region: Rect | null = null;
    for (const index of this.backup.keys()) region = union(region, this.grid.tileRect(index));
    this.restoreBackup();
    this.params = null;
    this.backup = new Map();
    this.coverage = new Map();
    this.samples = [];
    return region;
  }

  /** Returns and clears the region changed since the last call. */
  takeDirty(): Rect | null {
    const d = this.dirty;
    this.dirty = null;
    return d;
  }

  private restoreBackup(): void {
    for (const [index, data] of this.backup) {
      this.grid.write(this.doc.paint, index, data);
      this.dirty = union(this.dirty, this.grid.tileRect(index));
    }
  }

  private startColor(sample: StrokeSample, params: BrushParams): RGB {
    const radius = Math.max(1, params.sampleRadius * this.halfWidth * 2);
    const picked = this.sampleColor(sample.x, sample.y, radius, params);
    return jitterColor(styleColor(picked, params), params.colorJitter, this.rng);
  }

  /** Average color in a disk, from the original photo or the visible composite. */
  sampleColor(cx: number, cy: number, radius: number, params: BrushParams): RGB {
    const { width, height, originalPixels, paint } = this.doc;
    const steps = 6;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let j = -steps; j <= steps; j++) {
      for (let i = -steps; i <= steps; i++) {
        if (i * i + j * j > steps * steps) continue;
        const x = Math.round(cx + (i / steps) * radius);
        const y = Math.round(cy + (j / steps) * radius);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const k = (y * width + x) * 4;
        let pr = originalPixels[k] as number;
        let pg = originalPixels[k + 1] as number;
        let pb = originalPixels[k + 2] as number;
        if (params.sampleFrom === 'composite') {
          const a = (paint[k + 3] as number) / 255;
          pr += ((paint[k] as number) - pr) * a;
          pg += ((paint[k + 1] as number) - pg) * a;
          pb += ((paint[k + 2] as number) - pb) * a;
        }
        r += pr;
        g += pg;
        b += pb;
        n++;
      }
    }
    if (n === 0) return [128, 128, 128];
    return [r / n, g / n, b / n];
  }

  private pressureScale(p: number): number {
    return 0.55 + 0.9 * Math.min(1, Math.max(0, p));
  }

  private drawSegment(a: StrokeSample, b: StrokeSample, first: boolean): void {
    this.rasterize({
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      ha: this.halfWidth * this.pressureScale(a.pressure),
      hb: this.halfWidth * this.pressureScale(b.pressure),
      sa: a.distance,
      sb: b.distance,
      color: this.color,
      first,
    });
  }

  private rasterize(seg: Segment): void {
    const params = this.params as BrushParams;
    const { width, height, paint } = this.doc;
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    const len = Math.hypot(dx, dy);
    const tx = len > 1e-6 ? dx / len : 1;
    const ty = len > 1e-6 ? dy / len : 0;
    const nx = -ty;
    const ny = tx;
    const hmax = Math.max(seg.ha, seg.hb) * (1 + params.edgeWobble);
    const fullWidth = this.halfWidth * 2;
    const feather = Math.max(1, params.endFeather * fullWidth);
    // The tail only fades on the first segment; later segments overlap the previous one a bit.
    const back = seg.first ? feather : 1.5;
    const ahead = feather;

    // Corners of the rotated rectangle covering the segment plus its fades.
    const corners: Array<[number, number]> = [];
    for (const along of [-back, len + ahead]) {
      for (const across of [-hmax, hmax]) {
        corners.push([seg.ax + tx * along + nx * across, seg.ay + ty * along + ny * across]);
      }
    }
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const bounds = clipToBounds(
      {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      },
      width,
      height,
    );
    if (bounds.width <= 0 || bounds.height <= 0) return;
    // Polygon edges in winding order for per-row spans.
    const poly: Array<[number, number]> = [
      corners[0] as [number, number],
      corners[1] as [number, number],
      corners[3] as [number, number],
      corners[2] as [number, number],
    ];

    const soft = Math.max(0.02, params.edgeSoftness);
    const wobble = params.edgeWobble;
    const taper = Math.max(1, params.startTaper * fullWidth);
    const grain = params.grain;
    const contrast = params.grainContrast;
    const grainStep = 1 / Math.max(0.25, params.grainScale * this.shortSide);
    const cloudStep = (1 / Math.max(1, params.mottleScale * fullWidth)) * 8;
    const bristle = params.bristle;
    const mottle = params.mottle;
    const underlay = params.underlay;
    const opacity = params.opacity;
    const [cr, cg, cb] = seg.color;
    const wobbleScale = WOBBLE_LENGTH / Math.max(1, fullWidth * 6);
    const goX = this.grainOffsetX;
    const goY = this.grainOffsetY;

    for (const tileIndex of this.grid.tilesIn(bounds)) {
      const tile = this.grid.tileRect(tileIndex);
      let base = this.backup.get(tileIndex);
      if (!base) {
        base = this.grid.read(paint, tileIndex);
        this.backup.set(tileIndex, base);
      }
      let cov = this.coverage.get(tileIndex);
      if (!cov) {
        cov = new Uint8Array(TILE_SIZE * TILE_SIZE);
        this.coverage.set(tileIndex, cov);
      }
      const y0 = Math.max(bounds.y, tile.y);
      const y1 = Math.min(bounds.y + bounds.height, tile.y + tile.height);
      const tx0 = Math.max(bounds.x, tile.x);
      const tx1 = Math.min(bounds.x + bounds.width, tile.x + tile.width);
      for (let y = y0; y < y1; y++) {
        const py = y + 0.5;
        // Span of the polygon on this row.
        let minX = Infinity;
        let maxX = -Infinity;
        for (let e = 0; e < 4; e++) {
          const p = poly[e] as [number, number];
          const q = poly[(e + 1) % 4] as [number, number];
          if ((p[1] <= py && q[1] > py) || (q[1] <= py && p[1] > py)) {
            const x = p[0] + ((py - p[1]) / (q[1] - p[1])) * (q[0] - p[0]);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
        }
        if (minX > maxX) continue;
        const x0 = Math.max(tx0, Math.floor(minX));
        const x1 = Math.min(tx1, Math.ceil(maxX));
        for (let x = x0; x < x1; x++) {
          const px = x + 0.5;
          const rx = px - seg.ax;
          const ry = py - seg.ay;
          const u = rx * tx + ry * ty;
          const v = rx * nx + ry * ny;
          const t = len > 0 ? Math.min(1, Math.max(0, u / len)) : 0;
          const s = seg.sa + (seg.sb - seg.sa) * t + (u < 0 ? u : u > len ? u - len : 0);
          const wi =
            ((Math.floor(Math.max(0, s) * wobbleScale) % WOBBLE_LENGTH) + WOBBLE_LENGTH) %
            WOBBLE_LENGTH;
          const wob = v >= 0 ? (this.wobbleL[wi] as number) : (this.wobbleR[wi] as number);
          const hw = (seg.ha + (seg.hb - seg.ha) * t) * (1 + wobble * (wob * 2 - 1));
          const e = Math.abs(v) / hw;
          if (e >= 1) continue;
          let c = e <= 1 - soft ? 1 : 1 - smoothstep((e - (1 - soft)) / soft);
          if (u < 0) c *= 1 - smoothstep(-u / back);
          else if (u > len) c *= 1 - smoothstep((u - len) / ahead);
          if (s < taper) c *= 0.35 + 0.65 * smoothstep(Math.max(0, s) / taper);
          if (bristle > 0) {
            const bi = Math.floor(((v / hw) * 0.5 + 0.5) * (BRISTLE_LENGTH - 1));
            c *= 1 - bristle * (1 - (this.bristles[bi] as number));
          }
          const lx = x - tile.x;
          const ly = y - tile.y;
          const ci = ly * TILE_SIZE + lx;
          const value = Math.round(c * 255);
          if (value <= (cov[ci] as number)) continue;
          cov[ci] = value;

          // Paint deposit: the paper tooth decides where low coverage still leaves paint.
          const paper = this.paper.sample(x * grainStep + goX, y * grainStep + goY);
          let alpha = Math.min(1, Math.max(0, (c - (1 - paper) * grain) * contrast));
          if (underlay > 0) alpha = Math.max(alpha, underlay * c);
          alpha *= opacity;
          if (alpha <= 0) continue;

          let r = cr;
          let g = cg;
          let b = cb;
          if (mottle > 0) {
            const m = (this.cloud.sample(x * cloudStep, y * cloudStep) - 0.5) * mottle * 0.5;
            r *= 1 + m;
            g *= 1 + m;
            b *= 1 + m;
          }
          const ti = (ly * tile.width + lx) * 4;
          const ba = (base[ti + 3] as number) / 255;
          const outA = alpha + ba * (1 - alpha);
          const k = (y * width + x) * 4;
          if (outA <= 0) continue;
          const wBase = (ba * (1 - alpha)) / outA;
          const wNew = alpha / outA;
          paint[k] = r * wNew + (base[ti] as number) * wBase;
          paint[k + 1] = g * wNew + (base[ti + 1] as number) * wBase;
          paint[k + 2] = b * wNew + (base[ti + 2] as number) * wBase;
          paint[k + 3] = outA * 255;
        }
      }
    }
    this.dirty = union(this.dirty, bounds);
  }
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
