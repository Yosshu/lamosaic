import { TILE_SIZE, TileGrid, type TileSet } from '../canvas/history';
import { clipToBounds, union, type Rect } from '../canvas/rect';
import type { StrokeSample } from '../input/strokePath';
import { jitterColor, mixRgb, shiftColor, styleColor, type RGB } from './color';
import {
  cloudTexture,
  createRng,
  noise1D,
  paperTexture,
  TEXTURE_SIZE,
  type Texture,
} from './noise';
import type { BrushParams } from './params';
import { ColorPyramid } from './pyramid';

/** The parts of the document the engine needs: original pixels to pick colors from and the paint layer. */
export interface PixelDocument {
  readonly width: number;
  readonly height: number;
  readonly originalPixels: Uint8ClampedArray;
  readonly paint: Uint8ClampedArray;
}

const BRISTLE_LENGTH = 512;
const WOBBLE_LENGTH = 1024;
const TEX_MASK = TEXTURE_SIZE - 1;

const enum Part {
  /** The ribbon between two cross-sections. */
  Body,
  /** The fade behind the first sample. */
  StartCap,
  /** The fade beyond the last sample. */
  EndCap,
}

/** A piece of ribbon. For caps, only `a` and its tangent are used. */
interface Piece {
  part: Part;
  ax: number;
  ay: number;
  /** Unit tangent at a. */
  atx: number;
  aty: number;
  bx: number;
  by: number;
  /** Unit tangent at b. */
  btx: number;
  bty: number;
  /** Half widths at a and b. */
  ha: number;
  hb: number;
  /** Arc length at a and b. */
  sa: number;
  sb: number;
  /** Paint color at a and at b (they differ when the brush picks up color). */
  color: RGB;
  colorB: RGB;
}

/**
 * Paints one stroke at a time into the document's paint layer.
 *
 * A stroke is a flat ribbon swept along the path. Consecutive samples bound a piece of ribbon
 * between their cross-sections, so pieces tile the ribbon without gaps or overdraw; the start
 * and the end get a fading cap. Rasterising produces a coverage value per pixel (max-combined,
 * so overlapping parts of one stroke do not get darker); the paint deposited from that coverage
 * depends on the paper texture, so the low-coverage edges and ends break up into crayon-like
 * speckles. Each pixel is shaded from the stroke-start backup of the paint layer, which also
 * becomes the undo record.
 */
export class BrushEngine {
  private readonly doc: PixelDocument;
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
  /** Direction the grain is stretched along: the stroke's initial direction. */
  private grainAxisX = 1;
  private grainAxisY = 0;
  private dirty: Rect | null = null;
  private strokeCount = 0;
  private fixedColor: RGB | null = null;
  private pyramid: ColorPyramid | null = null;
  /** Per-stroke lightness variation for per-pixel color. */
  private localJitter = 1;
  /** Per-stroke lightness shift and hue rotation for local color. */
  private jitterL = 0;
  private jitterHue = 0;
  private readonly sampleBuffer = new Float32Array(3);

