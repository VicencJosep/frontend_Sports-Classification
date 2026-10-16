import type { Role, TeamCluster } from './vocab'

/** `[x, y]`. Pixels of the SOURCE video frame unless stated otherwise. */
export type Point = readonly [number, number]
/** `[x1, y1, x2, y2]` in source-frame pixels. */
export type Box = readonly [number, number, number, number]

/** One tracked person in one frame (`TrackRecord` in `core/tracking.py`). */
export interface PersonDetection {
  /** ByteTrack id. Persistent while the track is alive, but it churns; it is NOT a stable player identity. */
  trackerId: number
  box: Box
  /** Bottom-centre of the box: the foot point, the only point the homography projects correctly. */
  anchor: Point
  confidence: number
  role: Role
  /** Jersey number read by the detector, when available. */
  jersey: number | null
  /** Pitch coordinates in metres, corner origin, 105 x 68 pitch. Only present when `tracks_2d.jsonl` was produced. */
  fieldXy: Point | null
}

/** The ball in one frame (`BallRecord`). Not tracked: best detection per frame, often absent. */
export interface BallDetection {
  box: Box
  center: Point
  confidence: number
  /** Projected assuming the ball is on the ground; wrong while airborne. */
  fieldXy: Point | null
}

/** Everything the pipeline knows about one video frame. */
export interface TrackingFrame {
  frameIdx: number
  timestampS: number
  persons: PersonDetection[]
  ball: BallDetection | null
  /** From `possession.jsonl` (nearest player with hysteresis). null when unknown or not provided. */
  possessorTrackerId: number | null
  /** From `tracks_2d.jsonl`: whether a field homography existed for this frame. null when not provided. */
  homographyOk: boolean | null
}

/**
 * Aggregate of one tracker id over a part. It is a tracklet, not a player:
 * the same person usually receives several ids over a match.
 */
export interface Tracklet {
  trackerId: number
  teamCluster: TeamCluster | null
  /** Most frequent role seen for this id. */
  role: Role
  /** Most frequent non-null jersey number, if any was read. */
  jersey: number | null
  firstFrame: number
  lastFrame: number
  frameCount: number
}

/** Per-player statistics the pipeline does not produce yet. Always null today; rendered as a dash. */
export interface PlayerStats {
  distanceM: number | null
  avgSpeedMs: number | null
  maxSpeedMs: number | null
}

export const EMPTY_PLAYER_STATS: PlayerStats = { distanceM: null, avgSpeedMs: null, maxSpeedMs: null }
