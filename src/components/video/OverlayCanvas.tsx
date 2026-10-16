import { useEffect, useRef, useState } from 'react'

import type { ViewerSettings } from '@/app/providers/settings'
import type { LayerState } from '@/components/layers/layers'
import type { BallAction, MatchEvent, TeamAssignments } from '@/domain'
import type { TrackingStore } from '@/lib/trackingStore'
import type { VideoClock } from '@/lib/videoClock'

import { fitContain } from './overlay/geometry'
import { renderOverlay } from './overlay/renderOverlay'
import s from './video.module.css'

interface OverlayCanvasProps {
  clock: VideoClock
  store: TrackingStore | null
  teams: TeamAssignments
  actions: readonly BallAction[]
  events: readonly MatchEvent[]
  layers: LayerState
  settings: ViewerSettings
  selectedTrackerId: number | null
  /** Source frame size the tracking coordinates refer to. */
  sourceWidth: number
  sourceHeight: number
  fps: number
  /** Bumped by the owner when `store` gained frames in place; forces a redraw. */
  revision?: number
}

/**
 * Canvas sitting over the video. Subscribes to the VideoClock and redraws on
 * every presented frame; resizes with its container (ResizeObserver) and
 * renders at device pixel ratio.
 */
export function OverlayCanvas({ clock, store, teams, actions, events, layers, settings, selectedTrackerId, sourceWidth, sourceHeight, fps, revision = 0 }: OverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const transform = fitContain(sourceWidth, sourceHeight, size.width, size.height)

    let lastFrame = -1
    const draw = (force: boolean) => {
      const { frameIdx } = clock.getSnapshot()
      if (!force && frameIdx === lastFrame) return
      lastFrame = frameIdx
      if (!store) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, size.width, size.height)
        return
      }
      renderOverlay(ctx, {
        frameIdx,
        store,
        teams,
        actions,
        events,
        layers,
        settings,
        selectedTrackerId,
        fps,
        transform,
        width: size.width,
        height: size.height,
        dpr,
      })
    }
    draw(true)
    return clock.subscribe(() => draw(false))
  }, [clock, store, teams, actions, events, layers, settings, selectedTrackerId, sourceWidth, sourceHeight, fps, size, revision])

  return <canvas ref={canvasRef} className={s.canvas} aria-hidden="true" />
}
