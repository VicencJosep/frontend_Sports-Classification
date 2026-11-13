import { useRef, useState, type MouseEvent } from 'react'

import type { PersonDetection } from '@/domain'
import type { TrackingStore } from '@/lib/trackingStore'
import type { VideoClock } from '@/lib/videoClock'
import { cx } from '@/utils/cx'

import { fitContain, personAt, toSource } from './overlay/geometry'
import s from './video.module.css'

interface PlayerPickLayerProps {
  clock: VideoClock
  /** Tracking loaded around the playhead; null while it is not there yet (nothing can be picked). */
  store: TrackingStore | null
  /** Source frame size the tracking boxes refer to. */
  sourceWidth: number
  sourceHeight: number
  onPick: (person: PersonDetection) => void
}

/** Slack around a player's box, in screen pixels: far players are only a few pixels wide. */
const PICK_MARGIN_PX = 8

/**
 * Click layer over the video while the clip editor is open: clicking a tracked
 * player picks them as the player of the play; clicking anywhere else still
 * toggles play/pause, like the video itself.
 */
export function PlayerPickLayer({ clock, store, sourceWidth, sourceHeight, onPick }: PlayerPickLayerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [overPlayer, setOverPlayer] = useState(false)

  const personUnder = (e: MouseEvent<HTMLDivElement>): PersonDetection | null => {
    const el = ref.current
    if (!el || !store) return null
    const rect = el.getBoundingClientRect()
    const transform = fitContain(sourceWidth, sourceHeight, rect.width, rect.height)
    const frame = store.getFrameOrPrevious(clock.getSnapshot().frameIdx)
    if (!frame) return null
    const [x, y] = toSource(transform, e.clientX - rect.left, e.clientY - rect.top)
    return personAt(frame.persons, x, y, PICK_MARGIN_PX / transform.scale)
  }

  return (
    <div
      ref={ref}
      className={cx(s.pickLayer, overPlayer && s.pickLayerOver)}
      title={overPlayer ? 'Pick this player' : undefined}
      onMouseMove={(e) => {
        const over = personUnder(e) !== null
        setOverPlayer((prev) => (prev === over ? prev : over))
      }}
      onMouseLeave={() => setOverPlayer(false)}
      onClick={(e) => {
        const person = personUnder(e)
        if (person) onPick(person)
        else clock.toggle()
      }}
      aria-hidden="true"
    />
  )
}
