import type { MatchAnalysis } from './analysis'
import type { BallAction, MatchEvent } from './events'
import { eventInstantS } from './events'
import { isKnownEventLabel, type ReviewKind, type ReviewSide } from './vocab'

/**
 * Corrections to what the pipeline detected, made from the clip editor: the
 * label, the player, the team and the instant of a ball action or an event,
 * deleting a false detection, adding a missed one. The backend keeps them in a
 * reviewed copy of the analysis (`review/analysis.json`); the pipeline output
 * is never touched. The ground-truth sheet is exported from that copy.
 */

export interface ReviewInfo {
  /** False until the first correction: there is no copy on disk yet. */
  exists: boolean
  /** ISO timestamps, null while the copy does not exist. */
  createdAt: string | null
  updatedAt: string | null
  nEdited: number
  nAdded: number
  /** Pipeline detections the user deleted. */
  nDeleted: number
  /** The pipeline ran again after the copy was made: its tracker ids are no longer the copy's. */
  stale: boolean
  /** Team already set for a tracklet: applies to every action of that tracklet that has no team of its own. */
  trackerSides: ReadonlyMap<number, ReviewSide>
}

/** The detected item the editor is open on. */
export type ReviewSubject = { kind: 'event'; event: MatchEvent } | { kind: 'action'; action: BallAction }

/** Fields to change; absent ones are left alone. `trackerId: null` = player unknown, `side: null` = no team. */
export interface ReviewPatch {
  label?: string
  timeS?: number
  trackerId?: number | null
  side?: ReviewSide | null
}

export interface ReviewAddInput {
  kind: ReviewKind
  label: string
  timeS: number
  trackerId: number | null
  side: ReviewSide | null
}

/** What one correction left: the item as stored (null fields for the other kind) and the copy's new state. */
export interface ReviewResult {
  kind: ReviewKind
  id: string
  deleted: boolean
  action: BallAction | null
  event: MatchEvent | null
  info: ReviewInfo
}

/** The ground-truth sheet (`tiempo,etiqueta,dorsal,equipo`) of a range of the reviewed copy. */
export interface ReviewSheet {
  fromS: number
  toS: number
  nRows: number
  filename: string
  /** Where the backend also saved it, relative to the pipeline repo. */
  path: string
  csv: string
}

/** What the editor form holds when the user applies a correction. */
export interface ReviewForm {
  label: string
  timeS: number
  trackerId: number | null
  side: ReviewSide | null
}

export function subjectId(subject: ReviewSubject): string {
  return subject.kind === 'event' ? subject.event.id : subject.action.id
}

export function subjectLabel(subject: ReviewSubject): string {
  return subject.kind === 'event' ? subject.event.label : subject.action.label
}

/** The instant a correction moves: the action's frame time, or the peak of the event's span. */
export function subjectInstantS(subject: ReviewSubject): number {
  return subject.kind === 'event' ? eventInstantS(subject.event) : subject.action.timestampS
}

export function subjectTrackerId(subject: ReviewSubject): number | null {
  return (subject.kind === 'event' ? subject.event.trackerId : subject.action.trackerId) ?? null
}

/** The team set on the item itself (not the one inherited from its tracklet). */
export function subjectSide(subject: ReviewSubject): ReviewSide | null {
  return (subject.kind === 'event' ? subject.event.side : subject.action.side) ?? null
}

/** The team of an item: its own, or the one already set for its tracklet. */
export function effectiveSide(own: ReviewSide | null, trackerId: number | null, info: ReviewInfo | null | undefined): ReviewSide | null {
  if (own) return own
  return trackerId !== null ? (info?.trackerSides.get(trackerId) ?? null) : null
}

/** Where a new item goes: the timeline classes are events, everything else is a ball action. */
export function reviewKindForLabel(label: string): ReviewKind {
  return isKnownEventLabel(label) ? 'event' : 'action'
}

/**
 * The fields of `form` that differ from the stored item, so an untouched form sends nothing.
 * The team is sent only when it is not the one the copy would resolve by itself (the item's own, or its tracklet's).
 */
export function buildReviewPatch(subject: ReviewSubject, form: ReviewForm, fps: number, info: ReviewInfo | null | undefined): ReviewPatch {
  const patch: ReviewPatch = {}
  if (form.label !== subjectLabel(subject)) patch.label = form.label
  const halfFrameS = fps > 0 ? 0.5 / fps : 0.01
  if (Math.abs(form.timeS - subjectInstantS(subject)) >= halfFrameS) patch.timeS = form.timeS
  if (form.trackerId !== subjectTrackerId(subject)) patch.trackerId = form.trackerId
  if (form.side !== effectiveSide(subjectSide(subject), form.trackerId, info)) patch.side = form.side
  return patch
}

export function isEmptyPatch(patch: ReviewPatch): boolean {
  return Object.keys(patch).length === 0
}

/** The analysis after one correction: the item replaced, inserted or removed (lists stay sorted) and the copy's state. */
export function applyReviewResult(analysis: MatchAnalysis, result: ReviewResult): MatchAnalysis {
  if (result.kind === 'event') {
    const rest = analysis.events.filter((e) => e.id !== result.id)
    const events = result.deleted || !result.event ? rest : [...rest, result.event].sort((a, b) => a.startS - b.startS)
    return { ...analysis, events, review: result.info }
  }
  const rest = analysis.ballActions.filter((a) => a.id !== result.id)
  const ballActions = result.deleted || !result.action ? rest : [...rest, result.action].sort((a, b) => a.frameIdx - b.frameIdx)
  return { ...analysis, ballActions, review: result.info }
}
