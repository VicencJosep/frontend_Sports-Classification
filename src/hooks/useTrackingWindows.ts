import { useEffect, useRef, useState } from 'react'

import type { TeamAssignments, TrackingFrame } from '@/domain'
import { TrackingStore } from '@/lib/trackingStore'
import type { VideoClock } from '@/lib/videoClock'
import type { TrackingRange } from '@/services'

/**
 * Seconds of tracking fetched per request. Small on purpose: reviewing jumps around the match, and after each jump
 * only the seconds around the playhead matter. 10 s is ~50-100 KB compressed; 30 s was three times that per jump,
 * which is what an SSH tunnel feels.
 */
export const TRACKING_CHUNK_S = 10
/** Chunks are requested ahead of the playhead so playback never waits for data. */
const PREFETCH_CHUNKS = 1
/** A failed chunk is asked for again by itself: after 1 s, 2 s, 4 s... up to this. */
const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 15000
/** Consecutive failures of one chunk before the viewer is told tracking is unavailable (it keeps retrying). */
const FAILURES_BEFORE_ERROR = 3

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
  /** Consecutive failed requests of this chunk. */
  failures: number
}

/** What the viewer shows for a set of chunks: unavailable only after repeated failures, loading while anything is pending. */
export function trackingStatus(chunks: Iterable<ChunkState>): TrackingLoadStatus {
  let pending = false
  let done = false
  for (const c of chunks) {
    if (c.state !== 'done' && c.failures >= FAILURES_BEFORE_ERROR) return 'error'
    if (c.state === 'done') done = true
    else pending = true
  }
  return pending ? 'loading' : done ? 'ready' : 'idle'
}

/** Wait before asking again for a chunk that failed `failures` times in a row. */
export function retryDelayMs(failures: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, failures - 1))
}

/**
 * Loads tracking by time windows around the playhead instead of all at once:
 * a full match has ~145k frames, far too many for one request or one parse.
 * The store is shared and mutated in place; consumers re-render via `revision`.
 *
 * A request that fails (a backend restart, a hiccup of the tunnel) is repeated
 * by itself with a growing delay while the playhead still needs that window;
 * `status` only becomes `error` after several failures in a row, and goes back
 * to `ready` as soon as one attempt succeeds.
 */
export function useTrackingWindows(
  load: (range: TrackingRange) => Promise<TrackingFrame[]>,
  clock: VideoClock,
  durationS: number,
  frameCount: number,
  teams: TeamAssignments,
  /** False while nothing on screen needs tracking: no requests are made (what is loaded stays). */
  enabled = true,
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
    // Failed chunks are forgotten on every run (a manual retry, the layers coming back on): they start clean.
    for (const [k, c] of chunks) if (c.state === 'error') chunks.delete(k)
    if (!enabled) {
      // A full match of tracking is hundreds of MB: only fetch while a layer (or a selected player) uses it.
      setStatus(trackingStatus(chunks.values()))
      return
    }
    const timers = new Set<number>()

    const request = (chunk: number, failures: number) => {
      chunks.set(chunk, { state: 'loading', failures })
      setStatus(trackingStatus(chunks.values()))
      const fromS = chunk * TRACKING_CHUNK_S
      const toS = Math.min(durationS, (chunk + 1) * TRACKING_CHUNK_S)
      load({ fromS, toS }).then(
        (frames) => {
          if (cancelled) return
          store.addFrames(frames)
          chunks.set(chunk, { state: 'done', failures: 0 })
          setLoadedChunks([...chunks.values()].filter((c) => c.state === 'done').length)
          setRevision((r) => r + 1)
          const next = trackingStatus(chunks.values())
          if (next !== 'error') setError(null)
          setStatus(next)
        },
        (err: unknown) => {
          if (cancelled) return
          const failed = failures + 1
          chunks.set(chunk, { state: 'error', failures: failed })
          if (failed >= FAILURES_BEFORE_ERROR) setError(err)
          setStatus(trackingStatus(chunks.values()))
          // Try again by itself, but only if the playhead still needs this window by then.
          const timer = window.setTimeout(() => {
            timers.delete(timer)
            if (cancelled || chunks.get(chunk)?.state !== 'error') return
            if (wanted().includes(chunk)) request(chunk, failed)
            else {
              chunks.delete(chunk)
              const next = trackingStatus(chunks.values())
              if (next !== 'error') setError(null)
              setStatus(next)
            }
          }, retryDelayMs(failed))
          timers.add(timer)
        },
      )
    }

    /** Chunks the playhead needs now: the one it is in and the next ones. */
    const wanted = (): number[] => {
      const first = Math.floor(clock.getSnapshot().timeS / TRACKING_CHUNK_S)
      const list: number[] = []
      for (let i = 0; i <= PREFETCH_CHUNKS; i += 1) if (first + i >= 0 && first + i < totalChunks) list.push(first + i)
      return list
    }

    const check = () => {
      for (const chunk of wanted()) if (!chunks.has(chunk)) request(chunk, 0)
    }
    check()
    const unsubscribe = clock.subscribe(check)
    return () => {
      cancelled = true
      unsubscribe()
      for (const timer of timers) window.clearTimeout(timer)
      // Requests still in flight belong to this effect run and will be ignored: forget them so a
      // remount (StrictMode, or a changed `load`) asks for those chunks again.
      for (const [k, c] of chunks) if (c.state === 'loading') chunks.delete(k)
    }
  }, [load, clock, durationS, totalChunks, store, attempt, enabled])

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
