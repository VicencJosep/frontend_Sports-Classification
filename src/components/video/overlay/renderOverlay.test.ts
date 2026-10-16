import { describe, expect, it } from 'vitest'

import type { BallAction } from '@/domain'

import { recentActions } from './renderOverlay'

const action = (frameIdx: number): BallAction => ({
  id: `a${frameIdx}`,
  frameIdx,
  timestampS: frameIdx / 25,
  trackerId: 1,
  teamCluster: null, jersey: null,
  label: 'pass',
  confidence: 0.9,
  probabilities: {},
  isBackground: false,
  spotScore: null,
})

describe('recentActions', () => {
  const actions = [10, 20, 30, 100].map(action)
  it('returns actions inside the trailing window, newest first', () => {
    expect(recentActions(actions, 30, 15).map((a) => a.frameIdx)).toEqual([30, 20])
    expect(recentActions(actions, 29, 15).map((a) => a.frameIdx)).toEqual([20])
    expect(recentActions(actions, 5, 15)).toEqual([])
    expect(recentActions(actions, 100, 0).map((a) => a.frameIdx)).toEqual([100])
  })
  it('handles empty input', () => {
    expect(recentActions([], 10, 10)).toEqual([])
  })
})
