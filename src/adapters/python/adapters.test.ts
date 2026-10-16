import { describe, expect, it } from 'vitest'

import { EMPTY_TEAM_ASSIGNMENTS } from '@/domain'

import { AdapterError } from './guards'
import { isFullMatchTelemetry } from './raw'
import { parseTeamsJson, toTeamAssignments } from './teams'
import { parseTelemetryJson, toBallActions, toEvents, toMatchAnalysis } from './telemetry'
import { parseTracksJsonl, toTrackingFrames } from './tracks'

import teamsSample from './__fixtures__/teams.sample.json?raw'
import telemetryClipShot from './__fixtures__/telemetry.clip-shot.json?raw'
import telemetryClip from './__fixtures__/telemetry.clip.json?raw'
import telemetryFullMatch from './__fixtures__/telemetry.full-match.json?raw'
import tracks2dSample from './__fixtures__/tracks_2d.sample.jsonl?raw'
import tracksSample from './__fixtures__/tracks.sample.jsonl?raw'

// Real pipeline outputs (see __fixtures__/), imported as text so the parsers run exactly as in the app.
const FIXTURES: Record<string, string> = {
  'teams.sample.json': teamsSample,
  'telemetry.clip-shot.json': telemetryClipShot,
  'telemetry.clip.json': telemetryClip,
  'telemetry.full-match.json': telemetryFullMatch,
  'tracks_2d.sample.jsonl': tracks2dSample,
  'tracks.sample.jsonl': tracksSample,
}
const fixture = (name: string): string => {
  const text = FIXTURES[name]
  if (text === undefined) throw new Error(`unknown fixture ${name}`)
  return text
}

describe('tracks adapter (real tracks.jsonl records)', () => {
  it('converts persons, ball, roles and jerseys', () => {
    const frames = toTrackingFrames(parseTracksJsonl(fixture('tracks.sample.jsonl')))
    expect(frames).toHaveLength(3)
    const f0 = frames[0]!
    expect(f0.frameIdx).toBe(0)
    expect(f0.timestampS).toBe(0)
    expect(f0.persons.length).toBeGreaterThan(5)
    const p = f0.persons[0]!
    expect(p.trackerId).toBe(1)
    expect(p.box).toEqual([246.875, 303.75, 283.75, 362.5])
    expect(p.anchor).toEqual([265.3125, 362.5])
    expect(p.role).toBe('player')
    expect(p.jersey).toBeNull()
    expect(p.fieldXy).toBeNull()
    // optional data absent in plain tracks.jsonl
    expect(f0.possessorTrackerId).toBeNull()
    expect(f0.homographyOk).toBeNull()
    const withBall = frames.find((f) => f.ball !== null)
    if (withBall?.ball) {
      expect(withBall.ball.center).toHaveLength(2)
      expect(withBall.ball.confidence).toBeGreaterThan(0)
    }
  })

  it('reads field coordinates, homography flag and possessor from tracks_2d/possession records', () => {
    const frames = toTrackingFrames(parseTracksJsonl(fixture('tracks_2d.sample.jsonl')))
    expect(frames.map((f) => f.frameIdx)).toEqual([0, 156])
    const projected = frames[0]!
    expect(projected.homographyOk).toBe(true)
    expect(projected.possessorTrackerId).toBe(3)
    expect(projected.persons[0]!.fieldXy).not.toBeNull()
    const [x, y] = projected.persons[0]!.fieldXy!
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x).toBeLessThanOrEqual(105)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThanOrEqual(68)
    const missing = frames[1]!
    expect(missing.homographyOk).toBe(false)
    expect(missing.possessorTrackerId).toBeNull()
    expect(missing.persons.every((p) => p.fieldXy === null)).toBe(true)
  })

  it('rejects records that break the contract, naming the line', () => {
    expect(() => parseTracksJsonl('{"frame_idx": "nope", "timestamp_s": 0, "tracks": []}')).toThrow(AdapterError)
    expect(() => parseTracksJsonl('{"frame_idx": "nope", "timestamp_s": 0, "tracks": []}')).toThrow(/tracks.jsonl:1\.frame_idx/)
  })

  it('maps unknown roles to "other"', () => {
    const line = JSON.stringify({
      frame_idx: 7,
      timestamp_s: 0.28,
      tracks: [{ tracker_id: 9, xyxy: [0, 0, 10, 20], anchor_xy: [5, 20], confidence: 0.5, class_id: 2, role: 'mascot', jersey: 7 }],
      ball: null,
    })
    const [frame] = toTrackingFrames(parseTracksJsonl(line))
    expect(frame!.persons[0]!.role).toBe('other')
    expect(frame!.persons[0]!.jersey).toBe(7)
  })
})

