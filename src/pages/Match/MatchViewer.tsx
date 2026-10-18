import { useCallback, useMemo, useReducer, useRef, useState } from 'react'

import { useMatchService } from '@/app/providers/useServices'
import { useSettings } from '@/app/providers/useSettings'
import { Badge, EmptyState, ErrorState, Panel, Spinner } from '@/components/common'
import { BallActionList, EventList } from '@/components/events'
import { HighlightsPanel } from '@/components/highlights'
import { LayerBar } from '@/components/layers/LayerBar'
import { LayerPanel } from '@/components/layers/LayerPanel'
import { layerAvailability, needsTracking } from '@/components/layers/layers'
import { TrackletPanel } from '@/components/players/TrackletPanel'
import { OverlayCanvas } from '@/components/video/OverlayCanvas'
import { PlayerControls } from '@/components/video/PlayerControls'
import { VideoStage } from '@/components/video/VideoStage'
import type { BallAction, HighlightClip, Match, MatchEvent, MatchPart, PartHighlights, VideoInfo } from '@/domain'
import { EMPTY_TEAM_ASSIGNMENTS } from '@/domain'
import { useAsync } from '@/hooks/useAsync'
import { useTrackingWindows } from '@/hooks/useTrackingWindows'
import { VideoClock } from '@/lib/videoClock'
import type { TrackingRange } from '@/services'
import { cx } from '@/utils/cx'

import s from './Match.module.css'
import eventStyles from '@/components/events/events.module.css'
import { initialViewerState, viewerReducer } from './viewerState'

interface MatchViewerProps {
  match: Match
  part: MatchPart
  video: VideoInfo
}

const ACTION_PREROLL_S = 0.6

/** The viewer for one analysed part: video + overlays + layers + events + players. Mounted per part (keyed by the page). */
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
  // layer drawn from it is on or a player is selected: by default a match opens with the video alone.
  const trackingNeeded = needsTracking(state.layers, state.selectedTrackerId)
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

  const stageNote =
    tracking.status === 'loading' ? (
      <span className={s.loadingNote}>
        <Spinner /> Loading tracking… {tracking.progress.loaded}/{tracking.progress.total}
      </span>
    ) : tracking.status === 'error' ? (
      'Tracking unavailable'
    ) : null

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
        <PlayerControls
          clock={clock}
          durationS={video.durationS}
          events={events}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onFullscreen={toggleFullscreen}
          layerBar={<LayerBar layers={state.layers} availability={availability} onToggle={(id, on) => dispatch({ type: 'toggleLayer', id, on })} />}
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
            title={
              state.sidebarTab === 'events'
                ? `Play history · ${events.length}`
                : state.sidebarTab === 'actions'
                  ? `Ball actions · ${visibleActions.length}`
                  : highlightsTitle
            }
            actions={
              <div className={eventStyles.tabs} role="tablist" aria-label="Timeline content">
                <button
                  type="button"
                  role="tab"
                  aria-selected={state.sidebarTab === 'events'}
                  className={cx(eventStyles.tab, state.sidebarTab === 'events' && eventStyles.active)}
                  onClick={() => dispatch({ type: 'setTab', tab: 'events' })}
                >
                  Play history
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={state.sidebarTab === 'actions'}
                  className={cx(eventStyles.tab, state.sidebarTab === 'actions' && eventStyles.active)}
                  onClick={() => dispatch({ type: 'setTab', tab: 'actions' })}
                >
                  Ball actions
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={state.sidebarTab === 'highlights'}
                  className={cx(eventStyles.tab, state.sidebarTab === 'highlights' && eventStyles.active)}
                  onClick={() => dispatch({ type: 'setTab', tab: 'highlights' })}
                >
                  Highlights
                </button>
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
                    <EventList events={events} clock={clock} onSelect={seekToEvent} showConfidence={settings.showConfidence} />
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
