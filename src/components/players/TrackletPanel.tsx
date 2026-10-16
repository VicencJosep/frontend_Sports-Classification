import { useMemo, type CSSProperties } from 'react'

import { Button } from '@/components/common'
import type { PersonDetection, TeamAssignments, TeamInfo } from '@/domain'
import { EMPTY_PLAYER_STATS, ROLE_DISPLAY, ROLE_SHORT, TEAM_NEUTRAL_COLOR, teamOf } from '@/domain'
import { useClockFrame } from '@/hooks/useVideoClock'
import type { TrackingStore } from '@/lib/trackingStore'
import type { VideoClock } from '@/lib/videoClock'
import { cx } from '@/utils/cx'
import { formatClock } from '@/utils/time'

import s from './players.module.css'

interface TrackletPanelProps {
  store: TrackingStore | null
  teams: TeamAssignments
  clock: VideoClock
  fps: number
  selectedTrackerId: number | null
  onSelect: (trackerId: number | null) => void
}

interface Group {
  key: string
  title: string
  color: string
  persons: PersonDetection[]
}

function chipLabel(p: PersonDetection): string {
  return p.jersey !== null ? String(p.jersey) : `#${p.trackerId}`
}

/**
 * People visible in the current frame, grouped by team cluster, plus the
 * detail of the selected tracklet with placeholders for statistics the
 * pipeline does not produce yet.
 */
export function TrackletPanel({ store, teams, clock, fps, selectedTrackerId, onSelect }: TrackletPanelProps) {
  const frameIdx = useClockFrame(clock)
  const frame = store?.getFrameOrPrevious(frameIdx) ?? null

  const groups = useMemo<Group[]>(() => {
    if (!frame) return []
    const byKey = new Map<string, Group>()
    const ensure = (key: string, title: string, color: string): Group => {
      let g = byKey.get(key)
      if (!g) {
        g = { key, title, color, persons: [] }
        byKey.set(key, g)
      }
      return g
    }
    for (const c of teams.clusters) ensure(`c${c.cluster}`, c.displayName, c.color)
    for (const p of frame.persons) {
      const team: TeamInfo | null = teamOf(teams, p.trackerId)
      const g = team ? ensure(`c${team.cluster}`, team.displayName, team.color) : ensure('none', 'Referees / unassigned', TEAM_NEUTRAL_COLOR)
      g.persons.push(p)
    }
    for (const g of byKey.values()) g.persons.sort((a, b) => a.trackerId - b.trackerId)
    return [...byKey.values()].filter((g) => g.persons.length > 0)
  }, [frame, teams])

  const selected = useMemo(() => {
    if (selectedTrackerId === null || !store) return null
    return store.tracklets().find((t) => t.trackerId === selectedTrackerId) ?? null
  }, [store, selectedTrackerId])

  if (!store) return <p className={s.empty}>Tracking not loaded.</p>

  return (
    <div>
      <div className={s.groups}>
        {groups.length === 0 && <p className={s.empty}>No one detected in this frame.</p>}
        {groups.map((g) => (
          <div key={g.key}>
            <div className={s.groupTitle}>
              <span className={s.swatch} style={{ background: g.color }} />
              {g.title}
              <span style={{ marginLeft: 'auto', color: 'var(--text-faint)' }}>{g.persons.length}</span>
            </div>
            <div className={s.chips}>
              {g.persons.map((p) => (
                <button
                  key={p.trackerId}
                  type="button"
                  className={cx(s.chip, p.trackerId === selectedTrackerId && s.selected)}
                  style={{ '--chip-color': g.color } as CSSProperties}
                  onClick={() => onSelect(p.trackerId === selectedTrackerId ? null : p.trackerId)}
                  title={`${ROLE_DISPLAY[p.role]} · tracker #${p.trackerId}${p.jersey !== null ? ` · jersey ${p.jersey}` : ''}`}
                >
                  {ROLE_SHORT[p.role] && <span className={s.role}>{ROLE_SHORT[p.role]}</span>}
                  {chipLabel(p)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className={s.detail}>
          <div className={s.detailHeader}>
            <span className={s.detailTitle}>
              <span className={s.swatch} style={{ background: teamOf(teams, selected.trackerId)?.color ?? TEAM_NEUTRAL_COLOR }} />
              Tracker #{selected.trackerId}
            </span>
            <Button size="sm" variant="ghost" onClick={() => onSelect(null)}>
              Clear
            </Button>
          </div>
          <dl className={s.kv}>
            <dt>Role</dt>
            <dd>{ROLE_DISPLAY[selected.role]}</dd>
            <dt>Jersey</dt>
            <dd className={selected.jersey === null ? s.dash : undefined}>{selected.jersey ?? '—'}</dd>
            <dt>Team</dt>
            <dd>{teamOf(teams, selected.trackerId)?.displayName ?? '—'}</dd>
            <dt>Visible</dt>
            <dd>
              {formatClock(selected.firstFrame / fps)} – {formatClock(selected.lastFrame / fps)}
            </dd>
            <dt>Frames tracked</dt>
            <dd>{selected.frameCount}</dd>
          </dl>
          <div className={s.sectionLabel}>Statistics</div>
          <dl className={s.kv}>
            <dt>Distance</dt>
            <dd className={s.dash}>{EMPTY_PLAYER_STATS.distanceM ?? '—'}</dd>
            <dt>Average speed</dt>
            <dd className={s.dash}>{EMPTY_PLAYER_STATS.avgSpeedMs ?? '—'}</dd>
            <dt>Maximum speed</dt>
            <dd className={s.dash}>{EMPTY_PLAYER_STATS.maxSpeedMs ?? '—'}</dd>
          </dl>
          <p className={s.note}>Tracker ids are tracklets: the same player can receive a new id after an occlusion. Physical statistics are not produced by the pipeline yet.</p>
        </div>
      )}
    </div>
  )
}
