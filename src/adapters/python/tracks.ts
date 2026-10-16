import type { BallDetection, PersonDetection, Point, TrackingFrame } from '@/domain'
import { isRole } from '@/domain'

import { assertTracksRecord } from './guards'
import type { RawBall, RawTrack, RawTracksRecord } from './raw'

/** Parses a JSONL text (one tracking record per line). Blank lines are skipped. */
export function parseTracksJsonl(text: string, path = 'tracks.jsonl'): RawTracksRecord[] {
  const records: RawTracksRecord[] = []
  let lineNo = 0
  for (const line of text.split('\n')) {
    lineNo += 1
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const parsed: unknown = JSON.parse(trimmed)
    assertTracksRecord(parsed, `${path}:${lineNo}`)
    records.push(parsed)
  }
  return records
}

function toPoint(xy: readonly [number, number] | undefined): Point | null {
  return xy === undefined ? null : [xy[0], xy[1]]
}

export function toPersonDetection(raw: RawTrack): PersonDetection {
  return {
    trackerId: raw.tracker_id,
    box: [raw.xyxy[0], raw.xyxy[1], raw.xyxy[2], raw.xyxy[3]],
    anchor: [raw.anchor_xy[0], raw.anchor_xy[1]],
    confidence: raw.confidence,
    role: isRole(raw.role) ? raw.role : 'other',
    jersey: typeof raw.jersey === 'number' ? raw.jersey : null,
    fieldXy: toPoint(raw.field_xy),
  }
}

export function toBallDetection(raw: RawBall): BallDetection {
  return {
    box: [raw.xyxy[0], raw.xyxy[1], raw.xyxy[2], raw.xyxy[3]],
    center: [raw.center_xy[0], raw.center_xy[1]],
    confidence: raw.confidence,
    fieldXy: toPoint(raw.field_xy),
  }
}

export function toTrackingFrame(raw: RawTracksRecord): TrackingFrame {
  return {
    frameIdx: raw.frame_idx,
    timestampS: raw.timestamp_s,
    persons: raw.tracks.map(toPersonDetection),
    ball: raw.ball ? toBallDetection(raw.ball) : null,
    possessorTrackerId: typeof raw.possessor_tracker_id === 'number' ? raw.possessor_tracker_id : null,
    homographyOk: typeof raw.homography_ok === 'boolean' ? raw.homography_ok : null,
  }
}

/** Converts and sorts by frame index. */
export function toTrackingFrames(raws: readonly RawTracksRecord[]): TrackingFrame[] {
  return raws.map(toTrackingFrame).sort((a, b) => a.frameIdx - b.frameIdx)
}