  constructor(doc: PixelDocument, seed = 1) {
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

  /**
   * Starts a stroke. With `color` the stroke uses that color (from the eyedropper) instead of
   * picking one from the photo under the starting point.
   */
  begin(params: BrushParams, color: RGB | null = null, seed = ++this.strokeCount): void {
    this.params = { ...params };
    this.fixedColor = color;
    if (params.colorSource !== 'start' && !color && !this.pyramid) {
      this.pyramid = new ColorPyramid(this.doc.originalPixels, this.doc.width, this.doc.height);
    }
    this.rng = createRng(seed * 7919 + 17);
    this.backup = new Map();
    this.coverage = new Map();
    this.samples = [];
    this.halfWidth = this.widthFor(params) / 2;
    this.grainOffsetX = this.rng() * TEXTURE_SIZE;
    this.grainOffsetY = this.rng() * TEXTURE_SIZE;
    this.localJitter = 1 + (this.rng() - 0.5) * params.colorJitter * 0.16;
    this.jitterL = (this.rng() - 0.5) * params.colorJitter * 0.12;
    this.jitterHue = (this.rng() - 0.5) * params.colorJitter * 0.5;
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
      const from = this.color;
      if (params.colorSource === 'local' && !this.fixedColor) {
        // Each piece takes the average color under the brush where it ends. With pickup, the
        // color follows it gradually, like paint dragged across.
        const target = this.localColor(sample, params);
        const step =
          params.pickup > 0
            ? Math.min(1, (params.pickup * (sample.distance - prev.distance)) / this.halfWidth)
            : 1;
        this.color = mixRgb(this.color, target, step);
      } else if (params.pickup > 0) {
        const under = this.sampleColor(sample.x, sample.y, this.halfWidth * 0.5, params);
        const step = Math.min(
          1,
          (params.pickup * (sample.distance - prev.distance)) / this.halfWidth,
        );
        this.color = mixRgb(this.color, styleColor(under, params), step);
      }
      if (this.samples.length === 2) {
        this.grainAxisX = Math.cos(prev.angle);
        this.grainAxisY = Math.sin(prev.angle);
        this.rasterize(this.piece(Part.StartCap, prev, prev, from));
      }
      this.rasterize(this.piece(Part.Body, prev, sample, from));
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
    const hadSamples = this.samples.length > 0;
    const color = this.color;
    this.samples = [];
    this.add(samples.slice(0, 1));
    // Keep the color picked at the first sample so the stroke does not flicker.
    if (hadSamples) this.color = color;
    this.add(samples.slice(1));
  }

  /** Ends the stroke and returns the undo record. A single tap leaves a short dab. */
  end(): TileSet {
    if (this.params) {
      const last = this.samples[this.samples.length - 1];
      if (this.samples.length === 1 && last) {
        const len = this.halfWidth * 0.6;
        const cos = Math.cos(last.angle);
        const sin = Math.sin(last.angle);
        const a = { ...last, x: last.x - cos * len * 0.5, y: last.y - sin * len * 0.5 };
        const b = { ...last, x: last.x + cos * len * 0.5, y: last.y + sin * len * 0.5 };
        b.distance = len;
        this.rasterize(this.piece(Part.StartCap, a, a));
        this.rasterize(this.piece(Part.Body, a, b));
        this.rasterize(this.piece(Part.EndCap, b, b));
      } else if (last) {
        this.rasterize(this.piece(Part.EndCap, last, last));
      }
    }
    const record = this.backup;
    this.params = null;
    this.backup = new Map();
    this.coverage = new Map();
    this.samples = [];
    return record;
  }

  /** Aborts the stroke and restores the paint layer. */
  cancel(): void {
    if (!this.params) return;
    this.restoreBackup();
    this.params = null;
    this.backup = new Map();
    this.coverage = new Map();
    this.samples = [];
  }

  /** Returns and clears the region changed since the last call. */
  takeDirty(): Rect | null {
    const d = this.dirty;
    this.dirty = null;
    return d;
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

  private restoreBackup(): void {
    for (const [index, data] of this.backup) {
      this.grid.write(this.doc.paint, index, data);
      this.dirty = union(this.dirty, this.grid.tileRect(index));
    }
  }

  /** The styled average color of the photo under the brush at a sample. */
  private localColor(sample: StrokeSample, params: BrushParams): RGB {
    const radius = Math.max(1, params.localBlur * this.halfWidth * 2);
    let picked: RGB;
    if (params.sampleFrom === 'original' && this.pyramid) {
      const out = this.sampleBuffer;
      this.pyramid.smooth(sample.x, sample.y, radius, out);
      picked = [out[0] as number, out[1] as number, out[2] as number];
    } else {
      picked = this.sampleColor(sample.x, sample.y, radius, params);
    }
    return shiftColor(styleColor(picked, params), this.jitterL, this.jitterHue);
  }

  private startColor(sample: StrokeSample, params: BrushParams): RGB {
    if (this.fixedColor) return jitterColor(this.fixedColor, params.colorJitter * 0.5, this.rng);
    if (params.colorSource === 'local') return this.localColor(sample, params);
    const radius = Math.max(1, params.sampleRadius * this.halfWidth * 2);
    const picked = this.sampleColor(sample.x, sample.y, radius, params);
    return jitterColor(styleColor(picked, params), params.colorJitter, this.rng);
  }

  private pressureScale(p: number): number {
    return 0.55 + 0.9 * Math.min(1, Math.max(0, p));
  }

  private piece(part: Part, a: StrokeSample, b: StrokeSample, colorA = this.color): Piece {
    return {
      part,
      ax: a.x,
      ay: a.y,
      atx: Math.cos(a.angle),
      aty: Math.sin(a.angle),
      bx: b.x,
      by: b.y,
      btx: Math.cos(b.angle),
      bty: Math.sin(b.angle),
      ha: this.halfWidth * this.pressureScale(a.pressure),
      hb: this.halfWidth * this.pressureScale(b.pressure),
      sa: a.distance,
      sb: b.distance,
      color: colorA,
      colorB: this.color,
    };
  }

  private rasterize(p: Piece): void {
    const params = this.params as BrushParams;
    const { width, height, paint } = this.doc;
    const fullWidth = this.halfWidth * 2;
    const wobble = params.edgeWobble;
    const feather = Math.max(1, params.endFeather * fullWidth);

    // Direction and normal of the piece.
    let tx: number;
    let ty: number;
    let len: number;
    if (p.part === Part.Body) {
      const dx = p.bx - p.ax;
      const dy = p.by - p.ay;
      len = Math.hypot(dx, dy);
      tx = len > 1e-6 ? dx / len : p.atx;
      ty = len > 1e-6 ? dy / len : p.aty;
    } else {
      len = 0;
      tx = p.atx;
      ty = p.aty;
    }
    const nx = -ty;
    const ny = tx;

    // Outline used to find the pixel span on each row.
    const grow = 1 + wobble + 0.02;
    let poly: number[];
    if (p.part === Part.Body) {
      const ha = p.ha * grow;
      const hb = p.hb * grow;
      poly = [
        p.ax - p.aty * ha,
        p.ay + p.atx * ha,
        p.bx - p.bty * hb,
        p.by + p.btx * hb,
        p.bx + p.bty * hb,
        p.by - p.btx * hb,
        p.ax + p.aty * ha,
        p.ay - p.atx * ha,
      ];
    } else {
      const h = p.ha * grow;
      const sign = p.part === Part.StartCap ? -1 : 1;
      const fx = p.ax + tx * feather * sign;
      const fy = p.ay + ty * feather * sign;
      poly = [
        p.ax + nx * h,
        p.ay + ny * h,
        fx + nx * h,
        fy + ny * h,
        fx - nx * h,
        fy - ny * h,
        p.ax - nx * h,
        p.ay - ny * h,
      ];
    }
    let minPX = Infinity;
    let minPY = Infinity;
    let maxPX = -Infinity;
    let maxPY = -Infinity;
    for (let i = 0; i < 8; i += 2) {
      const x = poly[i] as number;
      const y = poly[i + 1] as number;
      if (x < minPX) minPX = x;
      if (x > maxPX) maxPX = x;
      if (y < minPY) minPY = y;
      if (y > maxPY) maxPY = y;
    }
    const bounds = clipToBounds(
      { x: minPX, y: minPY, width: maxPX - minPX, height: maxPY - minPY },
      width,
      height,
    );
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const part = p.part;
    const soft = Math.max(0.02, params.edgeSoftness);
    const hardEdge = 1 - soft;
    const taper = Math.max(1, params.startTaper * fullWidth);
    const grain = params.grain;
    const grainCore = Math.min(1, Math.max(0, params.grainCore));
    const texture = params.texture;
    const contrast = params.grainContrast;
    const grainStep = 1 / Math.max(0.25, params.grainScale * this.shortSide);
    const cloudStep = 8 / Math.max(1, params.mottleScale * fullWidth);
    const bristle = params.bristle;
    const mottle = params.mottle;
    const stretch = 1 / Math.max(1, params.grainStretch);
    const gax = this.grainAxisX * grainStep;
    const gay = this.grainAxisY * grainStep;
    const underlay = params.underlay;
    const opacity = params.opacity;
    // Per-pixel color: each pixel takes the blurred (or mosaic-averaged) photo color under it.
    const pyramid = params.colorSource === 'pixel' && !this.fixedColor ? this.pyramid : null;
    const blurRadius = Math.max(1, params.localBlur * fullWidth);
    const mosaicBlock = params.mosaic > 0 ? Math.max(2, params.mosaic * fullWidth) : 0;
    const local = new Float32Array(3);
    const keep = 1 - Math.min(1, Math.max(0, params.mute));
    const lift = Math.max(-0.5, Math.min(0.6, params.lighten * 1.3));
    const warm = params.warmth * 600;
    const jitter = this.localJitter;
    const [cr, cg, cb] = p.color;
    const dr = p.colorB[0] - cr;
    const dg = p.colorB[1] - cg;
    const db = p.colorB[2] - cb;
    const wobbleScale = WOBBLE_LENGTH / Math.max(1, fullWidth * 6);
    const goX = this.grainOffsetX;
    const goY = this.grainOffsetY;
    const paperData = this.paper.data;
    const cloud = this.cloud;
    const bristles = this.bristles;
    const wobbleL = this.wobbleL;
    const wobbleR = this.wobbleR;
    const { ax, ay, bx, by, atx, aty, btx, bty, ha, hb, sa, sb } = p;
    const invLen = len > 1e-6 ? 1 / len : 0;
    const invFeather = 1 / feather;
    const invTaper = 1 / taper;
    const invSoft = 1 / soft;

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
      const tileW = tile.width;
      for (let y = y0; y < y1; y++) {
        const py = y + 0.5;
        let spanMin = Infinity;
        let spanMax = -Infinity;
        for (let e = 0; e < 8; e += 2) {
          const px0 = poly[e] as number;
          const py0 = poly[e + 1] as number;
          const px1 = poly[(e + 2) % 8] as number;
          const py1 = poly[(e + 3) % 8] as number;
          if ((py0 <= py && py1 > py) || (py1 <= py && py0 > py)) {
            const x = px0 + ((py - py0) / (py1 - py0)) * (px1 - px0);
            if (x < spanMin) spanMin = x;
            if (x > spanMax) spanMax = x;
          }
        }
        if (spanMin > spanMax) continue;
        const x0 = Math.max(tx0, Math.floor(spanMin));
        const x1 = Math.min(tx1, Math.ceil(spanMax));
        const ly = y - tile.y;
        for (let x = x0; x < x1; x++) {
          const px = x + 0.5;
          const rx = px - ax;
          const ry = py - ay;
          let fade = 1;
          let t = 0;
          let s: number;
          if (part === Part.Body) {
            // Inside the piece: in front of a's cross-section and behind b's.
            if (rx * atx + ry * aty < 0) continue;
            if ((px - bx) * btx + (py - by) * bty >= 0) continue;
            t = (rx * tx + ry * ty) * invLen;
            if (t < 0) t = 0;
            else if (t > 1) t = 1;
            s = sa + (sb - sa) * t;
          } else {
            const u = rx * tx + ry * ty;
            const d = part === Part.StartCap ? -u : u;
            if (d < 0 || d >= feather) continue;
            const f = d * invFeather;
            fade = 1 - f * f * (3 - 2 * f);
            s = part === Part.StartCap ? sa - d : sa + d;
          }
          const v = rx * nx + ry * ny;
          let wi = ((s > 0 ? s : 0) * wobbleScale) | 0;
          wi %= WOBBLE_LENGTH;
          const wob = v >= 0 ? (wobbleL[wi] as number) : (wobbleR[wi] as number);
          const hw = (ha + (hb - ha) * t) * (1 + wobble * (wob * 2 - 1));
          const e = (v < 0 ? -v : v) / hw;
          if (e >= 1) continue;
          let c = fade;
          if (e > hardEdge) {
            const k = (e - hardEdge) * invSoft;
            c *= 1 - k * k * (3 - 2 * k);
          }
          if (s < taper) {
            const k = (s > 0 ? s : 0) * invTaper;
            c *= 0.35 + 0.65 * k * k * (3 - 2 * k);
          }
          if (bristle > 0) {
            // Streaks show most where the paint is already thin: the ends and the edges.
            const bi = ((v / hw) * 0.5 + 0.5) * (BRISTLE_LENGTH - 1);
            c *= 1 - bristle * (1 - (bristles[bi | 0] as number)) * (0.35 + 0.65 * (1 - c));
          }
          const ci = ly * TILE_SIZE + (x - tile.x);
          const value = (c * 255 + 0.5) | 0;
          if (value <= (cov[ci] as number)) continue;
          cov[ci] = value;

          // Paper tooth: bilinear sample of the tiling texture, optionally stretched along the
          // stroke so the grain turns into streaks.
          const gu = (x * gax + y * gay) * stretch + goX;
          const gv = y * gax - x * gay + goY;
          const fu = Math.floor(gu);
          const fv = Math.floor(gv);
          const du = gu - fu;
          const dv = gv - fv;
          const gx0 = fu & TEX_MASK;
          const gy0 = (fv & TEX_MASK) * TEXTURE_SIZE;
          const gx1 = (gx0 + 1) & TEX_MASK;
          const gy1 = ((fv + 1) & TEX_MASK) * TEXTURE_SIZE;
          const p00 = paperData[gy0 + gx0] as number;
          const p01 = paperData[gy0 + gx1] as number;
          const p10 = paperData[gy1 + gx0] as number;
          const p11 = paperData[gy1 + gx1] as number;
          const top = p00 + (p01 - p00) * du;
          const paperValue = top + (p10 + (p11 - p10) * du - top) * dv;

          // Holes are strongest where the paint thins out; grainCore keeps some in the center.
          const holes = grain * (grainCore + (1 - grainCore) * (1 - c * c));
          let alpha = (c - (1 - paperValue) * holes) * contrast;
          if (alpha > 1) alpha = 1;
          if (underlay > 0 && alpha < underlay * c) alpha = underlay * c;
          if (alpha <= 0) continue;
          alpha *= opacity;

          let r: number;
          let g: number;
          let b: number;
          if (pyramid) {
            if (mosaicBlock > 0) pyramid.block(x, y, mosaicBlock, local);
            else pyramid.smooth(x, y, blurRadius, local);
            r = local[0] as number;
            g = local[1] as number;
            b = local[2] as number;
            // Cheap version of the dusty correction: toward gray, then toward white.
            const lum = 0.3 * r + 0.59 * g + 0.11 * b;
            r = (lum + (r - lum) * keep) * jitter;
            g = (lum + (g - lum) * keep) * jitter;
            b = (lum + (b - lum) * keep) * jitter;
            if (lift > 0) {
              r += (255 - r) * lift;
              g += (255 - g) * lift;
              b += (255 - b) * lift;
            } else {
              r *= 1 + lift;
              g *= 1 + lift;
              b *= 1 + lift;
            }
            r += warm;
            b -= warm * 0.4;
          } else {
            r = cr + dr * t;
            g = cg + dg * t;
            b = cb + db * t;
          }
          if (mottle > 0) {
            // Cloudy blotches: pale, denser patches next to slightly darker, thinner ones. The
            // pale side mixes toward white so blotches stay soft pastel instead of muddy gray.
            const m = cloud.sample(x * cloudStep, y * cloudStep) - 0.5;
            if (m > 0) {
              const lift = m * mottle * 1.2;
              r += (255 - r) * lift;
              g += (255 - g) * lift;
              b += (255 - b) * lift;
            } else {
              const shade = 1 + m * mottle * 0.5;
              r *= shade;
              g *= shade;
              b *= shade;
            }
            alpha *= 1 + m * mottle * 0.3;
            if (alpha > 1) alpha = 1;
          }
          if (texture > 0) {
            // Light and dark flecks from the paper tooth, like crayon dragged over rough paper.
            const shade = 1 + (paperValue - 0.5) * texture * 0.5;
            r *= shade;
            g *= shade;
            b *= shade;
          }
          const ti = (ly * tileW + (x - tile.x)) * 4;
          const ba = (base[ti + 3] as number) / 255;
          const outA = alpha + ba * (1 - alpha);
          const wBase = (ba * (1 - alpha)) / outA;
          const wNew = alpha / outA;
          const k = (y * width + x) * 4;
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
