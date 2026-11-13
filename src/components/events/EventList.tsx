import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { Button, EmptyState, IconPencil, IconScissors } from '@/components/common'
import type { MatchEvent } from '@/domain'
import type { VideoClock } from '@/lib/videoClock'
import { cx } from '@/utils/cx'
import { scrollIntoNearestScrollable } from '@/utils/scroll'
import { formatClock, formatPercent } from '@/utils/time'

import { EventBadge } from './EventBadge'
import { useActiveEventKey } from './useActiveIds'
import s from './events.module.css'

interface EventListProps {
  events: readonly MatchEvent[]
  clock: VideoClock
  onSelect: (event: MatchEvent) => void
  showConfidence: boolean
  /** Shows a button on each row that opens the clip editor for that event. */
  onCreateClip?: (event: MatchEvent) => void
  /** The editor can also correct the event (reviewed copy): the row button is a pencil instead of scissors. */
  editable?: boolean
}

type EventFilter = 'all' | 'attack' | 'set-pieces' | 'discipline' | 'other'

const FILTERS: readonly { id: EventFilter; label: string; labels: readonly string[] | null }[] = [
  { id: 'all', label: 'All', labels: null },
  { id: 'attack', label: 'Goals & shots', labels: ['goal', 'shot', 'penalty'] },
  { id: 'set-pieces', label: 'Set pieces', labels: ['corner', 'free_kick', 'throw_in', 'kick_off'] },
  { id: 'discipline', label: 'Fouls & cards', labels: ['foul', 'card', 'offside'] },
  { id: 'other', label: 'Other', labels: ['substitution'] },
]

const KNOWN_FILTERED = new Set(FILTERS.flatMap((f) => f.labels ?? []))

function matches(filter: EventFilter, label: string): boolean {
  if (filter === 'all') return true
  const def = FILTERS.find((f) => f.id === filter)
  if (!def?.labels) return true
  if (filter === 'other') return def.labels.includes(label) || !KNOWN_FILTERED.has(label)
  return def.labels.includes(label)
}

/**
 * Play history: chronological event timeline with filters. Clicking a row seeks
 * the video to the event; the rows whose span contains the playhead are highlighted.
 * Memoised: it renders when its own props change, not on every state change of the viewer (pass stable callbacks).
 */
export const EventList = memo(function EventList({ events, clock, onSelect, showConfidence, onCreateClip, editable = false }: EventListProps) {
  const [filter, setFilter] = useState<EventFilter>('all')
  const visible = useMemo(() => events.filter((e) => matches(filter, e.label)), [events, filter])
  const activeKey = useActiveEventKey(clock, visible)
  const rows = useRef(new Map<string, HTMLButtonElement>())
  const firstActiveId = activeKey.split('|')[0] ?? ''
  const goals = useMemo(() => events.filter((e) => e.label === 'goal').length, [events])
  const shots = useMemo(() => events.filter((e) => e.label === 'shot').length, [events])

  useEffect(() => {
    if (!firstActiveId) return
    const row = rows.current.get(firstActiveId)
    if (row) scrollIntoNearestScrollable(row)
  }, [firstActiveId])

  if (events.length === 0) {
    return <EmptyState title="No events in this part">The event classifiers did not flag anything in this video.</EmptyState>
  }

  return (
    <>
      <div className={s.filters} role="group" aria-label="Filter plays">
        {FILTERS.map((f) => {
          const n = f.labels === null ? events.length : events.filter((e) => matches(f.id, e.label)).length
          return (
            <button key={f.id} type="button" className={cx(s.filter, filter === f.id && s.filterActive)} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
              <span className={s.filterCount}>{n}</span>
            </button>
          )
        })}
        <span className={s.summary} title="Goals · shots detected in this part">
          ⚽ {goals} · {shots} shots
        </span>
      </div>
      {visible.length === 0 ? (
        <EmptyState title="Nothing in this category" />
      ) : (
        <ul className={s.list}>
          {visible.map((event) => {
            const active = activeKey.includes(`${event.id}|`)
            const spanS = Math.max(0, event.endS - event.startS)
            const highlight = event.label === 'goal' || event.label === 'shot' || event.label === 'penalty'
            return (
              <li key={event.id} className={s.rowWrap}>
                <button
                  type="button"
                  ref={(el) => {
                    if (el) rows.current.set(event.id, el)
                    else rows.current.delete(event.id)
                  }}
                  className={cx(s.row, active && s.active, highlight && s.highlight, onCreateClip && s.rowWithAction)}
                  onClick={() => onSelect(event)}
                  aria-current={active ? 'true' : undefined}
                  title={`Go to ${formatClock(event.seekS)}`}
                >
                  <span className={s.time}>{formatClock(event.seekS)}</span>
                  <span className={s.main}>
                    <EventBadge label={event.label} />
                    <span className={s.sub}>
                      {spanS > 0 ? `${spanS.toFixed(spanS < 10 ? 1 : 0)} s` : ''}
                      {event.nWindows > 1 ? ` · ${event.nWindows} windows` : ''}
                    </span>
                  </span>
                  <span className={s.right}>
                    {event.review ? (
                      <span className={s.reviewTag} title={event.review === 'added' ? 'Added by hand' : 'Corrected by hand'}>
                        {event.review}
                      </span>
                    ) : (
                      showConfidence && <span title="Peak confidence">{formatPercent(event.peakConfidence)}</span>
                    )}
                  </span>
                </button>
                {onCreateClip && (
                  <Button
                    iconOnly
                    size="sm"
                    variant="ghost"
                    className={s.rowAction}
                    onClick={() => onCreateClip(event)}
                    aria-label={editable ? `Edit this ${event.label}` : `Cut a clip from this ${event.label}`}
                    title={editable ? 'Correct this event or cut a clip from it' : 'Cut a clip from this event'}
                  >
                    {editable ? <IconPencil size={14} /> : <IconScissors size={14} />}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
})
