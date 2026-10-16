/**
 * VideoClock: an external store that mirrors an HTMLVideoElement's playback
 * state and derives the pipeline frame index from the media time.
 *
 * Why a store and not React state: the overlay must redraw on every presented
 * video frame (25-60 Hz) without re-rendering the page. Components that need
 * the time subscribe through `useSyncExternalStore` (see hooks/useVideoClock),
 * the canvas subscribes directly.
 *
 * Frame sync uses `requestVideoFrameCallback` when the browser offers it (its
 * `mediaTime` is the presentation timestamp of the frame being shown), with a
 * `requestAnimationFrame` + `currentTime` fallback.
 */

export interface VideoTiming {
  fps: number
  frameCount: number
  /** Presentation timestamp of frame 0 (normally 0). */
  startTimeS: number
}

export interface VideoClockSnapshot {
  timeS: number
  frameIdx: number
  playing: boolean
  durationS: number
  /** Whether the media element has loaded metadata. */
  ready: boolean
  playbackRate: number
}

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number }) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

const FRAME_EPSILON = 1e-4

/** Frame index displayed at `timeS`: frame i covers [i/fps, (i+1)/fps). Clamped to the frame range. */
export function frameIndexForTime(timeS: number, timing: VideoTiming): number {
  const raw = Math.floor((timeS - timing.startTimeS) * timing.fps + FRAME_EPSILON)
  const max = Math.max(0, timing.frameCount - 1)
  return Math.min(max, Math.max(0, raw))
}

export function timeForFrameIndex(frameIdx: number, timing: VideoTiming): number {
  return timing.startTimeS + frameIdx / timing.fps
}

const DEFAULT_SNAPSHOT: VideoClockSnapshot = {
  timeS: 0,
  frameIdx: 0,
  playing: false,
  durationS: 0,
  ready: false,
  playbackRate: 1,
}

export class VideoClock {
  private listeners = new Set<() => void>()
  private snapshot: VideoClockSnapshot = DEFAULT_SNAPSHOT
  private video: FrameCallbackVideo | null = null
  private timing: VideoTiming
  private frameHandle: number | null = null
  private rafHandle: number | null = null
  private detachFns: Array<() => void> = []

  constructor(timing: VideoTiming) {
    this.timing = timing
  }

  // --- store API -------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): VideoClockSnapshot => this.snapshot

  getTiming(): VideoTiming {
    return this.timing
  }

  setTiming(timing: VideoTiming): void {
    this.timing = timing
    this.update(this.snapshot.timeS)
  }

  // --- element binding -------------------------------------------------------

  attach(video: HTMLVideoElement): () => void {
    this.detach()
    const el = video as FrameCallbackVideo
    this.video = el

    const onTime = () => this.update(el.currentTime)
    const onPlay = () => {
      this.update(el.currentTime)
      this.startLoop()
    }
    const onPause = () => {
      this.stopLoop()
      this.update(el.currentTime)
    }
    const onMeta = () => this.update(el.currentTime)

    const bind = (type: string, fn: () => void) => {
      el.addEventListener(type, fn)
      this.detachFns.push(() => el.removeEventListener(type, fn))
    }
    bind('loadedmetadata', onMeta)
    bind('durationchange', onMeta)
    bind('timeupdate', onTime)
    bind('seeking', onTime)
    bind('seeked', onTime)
    bind('play', onPlay)
    bind('playing', onPlay)
    bind('pause', onPause)
    bind('ended', onPause)
    bind('ratechange', onTime)

    this.update(el.currentTime)
    if (!el.paused) this.startLoop()
    return () => this.detach()
  }

  detach(): void {
    this.stopLoop()
    for (const fn of this.detachFns) fn()
    this.detachFns = []
    this.video = null
  }

  // --- controls ----------------------------------------------------------------

  seek(timeS: number): void {
    const el = this.video
    if (!el) return
    const duration = Number.isFinite(el.duration) ? el.duration : this.snapshot.durationS
    const clamped = Math.min(Math.max(0, timeS), Math.max(0, duration - 1 / this.timing.fps))
    el.currentTime = clamped
    this.update(clamped)
  }

  seekToFrame(frameIdx: number): void {
    // Aim at the middle of the frame interval so floor() lands on it reliably.
    this.seek(timeForFrameIndex(frameIdx, this.timing) + 0.5 / this.timing.fps)
  }

  stepFrames(delta: number): void {
    this.video?.pause()
    this.seekToFrame(this.snapshot.frameIdx + delta)
  }

  play(): void {
    void this.video?.play().catch(() => undefined)
  }

  pause(): void {
    this.video?.pause()
  }

  toggle(): void {
    if (!this.video) return
    if (this.video.paused) this.play()
    else this.pause()
  }

  setPlaybackRate(rate: number): void {
    if (this.video) this.video.playbackRate = rate
  }

  // --- internals ---------------------------------------------------------------

  private startLoop(): void {
    this.stopLoop()
    const el = this.video
    if (!el) return
    if (typeof el.requestVideoFrameCallback === 'function') {
      const tick = (_now: number, meta: { mediaTime: number }) => {
        this.update(meta.mediaTime)
        if (this.video === el && !el.paused && typeof el.requestVideoFrameCallback === 'function') {
          this.frameHandle = el.requestVideoFrameCallback(tick)
        }
      }
      this.frameHandle = el.requestVideoFrameCallback(tick)
    } else {
      const tick = () => {
        this.update(el.currentTime)
        if (this.video === el && !el.paused) this.rafHandle = requestAnimationFrame(tick)
      }
      this.rafHandle = requestAnimationFrame(tick)
    }
  }

  private stopLoop(): void {
    const el = this.video
    if (this.frameHandle !== null && el && typeof el.cancelVideoFrameCallback === 'function') {
      el.cancelVideoFrameCallback(this.frameHandle)
    }
    this.frameHandle = null
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle)
    this.rafHandle = null
  }

  private update(timeS: number): void {
    const el = this.video
    const durationS = el && Number.isFinite(el.duration) ? el.duration : this.snapshot.durationS
    const next: VideoClockSnapshot = {
      timeS,
      frameIdx: frameIndexForTime(timeS, this.timing),
      playing: el ? !el.paused && !el.ended : false,
      durationS,
      ready: el ? el.readyState >= 1 : false,
      playbackRate: el ? el.playbackRate : 1,
    }
    const prev = this.snapshot
    if (
      prev.frameIdx === next.frameIdx &&
      prev.playing === next.playing &&
      prev.durationS === next.durationS &&
      prev.ready === next.ready &&
      prev.playbackRate === next.playbackRate &&
      Math.abs(prev.timeS - next.timeS) < 1e-3
    ) {
      return
    }
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}
