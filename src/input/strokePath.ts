export interface InputPoint {
  x: number;
  y: number;
  /** 0..1; 0.5 when the device does not report pressure. */
  pressure: number;
}

export interface StrokeSample {
  x: number;
  y: number;
  pressure: number;
  /** Direction of travel in radians. */
  angle: number;
  /** Arc length from the start of the stroke, in image pixels. */
  distance: number;
}

/**
 * Turns raw pointer positions into evenly spaced, smoothed samples along the stroke.
 * Smoothing is a lazy follower: the pen tip trails the pointer, which removes finger jitter.
 */
export class StrokePath {
  private readonly spacing: number;
  private readonly follow: number;
  private readonly turn: number;
  private raw: InputPoint | null = null;
  private tip: InputPoint | null = null;
  private last: StrokeSample | null = null;
  private dirX = 0;
  private dirY = 0;
  private hasDirection = false;
  private pending: StrokeSample | null = null;

  /**
   * @param spacing distance between samples in image pixels
   * @param smoothing 0 = follow the pointer exactly, close to 1 = heavy smoothing
   */
  constructor(spacing: number, smoothing = 0.5) {
    this.spacing = Math.max(0.5, spacing);
    this.follow = 1 - Math.min(0.95, Math.max(0, smoothing));
    this.turn = 0.35;
  }

  get started(): boolean {
    return this.raw !== null;
  }

  /** Adds a pointer position and returns the samples it produced. */
  add(point: InputPoint): StrokeSample[] {
    this.raw = point;
    if (!this.tip) {
      this.tip = { ...point };
      this.pending = { ...point, angle: 0, distance: 0 };
      return [];
    }
    const tip = this.tip;
    const target = {
      x: tip.x + (point.x - tip.x) * this.follow,
      y: tip.y + (point.y - tip.y) * this.follow,
      pressure: tip.pressure + (point.pressure - tip.pressure) * this.follow,
    };
    this.tip = target;
    return this.advanceTo(target);
  }

  /** Catches the tip up with the last pointer position and returns the final samples. */
  finish(): StrokeSample[] {
    if (!this.raw || !this.tip) return [];
    const out = this.advanceTo(this.raw);
    this.tip = { ...this.raw };
    if (this.pending) {
      // A tap without movement: emit a single sample so the stroke still leaves a mark.
      out.push(this.pending);
      this.pending = null;
    }
    return out;
  }

  private advanceTo(target: InputPoint): StrokeSample[] {
    const out: StrokeSample[] = [];
    let from: StrokeSample = this.last ?? (this.pending as StrokeSample);
    let dx = target.x - from.x;
    let dy = target.y - from.y;
    let len = Math.hypot(dx, dy);
    while (len >= this.spacing) {
      const ux = dx / len;
      const uy = dy / len;
      if (!this.hasDirection) {
        this.dirX = ux;
        this.dirY = uy;
        this.hasDirection = true;
      } else {
        this.dirX += (ux - this.dirX) * this.turn;
        this.dirY += (uy - this.dirY) * this.turn;
      }
      const angle = Math.atan2(this.dirY, this.dirX);
      if (this.pending) {
        // The first sample gets its direction once the stroke starts moving.
        out.push({ ...this.pending, angle });
        this.pending = null;
      }
      const t = this.spacing / len;
      const next: StrokeSample = {
        x: from.x + ux * this.spacing,
        y: from.y + uy * this.spacing,
        pressure: from.pressure + (target.pressure - from.pressure) * t,
        angle,
        distance: from.distance + this.spacing,
      };
      out.push(next);
      this.last = next;
      from = next;
      dx = target.x - from.x;
      dy = target.y - from.y;
      len = Math.hypot(dx, dy);
    }
    return out;
  }
}
