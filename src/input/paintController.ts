import type { RGB } from '../brush/color';
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
  /** A fixed paint color, or null to pick the color under the stroke. */
  color(): RGB | null;
  /** Called when a stroke has finished and its undo record is ready. */
  strokeEnded(record: ReturnType<BrushEngine['end']>): void;
  /** Called whenever paint changed and should be pushed to the screen. */
  flush(): void;
}

/** Turns the pointer events it is given into brush strokes. */
export class PaintController {
  private readonly host: PaintControllerHost;
  private pointerId: number | null = null;
  private path: StrokePath | null = null;
  private start: InputPoint | null = null;
  private startedAt = 0;
  private frame = 0;

  constructor(host: PaintControllerHost) {
    this.host = host;
  }

  get painting(): boolean {
    return this.pointerId !== null;
  }

  /** Milliseconds since the current stroke started. */
  get age(): number {
    return this.painting ? performance.now() - this.startedAt : 0;
  }

  begin(e: PointerEvent): boolean {
    const engine = this.host.engine();
    if (!engine || this.pointerId !== null) return false;
    this.pointerId = e.pointerId;
    this.startedAt = performance.now();
    const params = this.host.params();
    const width = engine.widthFor(params);
    this.path = new StrokePath(Math.max(1, width * params.spacing), params.smoothing);
    engine.begin(params, this.host.color());
    this.start = this.toInput(e);
    this.feed([this.start]);
    return true;
  }

  move(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const points = (events.length > 0 ? events : [e]).map((ev) => this.toInput(ev));
    this.feed(points);
  }

  /** Finishes the stroke. */
  end(): void {
    if (this.pointerId === null) return;
    const engine = this.host.engine();
    if (engine && this.path) {
      if (!this.host.straight()) engine.add(this.path.finish());
      this.host.strokeEnded(engine.end());
    }
    this.pointerId = null;
    this.path = null;
    this.scheduleFlush();
  }

  /** Aborts the current stroke (e.g. when a second finger starts a zoom gesture). */
  cancel(): void {
    if (this.pointerId === null) return;
    this.pointerId = null;
    this.path = null;
    this.host.engine()?.cancel();
    this.host.flush();
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
