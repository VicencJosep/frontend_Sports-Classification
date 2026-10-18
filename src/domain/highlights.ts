import type { AnalysisStatus } from './vocab'

/** What the match record says about a part's highlights (`MatchPart.highlights`). */
export interface HighlightsSummary {
  status: AnalysisStatus
  /** Generator stage while `processing` (signals, vlm 3/10, cut 2/5, ...). */
  stage: string | null
  nClips: number
  error: string | null
}

/** Kind of play a clip shows. Widened like the other label vocabularies. */
export type HighlightLabel = 'goal' | 'shot' | 'play' | (string & Record<never, never>)

export interface HighlightClip {
  id: string
  rank: number
  label: HighlightLabel
  title: string
  description: string
  /** Boundaries inside the part's video (seconds). */
  startS: number
  endS: number
  durationS: number
  /** Key moment (shot / goal) inside the part's video. */
  anchorS: number
  teamCluster: number | null
  finalScore: number
  vlmRank: number | null
  /** Absolute URL of the cut clip (MP4), null when it was not cut. */
  contentUrl: string | null
}

/** Highlights of one part: generation status plus the clips once completed. */
export interface PartHighlights {
  matchId: string
  partId: string
  status: AnalysisStatus
  stage: string | null
  error: string | null
  generatedAt: string | null
  vlmModel: string | null
  nCandidates: number
  clips: HighlightClip[]
}
