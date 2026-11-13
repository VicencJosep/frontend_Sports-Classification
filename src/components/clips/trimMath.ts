/** Geometry shared by the trim strip and its tests (kept out of the component file for fast refresh). */

export const FILM_HEIGHT = 56
const RULER_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

/** Ruler step (seconds) that gives at most ~10 labels across a view of `spanS` seconds. */
export function rulerStep(spanS: number): number {
  return RULER_STEPS.find((step) => spanS / step <= 10) ?? RULER_STEPS[RULER_STEPS.length - 1] ?? 60
}

/** Ruler tick times inside [fromS, toS] at multiples of the step. */
export function rulerTicks(fromS: number, toS: number): number[] {
  const step = rulerStep(toS - fromS)
  const ticks: number[] = []
  for (let t = Math.ceil(fromS / step) * step; t <= toS + 1e-6; t += step) ticks.push(Math.round(t * 1000) / 1000)
  return ticks
}

const THUMBNAIL_GRIDS = [600, 300, 120, 60, 30, 15, 10, 5, 2, 1, 0.5, 0.2, 0.1]

/**
 * Instants of the `count` thumbnails of a view. Each is the centre of its tile snapped to a grid at most half the
 * tile spacing, so neighbouring tiles never collapse and the same instants (hence the same URLs, cached by the
 * browser and by the backend) come back when the view pans or the editor reopens nearby.
 */
export function thumbnailTimes(fromS: number, toS: number, count: number): number[] {
  if (count <= 0 || !(toS > fromS)) return []
  const spacing = (toS - fromS) / count
  const grid = THUMBNAIL_GRIDS.find((g) => g <= spacing / 2 + 1e-9) ?? 0.1
  return Array.from({ length: count }, (_, i) => Math.max(0, Math.round(Math.round((fromS + (i + 0.5) * spacing) / grid) * grid * 10) / 10))
}
