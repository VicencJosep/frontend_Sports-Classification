import type { CreateMatchInput, Match, MatchAnalysis, PartHighlights, ReviewAddInput, ReviewPatch, ReviewResult, ReviewSheet, TrackingFrame } from '@/domain'

export interface TrackingRange {
  fromS: number
  toS: number
}

export interface StartAnalysisOptions {
  /** Chain the best-plays generation after the analysis of each part. */
  highlights?: boolean
}

/**
 * Corrections to the detected events and ball actions of one part. They are saved by the backend in a reviewed
 * copy of the analysis (created by the first correction); the pipeline output is never modified.
 */
export interface ReviewService {
  /** Changes the label, instant, player and/or team of an item (`itemId` is the event's or the action's id). */
  updateItem(matchId: string, partId: string, itemId: string, patch: ReviewPatch): Promise<ReviewResult>
  /** Adds a ball action or event the pipeline missed. */
  addItem(matchId: string, partId: string, input: ReviewAddInput): Promise<ReviewResult>
  /** Removes a false detection from the reviewed copy (undo with `restoreItem`). */
  deleteItem(matchId: string, partId: string, itemId: string): Promise<ReviewResult>
  restoreItem(matchId: string, partId: string, itemId: string): Promise<ReviewResult>
  /** Ground-truth sheet of a time range of the reviewed copy (`toS` null = to the end). */
  exportSheet(matchId: string, partId: string, fromS: number, toS: number | null): Promise<ReviewSheet>
}

/**
 * The only door between UI and data. Implemented by the mock service today
 * (fixtures copied from real pipeline outputs) and by an API service once the
 * FastAPI backend exists. UI code never sees raw Python JSON.
 */
export interface MatchService {
  listMatches(): Promise<Match[]>
  getMatch(matchId: string): Promise<Match>
  /** Registers a new match from uploaded video(s) and starts its analysis. `onProgress` receives 0..1. */
  createMatch(input: CreateMatchInput, onProgress?: (fraction: number) => void): Promise<Match>
  /** (Re)starts the analysis of every part that is not completed; the GPU is shared, so retries are routine. */
  startAnalysis(matchId: string, options?: StartAnalysisOptions): Promise<Match>
  /** Events, ball actions and team clusters of one part (small): the reviewed copy when the user corrected something. */
  getPartAnalysis(matchId: string, partId: string): Promise<MatchAnalysis>
  /** Saving corrections; null when the data source cannot (the mock fixtures are read-only). */
  readonly review: ReviewService | null
  /** Per-frame tracking of one part (large). `range` lets a backend serve a window; the mock returns everything. */
  getPartTracking(matchId: string, partId: string, range?: TrackingRange): Promise<TrackingFrame[]>
  /** Best plays of one analysed part: generation status and, once completed, the clips. Rejects with `not-found` if never generated. */
  getPartHighlights(matchId: string, partId: string): Promise<PartHighlights>
  /** Queues the best-plays generation of an analysed part (`force` ignores the cached signals and model verdicts). */
  generateHighlights(matchId: string, partId: string, force?: boolean): Promise<PartHighlights>
}

export type ServiceErrorCode = 'not-found' | 'unavailable' | 'invalid-data' | 'not-implemented'

export class ServiceError extends Error {
  readonly code: ServiceErrorCode

  constructor(code: ServiceErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ServiceError'
    this.code = code
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError
}
