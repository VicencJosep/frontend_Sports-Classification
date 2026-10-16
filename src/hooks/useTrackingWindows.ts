import { useEffect, useRef, useState } from 'react'

import type { TeamAssignments, TrackingFrame } from '@/domain'
import { TrackingStore } from '@/lib/trackingStore'
import type { VideoClock } from '@/lib/videoClock'
import type { TrackingRange } from '@/services'

/** Seconds of tracking fetched per request; below the backend's 120 s limit. */
export const TRACKING_CHUNK_S = 30
/** Chunks are requested ahead of the playhead so playback never waits for data. */
const PREFETCH_CHUNKS = 1

export type TrackingLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface TrackingWindows {
  store: TrackingStore
  /** Increments whenever the store gains frames (the store is mutated in place). */
  revision: number
  status: TrackingLoadStatus
  error: unknown
  /** Loaded chunks over the chunks the video spans. */
  progress: { loaded: number; total: number }
  retry: () => void
}

interface ChunkState {
  state: 'loading' | 'done' | 'error'
}

/**
 * Loads tracking by time windows around the playhead instead of all at once:
 * a full match has ~145k frames, far too many for one request or one parse.
 * The store is shared and mutated in place; consumers re-render via `revision`.
 */
export function useTrackingWindows(
  load: (range: TrackingRange) => Promise<TrackingFrame[]>,
  clock: VideoClock,
  durationS: number,
  frameCount: number,
  teams: TeamAssignments,
): TrackingWindows {
  const [store] = useState(() => new TrackingStore([], { frameCount, teams }))
  const [revision, setRevision] = useState(0)
  const [status, setStatus] = useState<TrackingLoadStatus>('idle')
  const [error, setError] = useState<unknown>(null)
  const [loadedChunks, setLoadedChunks] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const chunksRef = useRef(new Map<number, ChunkState>())

  const totalChunks = Math.max(1, Math.ceil(durationS / TRACKING_CHUNK_S))

  useEffect(() => {
    store.setTeams(teams)
  }, [store, teams])

  useEffect(() => {
    let cancelled = false
    const chunks = chunksRef.current
    for (const [k, c] of chunks) if (c.state === 'error') chunks.delete(k)

    const ensure = (chunk: number) => {
      if (chunk < 0 || chunk >= totalChunks || chunks.has(chunk)) return
      chunks.set(chunk, { state: 'loading' })
      setStatus('loading')
      const fromS = chunk * TRACKING_CHUNK_S
      const toS = Math.min(durationS, (chunk + 1) * TRACKING_CHUNK_S)
      load({ fromS, toS }).then(
        (frames) => {
          if (cancelled) return
          store.addFrames(frames)
          chunks.set(chunk, { state: 'done' })
          setLoadedChunks([...chunks.values()].filter((c) => c.state === 'done').length)
          setRevision((r) => r + 1)
          if (![...chunks.values()].some((c) => c.state === 'loading')) setStatus('ready')
        },
        (err: unknown) => {
          if (cancelled) return
          chunks.set(chunk, { state: 'error' })
          setError(err)
          setStatus('error')
        },
      )
    }

    const check = () => {
      const chunk = Math.floor(clock.getSnapshot().timeS / TRACKING_CHUNK_S)
      for (let i = 0; i <= PREFETCH_CHUNKS; i += 1) ensure(chunk + i)
    }
    check()
    const unsubscribe = clock.subscribe(check)
    return () => {
      cancelled = true
      unsubscribe()
      // Requests still in flight belong to this effect run and will be ignored: forget them so a
      // remount (StrictMode, or a changed `load`) asks for those chunks again.
      for (const [k, c] of chunks) if (c.state === 'loading') chunks.delete(k)
    }
  }, [load, clock, durationS, totalChunks, store, attempt])

  return {
    store,
    revision,
    status,
    error,
    progress: { loaded: loadedChunks, total: totalChunks },
    retry: () => {
      setError(null)
      setAttempt((a) => a + 1)
    },
  }
}
