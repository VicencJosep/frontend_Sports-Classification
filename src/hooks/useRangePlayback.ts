import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { RangePlayback, type PlayRange } from '@/lib/rangePlayback'
import type { VideoClock } from '@/lib/videoClock'

const NONE = (): PlayRange | null => null

/** One range player per clock; `active` is the range being played (null when the user is in control). */
export function useRangePlayback(clock: VideoClock): { controller: RangePlayback; active: PlayRange | null } {
  const controller = useMemo(() => new RangePlayback(clock), [clock])
  useEffect(() => () => controller.stop(), [controller])
  const active = useSyncExternalStore(controller.subscribe, controller.getSnapshot, NONE)
  return { controller, active }
}
