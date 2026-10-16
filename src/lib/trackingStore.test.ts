import { describe, expect, it } from 'vitest'

import type { PersonDetection, TrackingFrame } from '@/domain'

import { TrackingStore } from './trackingStore'

const person = (trackerId: number, x: number, role: PersonDetection['role'] = 'player', jersey: number | null = null): PersonDetection => ({
  trackerId,
  box: [x, 0, x + 10, 20],
  anchor: [x + 5, 20],
  confidence: 0.9,
  role,
  jersey,
  fieldXy: null,
})

const frame = (idx: number, persons: PersonDetection[], ball = false): TrackingFrame => ({
  frameIdx: idx,
  timestampS: idx / 25,
  persons,
  ball: ball ? { box: [0, 0, 2, 2], center: [1, 1], confidence: 0.5, fieldXy: null } : null,
  possessorTrackerId: null,
  homographyOk: null,
})

describe('TrackingStore', () => {
  const store = new TrackingStore(
    [
      frame(0, [person(1, 0), person(2, 100, 'referee')], true),
      frame(1, [person(1, 10), person(2, 100, 'referee')]),
      frame(2, [person(1, 20)]),
      // frame 3 missing (gap)
      frame(4, [person(1, 40, 'player', 7)], true),
      frame(5, [person(1, 50, 'player', 7)]),
    ],
    { frameCount: 6 },
  )

  it('indexes frames by frameIdx and tolerates gaps', () => {
    expect(store.frameCount).toBe(6)
    expect(store.getFrame(2)?.persons).toHaveLength(1)
    expect(store.getFrame(3)).toBeNull()
    expect(store.getFrameOrPrevious(3)?.frameIdx).toBe(2)
  })

  it('builds trails oldest-first and stops at gaps', () => {
    expect(store.getTrail(1, 2, 10)).toEqual([[5, 20], [15, 20], [25, 20]])
    expect(store.getTrail(1, 5, 10)).toEqual([[45, 20], [55, 20]])
    expect(store.getTrail(2, 2, 10)).toEqual([])
  })

  it('finds the most recent ball', () => {
    expect(store.getRecentBall(2, 5)).toMatchObject({ age: 2 })
    expect(store.getRecentBall(2, 1)).toBeNull()
  })

  it('summarises tracklets with majority role and jersey', () => {
    const tracklets = store.tracklets()
    expect(tracklets.map((t) => t.trackerId)).toEqual([1, 2])
    expect(tracklets[0]).toMatchObject({ role: 'player', jersey: 7, firstFrame: 0, lastFrame: 5, frameCount: 5, teamCluster: null })
    expect(tracklets[1]).toMatchObject({ role: 'referee', jersey: null, frameCount: 2 })
  })
})
