import { useCallback, useMemo, useReducer, useRef, useState } from 'react'

import { useMatchService } from '@/app/providers/useServices'
import { useSettings } from '@/app/providers/useSettings'
import { Badge, EmptyState, ErrorState, Panel, Spinner } from '@/components/common'
import { ClipEditor, SavedClipsPanel } from '@/components/clips'
import { BallActionList, EventList } from '@/components/events'
import { HighlightsPanel } from '@/components/highlights'
import { LayerBar } from '@/components/layers/LayerBar'
import { LayerPanel } from '@/components/layers/LayerPanel'
import { layerAvailability, needsTracking } from '@/components/layers/layers'
import { TrackletPanel } from '@/components/players/TrackletPanel'
import { EventCardHitArea } from '@/components/video/EventCardHitArea'
import { OverlayCanvas } from '@/components/video/OverlayCanvas'
import { PlayerControls } from '@/components/video/PlayerControls'
import { VideoStage } from '@/components/video/VideoStage'
import type { BallAction, ClipDraft, HighlightClip, Match, MatchEvent, MatchPart, PartHighlights, SavedClip, VideoInfo } from '@/domain'
import { EMPTY_TEAM_ASSIGNMENTS, clipsExportJson, draftAtTime, draftFromClip, draftFromEvent } from '@/domain'
import { useAsync } from '@/hooks/useAsync'
import { useRangePlayback } from '@/hooks/useRangePlayback'
import { useSavedClips } from '@/hooks/useSavedClips'
import { useTrackingWindows } from '@/hooks/useTrackingWindows'
import { VideoClock } from '@/lib/videoClock'
import type { TrackingRange } from '@/services'
import { cx } from '@/utils/cx'

import s from './Match.module.css'
import eventStyles from '@/components/events/events.module.css'
import { editorKey, initialViewerState, viewerReducer, type SidebarTab } from './viewerState'

interface MatchViewerProps {
  match: Match
  part: MatchPart
  video: VideoInfo
}

const ACTION_PREROLL_S = 0.6
/** The "Clip" button takes the event this close to the playhead; otherwise it cuts a plain play. */
const NEAREST_EVENT_S = 3

const TABS: readonly { id: SidebarTab; label: string }[] = [
  { id: 'events', label: 'Play history' },
  { id: 'actions', label: 'Ball actions' },
  { id: 'highlights', label: 'Highlights' },
  { id: 'clips', label: 'Saved clips' },
]

/** The viewer for one analysed part: video + overlays + layers + events + players + clip editor. Mounted per part (keyed by the page). */
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

  const teams = analysis.data?.teams ?? EMPTY_TEAM_ASSIGNMENTS
  const events = useMemo<MatchEvent[]>(() => analysis.data?.events ?? [], [analysis.data])
  const allActions = useMemo<BallAction[]>(() => analysis.data?.ballActions ?? [], [analysis.data])
  const visibleActions = useMemo(() => allActions.filter((a) => !a.isBackground), [allActions])

  // Tracking arrives by time windows around the playhead (a full match is ~145k frames), and only while a
  // layer drawn from it is on, a player is selected or the clip editor needs the players on screen.
  const trackingNeeded = needsTracking(state.layers, state.selectedTrackerId) || state.editor !== null
  const tracking = useTrackingWindows(loadTracking, clock, video.durationS, video.frameCount, teams, trackingNeeded)
  const store = tracking.revision > 0 ? tracking.store : null
  const availability = useMemo(
    () => layerAvailability(analysis.data ?? null, store),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the store is mutated in place; `revision` tracks it
    [analysis.data, store, tracking.revision],
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

  // --- clips -----------------------------------------------------------------------------------

  /** Opens the editor on an event: the video pauses where it is (the card was clicked mid-play). */
  const openClipForEvent = (event: MatchEvent) => {
    clock.pause()
    rangePlayback.controller.stop()
    dispatch({ type: 'openEditor', target: { kind: 'new', event, atS: event.seekS, opened: Date.now() } })
  }

  /** The "Clip" button: the event at the playhead when there is one close enough, otherwise a plain play. */
  const openClipAtPlayhead = () => {
    const t = clock.getSnapshot().timeS
    let nearest: MatchEvent | null = null
    for (const e of events) {
      const d = t >= e.startS && t <= e.endS ? 0 : Math.min(Math.abs(e.seekS - t), Math.abs(e.endS - t))
      if (d <= NEAREST_EVENT_S && (nearest === null || d < Math.min(Math.abs(nearest.seekS - t), Math.abs(nearest.endS - t)))) nearest = e
    }
    if (nearest) {
      openClipForEvent(nearest)
      return
    }
    clock.pause()
    rangePlayback.controller.stop()
    dispatch({ type: 'openEditor', target: { kind: 'new', event: null, atS: t, opened: Date.now() } })
  }

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
    return target.event ? draftFromEvent(target.event, ctx) : draftAtTime(target.atS, ctx)
  }, [state.editor, match.id, part.id, video, visibleActions])

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
      <div ref={playerRef} className={s.player}>
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
          uiLayer={<EventCardHitArea clock={clock} events={events} fps={video.fps} enabled={state.layers.cards && state.editor === null} onPick={openClipForEvent} />}
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
                    <EventList events={events} clock={clock} onSelect={seekToEvent} showConfidence={settings.showConfidence} onCreateClip={openClipForEvent} />
                  ) : (
                    <BallActionList actions={allActions} teams={teams} clock={clock} onSelect={seekToAction} showConfidence={settings.showConfidence} />
                  ))}
              </>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
