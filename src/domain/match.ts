import type { AnalysisMode, AnalysisStatus, PartKind } from './vocab'

/**
 * Video metadata the viewer needs to map video time to pipeline frames.
 * The Python outputs index everything by `frame_idx`; `fps` is implicit there
 * (`timestamp_s = frame_idx / fps`), so it must be provided by whoever serves
 * the video (mock manifest today, FastAPI + ffprobe later).
 */
export interface VideoInfo {
  url: string
  width: number
  height: number
  fps: number
  frameCount: number
  durationS: number
  /** Presentation timestamp of the first frame, usually 0. */
  startTimeS: number
}

/** One analysed video file: the whole match, or one half. */
export interface MatchPart {
  id: string
  kind: PartKind
  label: string
  mode: AnalysisMode
  status: AnalysisStatus
  /** Pipeline stage reported by the backend while `processing` (tracking, analysis, teams, ...). */
  stage: string | null
  /** null while the part is not analysed yet or its video is unavailable. */
  video: VideoInfo | null
}

export interface Score {
  home: number
  away: number
}

/**
 * Frontend-owned match record. The Python pipeline stores none of this
 * metadata (only a source video path), so it lives in the service layer:
 * mock manifest today, backend registry later.
 */
export interface Match {
  id: string
  name: string
  homeTeam: string | null
  awayTeam: string | null
  score: Score | null
  /** ISO date (YYYY-MM-DD) or null when unknown. */
  date: string | null
  status: AnalysisStatus
  errorMessage: string | null
  /** True for fixture data shipped with the frontend. */
  isDemo: boolean
  note: string | null
  /** ISO timestamp. */
  createdAt: string
  parts: MatchPart[]
  /** Sum of the parts' durations, null when no part has video metadata. */
  durationS: number | null
}

export interface CreateMatchPartInput {
  kind: PartKind
  file: File
}

export interface CreateMatchInput {
  name: string
  homeTeam: string | null
  awayTeam: string | null
  date: string | null
  parts: CreateMatchPartInput[]
}

export function matchDurationS(parts: readonly MatchPart[]): number | null {
  const withVideo = parts.filter((p) => p.video !== null)
  if (withVideo.length === 0) return null
  return withVideo.reduce((acc, p) => acc + (p.video?.durationS ?? 0), 0)
}

/** Match status derived from its parts: error wins, then processing, then pending, else completed. */
export function deriveMatchStatus(parts: readonly MatchPart[]): AnalysisStatus {
  if (parts.length === 0) return 'pending'
  if (parts.some((p) => p.status === 'error')) return 'error'
  if (parts.some((p) => p.status === 'processing')) return 'processing'
  if (parts.some((p) => p.status === 'pending')) return 'pending'
  return 'completed'
}
