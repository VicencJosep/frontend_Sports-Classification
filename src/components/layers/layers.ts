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
  { id: 'players', label: 'Players', hint: 'Detected people: players, goalkeepers, referees.', defaultOn: true },
  { id: 'playerIds', label: 'Player IDs', hint: 'Jersey number when read, otherwise the tracker id.', defaultOn: true },
  { id: 'teams', label: 'Teams', hint: 'Colour by appearance cluster (two teams); grey for referees and unassigned tracks.', defaultOn: true },
  { id: 'ball', label: 'Ball', hint: 'Best ball detection per frame; it is often missed on wide shots.', defaultOn: true },
  { id: 'tracking', label: 'Tracking', hint: 'Short movement trail per tracked player.', defaultOn: true },
  { id: 'possession', label: 'Possession', hint: 'Highlights the player holding the ball (nearest player, with hysteresis).', defaultOn: true },
  { id: 'ballActions', label: 'Ball actions', hint: 'Pass, drive, header, high pass, throw-in badges on the acting player.', defaultOn: true },
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

export type LayerAvailability = 'available' | 'no-data' | 'future'

/** Which layers have data behind them for this part. Pure data inspection, nothing is computed. */
export function layerAvailability(analysis: MatchAnalysis | null, store: TrackingStore | null): Record<LayerId, LayerAvailability> {
  const hasTracking = store !== null && store.loadedFrames > 0
  const frames = hasTracking ? store.sampleLoaded(200) : []
  const hasBall = frames.some((f) => f.ball !== null)
  const hasPossession = frames.some((f) => f.possessorTrackerId !== null)
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
