import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'

import { IconPencil, IconScissors } from '@/components/common'
import type { BallAction, MatchEvent } from '@/domain'
import { activeEventAt, ballActionColor, eventColor, labelDisplayName } from '@/domain'
import type { VideoClock } from '@/lib/videoClock'
import { formatClock } from '@/utils/time'

import { cardLayout, recentActions } from './overlay/renderOverlay'
import s from './video.module.css'

interface EventCardHitAreaProps {
  clock: VideoClock
  events: readonly MatchEvent[]
  fps: number
  /** False while the cards layer is off: nothing to click on. */
  enabled: boolean
  onPick: (event: MatchEvent) => void
  /** Non-background ball actions sorted by frame; with `onPickAction`, the latest-action card is clickable too. */
  actions?: readonly BallAction[]
  /** How long the action card stays on screen (the viewer's `actionBadgeSeconds`). */
  actionWindowS?: number
  onPickAction?: (action: BallAction) => void
  /** Corrections can be saved: the cards offer to edit the detection, not only to cut a clip. */
  editable?: boolean
}

const NO_ACTIONS: readonly BallAction[] = []

/**
 * Invisible buttons laid exactly over the notification cards the canvas draws
 * top-left (the current event, then the latest ball action), so a card can be
 * clicked to correct that detection or cut a clip from it. Same geometry as the
 * renderer (`cardLayout`) and the same rules for which cards are shown.
 */
export function EventCardHitArea({ clock, events, fps, enabled, onPick, actions = NO_ACTIONS, actionWindowS = 0, onPickAction, editable = false }: EventCardHitAreaProps) {
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

  const withActions = onPickAction !== undefined
  // "<event id>|<action id>" so the layer only re-renders when one of the two cards changes.
  const activeKey = useSyncExternalStore(
    clock.subscribe,
    () => {
      if (!enabled || !(fps > 0)) return '|'
      const { frameIdx } = clock.getSnapshot()
      const eventId = activeEventAt(events, frameIdx / fps)?.id ?? ''
      const actionId = withActions ? (recentActions(actions, frameIdx, Math.round(actionWindowS * fps))[0]?.id ?? '') : ''
      return `${eventId}|${actionId}`
    },
    () => '|',
  )
  const [eventId = '', actionId = ''] = activeKey.split('|')
  const event = eventId ? (events.find((e) => e.id === eventId) ?? null) : null
  const action = actionId ? (actions.find((a) => a.id === actionId) ?? null) : null
  const layout = cardLayout(width)
  const actionTop = layout.margin + (event ? layout.cardH + layout.gap : 0)
  const HintIcon = editable ? IconPencil : IconScissors
  const hint = editable ? 'Edit' : 'Clip'

  return (
    <div ref={ref} className={s.uiLayer}>
      {event && width > 0 && (
        <button
          type="button"
          className={s.cardHit}
          style={{ left: layout.margin, top: layout.margin, width: layout.cardW, height: layout.cardH, '--card-color': eventColor(event.label) } as CSSProperties}
          title={`${editable ? 'Correct this' : 'Cut a clip from this'} ${labelDisplayName(event.label).toLowerCase()} (pauses the video)`}
          aria-label={`${editable ? 'Edit' : 'Create a clip from'} the ${labelDisplayName(event.label)} at ${formatClock(event.seekS)}`}
          onClick={() => onPick(event)}
        >
          <span className={s.cardHint}>
            <HintIcon size={11} />
            {hint}
          </span>
        </button>
      )}
      {action && onPickAction && width > 0 && (
        <button
          type="button"
          className={s.cardHit}
          style={{ left: layout.margin, top: actionTop, width: layout.cardW, height: layout.cardH, '--card-color': ballActionColor(action.label) } as CSSProperties}
          title={`Correct this ${labelDisplayName(action.label).toLowerCase()}: type, player, instant (E)`}
          aria-label={`Edit the ${labelDisplayName(action.label)} at ${formatClock(action.timestampS)}`}
          onClick={() => onPickAction(action)}
        >
          <span className={s.cardHint}>
            <HintIcon size={11} />
            {hint}
          </span>
        </button>
      )}
    </div>
  )
}
