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
 * Crayon: grainy flat slabs, each in one color, with speckled edges.
 * The base for the other presets.
 */
const crayon: BrushParams = { ...DEFAULT_PARAMS };

/** Soft: fine, low-contrast grain, pale and slightly see-through, with faint streaks. */
const soft: BrushParams = {
  ...DEFAULT_PARAMS,
  size: 0.1,
  opacity: 0.8,
  edgeSoftness: 0.5,
  endFeather: 0.5,
  grain: 0.85,
  grainScale: 0.0006,
  grainContrast: 2.5,
  grainStretch: 3,
  bristle: 0.45,
  bristleCount: 26,
  mottle: 0.15,
  mottleScale: 0.4,
  sampleFrom: 'composite',
  pickup: 0.15,
  lighten: 0.08,
  mute: 0.2,
  warmth: 0.006,
};

/** Pastel: very wide, dry strokes with frayed ends that drag colors from around them. */
const pastel: BrushParams = {
  ...DEFAULT_PARAMS,
  size: 0.18,
  opacity: 0.8,
  edgeSoftness: 0.45,
  edgeWobble: 0.04,
  endFeather: 1,
  grain: 0.75,
  grainScale: 0.0007,
  grainContrast: 4,
  grainStretch: 2.5,
  bristle: 0.75,
  bristleCount: 70,
  pickup: 0.25,
  lighten: 0.03,
  mute: 0.1,
  colorJitter: 0.35,
};

/** Mottled: cloudy light and dark blotches, blended with what is already painted. */
const mottled: BrushParams = {
  ...DEFAULT_PARAMS,
  size: 0.1,
  opacity: 0.75,
  edgeSoftness: 0.45,
  grain: 0.55,
  grainScale: 0.002,
  grainContrast: 2,
  bristle: 0.15,
  mottle: 0.9,
  mottleScale: 0.05,
  sampleFrom: 'composite',
  pickup: 0.2,
  lighten: 0.07,
  mute: 0.15,
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
