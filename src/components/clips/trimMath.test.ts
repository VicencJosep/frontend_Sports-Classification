import { describe, expect, it } from 'vitest'

import { rulerStep, rulerTicks } from './trimMath'

describe('trim ruler', () => {
  it('picks a step that keeps about ten labels', () => {
    expect(rulerStep(4)).toBe(0.5)
    expect(rulerStep(30)).toBe(5)
    expect(rulerStep(75)).toBe(10)
    expect(rulerStep(5400)).toBe(600)
  })

  it('ticks at multiples of the step inside the view', () => {
    expect(rulerTicks(26.3, 39.9)).toEqual([28, 30, 32, 34, 36, 38])
    expect(rulerTicks(0, 4)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4])
  })
})
