import { useCallback, useEffect, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: null; error: unknown }

interface Settled<T> {
  load: () => Promise<T>
  tick: number
  state: AsyncState<T>
}

const LOADING: AsyncState<never> = { status: 'loading', data: null, error: null }

/**
 * Runs `load` whenever its identity changes (memoise it with useCallback) and
 * exposes the result. Loading state is derived, not set in the effect, so a
 * change of `load` shows "loading" synchronously and stale results are never
 * attributed to a new request.
 */
export function useAsync<T>(load: () => Promise<T>): AsyncState<T> & { reload: () => void; refresh: () => void } {
  const [tick, setTick] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => {
        if (!cancelled) setSettled({ load, tick, state: { status: 'success', data, error: null } })
      },
      (error: unknown) => {
        if (!cancelled) setSettled({ load, tick, state: { status: 'error', data: null, error } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [load, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  /** Re-runs `load` keeping the current result visible until the new one arrives (polling). */
  const refresh = useCallback(() => {
    load().then(
      (data) => setSettled({ load, tick, state: { status: 'success', data, error: null } }),
      (error: unknown) => setSettled({ load, tick, state: { status: 'error', data: null, error } }),
    )
  }, [load, tick])
  const state: AsyncState<T> = settled && settled.load === load && settled.tick === tick ? settled.state : LOADING
  return { ...state, reload, refresh }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Something went wrong.'
}
