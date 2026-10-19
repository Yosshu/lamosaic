import type { Rect } from './rect';

export const TILE_SIZE = 128;

/** Tile contents keyed by tile index, used both for in-stroke backups and undo records. */
export type TileSet = Map<number, Uint8ClampedArray>;

export class TileGrid {
  readonly width: number;
  readonly height: number;
  readonly cols: number;
  readonly rows: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cols = Math.ceil(width / TILE_SIZE);
    this.rows = Math.ceil(height / TILE_SIZE);
  }

  tileRect(index: number): Rect {
    const tx = index % this.cols;
    const ty = Math.floor(index / this.cols);
    const x = tx * TILE_SIZE;
    const y = ty * TILE_SIZE;
    return {
      x,
      y,
      width: Math.min(TILE_SIZE, this.width - x),
      height: Math.min(TILE_SIZE, this.height - y),
    };
  }

  /** Indices of the tiles that intersect an integer rect. */
  tilesIn(r: Rect): number[] {
    if (r.width <= 0 || r.height <= 0) return [];
    const tx0 = Math.floor(r.x / TILE_SIZE);
    const ty0 = Math.floor(r.y / TILE_SIZE);
    const tx1 = Math.floor((r.x + r.width - 1) / TILE_SIZE);
    const ty1 = Math.floor((r.y + r.height - 1) / TILE_SIZE);
    const out: number[] = [];
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) out.push(ty * this.cols + tx);
    }
    return out;
  }

  read(pixels: Uint8ClampedArray, index: number): Uint8ClampedArray {
    const r = this.tileRect(index);
    const out = new Uint8ClampedArray(r.width * r.height * 4);
    const rowBytes = r.width * 4;
    for (let row = 0; row < r.height; row++) {
      const start = ((r.y + row) * this.width + r.x) * 4;
      out.set(pixels.subarray(start, start + rowBytes), row * rowBytes);
    }
    return out;
  }

  write(pixels: Uint8ClampedArray, index: number, data: Uint8ClampedArray): void {
    const r = this.tileRect(index);
    const rowBytes = r.width * 4;
    for (let row = 0; row < r.height; row++) {
      const start = ((r.y + row) * this.width + r.x) * 4;
      pixels.set(data.subarray(row * rowBytes, (row + 1) * rowBytes), start);
    }
  }
}

function bytesOf(tiles: TileSet): number {
  let n = 0;
  for (const t of tiles.values()) n += t.byteLength;
  return n;
}

/**
 * Undo/redo by tile swapping. Each entry stores the tiles a stroke changed as they were before
 * the stroke; undoing swaps them with the current contents, so the same entry can be redone.
 * Old entries are dropped once the memory budget is exceeded.
 */
export class History {
  private readonly grid: TileGrid;
  private readonly pixels: Uint8ClampedArray;
  private readonly budget: number;
  private undoStack: TileSet[] = [];
  private redoStack: TileSet[] = [];
  private bytes = 0;

  constructor(grid: TileGrid, pixels: Uint8ClampedArray, budgetBytes = 160 * 1024 * 1024) {
    this.grid = grid;
    this.pixels = pixels;
    this.budget = budgetBytes;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  push(before: TileSet): void {
    if (before.size === 0) return;
    this.undoStack.push(before);
    this.bytes += bytesOf(before);
    for (const entry of this.redoStack) this.bytes -= bytesOf(entry);
    this.redoStack = [];
    while (this.bytes > this.budget && this.undoStack.length > 1) {
      const dropped = this.undoStack.shift();
      if (dropped) this.bytes -= bytesOf(dropped);
    }
  }

  /** Returns the changed tile indices, or null when there is nothing to undo. */
  undo(): number[] | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.swap(entry);
    this.redoStack.push(entry);
    return [...entry.keys()];
  }

  redo(): number[] | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.swap(entry);
    this.undoStack.push(entry);
    return [...entry.keys()];
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.bytes = 0;
  }

  private swap(entry: TileSet): void {
    for (const [index, stored] of entry) {
      const current = this.grid.read(this.pixels, index);
      this.grid.write(this.pixels, index, stored);
      entry.set(index, current);
    }
  }
}
