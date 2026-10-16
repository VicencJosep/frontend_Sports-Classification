import type { BallAction, MatchEvent } from './events'
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
}
