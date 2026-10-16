import type { ViewerSettings } from '@/app/providers/settings'
import type { LayerState } from '@/components/layers/layers'
import type { BallAction, MatchEvent, PersonDetection, TeamAssignments, TrackingFrame } from '@/domain'
import { BALL_COLOR, POSSESSION_COLOR, ROLE_SHORT, SELECTION_COLOR, TEAM_NEUTRAL_COLOR, ballActionColor, eventColor, labelDisplayName, lastEventIndexAt, teamOf } from '@/domain'
import type { TrackingStore } from '@/lib/trackingStore'

import { clamp, toCanvas, trackerColor, type Transform } from './geometry'

export interface OverlayScene {
  frameIdx: number
  store: TrackingStore
  teams: TeamAssignments
  /** Non-background ball actions sorted by frame. */
  actions: readonly BallAction[]
  /** Events sorted by start time (for the on-video cards). */
  events: readonly MatchEvent[]
  layers: LayerState
  settings: ViewerSettings
  selectedTrackerId: number | null
  fps: number
  transform: Transform
  /** Canvas size in CSS pixels. */
  width: number
  height: number
  dpr: number
}

const FONT = '600 11px Roboto, system-ui, -apple-system, "Segoe UI", sans-serif'
const CARD_TITLE_FONT = '700 15px Montserrat, Roboto, system-ui, sans-serif'
const CARD_SUB_FONT = '500 11.5px Roboto, system-ui, sans-serif'
const CARD_BG = 'rgba(7, 11, 18, 0.78)'
const DARK_TEXT = '#0b0f14'
const LIGHT_TEXT = '#e9eef5'
const DEG = Math.PI / 180

/**
 * Draws one frame of overlays. Pure function of the scene: no React, no AI
 * logic, only the same visual encodings the pipeline's renderer uses (foot
 * ellipse, id label, team colour, trail, ball marker, possessor ring, action
 * badge), expressed in canvas calls.
 */
