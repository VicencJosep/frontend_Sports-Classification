import { useCallback, useEffect, useRef } from 'react'

/**
 * A function whose identity never changes but that always runs the latest `fn`.
 * For callbacks handed to memoised children (the event and ball-action lists):
 * a new function on every render of the viewer would re-render the whole list.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn)
  useEffect(() => {
    latest.current = fn
  })
  return useCallback((...args: A) => latest.current(...args), [])
}
