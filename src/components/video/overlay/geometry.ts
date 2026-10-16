import type { Point } from '@/domain'

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

/** Stable, well-separated colour per tracker id (used when the Teams layer is off). */
export function trackerColor(trackerId: number): string {
  const hue = (trackerId * 137.508) % 360
  return `hsl(${hue.toFixed(1)} 70% 62%)`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
