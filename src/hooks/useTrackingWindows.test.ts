import { describe, expect, it } from 'vitest'

import { retryDelayMs, trackingStatus } from './useTrackingWindows'

describe('tracking load status', () => {
  it('is idle with nothing, loading while anything is pending, ready when all arrived', () => {
    expect(trackingStatus([])).toBe('idle')
    expect(trackingStatus([{ state: 'loading', failures: 0 }])).toBe('loading')
    expect(trackingStatus([{ state: 'done', failures: 0 }, { state: 'loading', failures: 0 }])).toBe('loading')
    expect(trackingStatus([{ state: 'done', failures: 0 }, { state: 'done', failures: 0 }])).toBe('ready')
  })

  it('keeps saying loading through the first failures and only then reports the error', () => {
    expect(trackingStatus([{ state: 'error', failures: 1 }])).toBe('loading')
    expect(trackingStatus([{ state: 'loading', failures: 2 }])).toBe('loading')
    expect(trackingStatus([{ state: 'error', failures: 3 }])).toBe('error')
    // still unavailable while the next automatic attempt is in flight, available again once it succeeds
    expect(trackingStatus([{ state: 'done', failures: 0 }, { state: 'loading', failures: 4 }])).toBe('error')
    expect(trackingStatus([{ state: 'done', failures: 0 }, { state: 'done', failures: 0 }])).toBe('ready')
  })

  it('waits longer after each failure, up to a cap', () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMs)).toEqual([1000, 2000, 4000, 8000, 15000, 15000])
  })
})
