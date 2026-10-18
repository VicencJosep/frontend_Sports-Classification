import { describe, expect, it } from 'vitest'

import { TrackingStore } from '@/lib/trackingStore'

import { DEFAULT_LAYERS, layerAvailability, needsTracking } from './layers'

describe('needsTracking', () => {
  it('is off with the default layers and on with any tracking layer or a selected player', () => {
    expect(needsTracking(DEFAULT_LAYERS, null)).toBe(false)
    expect(needsTracking({ ...DEFAULT_LAYERS, cards: true }, null)).toBe(false)
    expect(needsTracking({ ...DEFAULT_LAYERS, players: true }, null)).toBe(true)
    expect(needsTracking({ ...DEFAULT_LAYERS, ball: true }, null)).toBe(true)
    expect(needsTracking(DEFAULT_LAYERS, 7)).toBe(true)
  })
})

describe('layerAvailability', () => {
  it('keeps the tracking layers switchable before tracking has been requested', () => {
    const a = layerAvailability(null, null)
    expect(a.players).toBe('available')
    expect(a.ball).toBe('available')
    expect(a.possession).toBe('available')
  })

  it('reports no data once tracking loaded empty', () => {
    const a = layerAvailability(null, new TrackingStore([]))
    expect(a.players).toBe('no-data')
    expect(a.ball).toBe('no-data')
  })
})
