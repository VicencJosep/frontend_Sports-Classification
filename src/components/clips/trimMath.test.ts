import { describe, expect, it } from 'vitest'

import { rulerStep, rulerTicks, thumbnailTimes } from './trimMath'

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

describe('filmstrip thumbnails', () => {
  it('snaps the tile centres to a grid finer than their spacing', () => {
    // 12 s of view in 12 tiles: one per second, centres on the half second
    expect(thumbnailTimes(2440, 2452, 12)).toEqual([2440.5, 2441.5, 2442.5, 2443.5, 2444.5, 2445.5, 2446.5, 2447.5, 2448.5, 2449.5, 2450.5, 2451.5])
    // an uneven view lands on the same grid, so most instants repeat when the view pans a little
    expect(thumbnailTimes(2440.13, 2452.13, 12)).toEqual([2440.5, 2441.5, 2442.5, 2443.5, 2444.5, 2445.5, 2446.5, 2447.5, 2448.5, 2449.5, 2450.5, 2451.5])
    expect(thumbnailTimes(0, 600, 10)).toEqual([30, 90, 150, 210, 270, 330, 390, 450, 510, 570])
  })

  it('never repeats an instant, even zoomed all the way in, and never goes negative', () => {
    const times = thumbnailTimes(10, 14, 12)
    expect(new Set(times).size).toBe(12)
    expect(times.every((t) => Math.round(t * 10) === t * 10 || Math.abs(Math.round(t * 10) - t * 10) < 1e-6)).toBe(true)
    expect(thumbnailTimes(0, 0.4, 2)[0]).toBeGreaterThanOrEqual(0)
    expect(thumbnailTimes(5, 5, 3)).toEqual([])
    expect(thumbnailTimes(0, 10, 0)).toEqual([])
  })
})
