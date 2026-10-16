import type { TeamCluster } from './vocab'

/** One appearance cluster of `core/classification.py`. The pipeline gives no names, colours or home/away mapping. */
export interface TeamInfo {
  cluster: TeamCluster
  /** "Team A" / "Team B" until a naming feature exists. */
  displayName: string
  /** Overlay colour (hex). */
  color: string
}

export interface TeamAssignments {
  byTrackerId: ReadonlyMap<number, TeamCluster>
  /** Tracker ids the clustering left out, with the pipeline's reason (`never_player`, `no_valid_crops`, ...). */
  excluded: ReadonlyMap<number, string>
  clusters: readonly TeamInfo[]
}

export const EMPTY_TEAM_ASSIGNMENTS: TeamAssignments = {
  byTrackerId: new Map(),
  excluded: new Map(),
  clusters: [],
}

export function teamOf(teams: TeamAssignments, trackerId: number | null): TeamInfo | null {
  if (trackerId === null) return null
  const cluster = teams.byTrackerId.get(trackerId)
  if (cluster === undefined) return null
  return teams.clusters.find((c) => c.cluster === cluster) ?? null
}
