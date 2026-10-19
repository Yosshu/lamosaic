/**
 * Every brush is a combination of these parts. Sizes are relative so a preset looks the same on
 * a 1000px screenshot and a 4000px photo: `size` is a fraction of the image's shorter side and
 * the other lengths are fractions of the brush width unless noted otherwise.
 */
export interface BrushParams {
  /** Ribbon width as a fraction of the image's shorter side. */
  size: number;
  /** Opacity of a single stroke (0..1). */
  opacity: number;

  /** Width of the soft band along the long sides (0 = hard edge, 1 = fully soft). */
  edgeSoftness: number;
  /** How much the long sides wander in and out (0..0.5). */
  edgeWobble: number;
  /** Length of the ragged fade at the start and end of a stroke. */
  endFeather: number;
  /** Length over which the stroke builds up at its start. */
  startTaper: number;

  /** Amount of holes where the paper shows through (0 = solid). */
  grain: number;
  /** Paper grain size as a fraction of the image's shorter side. */
  grainScale: number;
  /** Crispness of the grain holes (1 = soft, 8 = crisp). */
  grainContrast: number;
  /** Streaks along the stroke, like dry bristles (0..1). */
  bristle: number;
  /** Number of streaks across the ribbon. */
  bristleCount: number;
  /** Cloudy light/dark blotches inside the paint (0..1). */
  mottle: number;
  /** Blotch size as a fraction of the brush width. */
  mottleScale: number;
  /** Solid paint underneath the grain so the center never shows through (0..1). */
  underlay: number;

  /** Radius of the area the stroke color is picked from, as a fraction of the brush width. */
  sampleRadius: number;
  /** Pick colors from the original photo or from what is currently visible. */
  sampleFrom: 'original' | 'composite';
  /** How quickly the color drifts toward the color under the brush while painting (0..1). */
  pickup: number;
  /** Lightness shift of the picked color. */
  lighten: number;
  /** Saturation reduction of the picked color (0..1). */
  mute: number;
  /** Small hue shift toward rose. */
  warmth: number;
  /** Random variation of each stroke's color (0..1). */
  colorJitter: number;

  /** Pointer smoothing (0..0.95). */
  smoothing: number;
  /** Distance between samples, as a fraction of the brush width. */
  spacing: number;
}

export const DEFAULT_PARAMS: BrushParams = {
  size: 0.09,
  opacity: 0.86,
  edgeSoftness: 0.35,
  edgeWobble: 0.02,
  endFeather: 0.45,
  startTaper: 0.3,
  grain: 1.0,
  grainScale: 0.0009,
  grainContrast: 6,
  bristle: 0.04,
  bristleCount: 18,
  mottle: 0,
  mottleScale: 0.6,
  underlay: 0,
  sampleRadius: 0.35,
  sampleFrom: 'original',
  pickup: 0,
  lighten: 0.06,
  mute: 0.12,
  warmth: 0.004,
  colorJitter: 0.25,
  smoothing: 0.45,
  spacing: 0.12,
};
