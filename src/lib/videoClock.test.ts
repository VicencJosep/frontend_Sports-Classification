import { describe, expect, it } from 'vitest'

import { frameIndexForTime, timeForFrameIndex } from './videoClock'

const timing = { fps: 25, frameCount: 1875, startTimeS: 0 }

describe('frame <-> time mapping', () => {
  it('maps the start of each frame interval to that frame', () => {
    expect(frameIndexForTime(0, timing)).toBe(0)
    expect(frameIndexForTime(0.04, timing)).toBe(1)
    expect(frameIndexForTime(0.0399, timing)).toBe(0)
    expect(frameIndexForTime(1.0, timing)).toBe(25)
  })
  it('clamps to the frame range', () => {
    expect(frameIndexForTime(-1, timing)).toBe(0)
    expect(frameIndexForTime(999, timing)).toBe(1874)
  })
  it('honours a non-zero start time', () => {
    expect(frameIndexForTime(0.5, { ...timing, startTimeS: 0.5 })).toBe(0)
    expect(frameIndexForTime(0.54, { ...timing, startTimeS: 0.5 })).toBe(1)
  })
  it('round-trips through timeForFrameIndex', () => {
    for (const idx of [0, 1, 24, 25, 1000, 1874]) {
      expect(frameIndexForTime(timeForFrameIndex(idx, timing) + 0.5 / timing.fps, timing)).toBe(idx)
    }
  })
})
