import { DEFAULT_PARAMS, type BrushParams } from './params';

export type PresetId = 'crayon' | 'soft' | 'pastel' | 'mottled';

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

export const PRESETS: readonly Preset[] = [
  { id: 'crayon', label: 'クレヨン', description: '粒の粗い帯をラフに重ねる', params: crayon },
  { id: 'soft', label: 'ふんわり', description: '淡くやわらかい筋', params: soft },
  { id: 'pastel', label: 'パステル', description: '太く乾いたかすれ', params: pastel },
  { id: 'mottled', label: 'まだら', description: '雲のようなまだら模様', params: mottled },
];

export function presetById(id: PresetId): Preset {
  return PRESETS.find((p) => p.id === id) ?? (PRESETS[0] as Preset);
}
