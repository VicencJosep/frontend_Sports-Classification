import type {
  BallAction,
  BallDetection,
  HighlightClip,
  HighlightsSummary,
  Match,
  MatchAnalysis,
  MatchEvent,
  MatchPart,
  PartHighlights,
  PersonDetection,
  TeamAssignments,
  TeamInfo,
  TrackingFrame,
  VideoInfo,
} from '@/domain'
import { deriveMatchStatus, isAnalysisStatus, isPartKind, isRole, makeTeamInfo, matchDurationS } from '@/domain'

import type {
  ApiBallAction,
  ApiBallDetection,
  ApiHighlightClip,
  ApiHighlightsResponse,
  ApiHighlightsSummary,
  ApiMatch,
  ApiMatchEvent,
  ApiMatchPart,
  ApiPartAnalysis,
  ApiPersonDetection,
  ApiTeamAssignments,
  ApiTrackingFrame,
  ApiVideo,
} from './wire'

/** Joins the API base URL and a relative `content_url`. Absolute URLs pass through. */
export function resolveContentUrl(baseUrl: string, contentUrl: string): string {
  if (/^https?:\/\//.test(contentUrl)) return contentUrl
  return `${baseUrl.replace(/\/$/, '')}${contentUrl.startsWith('/') ? '' : '/'}${contentUrl}`
}

export function toVideoInfo(video: ApiVideo, baseUrl: string): VideoInfo {
  return {
    url: resolveContentUrl(baseUrl, video.content_url),
    width: video.width,
    height: video.height,
    fps: video.fps,
    frameCount: video.frame_count,
    durationS: video.duration_s,
    startTimeS: video.start_time_s,
  }
}

export function toHighlightsSummary(summary: ApiHighlightsSummary): HighlightsSummary {
  return {
    status: isAnalysisStatus(summary.status) ? summary.status : 'pending',
    stage: summary.stage,
    nClips: summary.n_clips,
    error: summary.error,
  }
}

export function toMatchPart(part: ApiMatchPart, baseUrl: string): MatchPart {
  return {
    id: part.id,
    kind: isPartKind(part.kind) ? part.kind : 'full',
    label: part.label,
    mode: part.mode,
    status: isAnalysisStatus(part.status) ? part.status : 'pending',
    stage: part.stage,
    video: part.video ? toVideoInfo(part.video, baseUrl) : null,
    highlights: part.highlights ? toHighlightsSummary(part.highlights) : null,
  }
}

export function toHighlightClip(clip: ApiHighlightClip, baseUrl: string): HighlightClip {
  return {
    id: clip.id,
    rank: clip.rank,
    label: clip.label,
    title: clip.title,
    description: clip.description,
    startS: clip.start_s,
    endS: clip.end_s,
    durationS: clip.duration_s,
    anchorS: clip.anchor_s,
    teamCluster: clip.team_cluster,
    finalScore: clip.final_score,
    vlmRank: clip.vlm_rank,
    soccerhighScore: clip.soccerhigh_score ?? null,
    contentUrl: clip.content_url ? resolveContentUrl(baseUrl, clip.content_url) : null,
  }
}

export function toPartHighlights(response: ApiHighlightsResponse, baseUrl: string): PartHighlights {
  return {
    matchId: response.match_id,
    partId: response.part_id,
    status: isAnalysisStatus(response.status) ? response.status : 'pending',
    stage: response.stage,
    error: response.error,
    generatedAt: response.generated_at,
    vlmModel: response.vlm_model,
    nCandidates: response.n_candidates,
    clips: [...response.clips].sort((a, b) => a.rank - b.rank).map((c) => toHighlightClip(c, baseUrl)),
  }
}

export function toMatch(match: ApiMatch, baseUrl: string): Match {
  const parts = match.parts.map((p) => toMatchPart(p, baseUrl))
  return {
    id: match.id,
    name: match.name,
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    score: null,
    date: match.date,
    status: isAnalysisStatus(match.status) ? match.status : deriveMatchStatus(parts),
    errorMessage: match.error_message,
    isDemo: false,
    note: null,
    createdAt: match.created_at,
    parts,
    durationS: match.duration_s ?? matchDurationS(parts),
  }
}

export function toTeamAssignments(teams: ApiTeamAssignments): TeamAssignments {
  const byTrackerId = new Map<number, number>()
  for (const [id, cluster] of Object.entries(teams.assignments)) byTrackerId.set(Number(id), cluster)
  const excluded = new Map<number, string>()
  for (const [id, reason] of Object.entries(teams.excluded)) excluded.set(Number(id), reason)
  const clusters: TeamInfo[] = [...teams.clusters].sort((a, b) => a - b).map(makeTeamInfo)
  return { byTrackerId, excluded, clusters }
}

export function toMatchEvent(event: ApiMatchEvent): MatchEvent {
  return {
    id: event.id,
    label: event.label,
    startS: event.start_s,
    endS: event.end_s,
    seekS: event.start_s,
    peakConfidence: event.peak_confidence,
    meanConfidence: event.mean_confidence,
    nWindows: event.n_windows,
    goalSource: event.goal_source ?? null,
    score: toScore(event.score),
  }
}

function toScore(score: readonly number[] | null | undefined): readonly [number, number] | null {
  const [home, away] = score ?? []
  return home !== undefined && away !== undefined ? [home, away] : null
}

export function toBallAction(action: ApiBallAction): BallAction {
  return {
    id: action.id,
    frameIdx: action.frame_idx,
    timestampS: action.timestamp_s,
    trackerId: action.tracker_id,
    teamCluster: action.team_cluster,
    jersey: action.jersey ?? null,
    label: action.label,
    confidence: action.confidence,
    probabilities: action.probabilities,
    isBackground: action.is_background,
    spotScore: action.spot_score,
  }
}

export function toMatchAnalysis(analysis: ApiPartAnalysis): MatchAnalysis {
  return {
    matchId: analysis.match_id,
    partId: analysis.part_id,
    mode: analysis.mode,
    teams: toTeamAssignments(analysis.teams),
    events: [...analysis.events].sort((a, b) => a.start_s - b.start_s).map(toMatchEvent),
    ballActions: [...analysis.ball_actions].sort((a, b) => a.frame_idx - b.frame_idx).map(toBallAction),
    frameCount: analysis.frame_count,
    sourceVideoPath: analysis.source_video_path,
  }
}

function toPersonDetection(person: ApiPersonDetection): PersonDetection {
  return {
    trackerId: person.tracker_id,
    box: [person.box[0], person.box[1], person.box[2], person.box[3]],
    anchor: [person.anchor[0], person.anchor[1]],
    confidence: person.confidence,
    role: isRole(person.role) ? person.role : 'other',
    jersey: person.jersey,
    fieldXy: person.field_xy ? [person.field_xy[0], person.field_xy[1]] : null,
  }
}

function toBallDetection(ball: ApiBallDetection): BallDetection {
  return {
    box: [ball.box[0], ball.box[1], ball.box[2], ball.box[3]],
    center: [ball.center[0], ball.center[1]],
    confidence: ball.confidence,
    fieldXy: ball.field_xy ? [ball.field_xy[0], ball.field_xy[1]] : null,
  }
}

export function toTrackingFrame(frame: ApiTrackingFrame): TrackingFrame {
  return {
    frameIdx: frame.frame_idx,
    timestampS: frame.timestamp_s,
    persons: frame.persons.map(toPersonDetection),
    ball: frame.ball ? toBallDetection(frame.ball) : null,
    possessorTrackerId: frame.possessor_tracker_id,
    homographyOk: frame.homography_ok,
  }
}

export function toTrackingFrames(frames: readonly ApiTrackingFrame[]): TrackingFrame[] {
  return frames.map(toTrackingFrame).sort((a, b) => a.frameIdx - b.frameIdx)
}
