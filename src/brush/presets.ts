import { DEFAULT_PARAMS, type BrushParams } from './params';

export type PresetId = 'crayon' | 'soft' | 'pastel' | 'mottled' | 'blur' | 'mosaic';

export interface Preset {
  id: PresetId;
  /** Shown on the preset button. */
  label: string;
  description: string;
  params: BrushParams;
}

/**
 * Crayon: opaque slabs in the color of what they cover, with fine light and dark flecks and
 * edges that break up into sandy grain.
 */
const crayon: BrushParams = {
  ...DEFAULT_PARAMS,
  opacity: 0.97,
  edgeSoftness: 0.55,
  edgeWobble: 0.05,
  endFeather: 0.6,
  grain: 1,
  grainCore: 0.15,
  grainScale: 0.0005,
  grainContrast: 2.5,
  grainStretch: 1.8,
  bristle: 0.08,
  texture: 0.25,
  mottle: 0.1,
  mottleScale: 0.3,
  localBlur: 0.9,
  pickup: 0.6,
  lighten: 0.12,
  mute: -0.2,
  warmth: 0,
  colorJitter: 0.5,
};

/** Soft: overlapping pale strokes, each in its own tone, with fuzzy edges and fine texture. */
const soft: BrushParams = {
  ...DEFAULT_PARAMS,
  size: 0.12,
  opacity: 0.93,
  edgeSoftness: 0.45,
  edgeWobble: 0.08,
  endFeather: 0.7,
  grain: 0.8,
  grainCore: 0.25,
  grainScale: 0.0004,
  grainContrast: 1.8,
  grainStretch: 2,
  bristle: 0.25,
  bristleCount: 40,
  texture: 0.25,
  mottle: 0.25,
  mottleScale: 0.2,
  localBlur: 0.9,
  pickup: 0.5,
  lighten: 0.14,
  mute: 0,
  warmth: 0.008,
  colorJitter: 0.6,
};

/** Pastel: very wide, opaque strokes whose ends break into long dry streaks. */
const pastel: BrushParams = {
  ...DEFAULT_PARAMS,
  size: 0.18,
  opacity: 0.97,
  edgeSoftness: 0.5,
  edgeWobble: 0.04,
  endFeather: 1.2,
  grain: 1,
  grainCore: 0.05,
  grainScale: 0.0004,
  grainContrast: 3,
  grainStretch: 5,
  bristle: 0.8,
  bristleCount: 90,
  texture: 0.15,
  localBlur: 0.9,
  pickup: 0.5,
  lighten: 0.03,
  mute: 0.1,
  colorJitter: 0.35,
};

/** Mottled: fuzzy, speckled clouds with pale blotches and edges that dissolve into grain. */
const mottled: BrushParams = {
  ...DEFAULT_PARAMS,
  size: 0.12,
  opacity: 0.95,
  edgeSoftness: 0.5,
  edgeWobble: 0.12,
  endFeather: 0.7,
  grain: 0.9,
  grainCore: 0.2,
  grainScale: 0.0008,
  grainContrast: 2,
  bristle: 0.1,
  texture: 0.35,
  mottle: 0.55,
  mottleScale: 0.25,
  localBlur: 0.9,
  pickup: 0.5,
  lighten: 0.06,
  mute: -0.15,
  warmth: 0.01,
  colorJitter: 0.5,
};

/** Blur: soft watercolor-like blobs in the blurred colors right under the brush. */
const blur: BrushParams = {
  ...DEFAULT_PARAMS,
  size: 0.12,
  opacity: 0.97,
  edgeSoftness: 0.75,
  edgeWobble: 0.06,
  endFeather: 0.6,
  startTaper: 0.15,
  grain: 0.25,
  grainScale: 0.0016,
  grainContrast: 2,
  bristle: 0,
  mottle: 0.15,
  mottleScale: 0.3,
  underlay: 0.7,
  colorSource: 'pixel',
  localBlur: 0.45,
  lighten: 0,
  mute: 0,
  colorJitter: 0.1,
};

/** Mosaic: square cells averaged from the photo, painted with a slightly rough brush. */
const mosaic: BrushParams = {
  ...DEFAULT_PARAMS,
  size: 0.12,
  opacity: 1,
  edgeSoftness: 0.2,
  edgeWobble: 0.03,
  endFeather: 0.25,
  startTaper: 0.1,
  grain: 0.35,
  grainScale: 0.0012,
  grainContrast: 4,
  bristle: 0,
  underlay: 0.9,
  colorSource: 'pixel',
  mosaic: 0.14,
  lighten: 0,
  mute: 0,
  colorJitter: 0,
};

export const PRESETS: readonly Preset[] = [
  { id: 'crayon', label: 'クレヨン', description: '粒の粗い帯をラフに重ねる', params: crayon },
  { id: 'soft', label: 'ふんわり', description: '淡くやわらかい筋', params: soft },
  { id: 'pastel', label: 'パステル', description: '太く乾いたかすれ', params: pastel },
  { id: 'mottled', label: 'まだら', description: '雲のようなまだら模様', params: mottled },
  { id: 'blur', label: 'ぼかし', description: 'その場の色でやわらかくぼかす', params: blur },
  { id: 'mosaic', label: 'モザイク', description: 'その場の色で四角いモザイク', params: mosaic },
];

export function presetById(id: PresetId): Preset {
  return PRESETS.find((p) => p.id === id) ?? (PRESETS[0] as Preset);
}
