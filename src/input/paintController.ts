import type { BrushEngine } from '../brush/engine';
import type { BrushParams } from '../brush/params';
import type { View } from '../canvas/view';
import { StrokePath, type InputPoint, type StrokeSample } from './strokePath';

export interface PaintControllerHost {
  readonly view: View;
  engine(): BrushEngine | null;
  params(): BrushParams;
  /** Straight-line strokes: the ribbon runs from the start point to the pointer. */
  straight(): boolean;
  /** Called when a stroke has finished and its undo record is ready. */
  strokeEnded(record: ReturnType<BrushEngine['end']>): void;
  /** Called whenever paint changed and should be pushed to the screen. */
  flush(): void;
}

/** Turns pointer events on the view into brush strokes. */
export class PaintController {
  private readonly host: PaintControllerHost;
  private pointerId: number | null = null;
  private path: StrokePath | null = null;
  private start: InputPoint | null = null;
  private frame = 0;

  constructor(host: PaintControllerHost) {
    this.host = host;
    const canvas = host.view.canvas;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.cancelFor(e));
    canvas.addEventListener('lostpointercapture', (e) => this.up(e));
  }

  get painting(): boolean {
    return this.pointerId !== null;
  }

  /** Aborts the current stroke (e.g. when a second finger starts a zoom gesture). */
  cancel(): void {
    if (this.pointerId === null) return;
    const engine = this.host.engine();
    const canvas = this.host.view.canvas;
    if (canvas.hasPointerCapture(this.pointerId)) canvas.releasePointerCapture(this.pointerId);
    this.pointerId = null;
    this.path = null;
    engine?.cancel();
    this.host.flush();
  }

  private down(e: PointerEvent): void {
    const engine = this.host.engine();
    if (!engine || this.pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.host.view.canvas.setPointerCapture(e.pointerId);
    const params = this.host.params();
    const width = engine.widthFor(params);
    this.path = new StrokePath(Math.max(1, width * params.spacing), params.smoothing);
    engine.begin(params);
    this.start = this.toInput(e);
    this.feed([this.start]);
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const points = (events.length > 0 ? events : [e]).map((ev) => this.toInput(ev));
    this.feed(points);
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    const engine = this.host.engine();
    if (engine && this.path) {
      if (!this.host.straight()) engine.add(this.path.finish());
      this.host.strokeEnded(engine.end());
    }
    this.pointerId = null;
    this.path = null;
    this.scheduleFlush();
  }

  private cancelFor(e: PointerEvent): void {
    if (e.pointerId === this.pointerId) this.cancel();
  }

  private feed(points: InputPoint[]): void {
    const engine = this.host.engine();
    if (!engine || !this.path) return;
    if (this.host.straight() && this.start) {
      const last = points[points.length - 1] as InputPoint;
      engine.replace(this.straightSamples(this.start, last));
    } else {
      const samples: StrokeSample[] = [];
      for (const p of points) samples.push(...this.path.add(p));
      engine.add(samples);
    }
    this.scheduleFlush();
  }

  private straightSamples(a: InputPoint, b: InputPoint): StrokeSample[] {
    const engine = this.host.engine();
    const params = this.host.params();
    const width = engine ? engine.widthFor(params) : 10;
    const path = new StrokePath(Math.max(1, width * params.spacing), 0);
    return [...path.add(a), ...path.add(b), ...path.finish()];
  }

  private scheduleFlush(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.host.flush();
    });
  }

  private toInput(e: PointerEvent): InputPoint {
    const rect = this.host.view.canvas.getBoundingClientRect();
    const p = this.host.view.toImage({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
    return { x: p.x, y: p.y, pressure };
  }
}
