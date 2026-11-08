import type { VideoClock } from './videoClock'

/**
 * Plays one range of the video in the main player (clip preview, "play clip"
 * from the saved list): seeks to the start, plays, and pauses on the last
 * frame or loops. The user keeps full control: pausing or seeking away ends
 * the range mode without side effects.
 */
export interface PlayRange {
  startS: number
  endS: number
  loop: boolean
}

export type RangeStep = 'continue' | 'loop' | 'finish' | 'release'

/** Seeking this far outside the range is read as the user leaving it. */
const LEAVE_TOLERANCE_S = 1

/**
 * What to do on a clock update while a range is active. `started` tells whether
 * playback was seen running at least once (the first updates after play() can
 * still report paused).
 */
export function rangeStep(timeS: number, playing: boolean, started: boolean, range: PlayRange, endToleranceS: number): RangeStep {
  if (!playing) return started ? 'release' : 'continue'
  if (timeS < range.startS - LEAVE_TOLERANCE_S || timeS > range.endS + LEAVE_TOLERANCE_S) return 'release'
  if (timeS >= range.endS - endToleranceS) return range.loop ? 'loop' : 'finish'
  return 'continue'
}

export class RangePlayback {
  private readonly clock: VideoClock
  private readonly endToleranceS: number
  private readonly listeners = new Set<() => void>()
  private active: PlayRange | null = null
  private started = false
  private unsubscribe: (() => void) | null = null

  constructor(clock: VideoClock, endToleranceS = 0.02) {
    this.clock = clock
    this.endToleranceS = endToleranceS
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** The range being played, null otherwise. */
  getSnapshot = (): PlayRange | null => this.active

  play(range: PlayRange): void {
    this.stop()
    this.active = range
    this.started = false
    this.clock.seek(range.startS)
    this.clock.play()
    this.unsubscribe = this.clock.subscribe(this.tick)
    this.notify()
  }

  /** Leaves range mode; playback itself is not touched. */
  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.active === null) return
    this.active = null
    this.notify()
  }

  private tick = (): void => {
    const range = this.active
    if (!range) return
    const { timeS, playing } = this.clock.getSnapshot()
    const step = rangeStep(timeS, playing, this.started, range, this.endToleranceS)
    if (playing) this.started = true
    switch (step) {
      case 'continue':
        return
      case 'loop':
        this.clock.seek(range.startS)
        return
      case 'finish':
        this.stop()
        this.clock.pause()
        this.clock.seek(range.endS)
        return
      case 'release':
        this.stop()
        return
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