export function renderOverlay(ctx: CanvasRenderingContext2D, scene: OverlayScene): void {
  const { width, height, dpr, transform } = scene
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const frame = scene.store.getFrameOrPrevious(scene.frameIdx)
  if (!frame) {
    ctx.restore()
    return
  }

  const lineW = clamp(transform.scale * 2.4, 1.5, 3)
  const colorOf = (p: PersonDetection): string => {
    if (!scene.layers.teams) return trackerColor(p.trackerId)
    return teamOf(scene.teams, p.trackerId)?.color ?? TEAM_NEUTRAL_COLOR
  }

  // 1. Trails (under everything else).
  if (scene.layers.tracking && scene.settings.trailLength > 0) {
    for (const p of frame.persons) {
      const trail = scene.store.getTrail(p.trackerId, frame.frameIdx, scene.settings.trailLength)
      if (trail.length < 2) continue
      ctx.beginPath()
      trail.forEach((pt, i) => {
        const [x, y] = toCanvas(transform, pt)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.strokeStyle = colorOf(p)
      ctx.globalAlpha = 0.75
      ctx.lineWidth = lineW * 0.8
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  // 2. Player markers, possession ring, selection.
  if (scene.layers.players || scene.layers.possession || scene.selectedTrackerId !== null) {
    for (const p of frame.persons) {
      const color = colorOf(p)
      const isPossessor = scene.layers.possession && frame.possessorTrackerId === p.trackerId
      const isSelected = scene.selectedTrackerId === p.trackerId
      if (scene.layers.players) drawMarker(ctx, p, color, lineW, transform, scene.settings.playerMarker)
      if (isPossessor) drawEllipse(ctx, p, POSSESSION_COLOR, lineW * 1.8, transform, 1.18)
      if (isSelected) drawSelection(ctx, p, transform)
    }
  }

  // 3. Ball (with optional hold of the last known position).
  if (scene.layers.ball) {
    const recent = scene.store.getRecentBall(frame.frameIdx, scene.settings.ballHoldFrames)
    if (recent?.frame.ball) {
      const alpha = recent.age === 0 ? 1 : clamp(0.9 - (0.6 * recent.age) / Math.max(1, scene.settings.ballHoldFrames), 0.25, 0.9)
      drawBall(ctx, recent.frame, alpha, transform)
    }
  }

  // 4. Labels.
  if (scene.layers.playerIds) {
    for (const p of frame.persons) {
      const text = labelFor(p, scene.settings.labelMode)
      if (!text) continue
      const [x, y] = toCanvas(transform, [(p.box[0] + p.box[2]) / 2, p.box[1]])
      drawPill(ctx, text, x, y - 7, colorOf(p), DARK_TEXT, 1)
    }
  }

  // 5. Ball-action badges (recent actions on the acting player).
  if (scene.layers.ballActions && scene.actions.length > 0) {
    const windowFrames = Math.round(scene.settings.actionBadgeSeconds * scene.fps)
    for (const action of recentActions(scene.actions, frame.frameIdx, windowFrames)) {
      if (action.trackerId === null) continue
      const person = frame.persons.find((p) => p.trackerId === action.trackerId)
      if (!person) continue
      const age = frame.frameIdx - action.frameIdx
      const alpha = clamp(1 - age / Math.max(1, windowFrames), 0.2, 1)
      const color = ballActionColor(action.label)
      drawEllipse(ctx, person, color, lineW * 1.6, transform, 1.3, alpha)
      const [x, y] = toCanvas(transform, [(person.box[0] + person.box[2]) / 2, person.box[1]])
      const labelOffset = scene.layers.playerIds ? 28 : 7
      drawPill(ctx, labelDisplayName(action.label).toUpperCase(), x, y - labelOffset, color, DARK_TEXT, alpha)
    }
  }

  // 6. Notification cards (top-left, like the pipeline's final video): current event, then latest ball action.
  if (scene.layers.cards) {
    const k = clamp(width / 1100, 0.7, 1.4)
    const cardW = Math.round(clamp(width * 0.26, 190, 320))
    const cardH = Math.round(58 * k)
    const margin = Math.round(14 * k)
    let y = margin
    const timeS = scene.frameIdx / scene.fps
    const event = activeEvent(scene.events, timeS)
    if (event) {
      drawCard(ctx, margin, y, cardW, cardH, k, labelDisplayName(event.label).toUpperCase(), `${Math.round(event.peakConfidence * 100)}% confidence`, eventColor(event.label), 1)
      y += cardH + Math.round(8 * k)
    }
    const windowFrames = Math.round(scene.settings.actionBadgeSeconds * scene.fps)
    const latest = recentActions(scene.actions, frame.frameIdx, windowFrames)[0]
    if (latest) {
      const age = frame.frameIdx - latest.frameIdx
      const alpha = clamp(1.2 - age / Math.max(1, windowFrames), 0.3, 1)
      drawCard(ctx, margin, y, cardW, cardH, k, labelDisplayName(latest.label).toUpperCase(), actionSubtitle(latest, scene.teams), ballActionColor(latest.label), alpha)
    }
  }

  ctx.restore()
}

/** The event whose span contains `timeS`; with overlapping spans, the one that started last. */
function activeEvent(events: readonly MatchEvent[], timeS: number): MatchEvent | null {
  for (let i = lastEventIndexAt(events, timeS); i >= 0; i -= 1) {
    const e = events[i]
    if (e === undefined) break
    if (timeS <= e.endS) return e
    // Spans are sorted by start; an earlier one can still contain timeS if it is longer, so keep walking a little.
    if (e.startS < timeS - 60) break
  }
  return null
}

/** "#1907 · jersey 9 · Team A · 77%": who did the action, as far as the pipeline knows. */
function actionSubtitle(action: BallAction, teams: TeamAssignments): string {
  const parts: string[] = []
  if (action.trackerId !== null) {
    parts.push(action.jersey !== null ? `No. ${action.jersey} (#${action.trackerId})` : `Player #${action.trackerId}`)
    const team = teamOf(teams, action.trackerId)
    if (team) parts.push(team.displayName)
  } else {
    parts.push('Player unknown')
  }
  parts.push(`${Math.round(action.confidence * 100)}%`)
  return parts.join(' · ')
}

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, title: string, subtitle: string, color: string, alpha: number): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = 12 * k
  ctx.fillStyle = CARD_BG
  roundRect(ctx, x, y, w, h, 8 * k)
  ctx.fill()
  ctx.shadowBlur = 0
  // Coloured left bar (the pipeline's card has a solid colour band).
  ctx.fillStyle = color
  roundRect(ctx, x, y, 5 * k, h, 3 * k)
  ctx.fill()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const textX = x + 16 * k
  ctx.font = scaleFont(CARD_TITLE_FONT, k)
  ctx.fillStyle = color
  ctx.fillText(fitText(ctx, title, w - 24 * k), textX, y + h * 0.36)
  ctx.font = scaleFont(CARD_SUB_FONT, k)
  ctx.fillStyle = LIGHT_TEXT
  ctx.fillText(fitText(ctx, subtitle, w - 24 * k), textX, y + h * 0.72)
  ctx.restore()
}

function scaleFont(font: string, k: number): string {
  return font.replace(/(\d+(?:\.\d+)?)px/, (_, size: string) => `${(Number(size) * k).toFixed(1)}px`)
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

function labelFor(p: PersonDetection, mode: ViewerSettings['labelMode']): string | null {
  const role = ROLE_SHORT[p.role]
  let core: string | null
  if (mode === 'jersey') core = p.jersey !== null ? String(p.jersey) : null
  else if (mode === 'tracker') core = `#${p.trackerId}`
  else core = p.jersey !== null ? String(p.jersey) : `#${p.trackerId}`
  if (core === null) return role || null
  return role ? `${role} ${core}` : core
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  p: PersonDetection,
  color: string,
  lineW: number,
  t: Transform,
  marker: ViewerSettings['playerMarker'],
): void {
  if (marker === 'box') {
    const [x1, y1] = toCanvas(t, [p.box[0], p.box[1]])
    const [x2, y2] = toCanvas(t, [p.box[2], p.box[3]])
    ctx.strokeStyle = color
    ctx.lineWidth = lineW
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
    return
  }
  drawEllipse(ctx, p, color, lineW, t, 1)
}

/** Open ellipse at the feet (-45° to 235°, like supervision's EllipseAnnotator). */
function drawEllipse(ctx: CanvasRenderingContext2D, p: PersonDetection, color: string, lineW: number, t: Transform, grow: number, alpha = 1): void {
  const [cx, cy] = toCanvas(t, p.anchor)
  const w = (p.box[2] - p.box[0]) * t.scale
  const rx = Math.max(7, w * 0.62) * grow
  const ry = Math.max(3, rx * 0.36)
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, -45 * DEG, 235 * DEG)
  ctx.strokeStyle = color
  ctx.lineWidth = lineW
  ctx.globalAlpha = alpha
  ctx.stroke()
  ctx.globalAlpha = 1
}

function drawSelection(ctx: CanvasRenderingContext2D, p: PersonDetection, t: Transform): void {
  const [x1, y1] = toCanvas(t, [p.box[0], p.box[1]])
  const [x2, y2] = toCanvas(t, [p.box[2], p.box[3]])
  ctx.save()
  ctx.setLineDash([4, 3])
  ctx.strokeStyle = SELECTION_COLOR
  ctx.lineWidth = 1.5
  ctx.strokeRect(x1 - 3, y1 - 3, x2 - x1 + 6, y2 - y1 + 6)
  ctx.restore()
}

function drawBall(ctx: CanvasRenderingContext2D, frame: TrackingFrame, alpha: number, t: Transform): void {
  const ball = frame.ball
  if (!ball) return
  const [cx, cy] = toCanvas(t, ball.center)
  const [, top] = toCanvas(t, [ball.center[0], ball.box[1]])
  const size = clamp(9 * t.scale * 1.4, 7, 13)
  ctx.globalAlpha = alpha
  // Inverted triangle pointing at the ball, like the pipeline's TriangleAnnotator.
  ctx.beginPath()
  ctx.moveTo(cx, top - 2)
  ctx.lineTo(cx - size * 0.7, top - 2 - size)
  ctx.lineTo(cx + size * 0.7, top - 2 - size)
  ctx.closePath()
  ctx.fillStyle = BALL_COLOR
  ctx.fill()
  ctx.strokeStyle = DARK_TEXT
  ctx.lineWidth = 1
  ctx.stroke()
  // Thin ring around the ball itself.
  ctx.beginPath()
  ctx.arc(cx, cy, Math.max(4, ((ball.box[2] - ball.box[0]) * t.scale) / 2 + 2), 0, Math.PI * 2)
  ctx.strokeStyle = BALL_COLOR
  ctx.lineWidth = 1.2
  ctx.stroke()
  ctx.globalAlpha = 1
}

function drawPill(ctx: CanvasRenderingContext2D, text: string, cx: number, bottomY: number, bg: string, fg: string, alpha: number): void {
  ctx.font = FONT
  const padX = 5
  const h = 16
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2
  const x = Math.round(cx - w / 2)
  const y = Math.round(bottomY - h)
  ctx.globalAlpha = alpha
  ctx.fillStyle = bg
  roundRect(ctx, x, y, w, h, 4)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, y + h / 2 + 0.5)
  ctx.globalAlpha = 1
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/** Actions with frameIdx in [frameIdx - windowFrames, frameIdx] (actions sorted by frame). */
export function recentActions(actions: readonly BallAction[], frameIdx: number, windowFrames: number): BallAction[] {
  // Binary search for the last action at or before frameIdx, then walk back.
  let lo = 0
  let hi = actions.length - 1
  let last = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const a = actions[mid]
    if (a !== undefined && a.frameIdx <= frameIdx) {
      last = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  const out: BallAction[] = []
  for (let i = last; i >= 0; i -= 1) {
    const a = actions[i]
    if (a === undefined || a.frameIdx < frameIdx - windowFrames) break
    out.push(a)
  }
  return out
}
