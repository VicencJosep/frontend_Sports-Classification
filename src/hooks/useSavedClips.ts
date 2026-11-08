import { useCallback, useMemo, useSyncExternalStore } from 'react'

import type { ClipDraft, SavedClip } from '@/domain'
import { sortClips } from '@/domain'
import { getDefaultClipRepository, type ClipRepository } from '@/lib/clipStore'

export interface SavedClipsApi {
  /** Clips of this part, by start time. */
  clips: SavedClip[]
  /** Inserts (`draft.id` null) or updates; the match/part of the hook always win. */
  save: (draft: ClipDraft) => SavedClip
  remove: (id: string) => SavedClip | null
  restore: (clip: SavedClip) => void
}

/** The user's clips for one part, live from the repository (shared by every component that reads it). */
export function useSavedClips(matchId: string, partId: string, repository: ClipRepository = getDefaultClipRepository()): SavedClipsApi {
  const all = useSyncExternalStore(repository.subscribe, repository.getAll, repository.getAll)
  const clips = useMemo(() => sortClips(all.filter((c) => c.matchId === matchId && c.partId === partId)), [all, matchId, partId])
  const save = useCallback((draft: ClipDraft) => repository.upsert({ ...draft, matchId, partId }), [repository, matchId, partId])
  const remove = useCallback((id: string) => repository.remove(id), [repository])
  const restore = useCallback((clip: SavedClip) => repository.restore(clip), [repository])
  return { clips, save, remove, restore }
}
