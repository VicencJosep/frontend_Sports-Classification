import { describe, expect, it } from 'vitest'

import type { MatchAnalysis } from './analysis'
import type { BallAction, MatchEvent } from './events'
import { eventInstantS, latestActionAt } from './events'
import { applyReviewResult, buildReviewPatch, effectiveSide, isEmptyPatch, reviewKindForLabel, subjectInstantS, type ReviewInfo, type ReviewSubject } from './review'
import { EMPTY_TEAM_ASSIGNMENTS } from './teams'

const FPS = 25

function event(overrides: Partial<MatchEvent> = {}): MatchEvent {
  return { id: 'evt-0003', label: 'shot', startS: 33, endS: 35, seekS: 33, peakConfidence: 0.9, meanConfidence: 0.8, nWindows: 1, goalSource: null, score: null, ...overrides }
}

function action(overrides: Partial<BallAction> = {}): BallAction {
  return { id: 'act-825', frameIdx: 825, timestampS: 33, trackerId: 1907, teamCluster: 1, jersey: 9, label: 'pass', confidence: 0.7, probabilities: {}, isBackground: false, spotScore: null, ...overrides }
}

function info(overrides: Partial<ReviewInfo> = {}): ReviewInfo {
  return { exists: true, createdAt: null, updatedAt: null, nEdited: 0, nAdded: 0, nDeleted: 0, stale: false, trackerSides: new Map(), ...overrides }
}

function analysis(overrides: Partial<MatchAnalysis> = {}): MatchAnalysis {
  return { matchId: 'm', partId: 'full', mode: 'full-match', teams: EMPTY_TEAM_ASSIGNMENTS, events: [], ballActions: [], frameCount: 1000, sourceVideoPath: null, review: info({ exists: false }), ...overrides }
}

describe('instants', () => {
  it('takes the peak of a spotted event span, the middle of a shorter one', () => {
    expect(eventInstantS(event({ startS: 33, endS: 35 }))).toBe(34)
    expect(eventInstantS(event({ startS: 24, endS: 30 }))).toBe(25)
    expect(eventInstantS(event({ startS: 0, endS: 1.2 }))).toBe(0.6)
    expect(subjectInstantS({ kind: 'event', event: event() })).toBe(34)
    expect(subjectInstantS({ kind: 'action', action: action() })).toBe(33)
  })

  it('finds the last visible action shortly before the playhead', () => {
    const actions = [action({ id: 'a', timestampS: 10 }), action({ id: 'b', timestampS: 12, isBackground: true }), action({ id: 'c', timestampS: 30 })]
    expect(latestActionAt(actions, 12.5, 4)?.id).toBe('a')
    expect(latestActionAt(actions, 30, 4)?.id).toBe('c')
    expect(latestActionAt(actions, 20, 4)).toBeNull()
    expect(latestActionAt(actions, 5, 4)).toBeNull()
  })
})

