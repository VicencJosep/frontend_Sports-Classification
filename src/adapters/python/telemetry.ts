import type { BallAction, MatchAnalysis, MatchEvent, TeamAssignments } from '@/domain'
import { canonicalLabel } from '@/domain'

import { assertTelemetry } from './guards'
import { isFullMatchTelemetry, type RawBallAction, type RawEventSpan, type RawTelemetry } from './raw'

export interface TelemetryContext {
  matchId: string
  partId: string
  /** Frames per second of the part video: converts ball-action frame indices to seconds. */
  fps: number
  /** Duration of the part video: bounds the single clip-mode event span. */
  durationS: number
  teams: TeamAssignments
}

export function parseTelemetryJson(text: string, path = 'telemetry.json'): RawTelemetry {
  const parsed: unknown = JSON.parse(text)
  assertTelemetry(parsed, path)
  return parsed
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000
}

function eventId(index: number, label: string, startS: number): string {
  return `evt-${index}-${label}-${startS.toFixed(3)}`
}

function spanToEvent(span: RawEventSpan, index: number): MatchEvent {
  const label = canonicalLabel(span.label)
  return {
    id: eventId(index, label, span.start_s),
    label,
    startS: span.start_s,
    endS: span.end_s,
    seekS: span.start_s,
    peakConfidence: span.peak_confidence,
    meanConfidence: span.mean_confidence,
    nWindows: span.n_windows,
  }
}

/**
 * Full-match telemetry: spans sorted by start. Clip telemetry: the single
 * prediction becomes one span over the whole clip, unless it is a
 * `background_*` class (no event).
 */
export function toEvents(raw: RawTelemetry, ctx: Pick<TelemetryContext, 'durationS'>): MatchEvent[] {
  if (isFullMatchTelemetry(raw)) {
    return [...raw.events].sort((a, b) => a.start_s - b.start_s).map(spanToEvent)
  }
  const prediction = raw.event
  if (prediction === null || prediction.is_background) return []
  const label = canonicalLabel(prediction.label)
  return [
    {
      id: eventId(0, label, 0),
      label,
      startS: 0,
      endS: ctx.durationS,
      seekS: 0,
      peakConfidence: prediction.confidence,
      meanConfidence: prediction.confidence,
      nWindows: 1,
    },
  ]
}

function toBallAction(raw: RawBallAction, ctx: Pick<TelemetryContext, 'fps' | 'teams'>): BallAction {
  const trackerId = raw.tracker_id >= 0 ? raw.tracker_id : null
  return {
    id: `act-${raw.frame_idx}-${raw.label}-${raw.tracker_id}`,
    frameIdx: raw.frame_idx,
    timestampS: round3(raw.frame_idx / ctx.fps),
    trackerId,
    teamCluster: trackerId === null ? null : (ctx.teams.byTrackerId.get(trackerId) ?? null),
    jersey: null,
    label: canonicalLabel(raw.label),
    confidence: raw.confidence,
    probabilities: Object.fromEntries(Object.entries(raw.probabilities).map(([k, v]) => [canonicalLabel(k), v])),
    isBackground: raw.is_background,
    spotScore: typeof raw.spot_score === 'number' ? raw.spot_score : null,
  }
}

export function toBallActions(raw: RawTelemetry, ctx: Pick<TelemetryContext, 'fps' | 'teams'>): BallAction[] {
  return [...raw.ball_actions].sort((a, b) => a.frame_idx - b.frame_idx).map((a) => toBallAction(a, ctx))
}

export function toMatchAnalysis(raw: RawTelemetry, ctx: TelemetryContext): MatchAnalysis {
  return {
    matchId: ctx.matchId,
    partId: ctx.partId,
    mode: isFullMatchTelemetry(raw) ? 'full-match' : 'clip',
    teams: ctx.teams,
    events: toEvents(raw, ctx),
    ballActions: toBallActions(raw, ctx),
    frameCount: raw.n_frames,
    sourceVideoPath: raw.source_video ?? null,
  }
}
