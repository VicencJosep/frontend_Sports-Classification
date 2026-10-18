import type { MatchAnalysis } from '@/domain'
import type { TrackingStore } from '@/lib/trackingStore'

export type LayerId = 'players' | 'playerIds' | 'teams' | 'ball' | 'tracking' | 'possession' | 'ballActions' | 'cards' | 'trajectories' | 'heatmap'

export interface LayerDefinition {
  id: LayerId
  label: string
  hint: string
  defaultOn: boolean
  /** Not produced by the pipeline yet: shown disabled. */
  future?: boolean
}

export const LAYERS: readonly LayerDefinition[] = [
  { id: 'players', label: 'Players', hint: 'Detected people: players, goalkeepers, referees. Turning it on loads the tracking data around the playhead.', defaultOn: false },
  { id: 'playerIds', label: 'Player IDs', hint: 'Jersey number when read, otherwise the tracker id.', defaultOn: false },
  { id: 'teams', label: 'Teams', hint: 'Colour by appearance cluster (two teams); grey for referees and unassigned tracks.', defaultOn: false },
  { id: 'ball', label: 'Ball', hint: 'Best ball detection per frame; it is often missed on wide shots.', defaultOn: false },
  { id: 'tracking', label: 'Tracking', hint: 'Short movement trail per tracked player.', defaultOn: false },
  { id: 'possession', label: 'Possession', hint: 'Highlights the player holding the ball (nearest player, with hysteresis).', defaultOn: false },
  { id: 'ballActions', label: 'Ball actions', hint: 'Pass, drive, header, high pass, throw-in badges on the acting player.', defaultOn: false },
  { id: 'cards', label: 'Event & action cards', hint: 'On-video notifications, as in the pipeline video: the current event (shot, goal, foul...) and the latest ball action with its player.', defaultOn: true },
  { id: 'trajectories', label: 'Trajectories', hint: 'Full-pitch paths: not produced by the pipeline yet.', defaultOn: false, future: true },
  { id: 'heatmap', label: 'Heatmap', hint: 'Position density: not produced by the pipeline yet.', defaultOn: false, future: true },
]

export type LayerState = Record<LayerId, boolean>

/** Layers shown as quick toggles over the player, in display order. */
export const QUICK_LAYERS: readonly { id: LayerId; label: string }[] = [
  { id: 'players', label: 'Players' },
  { id: 'playerIds', label: 'IDs' },
  { id: 'teams', label: 'Teams' },
  { id: 'ball', label: 'Ball' },
  { id: 'tracking', label: 'Trails' },
  { id: 'possession', label: 'Possession' },
  { id: 'ballActions', label: 'Actions' },
  { id: 'cards', label: 'Cards' },
]

export const DEFAULT_LAYERS: LayerState = Object.fromEntries(LAYERS.map((l) => [l.id, l.defaultOn])) as LayerState

/**
 * Layers drawn from the tracking frames. They start off: tracking is ~0.6 MB (gzipped) per 30 s of match, so it is
 * only downloaded while one of these is on or a player is selected. Cards and the lists work without it.
 */
export const TRACKING_LAYERS: readonly LayerId[] = ['players', 'playerIds', 'ball', 'tracking', 'possession', 'ballActions']

export function needsTracking(layers: LayerState, selectedTrackerId: number | null): boolean {
  return selectedTrackerId !== null || TRACKING_LAYERS.some((id) => layers[id])
}

export type LayerAvailability = 'available' | 'no-data' | 'future'

/**
 * Which layers have data behind them for this part. Pure data inspection, nothing is computed.
 * `store` is null until tracking has been requested (see `needsTracking`): the tracking layers then stay
 * switchable, since turning one on is what starts the download.
 */
export function layerAvailability(analysis: MatchAnalysis | null, store: TrackingStore | null): Record<LayerId, LayerAvailability> {
  const notLoadedYet = store === null
  const hasTracking = notLoadedYet || store.loadedFrames > 0
  const frames = store !== null && hasTracking ? store.sampleLoaded(200) : []
  const hasBall = notLoadedYet || frames.some((f) => f.ball !== null)
  const hasPossession = notLoadedYet || frames.some((f) => f.possessorTrackerId !== null)
  const hasTeams = analysis !== null && analysis.teams.byTrackerId.size > 0
  const hasActions = analysis !== null && analysis.ballActions.some((a) => !a.isBackground)
  const hasEvents = analysis !== null && analysis.events.length > 0
  return {
    players: hasTracking ? 'available' : 'no-data',
    playerIds: hasTracking ? 'available' : 'no-data',
    teams: hasTeams ? 'available' : 'no-data',
    ball: hasBall ? 'available' : 'no-data',
    tracking: hasTracking ? 'available' : 'no-data',
    possession: hasPossession ? 'available' : 'no-data',
    ballActions: hasActions ? 'available' : 'no-data',
    cards: hasActions || hasEvents ? 'available' : 'no-data',
    trajectories: 'future',
    heatmap: 'future',
  }
}
