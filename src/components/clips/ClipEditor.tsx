import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

import { Badge, Button, Field, IconCheck, IconClose, IconLoop, IconPencil, IconPlay, IconPlayhead, IconPlus, IconScissors, IconStop, IconTrash, IconZoomIn, IconZoomOut, Kbd, Select, Spinner, TextInput } from '@/components/common'
import type { BallAction, ClipDraft, ClipPlayer, MatchEvent, ReviewAddInput, ReviewInfo, ReviewPatch, ReviewSide, ReviewSubject, TeamAssignments, VideoInfo } from '@/domain'
import {
  CLIP_LABELS,
  REVIEW_LABELS,
  ROLE_DISPLAY,
  buildReviewPatch,
  clampClipRange,
  defaultClipTitle,
  effectiveSide,
  labelColor,
  labelDisplayName,
  reviewKindForLabel,
  shiftClipRange,
  snapToFrame,
  subjectInstantS,
  subjectSide,
  teamOf,
} from '@/domain'
import type { TrackingLoadStatus } from '@/hooks/useTrackingWindows'
import type { PlayRange, RangePlayback } from '@/lib/rangePlayback'
import type { TrackingStore } from '@/lib/trackingStore'
import type { VideoClock } from '@/lib/videoClock'
import { cx } from '@/utils/cx'
import { formatClockTenths, parseClock } from '@/utils/time'

import { playerCandidates, type PlayerCandidate } from './playerCandidates'
import type { PlayerPick, PlayerPickSource } from './playerPicks'
import { TrimStrip, type TimeView, type TrimEdge } from './TrimStrip'
import s from './clips.module.css'

/** What the editor needs to save corrections to the reviewed copy, next to saving clips. */
export interface EditorReview {
  info: ReviewInfo | null
  /** Team names for the Home / Away options. */
  homeName: string | null
  awayName: string | null
  busy: boolean
  error: string | null
  /** The editor was opened at the playhead to add a missed play: Enter adds it instead of saving a clip. */
  addFirst: boolean
  /** An empty patch means nothing changed. */
  onApply: (patch: ReviewPatch) => void
  onAdd: (input: ReviewAddInput) => void
  onDelete: () => void
}

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
  /** The detected event or ball action the editor is open on (it can then be corrected or deleted); null for a plain clip. */
  subject?: ReviewSubject | null
  /** Null when corrections cannot be saved: the editor only cuts clips. */
  review?: EditorReview | null
  /** Players clicked on the video. */
  picks?: PlayerPickSource
  /** The tracklet chosen as the player changed (the viewer highlights it). */
  onPlayerChange?: (trackerId: number | null) => void
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

