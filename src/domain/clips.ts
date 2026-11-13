import { labelDisplayName } from './display'
import type { BallAction, MatchEvent } from './events'
import { eventInstantS } from './events'
import type { VideoInfo } from './match'
import type { TeamAssignments } from './teams'
import { teamOf } from './teams'
import { REVIEW_LABELS, type EventLabel, type TeamCluster } from './vocab'

/**
 * Clips the user cuts from the viewer: an event of the play history (or any
 * moment of the video) with corrected boundaries, label and player. They are
 * frontend-owned: the pipeline knows nothing about them.
 */

/** Who made the play, as the user confirmed or corrected it. */
export interface ClipPlayer {
  /** Tracklet picked from the tracking; null for a typed-in name. */
  trackerId: number | null
  jersey: number | null
  teamCluster: TeamCluster | null
  /** Free text when the player is not in the tracking (or to name a tracklet). */
  name: string | null
}

/** The annotation vocabulary (events and ball actions) plus `play`, a clip that is none of those classes. */
export const CLIP_LABELS = [...REVIEW_LABELS, 'play'] as const
export type ClipLabel = EventLabel | 'play'

export interface SavedClip {
  id: string
  matchId: string
  partId: string
  /** Id of the event the clip was cut from, null for a clip made at the playhead. */
  sourceEventId: string | null
  /** Label the pipeline gave the source event, null when there was none. */
  detectedLabel: EventLabel | null
  label: ClipLabel
  startS: number
  endS: number
  /** Key moment inside the clip: the event's seek point, or the playhead the clip was made at. */
  anchorS: number
  player: ClipPlayer | null
  title: string
  notes: string
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
}

/** What the editor works on: a saved clip without its bookkeeping, or a new one (`id` null). */
export type ClipDraft = Omit<SavedClip, 'id' | 'createdAt' | 'updatedAt'> & { id: string | null }

export const MIN_CLIP_DURATION_S = 1
/** Pre-roll and post-roll added around a detected event, per label (seconds). */
export interface ClipPadding {
  beforeS: number
  afterS: number
}

const CLIP_PADDING: Readonly<Record<string, ClipPadding>> = {
  goal: { beforeS: 10, afterS: 8 },
  shot: { beforeS: 7, afterS: 4 },
  penalty: { beforeS: 6, afterS: 6 },
  foul: { beforeS: 5, afterS: 4 },
  card: { beforeS: 6, afterS: 4 },
  corner: { beforeS: 3, afterS: 9 },
  free_kick: { beforeS: 3, afterS: 9 },
  throw_in: { beforeS: 2, afterS: 6 },
  kick_off: { beforeS: 2, afterS: 8 },
}
const DEFAULT_PADDING: ClipPadding = { beforeS: 5, afterS: 5 }
/** A ball action is an instant: a short window is enough to see it, and keeps the trim bar frame-accurate. */
const BALL_ACTION_PADDING: ClipPadding = { beforeS: 3, afterS: 3 }
/** A ball action this close to the event's seek point is taken as "who made it". */
const PLAYER_ATTRIBUTION_WINDOW_S = 2.5

export function clipPaddingFor(label: string): ClipPadding {
  return CLIP_PADDING[label] ?? DEFAULT_PADDING
}

export function clipDurationS(clip: Pick<SavedClip, 'startS' | 'endS'>): number {
  return Math.max(0, clip.endS - clip.startS)
}

/** Nearest frame boundary (frame i starts at i / fps). */
export function snapToFrame(timeS: number, fps: number): number {
  if (!(fps > 0)) return timeS
  return Math.round(timeS * fps) / fps
}

/**
 * Valid clip boundaries: frame-aligned, inside [0, duration], at least `MIN_CLIP_DURATION_S` long.
 * `anchor` says which edge the user is moving: the other one gives way only when the video edge leaves no room.
 */
