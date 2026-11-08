import { useEffect, useRef, useSyncExternalStore } from 'react'

import { Badge, Button, EmptyState, IconDownload, IconPencil, IconPlay, IconScissors, IconStop, IconTrash } from '@/components/common'
import type { ClipPlayer, SavedClip, TeamAssignments } from '@/domain'
import { TEAM_NEUTRAL_COLOR, clipDurationS, describePlayer, eventColor, labelDisplayName, teamColor, teamOf, totalClipsDurationS } from '@/domain'
import type { VideoClock } from '@/lib/videoClock'
import { cx } from '@/utils/cx'
import { scrollIntoNearestScrollable } from '@/utils/scroll'
import { formatClock } from '@/utils/time'

import s from './clips.module.css'

interface SavedClipsPanelProps {
  clips: readonly SavedClip[]
  teams: TeamAssignments
  clock: VideoClock
  /** Clip being played through the range player, if any. */
  playingId: string | null
  /** Clip open in the editor, if any. */
  editingId: string | null
  /** Clip just saved: scrolled into view and flashed. */
  highlightId: string | null
  onPlay: (clip: SavedClip) => void
  onStop: () => void
  onEdit: (clip: SavedClip) => void
  onDelete: (clip: SavedClip) => void
  /** Last deleted clip (from this list or from the editor), offered for undo until dismissed. */
  deleted: SavedClip | null
  onUndoDelete: () => void
  onDismissDelete: () => void
  onExport: () => void
  /** New clip around the playhead. */
  onCreate: () => void
}

const UNDO_MS = 7000

/** Ids of the clips whose range contains the playhead, as one string so the list only re-renders when the set changes. */
function useActiveClipKey(clock: VideoClock, clips: readonly SavedClip[]): string {
  return useSyncExternalStore(
    clock.subscribe,
    () => {
      const t = clock.getSnapshot().timeS
      let key = ''
      for (const c of clips) if (t >= c.startS && t <= c.endS) key += `${c.id}|`
      return key
    },
    () => '',
  )
}

function PlayerChip({ player, teams }: { player: ClipPlayer | null; teams: TeamAssignments }) {
  if (!player) return <span className={s.playerChip}>player unknown</span>
  const team = player.trackerId !== null ? teamOf(teams, player.trackerId) : null
  const color = team?.color ?? (player.teamCluster !== null ? teamColor(player.teamCluster) : TEAM_NEUTRAL_COLOR)
  return (
    <span className={s.playerChip} title="Who made the play">
      <span className={s.teamDot} style={{ background: color }} />
      {describePlayer(player, teams)}
    </span>
  )
}

/**
 * The clips the user saved for this part: play them in the viewer, reopen the
 * editor, delete (with undo) and export the list as JSON.
 */
export function SavedClipsPanel({ clips, teams, clock, playingId, editingId, highlightId, onPlay, onStop, onEdit, onDelete, deleted, onUndoDelete, onDismissDelete, onExport, onCreate }: SavedClipsPanelProps) {
  const activeKey = useActiveClipKey(clock, clips)
  const rows = useRef(new Map<string, HTMLLIElement>())

  useEffect(() => {
    if (!highlightId) return
    const row = rows.current.get(highlightId)
    if (row) scrollIntoNearestScrollable(row)
  }, [highlightId])

  useEffect(() => {
    if (!deleted) return
    const id = window.setTimeout(onDismissDelete, UNDO_MS)
    return () => window.clearTimeout(id)
  }, [deleted, onDismissDelete])

  const undoBar = deleted && (
    <div className={s.undo} role="status">
      <span>
        Deleted <strong>{deleted.title}</strong>
      </span>
      <button type="button" className={s.linkish} onClick={onUndoDelete}>
        Undo
      </button>
    </div>
  )

  if (clips.length === 0) {
    return (
      <div className={s.emptyWrap}>
        <EmptyState title="No saved clips yet" icon={<IconScissors size={22} />}>
          Click the event card on the video (top-left, while a play is on screen), the ✂ button under the player or a row of the play history to cut a clip.
        </EmptyState>
        <Button size="sm" onClick={onCreate}>
          <IconScissors size={14} />
          Clip at the playhead
        </Button>
        {undoBar}
      </div>
    )
  }

  return (
    <div>
      <div className={s.panelToolbar}>
        <span>
          {clips.length} clip{clips.length === 1 ? '' : 's'} · {formatClock(totalClipsDurationS(clips))} total
        </span>
        <div className={s.panelActions}>
          <Button size="sm" variant="ghost" onClick={onCreate} title="New clip around the playhead">
            <IconScissors size={14} />
            New
          </Button>
          <Button size="sm" variant="ghost" onClick={onExport} title="Download the clips of this part as JSON">
            <IconDownload size={14} />
            Export
          </Button>
        </div>
      </div>
      <ul className={s.clipList}>
        {clips.map((clip) => {
          const active = activeKey.includes(`${clip.id}|`)
          const playing = clip.id === playingId
          return (
            <li
              key={clip.id}
              ref={(el) => {
                if (el) rows.current.set(clip.id, el)
                else rows.current.delete(clip.id)
              }}
              className={cx(s.clipRow, active && s.clipActive, clip.id === editingId && s.clipEditing, clip.id === highlightId && s.clipFlash)}
              aria-current={active ? 'true' : undefined}
            >
              <button type="button" className={s.clipMain} onClick={() => onPlay(clip)} title="Play this clip in the viewer">
                <span className={s.clipTime}>{formatClock(clip.startS)}</span>
                <span className={s.clipBody}>
                  <span className={s.clipTitleRow}>
                    <Badge color={eventColor(clip.label)}>{labelDisplayName(clip.label)}</Badge>
                    <span className={s.clipTitle}>{clip.title}</span>
                  </span>
                  <span className={s.clipSub}>
                    <span>
                      {formatClock(clip.startS)} – {formatClock(clip.endS)} · {clipDurationS(clip).toFixed(1)} s
                    </span>
                    <PlayerChip player={clip.player} teams={teams} />
                    {clip.detectedLabel && clip.detectedLabel !== clip.label && <span title="Label given by the pipeline">was {labelDisplayName(clip.detectedLabel)}</span>}
                  </span>
                </span>
              </button>
              <div className={s.clipActions}>
                {playing ? (
                  <Button iconOnly size="sm" onClick={onStop} aria-label="Stop" title="Stop">
                    <IconStop size={14} />
                  </Button>
                ) : (
                  <Button iconOnly size="sm" variant="ghost" onClick={() => onPlay(clip)} aria-label="Play clip" title="Play clip">
                    <IconPlay size={14} />
                  </Button>
                )}
                <Button iconOnly size="sm" variant="ghost" onClick={() => onEdit(clip)} aria-label="Edit clip" title="Edit clip">
                  <IconPencil size={14} />
                </Button>
                <Button iconOnly size="sm" variant="ghost" onClick={() => onDelete(clip)} aria-label="Delete clip" title="Delete clip">
                  <IconTrash size={14} />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      {undoBar}
    </div>
  )
}
