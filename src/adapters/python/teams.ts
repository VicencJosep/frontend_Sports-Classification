import type { TeamAssignments, TeamInfo } from '@/domain'
import { makeTeamInfo } from '@/domain'

import { assertTeamsJson } from './guards'
import type { RawTeamsJson } from './raw'

export function parseTeamsJson(text: string, path = 'teams.json'): RawTeamsJson {
  const parsed: unknown = JSON.parse(text)
  assertTeamsJson(parsed, path)
  return parsed
}

export function toTeamAssignments(raw: RawTeamsJson): TeamAssignments {
  const byTrackerId = new Map<number, number>()
  const clusterIds = new Set<number>()
  for (const t of raw.teams) {
    byTrackerId.set(t.tracker_id, t.team_cluster)
    clusterIds.add(t.team_cluster)
  }
  // Always expose n_clusters entries so an empty cluster still has a name/colour.
  const nClusters = Math.max(raw.n_clusters ?? 0, clusterIds.size, 0)
  for (let c = 0; c < nClusters; c += 1) clusterIds.add(c)
  const clusters: TeamInfo[] = [...clusterIds].sort((a, b) => a - b).map(makeTeamInfo)

  const excluded = new Map<number, string>()
  for (const e of raw.excluded) excluded.set(e.tracker_id, e.reason)

  return { byTrackerId, excluded, clusters }
}
