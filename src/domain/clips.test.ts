import { describe, expect, it } from 'vitest'

import type { BallAction, MatchEvent } from './events'
import {
  clampClipRange,
  clipsExportJson,
  defaultClipRange,
  describePlayer,
  draftAtTime,
  draftFromClip,
  draftFromEvent,
  playerAround,
  shiftClipRange,
  snapToFrame,
  sortClips,
  totalClipsDurationS,
  type SavedClip,
} from './clips'

const FPS = 25

function event(overrides: Partial<MatchEvent> = {}): MatchEvent {
  return {
    id: 'evt-0003',
    label: 'shot',
    startS: 33,
    endS: 35,
    seekS: 33,
    peakConfidence: 0.9,
    meanConfidence: 0.8,
    nWindows: 1,
    goalSource: null,
    score: null,
    ...overrides,
  }
}

function action(overrides: Partial<BallAction> = {}): BallAction {
  return {
    id: 'act-1',
    frameIdx: 825,
    timestampS: 33,
    trackerId: 1907,
    teamCluster: 1,
    jersey: 9,
    label: 'pass',
    confidence: 0.7,
    probabilities: {},
    isBackground: false,
    spotScore: null,
    ...overrides,
  }
}

describe('clip ranges', () => {
  it('snaps to frame boundaries', () => {
    expect(snapToFrame(1.013, FPS)).toBeCloseTo(1.0, 9)
    expect(snapToFrame(1.03, FPS)).toBeCloseTo(1.04, 9)
    expect(snapToFrame(5, 0)).toBe(5)
  })

  it('clamps to the video and keeps the minimum duration', () => {
    expect(clampClipRange(-3, 0.2, 100, FPS)).toEqual({ startS: 0, endS: 1 })
    expect(clampClipRange(99.5, 130, 100, FPS)).toEqual({ startS: 99, endS: 100 })
    expect(clampClipRange(10, 10.3, 100, FPS, 'start')).toEqual({ startS: 10, endS: 11 })
    expect(clampClipRange(10, 10.3, 100, FPS, 'end')).toEqual({ startS: 9.32, endS: 10.32 })
  })

  it('shifts a range without changing its length', () => {
    expect(shiftClipRange(10, 20, 5, 100, FPS)).toEqual({ startS: 15, endS: 25 })
    expect(shiftClipRange(10, 20, -15, 100, FPS)).toEqual({ startS: 0, endS: 10 })
    expect(shiftClipRange(10, 20, 100, 100, FPS)).toEqual({ startS: 90, endS: 100 })
  })

  it('pads an event by its label', () => {
    expect(defaultClipRange(event(), 5400, FPS)).toEqual({ startS: 26, endS: 39 })
    expect(defaultClipRange(event({ label: 'goal' }), 5400, FPS)).toEqual({ startS: 23, endS: 43 })
    expect(defaultClipRange(event({ label: 'something_new' }), 5400, FPS)).toEqual({ startS: 28, endS: 40 })
  })
})

describe('drafts', () => {
  const ctx = { matchId: 'm1', partId: 'full', video: { durationS: 5400, fps: FPS }, actions: [action()] }

  it('builds a draft from an event with the possessor around its seek point', () => {
    const draft = draftFromEvent(event(), ctx)
    expect(draft).toMatchObject({
      id: null,
      sourceEventId: 'evt-0003',
      detectedLabel: 'shot',
      label: 'shot',
      startS: 26,
      endS: 39,
      anchorS: 33,
      player: { trackerId: 1907, jersey: 9, teamCluster: 1, name: null },
      title: 'Shot · 00:33',
      notes: '',
    })
  })

  it('ignores background and unattributed actions, picks the nearest', () => {
    const actions = [action({ id: 'bg', timestampS: 33, isBackground: true }), action({ id: 'none', timestampS: 33, trackerId: null }), action({ id: 'far', timestampS: 36 }), action({ id: 'near', timestampS: 34, trackerId: 42, jersey: null })]
    expect(playerAround(33, actions)).toEqual({ trackerId: 42, jersey: null, teamCluster: 1, name: null })
    expect(playerAround(80, actions)).toBeNull()
  })

  it('builds a plain play draft at the playhead', () => {
    const draft = draftAtTime(2.2, { ...ctx, actions: [] })
    expect(draft).toMatchObject({ sourceEventId: null, detectedLabel: null, label: 'play', startS: 0, endS: 7.2, anchorS: 2.2, player: null, title: 'Play · 00:02' })
  })

  it('round-trips a saved clip into a draft', () => {
    const clip: SavedClip = { ...draftFromEvent(event(), ctx), id: 'c1', createdAt: '2026-11-08T10:00:00.000Z', updatedAt: '2026-11-08T10:00:00.000Z' }
    const draft = draftFromClip(clip)
    expect(draft.id).toBe('c1')
    expect('createdAt' in draft).toBe(false)
  })
})

describe('display helpers', () => {
  it('describes players', () => {
    expect(describePlayer(null)).toBe('Unknown')
    expect(describePlayer({ trackerId: 1907, jersey: 9, teamCluster: 1, name: null })).toBe('No. 9 (#1907) · Team B')
    expect(describePlayer({ trackerId: 1907, jersey: null, teamCluster: null, name: null })).toBe('#1907')
    expect(describePlayer({ trackerId: null, jersey: null, teamCluster: null, name: 'Haaland' })).toBe('Haaland')
    expect(describePlayer({ trackerId: null, jersey: 10, teamCluster: 0, name: null })).toBe('No. 10 · Team A')
  })

  it('sorts by start time and sums durations', () => {
    const base = { matchId: 'm', partId: 'p', sourceEventId: null, detectedLabel: null, label: 'play', anchorS: 0, player: null, title: '', notes: '', updatedAt: '' }
    const clips: SavedClip[] = [
      { ...base, id: 'b', startS: 50, endS: 60, createdAt: '2' },
      { ...base, id: 'a', startS: 10, endS: 15, createdAt: '1' },
    ]
    expect(sortClips(clips).map((c) => c.id)).toEqual(['a', 'b'])
    expect(totalClipsDurationS(clips)).toBe(15)
    const parsed = JSON.parse(clipsExportJson('m', 'p', clips, '2026-11-08T00:00:00.000Z')) as { version: number; clips: SavedClip[] }
    expect(parsed.version).toBe(1)
    expect(parsed.clips.map((c) => c.id)).toEqual(['a', 'b'])
  })
})
