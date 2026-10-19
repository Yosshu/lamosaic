import type { PaintDocument } from './document';

export interface Point {
  x: number;
  y: number;
}

/**
 * Draws the document into an on-screen canvas and converts between screen and image
 * coordinates. The transform is: screen = image * scale + offset (in CSS pixels).
 */
export class View {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private doc: PaintDocument | null = null;
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  showOriginal = false;
  /** True while the view shows the whole image; cleared when the user zooms or pans. */
  fitted = true;
  private frame = 0;
  private readonly overlays: Array<(ctx: CanvasRenderingContext2D, view: View) => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  setDocument(doc: PaintDocument | null): void {
    this.doc = doc;
    this.fit();
  }

  /** Adds a drawing callback that runs in image coordinates after the document is drawn. */
  addOverlay(draw: (ctx: CanvasRenderingContext2D, view: View) => void): void {
    this.overlays.push(draw);
  }

  get cssWidth(): number {
    return this.canvas.clientWidth;
  }

  get cssHeight(): number {
    return this.canvas.clientHeight;
  }

  /** Scales the image to fit the canvas with a small margin, centered. */
  fit(): void {
    this.fitted = true;
    if (!this.doc) {
      this.requestRender();
      return;
    }
    this.scale = this.fitScale();
    this.offsetX = (this.cssWidth - this.doc.width * this.scale) / 2;
    this.offsetY = (this.cssHeight - this.doc.height * this.scale) / 2;
    this.requestRender();
  }

  /** The scale at which the whole image fits. */
  fitScale(): number {
    if (!this.doc) return 1;
    const margin = 16;
    return Math.min(
      Math.max(1, this.cssWidth - margin * 2) / this.doc.width,
      Math.max(1, this.cssHeight - margin * 2) / this.doc.height,
    );
  }

  /** Zooms by `factor` keeping the given screen point (CSS px) fixed. */
  zoomAt(p: Point, factor: number): void {
    if (!this.doc) return;
    const fit = this.fitScale();
    const scale = Math.min(Math.max(fit * 16, 8), Math.max(fit * 0.5, this.scale * factor));
    const image = this.toImage(p);
    this.setTransform(scale, p.x - image.x * scale, p.y - image.y * scale);
  }

  panBy(dx: number, dy: number): void {
    this.setTransform(this.scale, this.offsetX + dx, this.offsetY + dy);
  }

  /** Sets scale and offset directly, keeping the image's center within reach. */
  setTransform(scale: number, offsetX: number, offsetY: number): void {
    if (!this.doc) return;
    const w = this.doc.width * scale;
    const h = this.doc.height * scale;
    const cx = this.cssWidth / 2;
    const cy = this.cssHeight / 2;
    this.scale = scale;
    this.offsetX = Math.min(cx, Math.max(cx - w, offsetX));
    this.offsetY = Math.min(cy, Math.max(cy - h, offsetY));
    this.fitted = false;
    this.requestRender();
  }

  toImage(p: Point): Point {
    return { x: (p.x - this.offsetX) / this.scale, y: (p.y - this.offsetY) / this.scale };
  }

  requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.cssWidth * dpr);
    const h = Math.round(this.cssHeight * dpr);
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.fitted) this.fit();
    else this.requestRender();
  }

  private render(): void {
    const { ctx, canvas } = this;
    const dpr = canvas.width / Math.max(1, this.cssWidth);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.doc) return;
    ctx.setTransform(
      this.scale * dpr,
      0,
      0,
      this.scale * dpr,
      this.offsetX * dpr,
      this.offsetY * dpr,
    );
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = this.scale < 1 ? 'high' : 'low';
    ctx.drawImage(this.doc.original, 0, 0);
    if (!this.showOriginal) ctx.drawImage(this.doc.paintCanvas, 0, 0);
    for (const draw of this.overlays) draw(ctx, this);
  }
}
