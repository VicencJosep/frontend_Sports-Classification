import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { useMatchService } from '@/app/providers/useServices'
import { useSettings } from '@/app/providers/useSettings'
import { Badge, EmptyState, ErrorState, Panel, Spinner } from '@/components/common'
import { ClipEditor, SavedClipsPanel, createPlayerPickChannel, type EditorReview } from '@/components/clips'
import { BallActionList, EventList } from '@/components/events'
import { HighlightsPanel } from '@/components/highlights'
import { LayerBar } from '@/components/layers/LayerBar'
import { LayerPanel } from '@/components/layers/LayerPanel'
import { layerAvailability, needsTracking } from '@/components/layers/layers'
import { TrackletPanel } from '@/components/players/TrackletPanel'
import { ReviewBar, type DeletedItem } from '@/components/review'
import { EventCardHitArea } from '@/components/video/EventCardHitArea'
import { OverlayCanvas } from '@/components/video/OverlayCanvas'
import { PlayerControls } from '@/components/video/PlayerControls'
import { PlayerPickLayer } from '@/components/video/PlayerPickLayer'
import { VideoStage } from '@/components/video/VideoStage'
import type { BallAction, ClipDraft, HighlightClip, Match, MatchEvent, MatchPart, PartHighlights, ReviewAddInput, ReviewPatch, ReviewSubject, SavedClip, VideoInfo } from '@/domain'
import {
  EMPTY_TEAM_ASSIGNMENTS,
  clipsExportJson,
  defaultClipTitle,
  draftAtTime,
  draftFromAction,
  draftFromClip,
  draftFromEvent,
  isEmptyPatch,
  latestActionAt,
  subjectId,
  subjectInstantS,
  subjectLabel,
} from '@/domain'
import { useAsync } from '@/hooks/useAsync'
import { useMatchReview } from '@/hooks/useMatchReview'
import { useRangePlayback } from '@/hooks/useRangePlayback'
import { useStableCallback } from '@/hooks/useStableCallback'
import { useSavedClips } from '@/hooks/useSavedClips'
import { useTrackingWindows } from '@/hooks/useTrackingWindows'
import { VideoClock, frameIndexForTime } from '@/lib/videoClock'
import type { TrackingRange } from '@/services'
import { cx } from '@/utils/cx'

import s from './Match.module.css'
import eventStyles from '@/components/events/events.module.css'
import { editorKey, initialViewerState, viewerReducer, type EditorTarget, type SidebarTab } from './viewerState'

interface MatchViewerProps {
  match: Match
  part: MatchPart
  video: VideoInfo
}

const ACTION_PREROLL_S = 0.6
/** The "Clip" button takes the event this close to the playhead; otherwise it cuts a plain play. */
const NEAREST_EVENT_S = 3
/** The E key edits the last ball action at most this far behind the playhead (reaction time included). */
const EDIT_ACTION_WINDOW_S = 4
/** A play added at the playhead starts as the most common class; a number key changes it. */
const NEW_PLAY_LABEL = 'pass'

const TABS: readonly { id: SidebarTab; label: string }[] = [
  { id: 'events', label: 'Play history' },
  { id: 'actions', label: 'Ball actions' },
  { id: 'highlights', label: 'Highlights' },
  { id: 'clips', label: 'Saved clips' },
]

/**
 * The viewer for one analysed part: video + overlays + layers + events + players + clip editor. Mounted per part
 * (keyed by the page). The editor also corrects what the pipeline detected: those corrections go to the reviewed
 * copy the backend keeps, and the lists below show that copy.
 */
