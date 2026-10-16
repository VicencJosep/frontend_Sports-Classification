import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

import type { MatchEvent } from '@/domain'
import { eventColor, labelDisplayName } from '@/domain'
import { useClockTime } from '@/hooks/useVideoClock'
import { cx } from '@/utils/cx'
import type { VideoClock } from '@/lib/videoClock'
import { formatClock } from '@/utils/time'

import s from './video.module.css'

interface TimelineProps {
  clock: VideoClock
  durationS: number
  events: readonly MatchEvent[]
  onSelectEvent?: (event: MatchEvent) => void
}

/** Seekable progress bar with event markers (dot at the seek point, thin bar for the span). */
export function Timeline({ clock, durationS, events, onSelectEvent }: TimelineProps) {
  const timeS = useClockTime(clock)
  const trackRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const dragging = useRef(false)

  const pct = (t: number) => (durationS > 0 ? `${(Math.min(Math.max(t, 0), durationS) / durationS) * 100}%` : '0%')

  const timeAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return fraction * durationS
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    clock.seek(timeAt(e.clientX))
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    setHover(timeAt(e.clientX))
    if (dragging.current) clock.seek(timeAt(e.clientX))
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 1
    if (e.key === 'ArrowLeft') clock.seek(timeS - step)
    else if (e.key === 'ArrowRight') clock.seek(timeS + step)
    else if (e.key === 'Home') clock.seek(0)
    else if (e.key === 'End') clock.seek(durationS)
    else return
    e.preventDefault()
  }

  return (
    <div
      className={s.timeline}
      role="slider"
      tabIndex={0}
      aria-label="Match timeline"
      aria-valuemin={0}
      aria-valuemax={Math.round(durationS)}
      aria-valuenow={Math.round(timeS)}
      aria-valuetext={formatClock(timeS)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
    >
      <div ref={trackRef} className={s.track}>
        <div className={s.progress} style={{ width: pct(timeS) }} />
        {events.map((event) => (
          <span
            key={`${event.id}-span`}
            className={s.span}
            style={{ left: pct(event.startS), width: `calc(${pct(event.endS)} - ${pct(event.startS)})`, background: eventColor(event.label) }}
            aria-hidden="true"
          />
        ))}
        {events.map((event) => (
          <button
            key={event.id}
            type="button"
            className={cx(s.marker, (event.label === 'goal' || event.label === 'shot' || event.label === 'penalty') && s.markerKey)}
            style={{ left: pct(event.seekS), '--marker-color': eventColor(event.label) } as CSSProperties}
            title={`${formatClock(event.seekS)} · ${labelDisplayName(event.label)}`}
            aria-label={`${labelDisplayName(event.label)} at ${formatClock(event.seekS)}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              clock.seek(event.seekS)
              onSelectEvent?.(event)
            }}
          />
        ))}
        <div className={s.playhead} style={{ left: pct(timeS) }} />
        {hover !== null && (
          <span className={s.hoverTip} style={{ left: pct(hover) }}>
            {formatClock(hover)}
          </span>
        )}
      </div>
    </div>
  )
}
