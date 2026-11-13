import type { PersonDetection, Point } from '@/domain'

/** Maps source-frame pixels to canvas CSS pixels for an `object-fit: contain` video. */
export interface Transform {
  scale: number
  offsetX: number
  offsetY: number
}

export function fitContain(sourceW: number, sourceH: number, boxW: number, boxH: number): Transform {
  if (sourceW <= 0 || sourceH <= 0 || boxW <= 0 || boxH <= 0) return { scale: 1, offsetX: 0, offsetY: 0 }
  const scale = Math.min(boxW / sourceW, boxH / sourceH)
  return {
    scale,
    offsetX: (boxW - sourceW * scale) / 2,
    offsetY: (boxH - sourceH * scale) / 2,
  }
}

export function toCanvas(t: Transform, p: Point): [number, number] {
  return [t.offsetX + p[0] * t.scale, t.offsetY + p[1] * t.scale]
}

/** Inverse of `toCanvas`: canvas CSS pixels to source-frame pixels. */
export function toSource(t: Transform, x: number, y: number): [number, number] {
  return [(x - t.offsetX) / t.scale, (y - t.offsetY) / t.scale]
}

/**
 * The person under a point of the source frame: among the boxes (grown by `margin` px) that contain it, the one
 * whose centre is nearest, so that with two overlapping players the click lands on the one it is closest to.
 */
export function personAt(persons: readonly PersonDetection[], x: number, y: number, margin = 0): PersonDetection | null {
  let best: PersonDetection | null = null
  let bestDistance = Infinity
  for (const p of persons) {
    const [x1, y1, x2, y2] = p.box
    if (x < x1 - margin || x > x2 + margin || y < y1 - margin || y > y2 + margin) continue
    const distance = Math.hypot(x - (x1 + x2) / 2, y - (y1 + y2) / 2)
    if (distance < bestDistance) {
      best = p
      bestDistance = distance
    }
  }
  return best
}

/** Stable, well-separated colour per tracker id (used when the Teams layer is off). */
export function trackerColor(trackerId: number): string {
  const hue = (trackerId * 137.508) % 360
  return `hsl(${hue.toFixed(1)} 70% 62%)`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
