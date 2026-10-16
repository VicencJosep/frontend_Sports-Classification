import type { TeamInfo } from './teams'
import type { AnalysisStatus, PartKind, Role, TeamCluster } from './vocab'
import { isKnownBallActionLabel, isKnownEventLabel, type KnownBallActionLabel, type KnownEventLabel } from './vocab'

/**
 * Display mappings: names and colours for the pipeline vocabularies.
 * Colours are hex so the same values work for CSS and canvas drawing.
 */

export const EVENT_COLORS: Readonly<Record<KnownEventLabel, string>> = {
  goal: '#f43f5e',
  shot: '#fb923c',
  penalty: '#dc2626',
  card: '#facc15',
  foul: '#a855f7',
  free_kick: '#e879f9',
  corner: '#22d3ee',
  throw_in: '#2dd4bf',
  kick_off: '#4ade80',
  offside: '#94a3b8',
  substitution: '#818cf8',
}

export const BALL_ACTION_COLORS: Readonly<Record<KnownBallActionLabel, string>> = {
  pass: '#60a5fa',
  drive: '#a3e635',
  high_pass: '#34d399',
  header: '#fbbf24',
  throw_in: '#2dd4bf',
  background: '#6b7280',
}

export const NEUTRAL_LABEL_COLOR = '#9aa7b8'

/** Mirrors `--team-a`, `--team-b`, `--team-neutral` in tokens.css. */
export const TEAM_COLORS: readonly string[] = ['#60a5fa', '#f87171', '#c084fc', '#fbbf24']
export const TEAM_NEUTRAL_COLOR = '#d1d5db'
export const BALL_COLOR = '#ffffff'
export const POSSESSION_COLOR = '#22c55e'
export const SELECTION_COLOR = '#ffffff'

export function eventColor(label: string): string {
  return isKnownEventLabel(label) ? EVENT_COLORS[label] : NEUTRAL_LABEL_COLOR
}

export function ballActionColor(label: string): string {
  return isKnownBallActionLabel(label) ? BALL_ACTION_COLORS[label] : NEUTRAL_LABEL_COLOR
}

const DISPLAY_OVERRIDES: Readonly<Record<string, string>> = { kick_off: 'Kick-off', throw_in: 'Throw-in' }

/** "kick_off" -> "Kick-off", "high_pass" -> "High pass", "background_public" -> "Background public". */
export function labelDisplayName(label: string): string {
  const override = DISPLAY_OVERRIDES[label]
  if (override !== undefined) return override
  const text = label.replace(/_/g, ' ').trim()
  if (text.length === 0) return label
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function teamDisplayName(cluster: TeamCluster): string {
  const letter = String.fromCharCode(65 + (cluster % 26))
  return `Team ${letter}`
}

export function teamColor(cluster: TeamCluster): string {
  return TEAM_COLORS[cluster % TEAM_COLORS.length] ?? TEAM_NEUTRAL_COLOR
}

export function makeTeamInfo(cluster: TeamCluster): TeamInfo {
  return { cluster, displayName: teamDisplayName(cluster), color: teamColor(cluster) }
}

export const ROLE_DISPLAY: Readonly<Record<Role, string>> = {
  player: 'Player',
  goalkeeper: 'Goalkeeper',
  referee: 'Referee',
  other: 'Other',
}

export const ROLE_SHORT: Readonly<Record<Role, string>> = {
  player: '',
  goalkeeper: 'GK',
  referee: 'REF',
  other: '',
}

export const STATUS_DISPLAY: Readonly<Record<AnalysisStatus, string>> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Analysis completed',
  error: 'Error',
}

export const PART_KIND_DISPLAY: Readonly<Record<PartKind, string>> = {
  full: 'Full match',
  'first-half': 'First half',
  'second-half': 'Second half',
}
