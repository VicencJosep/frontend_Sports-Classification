import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button, EmptyState, IconPencil } from '@/components/common'
import type { BallAction, TeamAssignments, TeamInfo } from '@/domain'
import { TEAM_NEUTRAL_COLOR, teamOf } from '@/domain'
import type { VideoClock } from '@/lib/videoClock'
import { cx } from '@/utils/cx'
import { scrollIntoNearestScrollable } from '@/utils/scroll'
import { formatClock, formatPercent } from '@/utils/time'

import { ActionBadge } from './EventBadge'
import { useCurrentActionId } from './useActiveIds'
import s from './events.module.css'

interface BallActionListProps {
  actions: readonly BallAction[]
  teams: TeamAssignments
  clock: VideoClock
  onSelect: (action: BallAction) => void
  showConfidence: boolean
  /** Shows a pencil on each row that opens the editor on that action (type, player, team, instant, delete). */
  onEdit?: (action: BallAction) => void
}

/**
 * Per-player ball actions (pass, drive, header, ...). Background predictions are hidden by default.
 *
 * A match has well over a thousand of them and the list is not windowed, so it is memoised twice: the list only
 * renders when its own props change (pass stable callbacks), and each row only when its action does. Correcting
 * one action, or the playhead reaching the next one, then touches one or two rows instead of all of them.
 */
export const BallActionList = memo(function BallActionList({ actions, teams, clock, onSelect, showConfidence, onEdit }: BallActionListProps) {
  const [showBackground, setShowBackground] = useState(false)
  const visible = useMemo(() => (showBackground ? actions : actions.filter((a) => !a.isBackground)), [actions, showBackground])
  const currentId = useCurrentActionId(clock, visible)
  const rows = useRef(new Map<string, HTMLButtonElement>())
  const backgroundCount = useMemo(() => actions.reduce((n, a) => n + (a.isBackground ? 1 : 0), 0), [actions])
  const register = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) rows.current.set(id, el)
    else rows.current.delete(id)
  }, [])

  useEffect(() => {
    if (!currentId) return
    const row = rows.current.get(currentId)
    if (row) scrollIntoNearestScrollable(row)
  }, [currentId])

  if (visible.length === 0) {
    return <EmptyState title="No ball actions in this part">No pass, drive, header, high pass or throw-in was attributed to a player.</EmptyState>
  }

  return (
    <>
      <ul className={s.list}>
        {visible.map((action) => (
          <ActionRow key={action.id} action={action} team={teamOf(teams, action.trackerId)} active={action.id === currentId} showConfidence={showConfidence} onSelect={onSelect} onEdit={onEdit} register={register} />
        ))}
      </ul>
      {backgroundCount > 0 && (
        <div className={s.footer}>
          <span>
            {backgroundCount} background prediction{backgroundCount === 1 ? '' : 's'} {showBackground ? 'shown' : 'hidden'}
          </span>
          <button type="button" className={s.linkish} onClick={() => setShowBackground((v) => !v)}>
            {showBackground ? 'Hide' : 'Show'}
          </button>
        </div>
      )}
    </>
  )
})

interface ActionRowProps {
  action: BallAction
  team: TeamInfo | null
  active: boolean
  showConfidence: boolean
  onSelect: (action: BallAction) => void
  onEdit?: (action: BallAction) => void
  /** Keeps the list's id -> element map (to scroll the current row into view). */
  register: (id: string, el: HTMLButtonElement | null) => void
}

const ActionRow = memo(function ActionRow({ action, team, active, showConfidence, onSelect, onEdit, register }: ActionRowProps) {
  return (
    <li className={s.rowWrap}>
      <button type="button" ref={(el) => register(action.id, el)} className={cx(s.row, active && s.active, onEdit && s.rowWithAction)} onClick={() => onSelect(action)} aria-current={active ? 'true' : undefined}>
        <span className={s.time}>{formatClock(action.timestampS)}</span>
        <span className={s.main}>
          <ActionBadge label={action.label} />
          {action.trackerId !== null ? (
            <span className={s.player} title={`${action.jersey !== null ? `Jersey ${action.jersey} · ` : ''}tracker #${action.trackerId}${team ? ` · ${team.displayName}` : ' · no team assigned'}`}>
              <span className={s.teamDot} style={{ background: team?.color ?? TEAM_NEUTRAL_COLOR }} />
              {action.jersey !== null ? (
                <>
                  <strong>{action.jersey}</strong>
                  <span className={s.playerSub}>#{action.trackerId}</span>
                </>
              ) : (
                `#${action.trackerId}`
              )}
              {team && <span className={s.playerSub}>{team.displayName}</span>}
            </span>
          ) : (
            <span className={s.sub}>player unknown</span>
          )}
        </span>
        <span className={s.right}>
          {action.review ? (
            <span className={s.reviewTag} title={action.review === 'added' ? 'Added by hand' : 'Corrected by hand'}>
              {action.review}
            </span>
          ) : (
            <>
              {showConfidence && <span title="Classifier confidence">{formatPercent(action.confidence)}</span>}
              {showConfidence && action.spotScore !== null && <span title="T-DEED spotter score">spot {action.spotScore.toFixed(2)}</span>}
            </>
          )}
        </span>
      </button>
      {onEdit && (
        <Button iconOnly size="sm" variant="ghost" className={s.rowAction} onClick={() => onEdit(action)} aria-label={`Edit this ${action.label}`} title="Correct this action: type, player, instant">
          <IconPencil size={14} />
        </Button>
      )}
    </li>
  )
})
