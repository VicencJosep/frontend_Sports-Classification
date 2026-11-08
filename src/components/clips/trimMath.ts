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
