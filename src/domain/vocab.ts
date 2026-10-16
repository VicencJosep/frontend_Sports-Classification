/**
 * Vocabularies observed in the Sports-Classification outputs.
 *
 * String unions instead of enums (the project compiles with `erasableSyntaxOnly`).
 * Known labels are listed so the UI can give them names and colours, but every
 * label type is widened with `AnyString`: a new class in a future Python
 * checkpoint must render with a neutral style, never crash the frontend.
 */

/** `string` that keeps autocomplete for the known literals. */
export type AnyString = string & Record<never, never>

/**
 * Timeline event classes. Since 15-oct-2026 they all come from T-DEED (`core/ball_spotting.py::EVENT_SOURCES`): the
 * nine of the former `core/events.py` plus `free_kick` and `offside`; the `background_*` classes never become spans.
 * Canonical snake_case, as the backend exposes them (`kick-off` -> `kick_off`, `throw-in` -> `throw_in`).
 */
export const EVENT_LABELS = [
  'card',
  'corner',
  'foul',
  'free_kick',
  'goal',
  'kick_off',
  'offside',
  'penalty',
  'shot',
  'substitution',
  'throw_in',
] as const
export type KnownEventLabel = (typeof EVENT_LABELS)[number]
export type EventLabel = KnownEventLabel | AnyString

/** Ball-action classes of `core/ball_actions.py` / T-DEED mapping in `core/ball_spotting.py`. */
export const BALL_ACTION_LABELS = ['pass', 'drive', 'high_pass', 'header', 'throw_in', 'background'] as const
export type KnownBallActionLabel = (typeof BALL_ACTION_LABELS)[number]
export type BallActionLabel = KnownBallActionLabel | AnyString

/** Person roles emitted by the detector (`core/tracking.py::ROLE_TO_CLASS_ID`, minus "ball"). */
export const ROLES = ['player', 'goalkeeper', 'referee', 'other'] as const
export type Role = (typeof ROLES)[number]

/** Team cluster index from `teams.json` (`team_cluster`). The pipeline uses k=2 today; kept numeric for forward compatibility. */
export type TeamCluster = number

export const ANALYSIS_STATUSES = ['pending', 'processing', 'completed', 'error'] as const
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number]

/** The two flows of `main.py`: a short clip (single event) or a full match (event timeline). */
export type AnalysisMode = 'clip' | 'full-match'

/** How a match video was uploaded: one file, or one file per half. */
export const PART_KINDS = ['full', 'first-half', 'second-half'] as const
export type PartKind = (typeof PART_KINDS)[number]

/** Pipeline spelling -> canonical label: lower case, hyphens and spaces to underscores. Same rule as the backend adapter. */
export function canonicalLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[-\s]+/g, '_')
}

export function isKnownEventLabel(label: string): label is KnownEventLabel {
  return (EVENT_LABELS as readonly string[]).includes(label)
}

export function isKnownBallActionLabel(label: string): label is KnownBallActionLabel {
  return (BALL_ACTION_LABELS as readonly string[]).includes(label)
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function isAnalysisStatus(value: unknown): value is AnalysisStatus {
  return typeof value === 'string' && (ANALYSIS_STATUSES as readonly string[]).includes(value)
}

export function isPartKind(value: unknown): value is PartKind {
  return typeof value === 'string' && (PART_KINDS as readonly string[]).includes(value)
}
