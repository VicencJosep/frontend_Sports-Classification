import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { Badge, Button, Field, IconCheck, IconClose, IconLoop, IconPlay, IconPlayhead, IconScissors, IconStop, IconTrash, IconZoomIn, IconZoomOut, Kbd, Select, Spinner, TextInput } from '@/components/common'
import type { BallAction, ClipDraft, ClipPlayer, MatchEvent, TeamAssignments, VideoInfo } from '@/domain'
import { CLIP_LABELS, ROLE_DISPLAY, clampClipRange, defaultClipTitle, eventColor, labelDisplayName, shiftClipRange, teamOf } from '@/domain'
import type { TrackingLoadStatus } from '@/hooks/useTrackingWindows'
import type { PlayRange, RangePlayback } from '@/lib/rangePlayback'
import type { TrackingStore } from '@/lib/trackingStore'
import type { VideoClock } from '@/lib/videoClock'
import { cx } from '@/utils/cx'
import { formatClockTenths, parseClock } from '@/utils/time'

import { playerCandidates, type PlayerCandidate } from './playerCandidates'
import { TrimStrip, type TimeView, type TrimEdge } from './TrimStrip'
import s from './clips.module.css'

interface ClipEditorProps {
  /** Initial values; the editor keeps its own working copy. */
  draft: ClipDraft
  mode: 'create' | 'edit'
  video: VideoInfo
  clock: VideoClock
  events: readonly MatchEvent[]
  actions: readonly BallAction[]
  teams: TeamAssignments
  store: TrackingStore | null
  trackingRevision: number
  trackingStatus: TrackingLoadStatus
  rangePlayback: RangePlayback
  activeRange: PlayRange | null
  onSave: (draft: ClipDraft) => void
  onCancel: () => void
  onDelete?: () => void
}

/** `none`, `custom` or `t:<trackerId>`: the value of the player select. */
type PlayerSelection = string

const MIN_VIEW_S = 4

function fitView(startS: number, endS: number, durationS: number): TimeView {
  const pad = Math.min(30, Math.max(6, (endS - startS) * 0.6))
  return { fromS: Math.max(0, startS - pad), toS: Math.min(durationS, endS + pad) }
}

function selectionFor(player: ClipPlayer | null): PlayerSelection {
  if (!player) return 'none'
  if (player.trackerId !== null) return `t:${player.trackerId}`
  return 'custom'
}

function candidateText(c: PlayerCandidate, teams: TeamAssignments): string {
  const parts: string[] = []
  if (c.jersey !== null) parts.push(`No. ${c.jersey}`)
  parts.push(`#${c.trackerId}`)
  const team = teamOf(teams, c.trackerId)
  if (team) parts.push(team.displayName)
  else if (c.teamCluster !== null) parts.push(`Team ${String.fromCharCode(65 + (c.teamCluster % 26))}`)
  if (c.role !== 'player') parts.push(ROLE_DISPLAY[c.role])
  return `${parts.join(' · ')}${c.fromAction ? ' · had the ball' : ''}`
}

/**
 * Cut a clip out of the match: trim its boundaries on a filmstrip, correct the
 * event type and the player, preview it, save it to the Saved clips tab.
 */
