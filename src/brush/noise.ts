/** Small seeded PRNG (mulberry32) so strokes render identically for the same seed. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TEXTURE_SIZE = 256;
const MASK = TEXTURE_SIZE - 1;

/**
 * A tileable 2D texture with values in 0..1, stored as Float32 and sampled with wrap-around
 * bilinear filtering.
 */
export class Texture {
  readonly data: Float32Array;

  constructor(data: Float32Array) {
    this.data = data;
  }

  /** Bilinear sample at texture coordinates (any real numbers, wraps around). */
  sample(u: number, v: number): number {
    const fu = Math.floor(u);
    const fv = Math.floor(v);
    const tu = u - fu;
    const tv = v - fv;
    const x0 = fu & MASK;
    const y0 = fv & MASK;
    const x1 = (x0 + 1) & MASK;
    const y1 = (y0 + 1) & MASK;
    const d = this.data;
    const r0 = y0 * TEXTURE_SIZE;
    const r1 = y1 * TEXTURE_SIZE;
    const a = d[r0 + x0] as number;
    const b = d[r0 + x1] as number;
    const c = d[r1 + x0] as number;
    const e = d[r1 + x1] as number;
    const top = a + (b - a) * tu;
    const bottom = c + (e - c) * tu;
    return top + (bottom - top) * tv;
  }
}

/** Tileable value noise: random values on a lattice of `cell` pixels, smoothly interpolated. */
function valueNoise(rng: () => number, cell: number): Float32Array {
  const n = Math.max(1, Math.round(TEXTURE_SIZE / cell));
  const lattice = new Float32Array(n * n);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng();
  const out = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE);
  const step = n / TEXTURE_SIZE;
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    const gy = y * step;
    const iy = Math.floor(gy);
    const ty = smooth(gy - iy);
    const y0 = iy % n;
    const y1 = (iy + 1) % n;
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const gx = x * step;
      const ix = Math.floor(gx);
      const tx = smooth(gx - ix);
      const x0 = ix % n;
      const x1 = (ix + 1) % n;
      const a = lattice[y0 * n + x0] as number;
      const b = lattice[y0 * n + x1] as number;
      const c = lattice[y1 * n + x0] as number;
      const d = lattice[y1 * n + x1] as number;
      out[y * TEXTURE_SIZE + x] = a + (b - a) * tx + (c + (d - c) * tx - a - (b - a) * tx) * ty;
    }
  }
  return out;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Rescales values so they spread evenly over 0..1 (histogram equalisation). */
function equalize(data: Float32Array): Float32Array {
  const order = Array.from(data.keys()).sort((i, j) => (data[i] as number) - (data[j] as number));
  const out = new Float32Array(data.length);
  const last = Math.max(1, data.length - 1);
  order.forEach((index, rank) => {
    out[index] = rank / last;
  });
  return out;
}

/**
 * Paper tooth for the crayon grain: fine clumps on top of medium bumps. Values are equalised,
 * so a threshold of t leaves a fraction t of the paper uncovered.
 */
export function paperTexture(seed: number): Texture {
  const rng = createRng(seed);
  const octaves: Array<[cell: number, weight: number]> = [
    [2, 0.5],
    [4, 0.3],
    [8, 0.14],
    [32, 0.06],
  ];
  const sum = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE);
  for (const [cell, weight] of octaves) {
    const layer = valueNoise(rng, cell);
    for (let i = 0; i < sum.length; i++)
      sum[i] = (sum[i] as number) + (layer[i] as number) * weight;
  }
  return new Texture(equalize(sum));
}

/** Soft, cloudy blotches used for the mottled look. */
export function cloudTexture(seed: number): Texture {
  const rng = createRng(seed);
  const sum = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE);
  for (const [cell, weight] of [
    [32, 0.6],
    [16, 0.3],
    [8, 0.1],
  ] as const) {
    const layer = valueNoise(rng, cell);
    for (let i = 0; i < sum.length; i++)
      sum[i] = (sum[i] as number) + (layer[i] as number) * weight;
  }
  return new Texture(equalize(sum));
}

/** Smooth 1D noise in 0..1, tileable over `length` samples. */
export function noise1D(rng: () => number, length: number, cell: number): Float32Array {
  const n = Math.max(2, Math.round(length / cell));
  const lattice = Array.from({ length: n }, rng);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const g = (i / length) * n;
    const k = Math.floor(g);
    const t = smooth(g - k);
    const a = lattice[k % n] as number;
    const b = lattice[(k + 1) % n] as number;
    out[i] = a + (b - a) * t;
  }
  return out;
}
