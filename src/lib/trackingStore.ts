import type { PersonDetection, Point, Role, TeamAssignments, TrackingFrame, Tracklet } from '@/domain'

/**
 * Frame-indexed access to a part's tracking data, plus the cheap derivations
 * the viewer needs (trails, tracklet summaries). Pure data shaping: no
 * detection, tracking or possession logic is recomputed here.
 *
 * Frames are stored in an array indexed by `frameIdx` (the pipeline runs with
 * stride 1, so indices are contiguous; gaps simply read as null). Frames can be
 * added later (`addFrames`): the viewer loads a full match by time windows.
 */
export class TrackingStore {
  frameCount: number
  loadedFrames = 0
  private frames: Array<TrackingFrame | undefined>
  private personIndex: Array<Map<number, PersonDetection> | undefined>
  private trackletCache: Tracklet[] | null = null
  private teams: TeamAssignments | null

  constructor(frames: readonly TrackingFrame[], options: { frameCount?: number; teams?: TeamAssignments | null } = {}) {
    const maxIdx = frames.reduce((m, f) => Math.max(m, f.frameIdx), -1)
    this.frameCount = Math.max(options.frameCount ?? 0, maxIdx + 1)
    this.frames = new Array<TrackingFrame | undefined>(this.frameCount)
    this.personIndex = new Array<Map<number, PersonDetection> | undefined>(this.frameCount)
    this.teams = options.teams ?? null
    this.addFrames(frames)
  }

  /** Adds (or replaces) frames; grows the arrays if an index is beyond `frameCount`. */
  addFrames(frames: readonly TrackingFrame[]): void {
    for (const f of frames) {
      if (f.frameIdx >= this.frameCount) {
        this.frameCount = f.frameIdx + 1
        this.frames.length = this.frameCount
        this.personIndex.length = this.frameCount
      }
      if (this.frames[f.frameIdx] === undefined) this.loadedFrames += 1
      this.frames[f.frameIdx] = f
      this.personIndex[f.frameIdx] = undefined
    }
    if (frames.length > 0) this.trackletCache = null
  }

  setTeams(teams: TeamAssignments | null): void {
    if (this.teams === teams) return
    this.teams = teams
    this.trackletCache = null
  }

  /** Up to `n` loaded frames spread over the loaded range (cheap data inspection, e.g. layer availability). */
  sampleLoaded(n: number): TrackingFrame[] {
    const out: TrackingFrame[] = []
    if (this.loadedFrames === 0) return out
    const step = Math.max(1, Math.floor(this.loadedFrames / n))
    let seen = 0
    for (const f of this.frames) {
      if (!f) continue
      if (seen % step === 0) out.push(f)
      seen += 1
    }
    return out
  }

  static empty(): TrackingStore {
    return new TrackingStore([])
  }

  getFrame(frameIdx: number): TrackingFrame | null {
    return this.frames[frameIdx] ?? null
  }

  /** Nearest loaded frame at or before `frameIdx` within `maxBack` frames (covers sparse/stride data). */
  getFrameOrPrevious(frameIdx: number, maxBack = 2): TrackingFrame | null {
    for (let i = frameIdx; i >= Math.max(0, frameIdx - maxBack); i -= 1) {
      const f = this.frames[i]
      if (f) return f
    }
    return null
  }

  getPerson(frameIdx: number, trackerId: number): PersonDetection | null {
    return this.indexFor(frameIdx)?.get(trackerId) ?? null
  }

  /**
   * Foot-anchor trail of one tracker over the `length` frames ending at
   * `frameIdx` (inclusive), oldest first. Same data the pipeline's
   * TraceAnnotator draws. Stops at the first gap so an id re-used after a
   * long absence does not draw a line across the pitch.
   */
  getTrail(trackerId: number, frameIdx: number, length: number): Point[] {
    const points: Point[] = []
    for (let i = frameIdx; i > frameIdx - length && i >= 0; i -= 1) {
      const person = this.indexFor(i)?.get(trackerId)
      if (!person) break
      points.push(person.anchor)
    }
    points.reverse()
    return points
  }

  /** Last known ball position within `maxBack` frames before `frameIdx` (the ball is detected in ~1/3 of frames). */
  getRecentBall(frameIdx: number, maxBack: number): { frame: TrackingFrame; age: number } | null {
    for (let age = 0; age <= maxBack; age += 1) {
      const f = this.frames[frameIdx - age]
      if (f?.ball) return { frame: f, age }
    }
    return null
  }

  /** Tracklet summaries for the whole loaded range (computed once). */
  tracklets(): Tracklet[] {
    if (this.trackletCache) return this.trackletCache
    const acc = new Map<number, { roles: Map<Role, number>; jerseys: Map<number, number>; first: number; last: number; n: number }>()
    for (const frame of this.frames) {
      if (!frame) continue
      for (const p of frame.persons) {
        let entry = acc.get(p.trackerId)
        if (!entry) {
          entry = { roles: new Map(), jerseys: new Map(), first: frame.frameIdx, last: frame.frameIdx, n: 0 }
          acc.set(p.trackerId, entry)
        }
        entry.roles.set(p.role, (entry.roles.get(p.role) ?? 0) + 1)
        if (p.jersey !== null) entry.jerseys.set(p.jersey, (entry.jerseys.get(p.jersey) ?? 0) + 1)
        entry.first = Math.min(entry.first, frame.frameIdx)
        entry.last = Math.max(entry.last, frame.frameIdx)
        entry.n += 1
      }
    }
    const result: Tracklet[] = []
    for (const [trackerId, e] of acc) {
      result.push({
        trackerId,
        teamCluster: this.teams?.byTrackerId.get(trackerId) ?? null,
        role: mostFrequent(e.roles) ?? 'other',
        jersey: mostFrequent(e.jerseys),
        firstFrame: e.first,
        lastFrame: e.last,
        frameCount: e.n,
      })
    }
    result.sort((a, b) => a.trackerId - b.trackerId)
    this.trackletCache = result
    return result
  }

  private indexFor(frameIdx: number): Map<number, PersonDetection> | null {
    const frame = this.frames[frameIdx]
    if (!frame) return null
    let index = this.personIndex[frameIdx]
    if (!index) {
      index = new Map(frame.persons.map((p) => [p.trackerId, p] as const))
      this.personIndex[frameIdx] = index
    }
    return index
  }
}

function mostFrequent<K>(counts: ReadonlyMap<K, number>): K | null {
  let best: K | null = null
  let bestCount = -1
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key
      bestCount = count
    }
  }
  return best
}
