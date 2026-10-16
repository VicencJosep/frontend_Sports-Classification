import { useSyncExternalStore } from 'react'

import type { VideoClock, VideoClockSnapshot } from '@/lib/videoClock'

/** Full snapshot: re-renders on every frame while playing. Prefer the narrow hooks below. */
export function useClockSnapshot(clock: VideoClock): VideoClockSnapshot {
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot)
}

export function useClockTime(clock: VideoClock): number {
  return useSyncExternalStore(
    clock.subscribe,
    () => clock.getSnapshot().timeS,
    () => 0,
  )
}

export function useClockFrame(clock: VideoClock): number {
  return useSyncExternalStore(
    clock.subscribe,
    () => clock.getSnapshot().frameIdx,
    () => 0,
  )
}

export function useClockPlaying(clock: VideoClock): boolean {
  return useSyncExternalStore(
    clock.subscribe,
    () => clock.getSnapshot().playing,
    () => false,
  )
}

export function useClockDuration(clock: VideoClock): number {
  return useSyncExternalStore(
    clock.subscribe,
    () => clock.getSnapshot().durationS,
    () => 0,
  )
}

export function useClockRate(clock: VideoClock): number {
  return useSyncExternalStore(
    clock.subscribe,
    () => clock.getSnapshot().playbackRate,
    () => 1,
  )
}