export function MatchViewer({ match, part, video }: MatchViewerProps) {
  const service = useMatchService()
  const { settings } = useSettings()
  const [state, dispatch] = useReducer(viewerReducer, initialViewerState)
  const [muted, setMuted] = useState(false)
  // What the highlights panel last saw (it polls on its own); the match record's summary is only the initial value.
  const [highlightsLive, setHighlightsLive] = useState<PartHighlights | null>(null)
  const highlightsTitle = highlightsLive
    ? highlightsLive.status === 'completed'
      ? `Highlights · ${highlightsLive.clips.length}`
      : 'Highlights'
    : part.highlights?.status === 'completed'
      ? `Highlights · ${part.highlights.nClips}`
      : 'Highlights'
  const playerRef = useRef<HTMLDivElement>(null)

  const clock = useMemo(() => new VideoClock({ fps: video.fps, frameCount: video.frameCount, startTimeS: video.startTimeS }), [video.fps, video.frameCount, video.startTimeS])
  const rangePlayback = useRangePlayback(clock)
  const savedClips = useSavedClips(match.id, part.id)
  const [playingClipId, setPlayingClipId] = useState<string | null>(null)
  const [justSavedId, setJustSavedId] = useState<string | null>(null)
  const [lastDeleted, setLastDeleted] = useState<SavedClip | null>(null)

  const loadAnalysis = useCallback(() => service.getPartAnalysis(match.id, part.id), [service, match.id, part.id])
  const loadTracking = useCallback(
    (range: TrackingRange) => service.getPartTracking(match.id, part.id, range),
    [service, match.id, part.id],
  )
  const analysis = useAsync(loadAnalysis)
  // The loaded analysis with this session's corrections applied (each one is saved by the backend first).
  const review = useMatchReview(service.review, match.id, part.id, analysis.data)
  const current = review.analysis
  const [deletedItem, setDeletedItem] = useState<DeletedItem | null>(null)
  const picks = useMemo(() => createPlayerPickChannel(), [])

  const teams = current?.teams ?? EMPTY_TEAM_ASSIGNMENTS
  const events = useMemo<MatchEvent[]>(() => current?.events ?? [], [current])
  const allActions = useMemo<BallAction[]>(() => current?.ballActions ?? [], [current])
  const visibleActions = useMemo(() => allActions.filter((a) => !a.isBackground), [allActions])

  // Tracking arrives by time windows around the playhead (a full match is ~145k frames), and only while a
  // layer drawn from it is on, a player is selected or the clip editor needs the players on screen.
  const trackingNeeded = needsTracking(state.layers, state.selectedTrackerId) || state.editor !== null
  const tracking = useTrackingWindows(loadTracking, clock, video.durationS, video.frameCount, teams, trackingNeeded)
  const store = tracking.revision > 0 ? tracking.store : null
  const availability = useMemo(
    () => layerAvailability(current ?? null, store),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the store is mutated in place; `revision` tracks it
    [current, store, tracking.revision],
  )

  const toggleFullscreen = () => {
    const el = playerRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.()
  }

  const seekToEvent = (event: MatchEvent) => clock.seek(event.seekS)
  const seekToHighlight = (clip: HighlightClip) => clock.seek(clip.startS)
  const seekToAction = (action: BallAction) => {
    clock.seek(Math.max(0, action.timestampS - ACTION_PREROLL_S))
    if (action.trackerId !== null) dispatch({ type: 'selectTracker', trackerId: action.trackerId })
  }

  // --- editor: clips and corrections ------------------------------------------------------------

  /** Opens the editor on a detection or at the playhead. The video pauses; `resume` remembers it was playing. */
  const openEditor = (subject: ReviewSubject | null, atS: number, intent: 'clip' | 'review') => {
    const resume = clock.getSnapshot().playing
    clock.pause()
    rangePlayback.controller.stop()
    review.clearError()
    dispatch({ type: 'openEditor', target: { kind: 'new', subject, atS, opened: Date.now(), intent, resume } })
  }

  /** Opens the editor on an event: the video pauses where it is (the card was clicked mid-play). */
  const openClipForEvent = (event: MatchEvent) => openEditor({ kind: 'event', event }, event.seekS, 'clip')

  /** Opens the editor on a ball action, at its frame, with the player it was attributed to highlighted. */
  const openEditorForAction = (action: BallAction) => {
    openEditor({ kind: 'action', action }, action.timestampS, 'review')
    clock.seek(action.timestampS)
    dispatch({ type: 'selectTracker', trackerId: action.trackerId })
  }

  /** The event whose span or edges are within `NEAREST_EVENT_S` of `t`, the closest one. */
  const eventNear = (t: number): MatchEvent | null => {
    let nearest: MatchEvent | null = null
    for (const e of events) {
      const d = t >= e.startS && t <= e.endS ? 0 : Math.min(Math.abs(e.seekS - t), Math.abs(e.endS - t))
      if (d <= NEAREST_EVENT_S && (nearest === null || d < Math.min(Math.abs(nearest.seekS - t), Math.abs(nearest.endS - t)))) nearest = e
    }
    return nearest
  }

  /** The "Clip" button: the event at the playhead when there is one close enough, otherwise a plain play. */
  const openClipAtPlayhead = () => {
    const t = clock.getSnapshot().timeS
    const nearest = eventNear(t)
    if (nearest) openClipForEvent(nearest)
    else openEditor(null, t, 'clip')
  }

  /** E: the ball action just played (its card is on screen), or the event at the playhead when there is none. */
  const editAtPlayhead = (preferEvent: boolean) => {
    const t = clock.getSnapshot().timeS
    const action = preferEvent ? null : latestActionAt(visibleActions, t, Math.max(EDIT_ACTION_WINDOW_S, settings.actionBadgeSeconds))
    if (action) {
      openEditorForAction(action)
      return
    }
    const event = eventNear(t)
    if (event) openClipForEvent(event)
  }

  /** N: a play the pipeline missed, added at the playhead. */
  const addPlayAtPlayhead = () => openEditor(null, clock.getSnapshot().timeS, 'review')

  const openClipForEdit = (clip: SavedClip) => {
    clock.pause()
    rangePlayback.controller.stop()
    clock.seek(clip.anchorS)
    dispatch({ type: 'openEditor', target: { kind: 'edit', clip, opened: Date.now() } })
  }

  const closeEditor = () => {
    rangePlayback.controller.stop()
    dispatch({ type: 'closeEditor' })
  }

  // The lists are memoised (a match has ~1,500 ball actions): they get callbacks that keep their identity.
  const onSelectEvent = useStableCallback(seekToEvent)
  const onSelectAction = useStableCallback(seekToAction)
  const onEditEvent = useStableCallback(openClipForEvent)
  const onEditAction = useStableCallback(openEditorForAction)

  // Opening the editor brings the player to the top of the page: the (shorter) video and the whole editor fit on screen.
  const openedKey = state.editor ? editorKey(state.editor) : null
  useEffect(() => {
    if (openedKey && !document.fullscreenElement) playerRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [openedKey])

  // The editor target as of the latest render, for the corrections that finish after an await.
  const editorRef = useRef(state.editor)
  useEffect(() => {
    editorRef.current = state.editor
  })

  /** After a saved correction: the editor closes (unless the user moved on meanwhile) and the video carries on. */
  const finishCorrection = (target: EditorTarget) => {
    if (editorRef.current !== target) return
    closeEditor()
    if (target.kind === 'new' && target.resume) clock.play()
  }

  const applyCorrection = async (patch: ReviewPatch) => {
    const target = state.editor
    if (target?.kind !== 'new' || !target.subject) return
    if (!isEmptyPatch(patch) && !(await review.updateItem(subjectId(target.subject), patch))) return
    finishCorrection(target)
  }

  const addPlay = async (input: ReviewAddInput) => {
    const target = state.editor
    if (target?.kind !== 'new') return
    if (await review.addItem(input)) finishCorrection(target)
  }

  const deleteDetection = async () => {
    const target = state.editor
    if (target?.kind !== 'new' || !target.subject) return
    const { subject } = target
    if (!(await review.deleteItem(subjectId(subject)))) return
    setDeletedItem({ id: subjectId(subject), label: subjectLabel(subject), timeS: subjectInstantS(subject) })
    finishCorrection(target)
  }

  const undoDeleteDetection = async () => {
    if (deletedItem && (await review.restoreItem(deletedItem.id))) setDeletedItem(null)
  }
  const dismissDeletedItem = useCallback(() => setDeletedItem(null), [])

  // E / Shift+E / N while the editor is closed. Typing in a field is left alone.
  const shortcuts = useRef({ editAtPlayhead, addPlayAtPlayhead })
  useEffect(() => {
    shortcuts.current = { editAtPlayhead, addPlayAtPlayhead }
  })
  const reviewKeys = review.supported && state.editor === null
  useEffect(() => {
    if (!reviewKeys) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'e' || e.key === 'E') shortcuts.current.editAtPlayhead(e.shiftKey)
      else if (e.key === 'n' || e.key === 'N') shortcuts.current.addPlayAtPlayhead()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reviewKeys])

  const saveClip = (draft: ClipDraft) => {
    const saved = savedClips.save(draft)
    closeEditor()
    dispatch({ type: 'setTab', tab: 'clips' })
    setJustSavedId(saved.id)
  }

  /** Deletes with undo: the Saved clips tab shows the undo bar, also when the editor did the deleting. */
  const deleteClip = (clip: SavedClip) => {
    if (playingClipId === clip.id) rangePlayback.controller.stop()
    const removed = savedClips.remove(clip.id)
    if (removed) setLastDeleted(removed)
    if (state.editor?.kind === 'edit' && state.editor.clip.id === clip.id) closeEditor()
    dispatch({ type: 'setTab', tab: 'clips' })
  }

  const undoDelete = () => {
    if (lastDeleted) savedClips.restore(lastDeleted)
    setLastDeleted(null)
  }
  const dismissDelete = useCallback(() => setLastDeleted(null), [])

  const playClip = (clip: SavedClip) => {
    setPlayingClipId(clip.id)
    rangePlayback.controller.play({ startS: clip.startS, endS: clip.endS, loop: false })
  }

  const exportClips = () => {
    const json = clipsExportJson(match.id, part.id, savedClips.clips)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clips-${match.id}-${part.id}.json`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const editorDraft: ClipDraft | null = useMemo(() => {
    const target = state.editor
    if (!target) return null
    if (target.kind === 'edit') return draftFromClip(target.clip)
    const ctx = { matchId: match.id, partId: part.id, video, actions: visibleActions }
    if (target.subject?.kind === 'event') return draftFromEvent(target.subject.event, ctx)
    if (target.subject?.kind === 'action') return draftFromAction(target.subject.action, ctx)
    const draft = draftAtTime(target.atS, ctx)
    if (target.intent !== 'review') return draft
    // A play the pipeline missed: it needs a real class (it starts as the most common one), and the best guess of
    // who made it is whoever had the ball at that very frame, not the player of the nearest detected action.
    const frame = store?.getFrameOrPrevious(frameIndexForTime(target.atS, clock.getTiming())) ?? null
    const possessorId = frame?.possessorTrackerId ?? null
    const possessor = possessorId !== null ? { trackerId: possessorId, jersey: frame?.persons.find((p) => p.trackerId === possessorId)?.jersey ?? null, teamCluster: teams.byTrackerId.get(possessorId) ?? null, name: null } : null
    return { ...draft, label: NEW_PLAY_LABEL, title: defaultClipTitle(NEW_PLAY_LABEL, draft.anchorS), player: possessor ?? draft.player }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once when the editor opens: the store is mutated in place and the editor keeps its own copy
  }, [state.editor, match.id, part.id, video, visibleActions])

  const editorSubject = state.editor?.kind === 'new' ? state.editor.subject : null
  const editorReview: EditorReview | null =
    review.supported && state.editor?.kind === 'new'
      ? {
          info: review.info,
          homeName: match.homeTeam,
          awayName: match.awayTeam,
          busy: review.busy,
          error: review.error,
          addFirst: state.editor.intent === 'review',
          onApply: (patch) => void applyCorrection(patch),
          onAdd: (input) => void addPlay(input),
          onDelete: () => void deleteDetection(),
        }
      : null

  const editingClip: SavedClip | null = state.editor?.kind === 'edit' ? state.editor.clip : null
  const editingRange = state.editor && editorDraft ? { startS: editorDraft.startS, endS: editorDraft.endS } : null
  const playingId = rangePlayback.active ? playingClipId : null

  const stageNote =
    tracking.status === 'loading' ? (
      <span className={s.loadingNote}>
        <Spinner /> Loading tracking… {tracking.progress.loaded}/{tracking.progress.total}
      </span>
    ) : tracking.status === 'error' ? (
      'Tracking unavailable'
    ) : null

  const panelTitle =
    state.sidebarTab === 'events'
      ? `Play history · ${events.length}`
      : state.sidebarTab === 'actions'
        ? `Ball actions · ${visibleActions.length}`
        : state.sidebarTab === 'clips'
          ? `Saved clips · ${savedClips.clips.length}`
          : highlightsTitle

  return (
    <>
      <div ref={playerRef} className={cx(s.player, state.editor && s.playerEditing)}>
        <VideoStage
          video={video}
          clock={clock}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onToggleFullscreen={toggleFullscreen}
          note={stageNote}
          badges={
            <>
              {part.mode === 'clip' && <Badge>Clip analysis</Badge>}
              {store && availability.possession === 'no-data' && <Badge>No possession data</Badge>}
            </>
          }
          uiLayer={
            <>
              <EventCardHitArea
                clock={clock}
                events={events}
                fps={video.fps}
                enabled={state.layers.cards && state.editor === null}
                onPick={openClipForEvent}
                actions={visibleActions}
                actionWindowS={settings.actionBadgeSeconds}
                onPickAction={review.supported ? openEditorForAction : undefined}
                editable={review.supported}
              />
              {state.editor && (
                <PlayerPickLayer clock={clock} store={store} sourceWidth={video.width} sourceHeight={video.height} onPick={(person) => picks.emit({ trackerId: person.trackerId, jersey: person.jersey })} />
              )}
            </>
          }
        >
          <OverlayCanvas
            clock={clock}
            store={tracking.store}
            teams={teams}
            actions={visibleActions}
            events={events}
            layers={state.layers}
            settings={settings}
            selectedTrackerId={state.selectedTrackerId}
            sourceWidth={video.width}
            sourceHeight={video.height}
            fps={video.fps}
            revision={tracking.revision}
          />
        </VideoStage>
        {state.editor && editorDraft && (
          <ClipEditor
            key={editorKey(state.editor)}
            draft={editorDraft}
            mode={editingClip ? 'edit' : 'create'}
            video={video}
            clock={clock}
            events={events}
            actions={visibleActions}
            teams={teams}
            store={store}
            trackingRevision={tracking.revision}
            trackingStatus={tracking.status}
            rangePlayback={rangePlayback.controller}
            activeRange={rangePlayback.active}
            onSave={saveClip}
            onCancel={closeEditor}
            onDelete={editingClip ? () => deleteClip(editingClip) : undefined}
            subject={editorSubject}
            review={editorReview}
            picks={picks}
            onPlayerChange={(trackerId) => dispatch({ type: 'selectTracker', trackerId })}
          />
        )}
        <PlayerControls
          clock={clock}
          durationS={video.durationS}
          events={events}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onFullscreen={toggleFullscreen}
          layerBar={<LayerBar layers={state.layers} availability={availability} onToggle={(id, on) => dispatch({ type: 'toggleLayer', id, on })} />}
          clips={savedClips.clips}
          editingRange={editingRange}
          onCreateClip={openClipAtPlayhead}
        />
      </div>

      {review.supported && review.info && (review.info.exists || deletedItem) && (
        <ReviewBar
          matchId={match.id}
          partId={part.id}
          info={review.info}
          durationS={video.durationS}
          busy={review.busy}
          error={state.editor === null ? review.error : null}
          deleted={deletedItem}
          onUndoDelete={() => void undoDeleteDetection()}
          onDismissDelete={dismissDeletedItem}
          onExport={review.exportSheet}
        />
      )}

      <div className={s.grid}>
        <div className={s.column}>
          <Panel title="Layers">
            <LayerPanel layers={state.layers} availability={availability} onToggle={(id, on) => dispatch({ type: 'toggleLayer', id, on })} teams={teams} />
          </Panel>
          <Panel title="Players on screen">
            {tracking.status === 'error' ? (
              <ErrorState error={tracking.error} title="Tracking unavailable" onRetry={tracking.retry} />
            ) : !trackingNeeded && store === null ? (
              <EmptyState title="Tracking not loaded">Turn on a video layer (Players, Ball, Trails…) to load the tracking around the playhead.</EmptyState>
            ) : (
              <TrackletPanel
                store={store}
                teams={teams}
                clock={clock}
                fps={video.fps}
                selectedTrackerId={state.selectedTrackerId}
                onSelect={(trackerId) => dispatch({ type: 'selectTracker', trackerId })}
              />
            )}
          </Panel>
        </div>

        <div className={s.column}>
          <Panel
            className={s.eventsPanel}
            flush
            title={panelTitle}
            actions={
              <div className={eventStyles.tabs} role="tablist" aria-label="Timeline content">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={state.sidebarTab === tab.id}
                    className={cx(eventStyles.tab, state.sidebarTab === tab.id && eventStyles.active)}
                    onClick={() => dispatch({ type: 'setTab', tab: tab.id })}
                  >
                    {tab.label}
                    {tab.id === 'clips' && savedClips.clips.length > 0 && <span className={eventStyles.tabCount}>{savedClips.clips.length}</span>}
                  </button>
                ))}
              </div>
            }
          >
            {state.sidebarTab === 'highlights' ? (
              <HighlightsPanel
                matchId={match.id}
                partId={part.id}
                analysisCompleted={part.status === 'completed'}
                onSeek={seekToHighlight}
                onStatus={setHighlightsLive}
              />
            ) : state.sidebarTab === 'clips' ? (
              <SavedClipsPanel
                clips={savedClips.clips}
                teams={teams}
                clock={clock}
                playingId={playingId}
                editingId={editingClip?.id ?? null}
                highlightId={justSavedId}
                onPlay={playClip}
                onStop={() => rangePlayback.controller.stop()}
                onEdit={openClipForEdit}
                onDelete={deleteClip}
                deleted={lastDeleted}
                onUndoDelete={undoDelete}
                onDismissDelete={dismissDelete}
                onExport={exportClips}
                onCreate={openClipAtPlayhead}
              />
            ) : (
              <>
                {analysis.status === 'loading' && (
                  <div style={{ padding: 24, textAlign: 'center' }}>
                    <Spinner label="Loading analysis" />
                  </div>
                )}
                {analysis.status === 'error' && <ErrorState error={analysis.error} title="Analysis unavailable" onRetry={analysis.reload} />}
                {analysis.status === 'success' &&
                  (state.sidebarTab === 'events' ? (
                    <EventList events={events} clock={clock} onSelect={onSelectEvent} showConfidence={settings.showConfidence} onCreateClip={onEditEvent} editable={review.supported} />
                  ) : (
                    <BallActionList
                      actions={allActions}
                      teams={teams}
                      clock={clock}
                      onSelect={onSelectAction}
                      showConfidence={settings.showConfidence}
                      onEdit={review.supported ? onEditAction : undefined}
                    />
                  ))}
              </>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
