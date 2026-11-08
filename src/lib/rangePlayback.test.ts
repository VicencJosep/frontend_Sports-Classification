import { describe, expect, it } from 'vitest'

import { rangeStep } from './rangePlayback'

const range = { startS: 10, endS: 20, loop: false }

describe('rangeStep', () => {
  it('waits for playback to start, then releases when the user pauses', () => {
    expect(rangeStep(10, false, false, range, 0.02)).toBe('continue')
    expect(rangeStep(12, false, true, range, 0.02)).toBe('release')
  })

  it('continues inside the range', () => {
    expect(rangeStep(10, true, true, range, 0.02)).toBe('continue')
    expect(rangeStep(19.9, true, true, range, 0.02)).toBe('continue')
  })

  it('finishes or loops at the end', () => {
    expect(rangeStep(19.99, true, true, range, 0.02)).toBe('finish')
    expect(rangeStep(20.5, true, true, range, 0.02)).toBe('finish')
    expect(rangeStep(19.99, true, true, { ...range, loop: true }, 0.02)).toBe('loop')
  })

  it('releases when the user seeks away', () => {
    expect(rangeStep(5, true, true, range, 0.02)).toBe('release')
    expect(rangeStep(30, true, true, range, 0.02)).toBe('release')
    // Just before the start (seek landed a little early) still counts as inside.
    expect(rangeStep(9.5, true, true, range, 0.02)).toBe('continue')
  })
})
