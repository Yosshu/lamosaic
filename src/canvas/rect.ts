export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isEmpty(r: Rect): boolean {
  return r.width <= 0 || r.height <= 0;
}

export function union(a: Rect | null, b: Rect): Rect {
  if (!a || isEmpty(a)) return { ...b };
  if (isEmpty(b)) return { ...a };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** Rounds outward to whole pixels and clips to the image bounds. */
export function clipToBounds(r: Rect, width: number, height: number): Rect {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(width, Math.ceil(r.x + r.width));
  const y1 = Math.min(height, Math.ceil(r.y + r.height));
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}
