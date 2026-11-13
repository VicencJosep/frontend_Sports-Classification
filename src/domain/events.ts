import type { BallActionLabel, EventLabel, ReviewSide, ReviewStatus, TeamCluster } from './vocab'

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
  /**
   * Goals only (`analytics/goals.py`): what confirmed it. `scoreboard` (the broadcast score changed),
   * `kickoff` (centre restart after the shot) or `tdeed` (model only, unconfirmed). null otherwise.
   */
  goalSource: string | null
  /** Score after the goal [home, away], when the scoreboard confirmed it. */
  score: readonly [number, number] | null
  /** Who made it. The pipeline never says; only the reviewed copy carries it. */
  trackerId?: number | null
  teamCluster?: TeamCluster | null
  jersey?: number | null
  /** Reviewed copy only: the team the user set, and whether the event was corrected or added by hand. */
  side?: ReviewSide | null
  review?: ReviewStatus | null
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
  /** Reviewed copy only: the team the user set, and whether the action was corrected or added by hand. */
  side?: ReviewSide | null
  review?: ReviewStatus | null
}

/** A spotted event is a span of +-1 s around the model's peak. */
const SPOT_EVENT_HALF_SPAN_S = 1

/**
 * The instant of an event: the peak of its span, `startS + 1` (or the middle of a shorter span).
 * Same rule as `scripts/evaluate_match.py::event_instants` and the backend's review export.
 */
export function eventInstantS(event: Pick<MatchEvent, 'startS' | 'endS'>): number {
  if (event.endS - event.startS >= 2 * SPOT_EVENT_HALF_SPAN_S - 1e-6) return event.startS + SPOT_EVENT_HALF_SPAN_S
  return (event.startS + event.endS) / 2
}

/** The last non-background action at or before `timeS`, no older than `windowS` (actions sorted by frame). */
export function latestActionAt(actions: readonly BallAction[], timeS: number, windowS: number): BallAction | null {
  let lo = 0
  let hi = actions.length - 1
  let last = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const a = actions[mid]
    if (a !== undefined && a.timestampS <= timeS) {
      last = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  for (let i = last; i >= 0; i -= 1) {
    const a = actions[i]
    if (a === undefined || a.timestampS < timeS - windowS) break
    if (!a.isBackground) return a
  }
  return null
}

export function eventActiveAt(event: MatchEvent, timeS: number): boolean {
  return timeS >= event.startS && timeS <= event.endS
}

/** The event whose span contains `timeS` (events sorted by startS); with overlapping spans, the one that started last. */
export function activeEventAt(events: readonly MatchEvent[], timeS: number): MatchEvent | null {
  for (let i = lastEventIndexAt(events, timeS); i >= 0; i -= 1) {
    const e = events[i]
    if (e === undefined) break
    if (timeS <= e.endS) return e
    // An earlier span can still contain timeS if it is longer, so keep walking a little.
    if (e.startS < timeS - 60) break
  }
  return null
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
