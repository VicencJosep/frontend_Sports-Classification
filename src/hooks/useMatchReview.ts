import { useCallback, useState } from 'react'

import type { MatchAnalysis, ReviewAddInput, ReviewInfo, ReviewPatch, ReviewResult, ReviewSheet } from '@/domain'
import { applyReviewResult } from '@/domain'
import type { ReviewService } from '@/services'

import { errorMessage } from './useAsync'

export interface MatchReviewApi {
  /** The loaded analysis with the corrections of this session applied; null while loading. */
  analysis: MatchAnalysis | null
  /** True when corrections can be saved: the data source has a review service and served the reviewed copy. */
  supported: boolean
  info: ReviewInfo | null
  /** A correction is being saved. */
  busy: boolean
  /** Message of the last failed correction, until the next one or `clearError`. */
  error: string | null
  clearError: () => void
  /** Each resolves with the stored result, or null when the request failed (see `error`). */
  updateItem: (itemId: string, patch: ReviewPatch) => Promise<ReviewResult | null>
  addItem: (input: ReviewAddInput) => Promise<ReviewResult | null>
  deleteItem: (itemId: string) => Promise<ReviewResult | null>
  restoreItem: (itemId: string) => Promise<ReviewResult | null>
  exportSheet: (fromS: number, toS: number | null) => Promise<ReviewSheet | null>
}

/**
 * The reviewed copy of one part's analysis, as the viewer edits it: every
 * correction is saved by the backend first and then applied to the local
 * lists, so what is on screen is always what the copy on disk holds.
 * `loaded` is the analysis as fetched; a reload replaces the local state.
 */
export function useMatchReview(service: ReviewService | null, matchId: string, partId: string, loaded: MatchAnalysis | null): MatchReviewApi {
  const [local, setLocal] = useState<{ base: MatchAnalysis; current: MatchAnalysis } | null>(null)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const analysis = loaded && local?.base === loaded ? local.current : loaded
  const supported = service !== null && analysis?.review != null

  const run = useCallback(
    async <T>(request: (svc: ReviewService) => Promise<T>, onDone?: (value: T) => void): Promise<T | null> => {
      if (!service) return null
      setPending((n) => n + 1)
      setError(null)
      try {
        const value = await request(service)
        onDone?.(value)
        return value
      } catch (e) {
        setError(errorMessage(e))
        return null
      } finally {
        setPending((n) => n - 1)
      }
    },
    [service],
  )

  const apply = useCallback(
    (result: ReviewResult) => {
      if (!loaded) return
      setLocal((prev) => ({ base: loaded, current: applyReviewResult(prev?.base === loaded ? prev.current : loaded, result) }))
    },
    [loaded],
  )

  const updateItem = useCallback((itemId: string, patch: ReviewPatch) => run((svc) => svc.updateItem(matchId, partId, itemId, patch), apply), [run, apply, matchId, partId])
  const addItem = useCallback((input: ReviewAddInput) => run((svc) => svc.addItem(matchId, partId, input), apply), [run, apply, matchId, partId])
  const deleteItem = useCallback((itemId: string) => run((svc) => svc.deleteItem(matchId, partId, itemId), apply), [run, apply, matchId, partId])
  const restoreItem = useCallback((itemId: string) => run((svc) => svc.restoreItem(matchId, partId, itemId), apply), [run, apply, matchId, partId])
  const exportSheet = useCallback((fromS: number, toS: number | null) => run((svc) => svc.exportSheet(matchId, partId, fromS, toS)), [run, matchId, partId])
  const clearError = useCallback(() => setError(null), [])

  return { analysis, supported, info: analysis?.review ?? null, busy: pending > 0, error, clearError, updateItem, addItem, deleteItem, restoreItem, exportSheet }
}