function trackerOf(selection: PlayerSelection): number | null {
  return selection.startsWith('t:') ? Number(selection.slice(2)) : null
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

/** Key of the label at `index` of `REVIEW_LABELS`: 1-9 then 0 for the first ten. */
function digitFor(index: number): string | null {
  return index < 0 || index > 9 ? null : String((index + 1) % 10)
}

/**
 * Cut a clip out of the match: trim its boundaries on a filmstrip, correct the
 * event type and the player, preview it, save it to the Saved clips tab.
 *
 * Opened on a detected event or ball action (`subject`), the same form also
 * corrects that detection in the reviewed copy (type, player, team, instant),
 * deletes it, or (opened at the playhead) adds a play the pipeline missed.
 */
export function ClipEditor({ draft, mode, video, clock, events, actions, teams, store, trackingRevision, trackingStatus, rangePlayback, activeRange, onSave, onCancel, onDelete, subject = null, review = null, picks, onPlayerChange }: ClipEditorProps) {
  const { fps, durationS } = video
  const reviewing = review !== null && mode === 'create'
  const ownSide = subject ? subjectSide(subject) : null
  const [range, setRange] = useState({ startS: draft.startS, endS: draft.endS })
  const [label, setLabel] = useState<string>(draft.label)
  const [playerSel, setPlayerSel] = useState<PlayerSelection>(() => selectionFor(draft.player))
  const [customName, setCustomName] = useState(draft.player?.name ?? '')
  const [title, setTitle] = useState(draft.title)
  const [titleDirty, setTitleDirty] = useState(() => mode === 'edit' || draft.title !== defaultClipTitle(draft.label, draft.anchorS))
  const [view, setView] = useState<TimeView>(() => fitView(draft.startS, draft.endS, durationS))
  const [loop, setLoop] = useState(false)
  // The instant of the play: what a correction moves, and where an added play goes.
  const [instantS, setInstantS] = useState(() => (subject ? subjectInstantS(subject) : draft.anchorS))
  const [side, setSide] = useState<ReviewSide | null>(() => effectiveSide(ownSide, draft.player?.trackerId ?? null, review?.info))
  const [sideTouched, setSideTouched] = useState(false)
  // Players picked on the video that the sampled candidates below do not list.
  const [picked, setPicked] = useState<PlayerCandidate[]>([])

  // Candidates come from the tracking loaded around the clip; recomputed when the range moves by a second or more.
  const roundedStart = Math.floor(range.startS)
  const roundedEnd = Math.ceil(range.endS)
  const candidates = useMemo(() => {
    const list = playerCandidates(store, teams, roundedStart, roundedEnd, fps, actions, draft.anchorS)
    const current = draft.player
    if (current?.trackerId !== null && current?.trackerId !== undefined && !list.some((c) => c.trackerId === current.trackerId)) {
      list.push({ trackerId: current.trackerId, jersey: current.jersey, teamCluster: current.teamCluster, role: 'player', frames: 0, fromAction: false })
    }
    for (const extra of picked) if (!list.some((c) => c.trackerId === extra.trackerId)) list.push(extra)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the store is mutated in place; `trackingRevision` tracks it
  }, [store, trackingRevision, teams, roundedStart, roundedEnd, fps, actions, draft.anchorS, draft.player, picked])

  const applyRange = (next: { startS: number; endS: number }, edge: TrimEdge) => {
    const clamped = edge === 'move' ? shiftClipRange(next.startS, next.endS, 0, durationS, fps) : clampClipRange(next.startS, next.endS, durationS, fps, edge)
    setRange(clamped)
    if (clamped.startS < view.fromS || clamped.endS > view.toS) setView(fitView(clamped.startS, clamped.endS, durationS))
  }

  const setStartAtPlayhead = () => applyRange({ startS: clock.getSnapshot().timeS, endS: range.endS }, 'start')
  const setEndAtPlayhead = () => applyRange({ startS: range.startS, endS: clock.getSnapshot().timeS }, 'end')
  const moveInstant = (timeS: number) => setInstantS(snapToFrame(Math.min(Math.max(0, timeS), durationS), fps))
  const setInstantAtPlayhead = () => moveInstant(clock.getSnapshot().timeS)

  const changeLabel = (next: string) => {
    setLabel(next)
    if (!titleDirty) setTitle(defaultClipTitle(next, draft.anchorS))
  }

  /** A new player brings the team already set for that tracklet, unless the user chose the team by hand. */
  const choosePlayer = (selection: PlayerSelection) => {
    setPlayerSel(selection)
    const trackerId = trackerOf(selection)
    if (!sideTouched) setSide((trackerId !== null ? review?.info?.trackerSides.get(trackerId) : undefined) ?? ownSide)
    onPlayerChange?.(trackerId)
  }

  const chooseSide = (next: ReviewSide | null) => {
    setSide(next)
    setSideTouched(true)
  }

  const pickPlayer = (pick: PlayerPick) => {
    setPicked((prev) => (prev.some((c) => c.trackerId === pick.trackerId) ? prev : [...prev, { trackerId: pick.trackerId, jersey: pick.jersey, teamCluster: teams.byTrackerId.get(pick.trackerId) ?? null, role: 'player', frames: 0, fromAction: false }]))
    choosePlayer(`t:${pick.trackerId}`)
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

  // --- corrections to the reviewed copy -------------------------------------------------------

  const canApply = reviewing && subject !== null
  const canAdd = reviewing && subject === null
  const addable = label !== 'play'
  const addKind = reviewKindForLabel(label)

  const applyCorrection = () => {
    if (!review || !subject || review.busy) return
    review.onApply(buildReviewPatch(subject, { label, timeS: instantS, trackerId: trackerOf(playerSel), side }, fps, review.info))
  }

  const addPlay = () => {
    if (!review || review.busy || !addable) return
    review.onAdd({ kind: addKind, label, timeS: instantS, trackerId: trackerOf(playerSel), side })
  }

  const deleteDetection = () => {
    if (review && subject && !review.busy) review.onDelete()
  }

  /** What Enter does: the correction when there is a detection to correct, the new play when adding, else the clip. */
  const confirm = () => {
    if (canApply) applyCorrection()
    else if (canAdd && review?.addFirst) addPlay()
    else save()
  }

  // Keyboard. Typing in a field is left alone; keys the video stage already handled (it has the focus) are not repeated.
  const handlers = useRef({ setStartAtPlayhead, setEndAtPlayhead, setInstantAtPlayhead, changeLabel, chooseSide, confirm, deleteDetection, pickPlayer, onCancel })
  useEffect(() => {
    handlers.current = { setStartAtPlayhead, setEndAtPlayhead, setInstantAtPlayhead, changeLabel, chooseSide, confirm, deleteDetection, pickPlayer, onCancel }
  })
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName ?? ''
      if (target && (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const h = handlers.current
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (key === 'i' || key === '[') h.setStartAtPlayhead()
      else if (key === 'o' || key === ']') h.setEndAtPlayhead()
      else if (key === 'Escape') h.onCancel()
      else if (/^[0-9]$/.test(key)) h.changeLabel(REVIEW_LABELS[key === '0' ? 9 : Number(key) - 1] ?? REVIEW_LABELS[0])
      else if (key === 't' && reviewing) h.setInstantAtPlayhead()
      else if (key === 'h' && reviewing) h.chooseSide('home')
      else if (key === 'a' && reviewing) h.chooseSide('away')
      else if (key === 'Enter' && tag !== 'BUTTON') h.confirm()
      else if ((key === 'Delete' || key === 'Backspace') && canApply) h.deleteDetection()
      else if (key === ' ' && tag !== 'BUTTON' && !e.defaultPrevented) clock.toggle()
      else if (key === ',' && !e.defaultPrevented) clock.stepFrames(-1)
      else if (key === '.' && !e.defaultPrevented) clock.stepFrames(1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clock, reviewing, canApply])
  useEffect(() => picks?.subscribe((pick) => handlers.current.pickPlayer(pick)), [picks])

  const color = labelColor(label)
  const baseLabels: readonly string[] = subject ? REVIEW_LABELS : CLIP_LABELS
  const labelOptions = baseLabels.includes(label) ? baseLabels : [...baseLabels, label]
  const trackingPending = store === null || (trackingStatus === 'loading' && candidates.length === 0)
  const playerHint = trackingPending ? (
    <span className={s.fieldNote}>
      <Spinner label="Loading tracking" /> Loading the tracking around the clip to list the players…
    </span>
  ) : candidates.length === 0 ? (
    'No tracked player in this range. Type a name instead.'
  ) : null
  const playerTip = picks ? 'Click a player on the video to pick them. "Had the ball" is the pipeline\'s attribution.' : 'Tracklets seen in the clip; "had the ball" is the pipeline\'s attribution.'
  const heading = mode === 'edit' ? 'Edit clip' : canApply ? (subject.kind === 'action' ? 'Ball action' : 'Event') : canAdd && review?.addFirst ? 'New play' : 'New clip'
  const status = subject ? ((subject.kind === 'action' ? subject.action.review : subject.event.review) ?? null) : null

  return (
    <section className={s.editor} aria-label="Clip editor">
      <header className={s.editorHead}>
        <span className={s.editorTitle}>
          {canApply ? <IconPencil size={14} /> : <IconScissors size={14} />}
          {heading}
        </span>
        <Badge color={color}>{labelDisplayName(label)}</Badge>
        {draft.detectedLabel && draft.detectedLabel !== label && (
          <span className={s.editorHint}>
            {status ? 'was' : 'detected as'} {labelDisplayName(draft.detectedLabel)}
          </span>
        )}
        {status && <span className={s.reviewMark}>{status}</span>}
        <span className={s.spacer} />
        {reviewing ? (
          <span className={s.keys}>
            <Kbd>1</Kbd>–<Kbd>0</Kbd> type · <Kbd>T</Kbd> instant · <Kbd>H</Kbd>/<Kbd>A</Kbd> team · <Kbd>Enter</Kbd> {canApply ? 'apply' : review?.addFirst ? 'add' : 'save clip'}
            {canApply && (
              <>
                {' '}
                · <Kbd>Del</Kbd> delete
              </>
            )}{' '}
            · <Kbd>Esc</Kbd> close
          </span>
        ) : (
          <span className={s.keys}>
            <Kbd>I</Kbd> start at playhead · <Kbd>O</Kbd> end at playhead · <Kbd>Esc</Kbd> close
          </span>
        )}
        <Button iconOnly size="sm" variant="ghost" onClick={onCancel} aria-label="Close the clip editor" title="Close (Esc)">
          <IconClose size={16} />
        </Button>
      </header>

      <TrimStrip
        clock={clock}
        video={video}
        startS={range.startS}
        endS={range.endS}
        anchorS={reviewing ? instantS : draft.anchorS}
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
        <TimeField label="Start" value={range.startS} onCommit={(t) => applyRange({ startS: t, endS: range.endS }, 'start')} onSetPlayhead={setStartAtPlayhead} shortcut="I" what="clip start" />
        <TimeField label="End" value={range.endS} onCommit={(t) => applyRange({ startS: range.startS, endS: t }, 'end')} onSetPlayhead={setEndAtPlayhead} shortcut="O" what="clip end" />
        <span className={s.duration} title="Clip duration">
          {(range.endS - range.startS).toFixed(1)} s
        </span>
        {reviewing && (
          <TimeField
            label="Instant"
            value={instantS}
            onCommit={(t) => {
              moveInstant(t)
              clock.seek(Math.min(Math.max(0, t), durationS))
            }}
            onSetPlayhead={setInstantAtPlayhead}
            shortcut="T"
            what="instant of the play"
            accent
          />
        )}
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

      <div className={s.chips} role="radiogroup" aria-label="Event type">
        {labelOptions.map((option) => {
            const digit = digitFor((REVIEW_LABELS as readonly string[]).indexOf(option))
            const on = option === label
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={on}
                className={cx(s.chip, on && s.chipOn)}
                style={{ '--chip-color': labelColor(option) } as CSSProperties}
                onClick={() => changeLabel(option)}
                title={digit ? `${labelDisplayName(option)} (${digit})` : labelDisplayName(option)}
              >
                {digit && <span className={s.chipKey}>{digit}</span>}
                {labelDisplayName(option)}
              </button>
            )
          })}
      </div>

      <div className={s.editorFields}>
        <Field label={picks ? 'Player · click one on the video' : 'Player'} htmlFor="clip-player" hint={playerHint}>
          <Select id="clip-player" value={playerSel} onChange={(e) => choosePlayer(e.target.value)} title={playerTip}>
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
        {reviewing && (
          <Field label="Team" htmlFor="clip-side">
            <Select
              id="clip-side"
              value={side ?? ''}
              onChange={(e) => chooseSide(e.target.value === 'home' || e.target.value === 'away' ? e.target.value : null)}
              title="Set once per tracklet: the other actions of that tracklet take it too."
            >
              <option value="">Not set</option>
              <option value="home">Home{review?.homeName ? ` · ${review.homeName}` : ''} (H)</option>
              <option value="away">Away{review?.awayName ? ` · ${review.awayName}` : ''} (A)</option>
            </Select>
          </Field>
        )}
        <Field label="Clip title" htmlFor="clip-title">
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
        {canApply && (
          <Button variant="primary" onClick={applyCorrection} disabled={review?.busy} title="Save the type, player, team and instant to the reviewed copy (Enter)">
            <IconCheck size={15} />
            Apply correction
          </Button>
        )}
        {canAdd && review?.addFirst && (
          <Button variant="primary" onClick={addPlay} disabled={review.busy || !addable} title={addable ? 'Add this play to the reviewed copy (Enter)' : 'Pick the type of the play first'}>
            <IconPlus size={15} />
            Add {addKind === 'event' ? 'event' : 'ball action'}
          </Button>
        )}
        <Button variant={canApply || (canAdd && review?.addFirst) ? 'secondary' : 'primary'} onClick={save}>
          {canApply || (canAdd && review?.addFirst) ? <IconScissors size={15} /> : <IconCheck size={15} />}
          {mode === 'create' ? 'Save clip' : 'Update clip'}
        </Button>
        {canAdd && !review?.addFirst && (
          <Button variant="secondary" onClick={addPlay} disabled={review?.busy || !addable} title={addable ? 'Add this play to the reviewed copy' : 'Pick the type of the play first'}>
            <IconPlus size={15} />
            Add {addKind === 'event' ? 'event' : 'ball action'}
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {review?.busy && <Spinner label="Saving" />}
        {review?.error && (
          <span className={s.reviewError} role="alert">
            Not saved: {review.error}
          </span>
        )}
        {canApply && (
          <Button variant="danger" className={s.pushRight} onClick={deleteDetection} disabled={review?.busy} title="Remove this detection from the reviewed copy: it did not happen (Del)">
            <IconTrash size={15} />
            Delete {subject.kind === 'action' ? 'action' : 'event'}
          </Button>
        )}
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
  /** What the field sets, for tooltips and screen readers ("clip start"). */
  what: string
  /** Drawn in the accent colour: the instant, as opposed to the clip boundaries. */
  accent?: boolean
}

/** mm:ss.t text field: edits are applied on blur or Enter; the arrow button copies the playhead. */
function TimeField({ label, value, onCommit, onSetPlayhead, shortcut, what, accent = false }: TimeFieldProps) {
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
    <label className={cx(s.timeField, accent && s.timeFieldAccent)}>
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
        aria-label={`${what.charAt(0).toUpperCase()}${what.slice(1)} (mm:ss.t)`}
        spellCheck={false}
      />
      <button type="button" className={s.timeSet} onClick={onSetPlayhead} title={`Set the ${what} at the playhead (${shortcut})`} aria-label={`Set the ${what} at the playhead`}>
        <IconPlayhead size={14} />
      </button>
    </label>
  )
}
