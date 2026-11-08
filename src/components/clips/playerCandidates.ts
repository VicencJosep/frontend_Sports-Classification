import type { BallAction, ClipPlayer, Role, TeamAssignments, TeamCluster } from '@/domain'
import { playerAround } from '@/domain'
import type { TrackingStore } from '@/lib/trackingStore'

/** One tracklet the user can pick as the player of a clip. */
export interface PlayerCandidate {
  trackerId: number
  jersey: number | null
  teamCluster: TeamCluster | null
  role: Role
  /** Sampled frames of the clip range in which the tracklet appears. */
  frames: number
  /** The pipeline attributed a ball action around the anchor to this tracklet. */
  fromAction: boolean
}

/** Frames looked at per range, at most: the sampling stride grows with the range. */
const MAX_SAMPLED_FRAMES = 400
const ROLE_ORDER: Readonly<Record<Role, number>> = { player: 0, goalkeeper: 1, other: 2, referee: 3 }

/**
 * Tracklets visible in the clip range, from the loaded tracking (pure data
 * inspection). The possessor the pipeline attributed around the anchor comes
 * first; the rest by how often they are on screen, players before referees.
 */
export function playerCandidates(
  store: TrackingStore | null,
  teams: TeamAssignments,
  fromS: number,
  toS: number,
  fps: number,
  actions: readonly BallAction[],
  anchorS: number,
): PlayerCandidate[] {
  const acc = new Map<number, { jerseys: Map<number, number>; roles: Map<Role, number>; frames: number }>()
  const ensure = (trackerId: number) => {
    let entry = acc.get(trackerId)
    if (!entry) {
      entry = { jerseys: new Map(), roles: new Map(), frames: 0 }
      acc.set(trackerId, entry)
    }
    return entry
  }

  if (store && fps > 0 && toS > fromS) {
    const first = Math.max(0, Math.floor(fromS * fps))
    const last = Math.min(store.frameCount - 1, Math.ceil(toS * fps))
    const stride = Math.max(1, Math.ceil((last - first + 1) / MAX_SAMPLED_FRAMES))
    for (let i = first; i <= last; i += stride) {
      const frame = store.getFrame(i)
      if (!frame) continue
      for (const p of frame.persons) {
        const entry = ensure(p.trackerId)
        entry.frames += 1
        entry.roles.set(p.role, (entry.roles.get(p.role) ?? 0) + 1)
        if (p.jersey !== null) entry.jerseys.set(p.jersey, (entry.jerseys.get(p.jersey) ?? 0) + 1)
      }
    }
  }

  const attributed: ClipPlayer | null = playerAround(anchorS, actions)
  if (attributed?.trackerId !== null && attributed?.trackerId !== undefined) {
    const entry = ensure(attributed.trackerId)
    if (attributed.jersey !== null && entry.jerseys.size === 0) entry.jerseys.set(attributed.jersey, 1)
  }

  const out: PlayerCandidate[] = []
  for (const [trackerId, e] of acc) {
    out.push({
      trackerId,
      jersey: mostFrequent(e.jerseys),
      teamCluster: teams.byTrackerId.get(trackerId) ?? (attributed?.trackerId === trackerId ? attributed.teamCluster : null),
      role: mostFrequent(e.roles) ?? 'player',
      frames: e.frames,
      fromAction: attributed?.trackerId === trackerId,
    })
  }
  out.sort((a, b) => Number(b.fromAction) - Number(a.fromAction) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || b.frames - a.frames || a.trackerId - b.trackerId)
  return out
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