describe('buildReviewPatch', () => {
  const subject: ReviewSubject = { kind: 'action', action: action() }
  const form = { label: 'pass', timeS: 33, trackerId: 1907, side: null }

  it('sends nothing for an untouched form', () => {
    const patch = buildReviewPatch(subject, form, FPS, info())
    expect(patch).toEqual({})
    expect(isEmptyPatch(patch)).toBe(true)
  })

  it('sends only what changed', () => {
    expect(buildReviewPatch(subject, { ...form, label: 'drive' }, FPS, info())).toEqual({ label: 'drive' })
    expect(buildReviewPatch(subject, { ...form, trackerId: 2001 }, FPS, info())).toEqual({ trackerId: 2001 })
    expect(buildReviewPatch(subject, { ...form, trackerId: null }, FPS, info())).toEqual({ trackerId: null })
    expect(buildReviewPatch(subject, { ...form, side: 'away' }, FPS, info())).toEqual({ side: 'away' })
  })

  it('ignores an instant less than half a frame away', () => {
    expect(buildReviewPatch(subject, { ...form, timeS: 33.01 }, FPS, info())).toEqual({})
    expect(buildReviewPatch(subject, { ...form, timeS: 33.04 }, FPS, info())).toEqual({ timeS: 33.04 })
    const shot: ReviewSubject = { kind: 'event', event: event() }
    expect(buildReviewPatch(shot, { label: 'shot', timeS: 34, trackerId: null, side: null }, FPS, info())).toEqual({})
    expect(buildReviewPatch(shot, { label: 'goal', timeS: 35.2, trackerId: 7, side: 'home' }, FPS, info())).toEqual({ label: 'goal', timeS: 35.2, trackerId: 7, side: 'home' })
  })

  it('does not resend the team its tracklet already has', () => {
    const known = info({ trackerSides: new Map([[1907, 'home'], [2001, 'away']]) })
    expect(buildReviewPatch(subject, { ...form, side: 'home' }, FPS, known)).toEqual({})
    // new player whose tracklet is known: the copy resolves the team by itself
    expect(buildReviewPatch(subject, { ...form, trackerId: 2001, side: 'away' }, FPS, known)).toEqual({ trackerId: 2001 })
    // the action carries its own team: changing player to the other side has to say so
    const own: ReviewSubject = { kind: 'action', action: action({ side: 'home' }) }
    expect(buildReviewPatch(own, { ...form, trackerId: 2001, side: 'away' }, FPS, known)).toEqual({ trackerId: 2001, side: 'away' })
    expect(buildReviewPatch(own, { ...form, side: null }, FPS, known)).toEqual({ side: null })
  })
})

describe('sides and kinds', () => {
  it('prefers the item team over its tracklet team', () => {
    const known = info({ trackerSides: new Map([[5, 'away']]) })
    expect(effectiveSide('home', 5, known)).toBe('home')
    expect(effectiveSide(null, 5, known)).toBe('away')
    expect(effectiveSide(null, 6, known)).toBeNull()
    expect(effectiveSide(null, null, known)).toBeNull()
    expect(effectiveSide(null, 5, null)).toBeNull()
  })

  it('adds timeline classes as events and the rest as ball actions', () => {
    expect(reviewKindForLabel('corner')).toBe('event')
    expect(reviewKindForLabel('shot')).toBe('event')
    expect(reviewKindForLabel('throw_in')).toBe('event')
    expect(reviewKindForLabel('pass')).toBe('action')
    expect(reviewKindForLabel('player_successful_tackle')).toBe('action')
  })
})

describe('applyReviewResult', () => {
  const base = analysis({
    events: [event({ id: 'e1', startS: 10, endS: 12 }), event({ id: 'e2', startS: 40, endS: 42 })],
    ballActions: [action({ id: 'a1', frameIdx: 100 }), action({ id: 'a2', frameIdx: 300 })],
  })

  it('replaces a corrected action and keeps the list sorted by frame', () => {
    const moved = action({ id: 'a1', frameIdx: 400, label: 'drive', review: 'edited' })
    const next = applyReviewResult(base, { kind: 'action', id: 'a1', deleted: false, action: moved, event: null, info: info({ nEdited: 1 }) })
    expect(next.ballActions.map((a) => a.id)).toEqual(['a2', 'a1'])
    expect(next.ballActions[1]).toBe(moved)
    expect(next.events).toBe(base.events)
    expect(next.review?.nEdited).toBe(1)
    expect(base.ballActions.map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('inserts an added event in time order and removes a deleted one', () => {
    const added = event({ id: 'evt-new-1', startS: 20, endS: 22, review: 'added' })
    const withAdded = applyReviewResult(base, { kind: 'event', id: added.id, deleted: false, action: null, event: added, info: info({ nAdded: 1 }) })
    expect(withAdded.events.map((e) => e.id)).toEqual(['e1', 'evt-new-1', 'e2'])
    const withoutE1 = applyReviewResult(withAdded, { kind: 'event', id: 'e1', deleted: true, action: null, event: event({ id: 'e1' }), info: info({ nAdded: 1, nDeleted: 1 }) })
    expect(withoutE1.events.map((e) => e.id)).toEqual(['evt-new-1', 'e2'])
    expect(withoutE1.review).toMatchObject({ nAdded: 1, nDeleted: 1 })
  })
})