export function clampClipRange(startS: number, endS: number, durationS: number, fps: number, anchor: 'start' | 'end' = 'start'): { startS: number; endS: number } {
  const maxS = Math.max(durationS, MIN_CLIP_DURATION_S)
  let start = snapToFrame(Math.min(Math.max(0, startS), maxS), fps)
  let end = snapToFrame(Math.min(Math.max(0, endS), maxS), fps)
  if (end - start < MIN_CLIP_DURATION_S) {
    if (anchor === 'start') {
      end = Math.min(maxS, start + MIN_CLIP_DURATION_S)
      start = Math.min(start, end - MIN_CLIP_DURATION_S)
    } else {
      start = Math.max(0, end - MIN_CLIP_DURATION_S)
      end = Math.max(end, start + MIN_CLIP_DURATION_S)
    }
  }
  return { startS: snapToFrame(start, fps), endS: snapToFrame(end, fps) }
}

/** Moves the whole range by `deltaS` keeping its length, stopping at the video edges. */
export function shiftClipRange(startS: number, endS: number, deltaS: number, durationS: number, fps: number): { startS: number; endS: number } {
  const length = Math.max(MIN_CLIP_DURATION_S, endS - startS)
  const maxStart = Math.max(0, durationS - length)
  const start = Math.min(Math.max(0, startS + deltaS), maxStart)
  return { startS: snapToFrame(start, fps), endS: snapToFrame(Math.min(start + length, Math.max(durationS, length)), fps) }
}

/** Boundaries proposed for an event: its span plus the label's pre-roll and post-roll. */
export function defaultClipRange(event: Pick<MatchEvent, 'label' | 'startS' | 'endS' | 'seekS'>, durationS: number, fps: number): { startS: number; endS: number } {
  const pad = clipPaddingFor(event.label)
  return clampClipRange(Math.min(event.seekS, event.startS) - pad.beforeS, event.endS + pad.afterS, durationS, fps)
}

/** Nearest attributed ball action around `anchorS`, as far as the pipeline knows who had the ball. */
export function playerAround(anchorS: number, actions: readonly BallAction[], windowS = PLAYER_ATTRIBUTION_WINDOW_S): ClipPlayer | null {
  let best: BallAction | null = null
  for (const action of actions) {
    if (action.isBackground || action.trackerId === null) continue
    const distance = Math.abs(action.timestampS - anchorS)
    if (distance > windowS) continue
    if (best === null || distance < Math.abs(best.timestampS - anchorS)) best = action
  }
  if (!best) return null
  return { trackerId: best.trackerId, jersey: best.jersey, teamCluster: best.teamCluster, name: null }
}

export function defaultClipTitle(label: string, anchorS: number): string {
  return `${labelDisplayName(label)} · ${formatClipClock(anchorS)}`
}

/** 67.4 -> "01:07"; 3725 -> "1:02:05" (same rule as utils/time, kept here so the domain stays dependency-free). */
export function formatClipClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

interface DraftContext {
  matchId: string
  partId: string
  video: Pick<VideoInfo, 'durationS' | 'fps'>
  actions: readonly BallAction[]
}

/** New clip from a detected event: padded span, the event's label, the possessor around its instant (the peak of the span). */
export function draftFromEvent(event: MatchEvent, ctx: DraftContext): ClipDraft {
  const range = defaultClipRange(event, ctx.video.durationS, ctx.video.fps)
  return {
    id: null,
    matchId: ctx.matchId,
    partId: ctx.partId,
    sourceEventId: event.id,
    detectedLabel: event.label,
    label: event.label,
    startS: range.startS,
    endS: range.endS,
    anchorS: snapToFrame(event.seekS, ctx.video.fps),
    // A reviewed event carries its own player; the pipeline's events never do.
    player:
      event.trackerId !== null && event.trackerId !== undefined
        ? { trackerId: event.trackerId, jersey: event.jersey ?? null, teamCluster: event.teamCluster ?? null, name: null }
        : playerAround(eventInstantS(event), ctx.actions),
    title: defaultClipTitle(event.label, event.seekS),
    notes: '',
  }
}

