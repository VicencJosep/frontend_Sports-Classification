import type { BallAction, MatchEvent } from './events'
import type { ReviewInfo } from './review'
import type { TeamAssignments } from './teams'
import type { AnalysisMode } from './vocab'

/** Everything derived from `telemetry.json` + `teams.json` for one match part. Tracking is loaded separately (it is large). */
export interface MatchAnalysis {
  matchId: string
  partId: string
  mode: AnalysisMode
  teams: TeamAssignments
  /** Sorted by start time. */
  events: MatchEvent[]
  /** Sorted by frame. Includes `background` actions; filter with `isBackground` for display. */
  ballActions: BallAction[]
  frameCount: number
  /** Path of the source video as recorded by the pipeline, for traceability. */
  sourceVideoPath: string | null
  /**
   * State of the reviewed copy the events and actions come from. Absent or null when the data source has no
   * reviewed copies (mock fixtures, an older backend): the lists are then the raw pipeline output.
   */
  review?: ReviewInfo | null
}
