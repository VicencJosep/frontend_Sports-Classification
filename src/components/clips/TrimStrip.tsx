import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

import type { MatchEvent, VideoInfo } from '@/domain'
import { eventColor, labelDisplayName } from '@/domain'
import { useClockTime } from '@/hooks/useVideoClock'
import type { VideoClock } from '@/lib/videoClock'
import { cx } from '@/utils/cx'
import { formatClock, formatClockTenths } from '@/utils/time'

import { Filmstrip } from './Filmstrip'
import { FILM_HEIGHT, rulerTicks } from './trimMath'
import s from './clips.module.css'

export interface TimeView {
  fromS: number
  toS: number
}

export type TrimEdge = 'start' | 'end' | 'move'

interface TrimStripProps {
  clock: VideoClock
  video: VideoInfo
  startS: number
  endS: number
  /** Key moment of the clip (the detected event), drawn as a dashed line. */
  anchorS: number
  view: TimeView
  /** Other detected events, drawn as ticks for orientation. */
  events: readonly MatchEvent[]
  /** Colour of the clip's label: selection frame and anchor. */
  color: string
  /** Raw boundaries from the pointer; the owner clamps and snaps them. */
  onChange: (next: { startS: number; endS: number }, edge: TrimEdge) => void
  onViewChange: (view: TimeView) => void
  onSeek: (timeS: number) => void
}

interface Drag {
  kind: TrimEdge | 'scrub'
  pointerId: number
  originT: number
  originStart: number
  originEnd: number
}

/**
 * The trim bar of the clip editor: filmstrip of the view window, the selected
 * range with two draggable handles (drag the middle to move the whole clip),
 * the detected event as an anchor, the other events as ticks and the playhead.
 * Clicking the film seeks the main player.
 */
export function TrimStrip({ clock, video, startS, endS, anchorS, view, events, color, onChange, onViewChange, onSeek }: TrimStripProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<Drag | null>(null)
  const timeS = useClockTime(clock)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setWidth((prev) => (prev === w ? prev : w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const span = Math.max(0.001, view.toS - view.fromS)
  const xOf = (t: number) => ((t - view.fromS) / span) * width
  const tAt = (clientX: number) => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return view.fromS
    return view.fromS + ((clientX - rect.left) / rect.width) * span
  }
  const inView = (t: number) => t >= view.fromS && t <= view.toS

  const extendViewTo = (t: number) => {
    if (t < view.fromS) onViewChange({ fromS: Math.max(0, t - span * 0.1), toS: view.toS })
    else if (t > view.toS) onViewChange({ fromS: view.fromS, toS: Math.min(video.durationS, t + span * 0.1) })
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const grip = (e.target as HTMLElement).closest<HTMLElement>('[data-grip]')?.dataset.grip
    const kind: Drag['kind'] = grip === 'start' || grip === 'end' || grip === 'move' ? grip : 'scrub'
    const t = tAt(e.clientX)
    drag.current = { kind, pointerId: e.pointerId, originT: t, originStart: startS, originEnd: endS }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (kind === 'scrub') onSeek(t)
    else if (kind === 'start') onSeek(startS)
    else if (kind === 'end') onSeek(endS)
    e.preventDefault()
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const t = tAt(e.clientX)
    setHover(t)
    const d = drag.current
    if (!d) return
    switch (d.kind) {
      case 'scrub':
        onSeek(Math.min(Math.max(0, t), video.durationS))
        break
      case 'start':
        onChange({ startS: t, endS: d.originEnd }, 'start')
        onSeek(Math.min(Math.max(0, t), video.durationS))
        extendViewTo(t)
        break
      case 'end':
        onChange({ startS: d.originStart, endS: t }, 'end')
        onSeek(Math.min(Math.max(0, t), video.durationS))
        extendViewTo(t)
        break
      case 'move': {
        const delta = t - d.originT
        onChange({ startS: d.originStart + delta, endS: d.originEnd + delta }, 'move')
        break
      }
    }
  }

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === e.pointerId) {
      drag.current = null
      setDragging(false)
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const onHandleKey = (edge: 'start' | 'end') => (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 1 : 1 / video.fps
    const delta = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : null
    if (delta === null) return
    e.preventDefault()
    e.stopPropagation()
    const next = edge === 'start' ? { startS: startS + delta, endS } : { startS, endS: endS + delta }
    onChange(next, edge)
    onSeek(edge === 'start' ? next.startS : next.endS)
  }

  const ticks = rulerTicks(view.fromS, view.toS)

  const left = xOf(startS)
  const right = xOf(endS)

  return (
    <div
      ref={rootRef}
      className={s.strip}
      style={{ '--clip-color': color } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => setHover(null)}
    >
      <Filmstrip src={video.url} fromS={view.fromS} toS={view.toS} width={width} height={FILM_HEIGHT} />

      {width > 0 && (
        <>
          <div className={s.shade} style={{ left: 0, width: Math.max(0, left) }} />
          <div className={s.shade} style={{ left: Math.min(width, right), right: 0 }} />

          {events.map((event) =>
            inView(event.seekS) ? (
              <span
                key={event.id}
                className={s.eventTick}
                style={{ left: xOf(event.seekS), background: eventColor(event.label) }}
                title={`${labelDisplayName(event.label)} · ${formatClock(event.seekS)}`}
              />
            ) : null,
          )}

          {inView(anchorS) && <span className={s.anchor} style={{ left: xOf(anchorS) }} title={`Detected at ${formatClockTenths(anchorS)}`} />}

          <div className={s.selection} style={{ left, width: Math.max(0, right - left) }} data-grip="move" title="Drag to move the clip" />

          <div
            className={cx(s.grip, s.gripStart)}
            style={{ left }}
            data-grip="start"
            role="slider"
            tabIndex={0}
            aria-label="Clip start"
            aria-valuemin={0}
            aria-valuemax={Math.round(video.durationS)}
            aria-valuenow={Math.round(startS)}
            aria-valuetext={formatClockTenths(startS)}
            title="Drag to set the start (arrows: 1 frame, shift: 1 s)"
            onKeyDown={onHandleKey('start')}
          >
            <span className={s.gripBar} />
          </div>
          <div
            className={cx(s.grip, s.gripEnd)}
            style={{ left: right }}
            data-grip="end"
            role="slider"
            tabIndex={0}
            aria-label="Clip end"
            aria-valuemin={0}
            aria-valuemax={Math.round(video.durationS)}
            aria-valuenow={Math.round(endS)}
            aria-valuetext={formatClockTenths(endS)}
            title="Drag to set the end (arrows: 1 frame, shift: 1 s)"
            onKeyDown={onHandleKey('end')}
          >
            <span className={s.gripBar} />
          </div>

          {inView(timeS) && <span className={s.stripPlayhead} style={{ left: xOf(timeS) }} />}

          <div className={s.ruler}>
            {ticks.map((t) => (
              <span key={t} className={s.rulerTick} style={{ left: xOf(t) }}>
                {formatClock(t)}
              </span>
            ))}
          </div>

          {hover !== null && !dragging && (
            <span className={s.stripTip} style={{ left: xOf(hover) }}>
              {formatClockTenths(hover)}
            </span>
          )}
        </>
      )}
    </div>
  )
}
