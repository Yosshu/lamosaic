export type RGB = [r: number, g: number, b: number];

function toLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function fromLinear(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

export interface OKLab {
  L: number;
  a: number;
  b: number;
}

export function rgbToOklab([r, g, b]: RGB): OKLab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb({ L, a, b }: OKLab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export interface ColorStyle {
  /** Added to OKLab lightness (0..1 scale); positive values brighten. */
  lighten: number;
  /** 0 keeps the chroma, 1 makes the color gray. */
  mute: number;
  /** Shifts the hue toward rose (positive) in OKLab a/b units. */
  warmth: number;
}

/** The "dusty" correction: a little lighter, a little less saturated. */
export function styleColor(rgb: RGB, style: ColorStyle): RGB {
  const lab = rgbToOklab(rgb);
  const keep = 1 - Math.min(1, Math.max(0, style.mute));
  return oklabToRgb({
    L: Math.min(0.97, Math.max(0.05, lab.L + style.lighten * (1 - lab.L * 0.5))),
    a: lab.a * keep + style.warmth,
    b: lab.b * keep + style.warmth * 0.25,
  });
}

/** Random variation of one stroke's color: lightness and a small hue rotation. */
export function jitterColor(rgb: RGB, amount: number, rng: () => number): RGB {
  if (amount <= 0) return rgb;
  const lab = rgbToOklab(rgb);
  const angle = (rng() - 0.5) * amount * 0.5;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return oklabToRgb({
    L: Math.min(0.97, Math.max(0.03, lab.L + (rng() - 0.5) * amount * 0.12)),
    a: lab.a * cos - lab.b * sin,
    b: lab.a * sin + lab.b * cos,
  });
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
