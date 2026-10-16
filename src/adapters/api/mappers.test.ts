import { describe, expect, it } from 'vitest'

import { resolveContentUrl, toMatch, toMatchAnalysis, toTrackingFrames } from './mappers'
import type { ApiMatch, ApiPartAnalysis, ApiTrackingFrame, ApiVideo } from './wire'

const video: ApiVideo = {
  id: '0123456789abcdef',
  original_filename: 'match.mp4',
  size_bytes: 10,
  container: 'mp4',
  video_codec: 'h264',
  width: 1280,
  height: 720,
  fps: 25,
  frame_count: 1500,
  duration_s: 60,
  start_time_s: 0,
  has_audio: false,
  browser_playable: true,
  uploaded_at: '2026-10-09T08:00:00Z',
  content_url: '/api/videos/0123456789abcdef/content',
}

describe('api mappers', () => {
  it('maps a match with its parts and video URL', () => {
    const api: ApiMatch = {
      id: 'fedcba9876543210',
      name: 'A vs B',
      home_team: 'A',
      away_team: 'B',
      date: '2026-10-09',
      created_at: '2026-10-09T08:00:00Z',
      status: 'processing',
      error_message: null,
      duration_s: 60,
      parts: [{ id: 'full', kind: 'full', label: 'Full match', mode: 'full-match', status: 'processing', stage: 'tracking', error: null, video }],
    }
    const match = toMatch(api, 'http://localhost:8100/')
    expect(match).toMatchObject({ id: api.id, homeTeam: 'A', status: 'processing', isDemo: false, durationS: 60 })
    expect(match.parts[0]).toMatchObject({ id: 'full', kind: 'full', stage: 'tracking' })
    expect(match.parts[0]?.video?.url).toBe('http://localhost:8100/api/videos/0123456789abcdef/content')
    expect(resolveContentUrl('http://x', 'https://cdn/v.mp4')).toBe('https://cdn/v.mp4')
  })

  it('maps analysis results (teams keyed by number, sorted events and actions)', () => {
    const api: ApiPartAnalysis = {
      match_id: 'm',
      part_id: 'full',
      mode: 'full-match',
      frame_count: 1500,
      source_video_path: null,
      events: [
        { id: 'evt-0001', label: 'shot', start_s: 10, end_s: 12, peak_confidence: 0.7, mean_confidence: 0.7, n_windows: 1 },
        { id: 'evt-0000', label: 'kick_off', start_s: 0, end_s: 6, peak_confidence: 0.9, mean_confidence: 0.9, n_windows: 1 },
      ],
      ball_actions: [
        { id: 'act-50', frame_idx: 50, timestamp_s: 2, tracker_id: null, team_cluster: null, jersey: null, label: 'pass', confidence: 0.9, probabilities: { pass: 0.9 }, is_background: false, spot_score: 0.8 },
      ],
      teams: { clusters: [0, 1], assignments: { '7': 1 }, excluded: { '9': 'never_player' } },
    }
    const analysis = toMatchAnalysis(api)
    expect(analysis.events.map((e) => e.label)).toEqual(['kick_off', 'shot'])
    expect(analysis.events[1]).toMatchObject({ seekS: 10, peakConfidence: 0.7 })
    expect(analysis.ballActions[0]).toMatchObject({ trackerId: null, spotScore: 0.8 })
    expect(analysis.teams.byTrackerId.get(7)).toBe(1)
    expect(analysis.teams.excluded.get(9)).toBe('never_player')
    expect(analysis.teams.clusters.map((c) => c.cluster)).toEqual([0, 1])
  })

  it('maps tracking frames', () => {
    const frame: ApiTrackingFrame = {
      frame_idx: 3,
      timestamp_s: 0.12,
      persons: [{ tracker_id: 1, box: [1, 2, 3, 4], anchor: [2, 4], confidence: 0.9, role: 'weird', jersey: 10, field_xy: [50, 34] }],
      ball: { box: [0, 0, 1, 1], center: [0.5, 0.5], confidence: 0.3, field_xy: null },
      possessor_tracker_id: 1,
      homography_ok: true,
    }
    const [mapped] = toTrackingFrames([frame])
    expect(mapped).toMatchObject({ frameIdx: 3, possessorTrackerId: 1, homographyOk: true })
    expect(mapped?.persons[0]).toMatchObject({ trackerId: 1, role: 'other', jersey: 10, fieldXy: [50, 34] })
    expect(mapped?.ball).toMatchObject({ center: [0.5, 0.5], fieldXy: null })
  })
})