describe('teams adapter (real teams.json)', () => {
  it('builds the tracker -> cluster map and two named clusters', () => {
    const teams = toTeamAssignments(parseTeamsJson(fixture('teams.sample.json')))
    expect(teams.clusters.map((c) => c.cluster)).toEqual([0, 1])
    expect(teams.clusters[0]!.displayName).toBe('Team A')
    expect(teams.clusters[1]!.displayName).toBe('Team B')
    expect(teams.byTrackerId.get(1)).toBe(1)
    expect(teams.byTrackerId.get(2)).toBe(0)
    expect(teams.excluded.get(11)).toBe('never_player')
    expect(teams.byTrackerId.has(11)).toBe(false)
  })
})

describe('telemetry adapter', () => {
  const teams = toTeamAssignments(parseTeamsJson(fixture('teams.sample.json')))

  it('clip mode: a background prediction yields no event', () => {
    const raw = parseTelemetryJson(fixture('telemetry.clip.json'))
    expect(isFullMatchTelemetry(raw)).toBe(false)
    expect(toEvents(raw, { durationS: 2 })).toEqual([])
    const actions = toBallActions(raw, { fps: 25, teams })
    expect(actions).toHaveLength(2)
    expect(actions[0]).toMatchObject({ frameIdx: 0, timestampS: 0, trackerId: 2, teamCluster: 0, label: 'pass', isBackground: false, spotScore: null })
    expect(actions[1]!.timestampS).toBeCloseTo(34 / 25, 3)
  })

  it('clip mode: a real prediction becomes one span over the whole clip', () => {
    const raw = parseTelemetryJson(fixture('telemetry.clip-shot.json'))
    const events = toEvents(raw, { durationS: 3 })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ label: 'shot', startS: 0, endS: 3, seekS: 0, nWindows: 1 })
    expect(events[0]!.peakConfidence).toBeGreaterThan(0)
  })

  it('full-match mode: spans are sorted, ids are stable, actions carry spot scores', () => {
    const raw = parseTelemetryJson(fixture('telemetry.full-match.json'))
    expect(isFullMatchTelemetry(raw)).toBe(true)
    const analysis = toMatchAnalysis(raw, { matchId: 'm', partId: 'p', fps: 25, durationS: 1207.2, teams: EMPTY_TEAM_ASSIGNMENTS })
    expect(analysis.mode).toBe('full-match')
    expect(analysis.events.length).toBeGreaterThan(3)
    for (let i = 1; i < analysis.events.length; i += 1) {
      expect(analysis.events[i]!.startS).toBeGreaterThanOrEqual(analysis.events[i - 1]!.startS)
    }
    expect(analysis.events[0]).toMatchObject({ label: 'kick_off', startS: 0, seekS: 0 })
    expect(analysis.events[0]!.id).toBe('evt-0-kick_off-0.000')
    expect(analysis.ballActions.length).toBeGreaterThan(5)
    expect(analysis.ballActions[0]!.spotScore).not.toBeNull()
    expect(analysis.ballActions.every((a) => a.teamCluster === null)).toBe(true)
    expect(analysis.frameCount).toBe(30180)
    expect(analysis.sourceVideoPath).toContain('Middlesbrough')
  })

  it('maps a -1 tracker id to null', () => {
    const raw = parseTelemetryJson(
      JSON.stringify({
        source_video: 'x.mp4',
        events: [],
        ball_actions: [{ frame_idx: 50, tracker_id: -1, label: 'pass', confidence: 0.9, probabilities: { pass: 0.9 }, is_background: false, spot_score: 0.8 }],
        n_frames: 100,
        n_possession_changes: 1,
      }),
    )
    const [action] = toBallActions(raw, { fps: 25, teams })
    expect(action!.trackerId).toBeNull()
    expect(action!.teamCluster).toBeNull()
    expect(action!.timestampS).toBe(2)
  })

  it('rejects telemetry with neither events nor event', () => {
    expect(() => parseTelemetryJson('{"source_video": "x", "ball_actions": []}')).toThrow(AdapterError)
  })
})
