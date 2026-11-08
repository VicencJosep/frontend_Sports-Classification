import { useEffect, useRef } from 'react'

import s from './clips.module.css'

interface FilmstripProps {
  /** Same URL as the main player; a detached video element seeks through it. */
  src: string
  fromS: number
  toS: number
  /** CSS size of the strip. */
  width: number
  height: number
}

const THUMB_SCALE = 2
const THUMB_READY_CLASS = s.thumbReady ?? 'thumbReady'
/** Pans and zooms arrive in bursts: wait for the view to settle before seeking. */
const CAPTURE_DELAY_MS = 180
const WAIT_TIMEOUT_MS = 4000

/**
 * Row of frame thumbnails for a time window, like the filmstrip of a video
 * editor. Frames are drawn straight onto canvases (never read back), so a
 * backend on another origin works too; a seek that fails just leaves a dark tile.
 */
export function Filmstrip({ src, fromS, toS, width, height }: FilmstripProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvases = useRef<Array<HTMLCanvasElement | null>>([])
  const thumbW = Math.max(1, Math.round((height * 16) / 9))
  const count = width > 0 ? Math.ceil(width / thumbW) : 0

  useEffect(() => {
    const el = document.createElement('video')
    el.muted = true
    el.preload = 'auto'
    el.playsInline = true
    el.src = src
    videoRef.current = el
    return () => {
      videoRef.current = null
      el.removeAttribute('src')
      el.load()
    }
  }, [src])

  useEffect(() => {
    if (count === 0 || !(toS > fromS)) return
    let cancelled = false
    for (const canvas of canvases.current) canvas?.classList.remove(THUMB_READY_CLASS)
    const timer = window.setTimeout(() => {
      void (async () => {
        const el = videoRef.current
        if (!el || !(await waitForMetadata(el))) return
        const span = toS - fromS
        for (let i = 0; i < count && !cancelled; i += 1) {
          const timeS = fromS + ((i + 0.5) * span) / count
          if (!(await seekTo(el, Math.max(0, timeS))) || cancelled) continue
          const canvas = canvases.current[i]
          const ctx = canvas?.getContext('2d')
          if (!canvas || !ctx) continue
          try {
            ctx.drawImage(el, 0, 0, canvas.width, canvas.height)
            canvas.classList.add(THUMB_READY_CLASS)
          } catch {
            // Frame not decodable yet: leave the tile dark.
          }
        }
      })()
    }, CAPTURE_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [src, fromS, toS, count])

  return (
    <div className={s.film} style={{ height }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <canvas
          key={i}
          ref={(el) => {
            canvases.current[i] = el
          }}
          className={s.thumb}
          width={thumbW * THUMB_SCALE}
          height={height * THUMB_SCALE}
          style={{ width: thumbW, height }}
        />
      ))}
    </div>
  )
}

function waitForMetadata(el: HTMLVideoElement): Promise<boolean> {
  if (el.readyState >= 1) return Promise.resolve(true)
  return new Promise((resolve) => {
    let timer = 0
    function cleanup() {
      el.removeEventListener('loadedmetadata', onOk)
      el.removeEventListener('error', onError)
      window.clearTimeout(timer)
    }
    function onOk() {
      cleanup()
      resolve(true)
    }
    function onError() {
      cleanup()
      resolve(false)
    }
    el.addEventListener('loadedmetadata', onOk)
    el.addEventListener('error', onError)
    timer = window.setTimeout(onError, WAIT_TIMEOUT_MS)
  })
}

function seekTo(el: HTMLVideoElement, timeS: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let timer = 0
    function finish(ok: boolean) {
      if (settled) return
      settled = true
      el.removeEventListener('seeked', onSeeked)
      el.removeEventListener('error', onError)
      window.clearTimeout(timer)
      resolve(ok)
    }
    function onSeeked() {
      finish(true)
    }
    function onError() {
      finish(false)
    }
    if (Math.abs(el.currentTime - timeS) < 1e-3 && el.readyState >= 2) {
      resolve(true)
      return
    }
    el.addEventListener('seeked', onSeeked)
    el.addEventListener('error', onError)
    timer = window.setTimeout(onError, WAIT_TIMEOUT_MS)
    el.currentTime = timeS
  })
}