export function ClipEditor({ draft, mode, video, clock, events, actions, teams, store, trackingRevision, trackingStatus, rangePlayback, activeRange, onSave, onCancel, onDelete }: ClipEditorProps) {
  const { fps, durationS } = video
  const [range, setRange] = useState({ startS: draft.startS, endS: draft.endS })
  const [label, setLabel] = useState<string>(draft.label)
  const [playerSel, setPlayerSel] = useState<PlayerSelection>(() => selectionFor(draft.player))
  const [customName, setCustomName] = useState(draft.player?.name ?? '')
  const [title, setTitle] = useState(draft.title)
  const [titleDirty, setTitleDirty] = useState(() => mode === 'edit' || draft.title !== defaultClipTitle(draft.label, draft.anchorS))
  const [view, setView] = useState<TimeView>(() => fitView(draft.startS, draft.endS, durationS))
  const [loop, setLoop] = useState(false)

  // Candidates come from the tracking loaded around the clip; recomputed when the range moves by a second or more.
  const roundedStart = Math.floor(range.startS)
  const roundedEnd = Math.ceil(range.endS)
  const candidates = useMemo(() => {
    const list = playerCandidates(store, teams, roundedStart, roundedEnd, fps, actions, draft.anchorS)
    const current = draft.player
    if (current?.trackerId !== null && current?.trackerId !== undefined && !list.some((c) => c.trackerId === current.trackerId)) {
      list.push({ trackerId: current.trackerId, jersey: current.jersey, teamCluster: current.teamCluster, role: 'player', frames: 0, fromAction: false })
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the store is mutated in place; `trackingRevision` tracks it
  }, [store, trackingRevision, teams, roundedStart, roundedEnd, fps, actions, draft.anchorS, draft.player])

  const applyRange = (next: { startS: number; endS: number }, edge: TrimEdge) => {
    const clamped = edge === 'move' ? shiftClipRange(next.startS, next.endS, 0, durationS, fps) : clampClipRange(next.startS, next.endS, durationS, fps, edge)
    setRange(clamped)
    if (clamped.startS < view.fromS || clamped.endS > view.toS) setView(fitView(clamped.startS, clamped.endS, durationS))
  }

  const setStartAtPlayhead = () => applyRange({ startS: clock.getSnapshot().timeS, endS: range.endS }, 'start')
  const setEndAtPlayhead = () => applyRange({ startS: range.startS, endS: clock.getSnapshot().timeS }, 'end')

  const changeLabel = (next: string) => {
    setLabel(next)
    if (!titleDirty) setTitle(defaultClipTitle(next, draft.anchorS))
  }

  const zoom = (factor: number) => {
    const centre = (range.startS + range.endS) / 2
    const span = Math.min(durationS, Math.max(MIN_VIEW_S, (view.toS - view.fromS) * factor))
    const fromS = Math.min(Math.max(0, centre - span / 2), Math.max(0, durationS - span))
    setView({ fromS, toS: Math.min(durationS, fromS + span) })
  }

  const preview = () => {
    if (activeRange) rangePlayback.stop()
    else rangePlayback.play({ startS: range.startS, endS: range.endS, loop })
  }

  const playerForSave = (): ClipPlayer | null => {
    if (playerSel === 'none') return null
    if (playerSel === 'custom') {
      const name = customName.trim()
      return name ? { trackerId: null, jersey: null, teamCluster: null, name } : null
    }
    const trackerId = Number(playerSel.slice(2))
    const candidate = candidates.find((c) => c.trackerId === trackerId)
    if (candidate) return { trackerId, jersey: candidate.jersey, teamCluster: candidate.teamCluster, name: null }
    return draft.player?.trackerId === trackerId ? draft.player : { trackerId, jersey: null, teamCluster: null, name: null }
  }

  const save = () => {
    onSave({
      ...draft,
      label,
      startS: range.startS,
      endS: range.endS,
      player: playerForSave(),
      title: title.trim() || defaultClipTitle(label, draft.anchorS),
    })
  }

  // Keyboard: I / [ set the start, O / ] the end, Esc closes. Typing in a field is left alone.
  const shortcuts = useRef({ setStartAtPlayhead, setEndAtPlayhead, onCancel })
  useEffect(() => {
    shortcuts.current = { setStartAtPlayhead, setEndAtPlayhead, onCancel }
  })
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'i' || e.key === 'I' || e.key === '[') shortcuts.current.setStartAtPlayhead()
      else if (e.key === 'o' || e.key === 'O' || e.key === ']') shortcuts.current.setEndAtPlayhead()
      else if (e.key === 'Escape') shortcuts.current.onCancel()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const color = eventColor(label)
  const labelOptions = (CLIP_LABELS as readonly string[]).includes(label) ? CLIP_LABELS : [...CLIP_LABELS, label]
  const trackingPending = store === null || (trackingStatus === 'loading' && candidates.length === 0)
  const playerHint = trackingPending ? (
    <span className={s.fieldNote}>
      <Spinner label="Loading tracking" /> Loading the tracking around the clip to list the players…
    </span>
  ) : candidates.length === 0 ? (
    'No tracked player in this range. Type a name instead.'
  ) : (
    'Tracklets seen in the clip; "had the ball" is the pipeline\'s attribution.'
  )

  return (
    <section className={s.editor} aria-label="Clip editor">
      <header className={s.editorHead}>
        <span className={s.editorTitle}>
          <IconScissors size={14} />
          {mode === 'create' ? 'New clip' : 'Edit clip'}
        </span>
        <Badge color={color}>{labelDisplayName(label)}</Badge>
        {draft.detectedLabel && draft.detectedLabel !== label && <span className={s.editorHint}>detected as {labelDisplayName(draft.detectedLabel)}</span>}
        <span className={s.spacer} />
        <span className={s.keys}>
          <Kbd>I</Kbd> start at playhead · <Kbd>O</Kbd> end at playhead · <Kbd>Esc</Kbd> close
        </span>
        <Button iconOnly size="sm" variant="ghost" onClick={onCancel} aria-label="Close the clip editor" title="Close (Esc)">
          <IconClose size={16} />
        </Button>
      </header>

      <TrimStrip
        clock={clock}
        video={video}
        startS={range.startS}
        endS={range.endS}
        anchorS={draft.anchorS}
        view={view}
        events={events}
        color={color}
        onChange={applyRange}
        onViewChange={setView}
        onSeek={(t) => clock.seek(t)}
      />

      <div className={s.editorRow}>
        <Button size="sm" variant={activeRange ? 'secondary' : 'primary'} onClick={preview} title={activeRange ? 'Stop the preview' : 'Play the clip in the viewer'}>
          {activeRange ? <IconStop size={14} /> : <IconPlay size={14} />}
          {activeRange ? 'Stop' : 'Preview'}
        </Button>
        <button type="button" className={cx(s.loopBtn, loop && s.loopOn)} aria-pressed={loop} onClick={() => setLoop((v) => !v)} title="Loop the preview">
          <IconLoop size={14} />
        </button>
        <TimeField label="Start" value={range.startS} onCommit={(t) => applyRange({ startS: t, endS: range.endS }, 'start')} onSetPlayhead={setStartAtPlayhead} shortcut="I" />
        <TimeField label="End" value={range.endS} onCommit={(t) => applyRange({ startS: range.startS, endS: t }, 'end')} onSetPlayhead={setEndAtPlayhead} shortcut="O" />
        <span className={s.duration} title="Clip duration">
          {(range.endS - range.startS).toFixed(1)} s
        </span>
        <span className={s.spacer} />
        <div className={s.zoom} role="group" aria-label="Zoom of the trim bar">
          <Button iconOnly size="sm" variant="ghost" onClick={() => zoom(2)} aria-label="Zoom out" title="Zoom out">
            <IconZoomOut size={15} />
          </Button>
          <Button iconOnly size="sm" variant="ghost" onClick={() => zoom(0.5)} aria-label="Zoom in" title="Zoom in">
            <IconZoomIn size={15} />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setView(fitView(range.startS, range.endS, durationS))} title="Fit the clip in the trim bar">
            Fit
          </Button>
        </div>
      </div>

      <div className={s.editorFields}>
        <Field label="Event type" htmlFor="clip-label">
          <Select id="clip-label" value={label} onChange={(e) => changeLabel(e.target.value)}>
            {labelOptions.map((l) => (
              <option key={l} value={l}>
                {labelDisplayName(l)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Player" htmlFor="clip-player" hint={playerHint}>
          <Select id="clip-player" value={playerSel} onChange={(e) => setPlayerSel(e.target.value)}>
            <option value="none">Unknown / not set</option>
            {candidates.map((c) => (
              <option key={c.trackerId} value={`t:${c.trackerId}`}>
                {candidateText(c, teams)}
              </option>
            ))}
            <option value="custom">Type a name…</option>
          </Select>
          {playerSel === 'custom' && (
            <TextInput className={s.customName} value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Player name or number" aria-label="Player name" />
          )}
        </Field>
        <Field label="Title" htmlFor="clip-title">
          <TextInput
            id="clip-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setTitleDirty(true)
            }}
            placeholder={defaultClipTitle(label, draft.anchorS)}
          />
        </Field>
      </div>

      <footer className={s.editorActions}>
        <Button variant="primary" onClick={save}>
          <IconCheck size={15} />
          {mode === 'create' ? 'Save clip' : 'Update clip'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {mode === 'edit' && onDelete && (
          <Button variant="danger" className={s.pushRight} onClick={onDelete}>
            <IconTrash size={15} />
            Delete clip
          </Button>
        )}
      </footer>
    </section>
  )
}

interface TimeFieldProps {
  label: string
  value: number
  onCommit: (timeS: number) => void
  onSetPlayhead: () => void
  shortcut: string
}

/** mm:ss.t text field: edits are applied on blur or Enter; the arrow button copies the playhead. */
function TimeField({ label, value, onCommit, onSetPlayhead, shortcut }: TimeFieldProps) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const commit = () => {
    const parsed = parseClock(text)
    if (parsed !== null) onCommit(parsed)
    setEditing(false)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setEditing(false)
      e.currentTarget.blur()
      e.stopPropagation()
    }
  }
  return (
    <label className={s.timeField}>
      <span className={s.timeLabel}>{label}</span>
      <input
        className={s.timeInput}
        value={editing ? text : formatClockTenths(value)}
        onFocus={() => {
          setText(formatClockTenths(value))
          setEditing(true)
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        aria-label={`Clip ${label.toLowerCase()} (mm:ss.t)`}
        spellCheck={false}
      />
      <button type="button" className={s.timeSet} onClick={onSetPlayhead} title={`Set the ${label.toLowerCase()} at the playhead (${shortcut})`} aria-label={`Set the ${label.toLowerCase()} at the playhead`}>
        <IconPlayhead size={14} />
      </button>
    </label>
  )
}
