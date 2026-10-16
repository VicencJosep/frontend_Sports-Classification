import type { BallActionLabel, EventLabel, TeamCluster } from './vocab'

/**
 * A match event. The pipeline emits SPANS (`EventSpan` in `analytics/engine.py`):
 * a window classifier merges contiguous windows, and T-DEED shot/goal peaks are
 * widened to +-1 s. There is no id, team or player on the Python side; the id is
 * synthesised by the adapter.
 */
export interface MatchEvent {
  id: string
  label: EventLabel
  startS: number
  endS: number
  /** Where the viewer seeks when the event is clicked (span start, like the Python renderer). */
  seekS: number
  peakConfidence: number
  meanConfidence: number
  /** Number of classifier windows merged into the span (1 for T-DEED peaks). */
  nWindows: number
}

/**
 * A ball action attributed to a player (`PossessionChangeAction`). The player is
 * the ball possessor at that frame (`core/possession.py`), the label comes from
 * R3D-18 and/or T-DEED.
 */
export interface BallAction {
  id: string
  frameIdx: number
  timestampS: number
  /** null when the pipeline could not resolve a possessor (it writes -1). */
  trackerId: number | null
  teamCluster: TeamCluster | null
  /** Majority jersey number read for that tracklet, when the detector read one (backend only). */
  jersey: number | null
  label: BallActionLabel
  confidence: number
  probabilities: Readonly<Record<string, number>>
  isBackground: boolean
  /** T-DEED peak score when the action was triggered by the spotter; null for possession-change triggers. */
  spotScore: number | null
}

export function eventActiveAt(event: MatchEvent, timeS: number): boolean {
  return timeS >= event.startS && timeS <= event.endS
}

/** Index of the last event whose span start is <= timeS (events sorted by startS), or -1. */
export function lastEventIndexAt(events: readonly MatchEvent[], timeS: number): number {
  let lo = 0
  let hi = events.length - 1
  let result = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const e = events[mid]
    if (e !== undefined && e.startS <= timeS) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}
