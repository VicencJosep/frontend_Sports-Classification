import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'

import { IconScissors } from '@/components/common'
import type { MatchEvent } from '@/domain'
import { activeEventAt, eventColor, labelDisplayName } from '@/domain'
import type { VideoClock } from '@/lib/videoClock'
import { formatClock } from '@/utils/time'

import { cardLayout } from './overlay/renderOverlay'
import s from './video.module.css'

interface EventCardHitAreaProps {
  clock: VideoClock
  events: readonly MatchEvent[]
  fps: number
  /** False while the cards layer is off: nothing to click on. */
  enabled: boolean
  onPick: (event: MatchEvent) => void
}

/**
 * Invisible button laid exactly over the event card the canvas draws top-left,
 * so the card can be clicked to cut a clip. Same geometry as the renderer
 * (`cardLayout`) and the same active-event rule, so it only exists while a card is shown.
 */
export function EventCardHitArea({ clock, events, fps, enabled, onPick }: EventCardHitAreaProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setWidth((prev) => (prev === w ? prev : w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const activeId = useSyncExternalStore(
    clock.subscribe,
    () => (enabled && fps > 0 ? (activeEventAt(events, clock.getSnapshot().frameIdx / fps)?.id ?? '') : ''),
    () => '',
  )
  const event = activeId ? (events.find((e) => e.id === activeId) ?? null) : null
  const layout = cardLayout(width)

  return (
    <div ref={ref} className={s.uiLayer}>
      {event && width > 0 && (
        <button
          type="button"
          className={s.cardHit}
          style={{ left: layout.margin, top: layout.margin, width: layout.cardW, height: layout.cardH, '--card-color': eventColor(event.label) } as CSSProperties}
          title={`Cut a clip from this ${labelDisplayName(event.label).toLowerCase()} (pauses the video)`}
          aria-label={`Create a clip from the ${labelDisplayName(event.label)} at ${formatClock(event.seekS)}`}
          onClick={() => onPick(event)}
        >
          <span className={s.cardHint}>
            <IconScissors size={11} />
            Clip
          </span>
        </button>
      )}
    </div>
  )
}
