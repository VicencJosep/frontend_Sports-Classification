import { describe, expect, it } from 'vitest'

import type { BallAction, PersonDetection, TrackingFrame } from '@/domain'
import { EMPTY_TEAM_ASSIGNMENTS, makeTeamInfo } from '@/domain'
import { TrackingStore } from '@/lib/trackingStore'

import { playerCandidates } from './playerCandidates'

function person(trackerId: number, overrides: Partial<PersonDetection> = {}): PersonDetection {
  return { trackerId, box: [0, 0, 10, 20], anchor: [5, 20], confidence: 0.9, role: 'player', jersey: null, fieldXy: null, ...overrides }
}

function frame(frameIdx: number, persons: PersonDetection[]): TrackingFrame {
  return { frameIdx, timestampS: frameIdx / 25, persons, ball: null, possessorTrackerId: null, homographyOk: null }
}

const action: BallAction = {
  id: 'a',
  frameIdx: 50,
  timestampS: 2,
  trackerId: 7,
  teamCluster: 1,
  jersey: 10,
  label: 'pass',
  confidence: 0.8,
  probabilities: {},
  isBackground: false,
  spotScore: null,
}

describe('playerCandidates', () => {
  const frames: TrackingFrame[] = []
  for (let i = 0; i <= 100; i += 1) {
    const persons = [person(1, { jersey: i < 60 ? 9 : 4 }), person(3, { role: 'referee' })]
    if (i >= 40) persons.push(person(2, { role: 'goalkeeper', jersey: 1 }))
    frames.push(frame(i, persons))
  }
  const store = new TrackingStore(frames)
  const teams = { ...EMPTY_TEAM_ASSIGNMENTS, byTrackerId: new Map([[1, 0]]), clusters: [makeTeamInfo(0), makeTeamInfo(1)] }

  it('lists tracklets in the range, attributed possessor first, players before referees', () => {
    const out = playerCandidates(store, teams, 0, 4, 25, [action], 2)
    expect(out.map((c) => c.trackerId)).toEqual([7, 1, 2, 3])
    expect(out[0]).toMatchObject({ trackerId: 7, fromAction: true, jersey: 10, teamCluster: 1, frames: 0 })
    expect(out[1]).toMatchObject({ trackerId: 1, jersey: 9, teamCluster: 0, role: 'player' })
    expect(out[2]).toMatchObject({ trackerId: 2, role: 'goalkeeper', jersey: 1 })
    expect(out[3]).toMatchObject({ trackerId: 3, role: 'referee' })
  })

  it('works without tracking and without actions', () => {
    expect(playerCandidates(null, teams, 0, 4, 25, [], 2)).toEqual([])
    expect(playerCandidates(null, teams, 0, 4, 25, [action], 2).map((c) => c.trackerId)).toEqual([7])
  })

  it('only looks inside the range', () => {
    const out = playerCandidates(store, teams, 0, 1, 25, [], 0.5)
    expect(out.map((c) => c.trackerId)).toEqual([1, 3])
  })
})
