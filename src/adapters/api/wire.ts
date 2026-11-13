/**
 * Wire types of the FastAPI backend (`Sports-Classification/backend`), snake_case
 * exactly as the Pydantic schemas serialise them. Only the mappers in this folder
 * see them; UI code works with `src/domain`.
 */

export interface ApiVideo {
  id: string
  original_filename: string
  size_bytes: number
  container: string
  video_codec: string
  width: number
  height: number
  fps: number
  frame_count: number
  duration_s: number
  start_time_s: number
  has_audio: boolean
  browser_playable: boolean
  uploaded_at: string
  /** Relative to the API base URL (`/api/videos/{id}/content`). */
  content_url: string
  /** Frame thumbnails (`/api/videos/{id}/thumbnail?t=<s>&h=<px>`); absent on a backend without them. */
  thumbnail_url?: string
}

export interface ApiHighlightsSummary {
  status: string
  stage: string | null
  n_clips: number
  error: string | null
}

export interface ApiMatchPart {
  id: string
  kind: string
  label: string
  mode: 'clip' | 'full-match'
  status: string
  stage: string | null
  error: string | null
  video: ApiVideo | null
  highlights?: ApiHighlightsSummary | null
}

export interface ApiHighlightClip {
  id: string
  rank: number
  label: string
  title: string
  description: string
  start_s: number
  end_s: number
  duration_s: number
  anchor_s: number
  team_cluster: number | null
  final_score: number
  vlm_rank: number | null
  /** SoccerHigh (VideoMAEv2) confidence that the play belongs in the official summary, 0-1. */
  soccerhigh_score?: number | null
  /** Relative to the API base URL, null when the clip was not cut. */
  content_url: string | null
}

export interface ApiHighlightsResponse {
  match_id: string
  part_id: string
  status: string
  stage: string | null
  error: string | null
  started_at: string | null
  finished_at: string | null
  generated_at: string | null
  vlm_model: string | null
  n_candidates: number
  clips: ApiHighlightClip[]
}

export interface ApiMatch {
  id: string
  name: string
  home_team: string | null
  away_team: string | null
  date: string | null
  created_at: string
  status: string
  error_message: string | null
  parts: ApiMatchPart[]
  duration_s: number | null
}

export interface ApiMatchCreate {
  name: string
  home_team: string | null
  away_team: string | null
  date: string | null
  parts: { kind: string; video_id: string }[]
}

export interface ApiPartAnalysisStatus {
  part_id: string
  status: string
  stage: string | null
  started_at: string | null
  finished_at: string | null
  error: string | null
}

export interface ApiAnalysisStatus {
  match_id: string
  status: string
  parts: ApiPartAnalysisStatus[]
}

export interface ApiMatchEvent {
  id: string
  label: string
  start_s: number
  end_s: number
  peak_confidence: number
  mean_confidence: number
  n_windows: number
  goal_source?: string | null
  score?: number[] | null
  /** Reviewed copy (`/review`) only. */
  tracker_id?: number | null
  team_cluster?: number | null
  jersey?: number | null
  side?: string | null
  review?: string | null
}

export interface ApiBallAction {
  id: string
  frame_idx: number
  timestamp_s: number
  tracker_id: number | null
  team_cluster: number | null
  jersey?: number | null
  label: string
  confidence: number
  probabilities: Record<string, number>
  is_background: boolean
  spot_score: number | null
  /** Reviewed copy (`/review`) only. */
  side?: string | null
  review?: string | null
}

export interface ApiTeamAssignments {
  clusters: number[]
  /** JSON object keys are strings even though tracker ids are numbers. */
  assignments: Record<string, number>
  excluded: Record<string, string>
}

export interface ApiPartAnalysis {
  match_id: string
  part_id: string
  mode: 'clip' | 'full-match'
  frame_count: number
  source_video_path: string | null
  events: ApiMatchEvent[]
  ball_actions: ApiBallAction[]
  teams: ApiTeamAssignments
  /** Present on `/review` (the reviewed copy, or the pipeline output while nothing was corrected). */
  review?: ApiReviewInfo | null
}

export interface ApiReviewInfo {
  exists: boolean
  created_at: string | null
  updated_at: string | null
  n_edited: number
  n_added: number
  n_deleted: number
  stale?: boolean
  /** JSON object keys are strings even though tracker ids are numbers. */
  tracker_sides: Record<string, string>
}

/** Body of `PATCH /review/items/{id}`: only the fields to change. */
export interface ApiReviewItemPatch {
  label?: string
  time_s?: number
  tracker_id?: number | null
  side?: string | null
}

export interface ApiReviewItemCreate {
  kind: 'action' | 'event'
  label: string
  time_s: number
  tracker_id: number | null
  side: string | null
}

export interface ApiReviewItemResult {
  kind: 'action' | 'event'
  id: string
  deleted: boolean
  action: ApiBallAction | null
  event: ApiMatchEvent | null
  review: ApiReviewInfo
}

export interface ApiReviewExport {
  from_s: number
  to_s: number
  n_rows: number
  filename: string
  path: string
  csv: string
}

export type ApiXy = [number, number]
export type ApiBox = [number, number, number, number]

export interface ApiPersonDetection {
  tracker_id: number
  box: ApiBox
  anchor: ApiXy
  confidence: number
  role: string
  jersey: number | null
  field_xy: ApiXy | null
}

export interface ApiBallDetection {
  box: ApiBox
  center: ApiXy
  confidence: number
  field_xy: ApiXy | null
}

export interface ApiTrackingFrame {
  frame_idx: number
  timestamp_s: number
  persons: ApiPersonDetection[]
  ball: ApiBallDetection | null
  possessor_tracker_id: number | null
  homography_ok: boolean | null
}

export interface ApiTrackingWindow {
  match_id: string
  part_id: string
  from_s: number
  to_s: number
  fps: number
  frames: ApiTrackingFrame[]
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string }
  detail?: unknown
}
