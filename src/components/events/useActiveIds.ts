import { useSyncExternalStore } from 'react'

import type { BallAction, MatchEvent } from '@/domain'
import { eventActiveAt } from '@/domain'
import type { VideoClock } from '@/lib/videoClock'

/** Ids of the events whose span contains the current time, as one string so the list only re-renders when the set changes. */
export function useActiveEventKey(clock: VideoClock, events: readonly MatchEvent[]): string {
  return useSyncExternalStore(
    clock.subscribe,
    () => {
      const t = clock.getSnapshot().timeS
      let key = ''
      for (const e of events) if (eventActiveAt(e, t)) key += `${e.id}|`
      return key
    },
    () => '',
  )
}

/** Id of the most recent action at or before the current frame (actions sorted by frame), or ''. */
export function useCurrentActionId(clock: VideoClock, actions: readonly BallAction[]): string {
  return useSyncExternalStore(
    clock.subscribe,
    () => {
      const frame = clock.getSnapshot().frameIdx
      let lo = 0
      let hi = actions.length - 1
      let found = ''
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const a = actions[mid]
        if (a !== undefined && a.frameIdx <= frame) {
          found = a.id
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      return found
    },
    () => '',
  )
}
