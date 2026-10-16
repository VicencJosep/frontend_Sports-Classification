import { useEffect, useMemo, useRef, useState } from 'react'

import { EmptyState } from '@/components/common'
import type { BallAction, TeamAssignments } from '@/domain'
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
}

/** Per-player ball actions (pass, drive, header, ...). Background predictions are hidden by default. */
export function BallActionList({ actions, teams, clock, onSelect, showConfidence }: BallActionListProps) {
  const [showBackground, setShowBackground] = useState(false)
  const visible = useMemo(() => (showBackground ? actions : actions.filter((a) => !a.isBackground)), [actions, showBackground])
  const currentId = useCurrentActionId(clock, visible)
  const rows = useRef(new Map<string, HTMLButtonElement>())
  const backgroundCount = actions.length - actions.filter((a) => !a.isBackground).length

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
        {visible.map((action) => {
          const team = teamOf(teams, action.trackerId)
          const active = action.id === currentId
          return (
            <li key={action.id}>
              <button
                type="button"
                ref={(el) => {
                  if (el) rows.current.set(action.id, el)
                  else rows.current.delete(action.id)
                }}
                className={cx(s.row, active && s.active)}
                onClick={() => onSelect(action)}
                aria-current={active ? 'true' : undefined}
              >
                <span className={s.time}>{formatClock(action.timestampS)}</span>
                <span className={s.main}>
                  <ActionBadge label={action.label} />
                  {action.trackerId !== null ? (
                    <span
                      className={s.player}
                      title={`${action.jersey !== null ? `Jersey ${action.jersey} · ` : ''}tracker #${action.trackerId}${team ? ` · ${team.displayName}` : ' · no team assigned'}`}
                    >
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
                  {showConfidence && <span title="Classifier confidence">{formatPercent(action.confidence)}</span>}
                  {showConfidence && action.spotScore !== null && <span title="T-DEED spotter score">spot {action.spotScore.toFixed(2)}</span>}
                </span>
              </button>
            </li>
          )
        })}
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
}
