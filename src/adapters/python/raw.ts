/**
 * Exact shapes of the Sports-Classification JSON outputs (snake_case, as written
 * by the Python dataclasses' `to_telemetry()`). Nothing here is used by UI code:
 * these types exist only so the adapters are checked against the real contract.
 *
 * Sources:
 *   - core/tracking.py        TrackRecord, BallRecord, FrameTrackingResult.to_telemetry()
 *   - core/possession.py      adds possessor_tracker_id to each record
 *   - core/homography.py      project_tracks(): adds homography_ok, field_xy, field_xy_assumes_ground
 *   - core/classification.py  TeamClusteringResult.to_telemetry()  -> teams.json
 *   - analytics/engine.py     MatchTelemetry / FullMatchTelemetry   -> telemetry.json
 *   - core/events.py          EventPrediction.to_telemetry()
 */

export type RawXyxy = [number, number, number, number]
export type RawXy = [number, number]

export interface RawTrack {
  tracker_id: number
  xyxy: RawXyxy
  anchor_xy: RawXy
  confidence: number
  /** ROLE_TO_CLASS_ID: ball=0, goalkeeper=1, other=2, player=3, referee=4 */
  class_id: number
  role: string
  jersey: number | null
  /** Only in tracks_2d.jsonl, and only when the point was projectable. Metres, corner origin. */
  field_xy?: RawXy
}

export interface RawBall {
  xyxy: RawXyxy
  center_xy: RawXy
  confidence: number
  field_xy?: RawXy
  field_xy_assumes_ground?: boolean
}

/** One line of tracks.jsonl / possession.jsonl / tracks_2d.jsonl. */
export interface RawTracksRecord {
  frame_idx: number
  timestamp_s: number
  tracks: RawTrack[]
  ball: RawBall | null
  /** possession.jsonl only. */
  possessor_tracker_id?: number | null
  /** tracks_2d.jsonl only. */
  homography_ok?: boolean
}

export interface RawTeamAssignment {
  tracker_id: number
  team_cluster: number
}

export interface RawExcludedTracklet {
  tracker_id: number
  /** "never_player" | "no_valid_crops" */
  reason: string
}

/** teams.json (single object). */
export interface RawTeamsJson {
  source_video: string
  tracks_jsonl: string
  embedder: string
  embedding_dim: number
  n_clusters: number
  random_state: number
  teams: RawTeamAssignment[]
  excluded: RawExcludedTracklet[]
  n_frames_processed: number
  n_crops_embedded: number
  n_crops_skipped_degenerate: number
}

/** core/events.py EventPrediction (clip mode, one per clip). */
export interface RawEventPrediction {
  video_path: string
  /** One of 9 event classes or a `background_*` class. */
  label: string
  confidence: number
  probabilities: Record<string, number>
  is_background: boolean
}

/** analytics/engine.py EventSpan (full-match mode). */
export interface RawEventSpan {
  label: string
  start_s: number
  end_s: number
  peak_confidence: number
  mean_confidence: number
  n_windows: number
}

/** analytics/engine.py PossessionChangeAction. */
export interface RawBallAction {
  frame_idx: number
  /** -1 when no possessor could be resolved for a spotter-triggered action. */
  tracker_id: number
  label: string
  confidence: number
  probabilities: Record<string, number>
  is_background: boolean
  /** Only written by runs with the T-DEED trigger (absent in older files). */
  spot_score?: number | null
}

/** telemetry.json of `main.py --mode clip` (MatchTelemetry). */
export interface RawClipTelemetry {
  source_video: string
  event: RawEventPrediction | null
  ball_actions: RawBallAction[]
  n_frames: number
  n_possession_changes: number
}

/** telemetry.json of `main.py --mode full-match` (FullMatchTelemetry). */
export interface RawFullMatchTelemetry {
  source_video: string
  events: RawEventSpan[]
  ball_actions: RawBallAction[]
  n_frames: number
  n_possession_changes: number
}

export type RawTelemetry = RawClipTelemetry | RawFullMatchTelemetry

export function isFullMatchTelemetry(t: RawTelemetry): t is RawFullMatchTelemetry {
  return Array.isArray((t as Partial<RawFullMatchTelemetry>).events)
}
