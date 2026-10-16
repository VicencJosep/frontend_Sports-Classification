import type { CreateMatchInput, Match, MatchAnalysis, TrackingFrame } from '@/domain'

export interface TrackingRange {
  fromS: number
  toS: number
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
  startAnalysis(matchId: string): Promise<Match>
  /** Events, ball actions and team clusters of one part (small). */
  getPartAnalysis(matchId: string, partId: string): Promise<MatchAnalysis>
  /** Per-frame tracking of one part (large). `range` lets a backend serve a window; the mock returns everything. */
  getPartTracking(matchId: string, partId: string, range?: TrackingRange): Promise<TrackingFrame[]>
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
