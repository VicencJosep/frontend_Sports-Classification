import { describe, expect, it } from 'vitest'

import { fitContain, toCanvas, trackerColor } from './geometry'

describe('fitContain', () => {
  it('letterboxes a 16:9 source into a 4:3 box', () => {
    const t = fitContain(1280, 720, 640, 480)
    expect(t.scale).toBe(0.5)
    expect(t.offsetX).toBe(0)
    expect(t.offsetY).toBe(60)
    expect(toCanvas(t, [1280, 720])).toEqual([640, 420])
    expect(toCanvas(t, [0, 0])).toEqual([0, 60])
  })
  it('pillarboxes into a wider box', () => {
    const t = fitContain(1280, 720, 1000, 300)
    expect(t.scale).toBeCloseTo(300 / 720)
    expect(t.offsetY).toBe(0)
    expect(t.offsetX).toBeCloseTo((1000 - 1280 * (300 / 720)) / 2)
  })
  it('is safe with empty boxes', () => {
    expect(fitContain(1280, 720, 0, 0)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 })
  })
  it('gives different colours to neighbouring ids', () => {
    expect(trackerColor(1)).not.toBe(trackerColor(2))
  })
})
