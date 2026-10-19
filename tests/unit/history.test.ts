import { describe, expect, it } from 'vitest';
import { History, TILE_SIZE, TileGrid } from '../../src/canvas/history';

function makePixels(width: number, height: number) {
  return new Uint8ClampedArray(width * height * 4);
}

describe('TileGrid', () => {
  it('lists the tiles that intersect a rect', () => {
    const grid = new TileGrid(300, 200);
    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(2);
    expect(grid.tilesIn({ x: 0, y: 0, width: 10, height: 10 })).toEqual([0]);
    expect(grid.tilesIn({ x: TILE_SIZE - 1, y: 0, width: 2, height: TILE_SIZE + 1 })).toEqual([
      0, 1, 3, 4,
    ]);
  });

  it('round-trips tile contents, including partial edge tiles', () => {
    const grid = new TileGrid(300, 200);
    const pixels = makePixels(300, 200);
    pixels.fill(7);
    const last = grid.cols * grid.rows - 1;
    const data = grid.read(pixels, last);
    expect(data.length).toBe((300 - 2 * TILE_SIZE) * (200 - TILE_SIZE) * 4);
    data.fill(9);
    grid.write(pixels, last, data);
    expect(pixels[(199 * 300 + 299) * 4]).toBe(9);
    expect(pixels[0]).toBe(7);
  });
});

describe('History', () => {
  it('undoes and redoes by swapping tiles', () => {
    const grid = new TileGrid(256, 256);
    const pixels = makePixels(256, 256);
    const history = new History(grid, pixels);

    const before = new Map([[0, grid.read(pixels, 0)]]);
    pixels[0] = 200;
    history.push(before);

    expect(history.undo()).toEqual([0]);
    expect(pixels[0]).toBe(0);
    expect(history.canRedo).toBe(true);
    expect(history.redo()).toEqual([0]);
    expect(pixels[0]).toBe(200);
  });

  it('clears the redo stack on a new stroke', () => {
    const grid = new TileGrid(128, 128);
    const pixels = makePixels(128, 128);
    const history = new History(grid, pixels);
    history.push(new Map([[0, grid.read(pixels, 0)]]));
    history.undo();
    history.push(new Map([[0, grid.read(pixels, 0)]]));
    expect(history.canRedo).toBe(false);
  });

  it('drops the oldest entries beyond the memory budget', () => {
    const grid = new TileGrid(128, 128);
    const pixels = makePixels(128, 128);
    const tileBytes = TILE_SIZE * TILE_SIZE * 4;
    const history = new History(grid, pixels, tileBytes * 2);
    for (let i = 0; i < 5; i++) history.push(new Map([[0, grid.read(pixels, 0)]]));
    let undos = 0;
    while (history.undo()) undos++;
    expect(undos).toBe(2);
  });
});