/** New clip from a ball action: a short window around its frame, its label and the player it was attributed to. */
export function draftFromAction(action: BallAction, ctx: Omit<DraftContext, 'actions'>): ClipDraft {
  const { fps, durationS } = ctx.video
  const range = clampClipRange(action.timestampS - BALL_ACTION_PADDING.beforeS, action.timestampS + BALL_ACTION_PADDING.afterS, durationS, fps)
  return {
    id: null,
    matchId: ctx.matchId,
    partId: ctx.partId,
    sourceEventId: action.id,
    detectedLabel: action.label,
    label: action.label,
    startS: range.startS,
    endS: range.endS,
    anchorS: snapToFrame(action.timestampS, fps),
    player: action.trackerId !== null ? { trackerId: action.trackerId, jersey: action.jersey, teamCluster: action.teamCluster, name: null } : null,
    title: defaultClipTitle(action.label, action.timestampS),
    notes: '',
  }
}

/** New clip around an arbitrary moment (no event): a symmetric window labelled `play`. */
export function draftAtTime(timeS: number, ctx: DraftContext): ClipDraft {
  const range = clampClipRange(timeS - DEFAULT_PADDING.beforeS, timeS + DEFAULT_PADDING.afterS, ctx.video.durationS, ctx.video.fps)
  const anchorS = snapToFrame(Math.min(Math.max(0, timeS), ctx.video.durationS), ctx.video.fps)
  return {
    id: null,
    matchId: ctx.matchId,
    partId: ctx.partId,
    sourceEventId: null,
    detectedLabel: null,
    label: 'play',
    startS: range.startS,
    endS: range.endS,
    anchorS,
    player: playerAround(timeS, ctx.actions),
    title: defaultClipTitle('play', anchorS),
    notes: '',
  }
}

export function draftFromClip(clip: SavedClip): ClipDraft {
  return {
    id: clip.id,
    matchId: clip.matchId,
    partId: clip.partId,
    sourceEventId: clip.sourceEventId,
    detectedLabel: clip.detectedLabel,
    label: clip.label,
    startS: clip.startS,
    endS: clip.endS,
    anchorS: clip.anchorS,
    player: clip.player,
    title: clip.title,
    notes: clip.notes,
  }
}

/** "No. 9 (#1907) · Team A", "#1907", "Name typed by the user", or "Unknown". */
export function describePlayer(player: ClipPlayer | null, teams?: TeamAssignments): string {
  if (!player) return 'Unknown'
  const parts: string[] = []
  if (player.name) parts.push(player.name)
  if (player.trackerId !== null) {
    parts.push(player.jersey !== null ? `No. ${player.jersey} (#${player.trackerId})` : `#${player.trackerId}`)
  } else if (player.jersey !== null) {
    parts.push(`No. ${player.jersey}`)
  }
  const team = teams && player.trackerId !== null ? teamOf(teams, player.trackerId) : null
  if (team) parts.push(team.displayName)
  else if (player.teamCluster !== null) parts.push(`Team ${String.fromCharCode(65 + (player.teamCluster % 26))}`)
  return parts.length > 0 ? parts.join(' · ') : 'Unknown'
}

export function sortClips<T extends Pick<SavedClip, 'startS' | 'createdAt'>>(clips: readonly T[]): T[] {
  return [...clips].sort((a, b) => a.startS - b.startS || a.createdAt.localeCompare(b.createdAt))
}

export function totalClipsDurationS(clips: readonly Pick<SavedClip, 'startS' | 'endS'>[]): number {
  return clips.reduce((acc, c) => acc + clipDurationS(c), 0)
}

/** JSON document for the "Export" button: the clips of one part plus where they came from. */
export function clipsExportJson(matchId: string, partId: string, clips: readonly SavedClip[], exportedAt = new Date().toISOString()): string {
  return JSON.stringify({ version: 1, matchId, partId, exportedAt, clips: sortClips(clips) }, null, 2)
}
