import type { Point, View } from '../canvas/view';
import type { PaintController } from './paintController';

export interface RouterHost {
  readonly view: View;
  readonly painter: PaintController;
  hasDocument(): boolean;
  undo(): void;
  /** True while the eyedropper is active: a tap picks a color instead of painting. */
  picking(): boolean;
  pick(imagePoint: Point): void;
}

/** A second finger arriving this soon after the first turns a stroke into a gesture. */
const GESTURE_GRACE_MS = 280;
const TAP_MS = 260;
const TAP_MOVE_PX = 12;

/**
 * Decides what each pointer does:
 * - one finger, the mouse or a pen paints;
 * - two fingers pinch-zoom and pan; a quick two-finger tap undoes;
 * - once an Apple Pencil (pen) has been used, fingers only navigate, so a resting palm or
 *   finger never paints;
 * - the mouse wheel zooms, and space + drag or the middle button pans.
 */
export class InputRouter {
  private readonly host: RouterHost;
  private readonly touches = new Map<number, Point>();
  private mode: 'idle' | 'paint' | 'gesture' | 'pan' = 'idle';
  private penSeen = false;
  private spaceDown = false;
  private gestureStart = 0;
  private gestureMoved = 0;
  private maxTouches = 0;
  private lastCenter: Point | null = null;
  private lastDistance = 0;
  /** Last hover position of a mouse or pen, in CSS px relative to the canvas. */
  hover: Point | null = null;

  constructor(host: RouterHost) {
    this.host = host;
    const canvas = host.view.canvas;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e, true));
    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      host.view.requestRender();
    });
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !isTyping(e)) {
        this.spaceDown = true;
        canvas.dataset.pan = 'true';
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        delete canvas.dataset.pan;
      }
    });
    window.addEventListener('blur', () => {
      this.spaceDown = false;
      delete canvas.dataset.pan;
    });
  }

  /** True once a pen has been used; fingers then only navigate. */
  get penMode(): boolean {
    return this.penSeen;
  }

  private local(e: PointerEvent | WheelEvent): Point {
    const rect = this.host.view.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private down(e: PointerEvent): void {
    if (!this.host.hasDocument()) return;
    e.preventDefault();
    try {
      this.host.view.canvas.setPointerCapture(e.pointerId);
    } catch {
      // The pointer may already be gone (or be synthetic); events still arrive on the canvas.
    }
    if (e.pointerType === 'pen') this.penSeen = true;

    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, this.local(e));
      this.maxTouches = Math.max(this.maxTouches, this.touches.size);
      if (this.penSeen) {
        this.startGesture();
        return;
      }
      if (this.touches.size === 1 && this.mode === 'idle') {
        this.startPaint(e);
        return;
      }
      if (this.touches.size >= 2) {
        if (this.mode === 'paint') {
          // A stroke that only just started was the first finger of a pinch.
          if (this.host.painter.age < GESTURE_GRACE_MS) this.host.painter.cancel();
          else this.host.painter.end();
        }
        this.startGesture();
      }
      return;
    }

    if (this.mode !== 'idle') return;
    if (e.pointerType === 'mouse' && (e.button === 1 || (e.button === 0 && this.spaceDown))) {
      this.mode = 'pan';
      this.lastCenter = this.local(e);
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.startPaint(e);
  }

  private startPaint(e: PointerEvent): void {
    if (this.host.picking()) {
      this.host.pick(this.host.view.toImage(this.local(e)));
      return;
    }
    if (this.host.painter.begin(e)) this.mode = 'paint';
  }

  private startGesture(): void {
    if (this.mode !== 'gesture') {
      this.gestureStart = performance.now();
      this.gestureMoved = 0;
    }
    this.mode = 'gesture';
    this.lastCenter = this.center();
    this.lastDistance = this.spread();
  }

  private move(e: PointerEvent): void {
    if (e.pointerType !== 'touch') {
      this.hover = this.local(e);
      if (this.mode === 'idle') this.host.view.requestRender();
    }
    if (this.mode === 'paint') {
      e.preventDefault();
      this.host.painter.move(e);
      return;
    }
    if (this.mode === 'pan' && e.pointerType !== 'touch') {
      const p = this.local(e);
      if (this.lastCenter) this.host.view.panBy(p.x - this.lastCenter.x, p.y - this.lastCenter.y);
      this.lastCenter = p;
      return;
    }
    if (this.mode === 'gesture' && this.touches.has(e.pointerId)) {
      e.preventDefault();
      this.touches.set(e.pointerId, this.local(e));
      const center = this.center();
      const distance = this.spread();
      if (this.lastCenter) {
        const dx = center.x - this.lastCenter.x;
        const dy = center.y - this.lastCenter.y;
        this.gestureMoved += Math.hypot(dx, dy) + Math.abs(distance - this.lastDistance);
        if (this.touches.size >= 2 && this.lastDistance > 0 && distance > 0) {
          this.host.view.zoomAt(center, distance / this.lastDistance);
        }
        this.host.view.panBy(dx, dy);
      }
      this.lastCenter = center;
      this.lastDistance = distance;
    }
  }

  private up(e: PointerEvent, cancelled = false): void {
    if (e.pointerType === 'touch') this.touches.delete(e.pointerId);
    if (this.mode === 'paint') {
      if (cancelled) this.host.painter.cancel();
      else this.host.painter.end();
      this.mode = 'idle';
    } else if (this.mode === 'pan') {
      this.mode = 'idle';
    } else if (this.mode === 'gesture') {
      if (this.touches.size === 0) {
        const quick = performance.now() - this.gestureStart < TAP_MS;
        if (!cancelled && quick && this.maxTouches === 2 && this.gestureMoved < TAP_MOVE_PX) {
          this.host.undo();
        }
        this.mode = 'idle';
      } else {
        // One finger lifted: continue navigating with the rest.
        this.lastCenter = this.center();
        this.lastDistance = this.spread();
      }
    }
    if (this.touches.size === 0) this.maxTouches = 0;
  }

  private wheel(e: WheelEvent): void {
    if (!this.host.hasDocument()) return;
    e.preventDefault();
    const p = this.local(e);
    if (e.ctrlKey || e.metaKey || e.deltaMode === 1 || Math.abs(e.deltaX) < 0.01) {
      // Mouse wheel or trackpad pinch: zoom around the cursor.
      const speed = e.ctrlKey ? 0.01 : e.deltaMode === 1 ? 0.05 : 0.0015;
      this.host.view.zoomAt(p, Math.exp(-e.deltaY * speed));
    } else {
      // Two-finger trackpad scroll: pan.
      this.host.view.panBy(-e.deltaX, -e.deltaY);
    }
  }

  private center(): Point {
    let x = 0;
    let y = 0;
    for (const p of this.touches.values()) {
      x += p.x;
      y += p.y;
    }
    const n = Math.max(1, this.touches.size);
    return { x: x / n, y: y / n };
  }

  private spread(): number {
    const pts = [...this.touches.values()];
    if (pts.length < 2) return 0;
    const a = pts[0] as Point;
    const b = pts[1] as Point;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
