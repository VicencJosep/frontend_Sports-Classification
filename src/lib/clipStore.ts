import type { ClipDraft, SavedClip } from '@/domain'

/**
 * Where the user's clips live. The pipeline and the backend know nothing about
 * them yet, so the only implementation persists to localStorage; the interface
 * is what a backend-backed repository would implement later.
 *
 * It is an external store (subscribe / getAll) so components read it through
 * `useSyncExternalStore` and every match page sees the same list.
 */
export interface ClipRepository {
  subscribe(listener: () => void): () => void
  /** Every stored clip, all matches. The array is replaced on each change (stable between changes). */
  getAll(): readonly SavedClip[]
  /** Inserts a new clip (`draft.id` null) or updates an existing one. Returns the stored clip. */
  upsert(draft: ClipDraft): SavedClip
  remove(id: string): SavedClip | null
  /** Puts a removed clip back (undo). */
  restore(clip: SavedClip): void
}

export const CLIPS_STORAGE_KEY = 'football-intelligence.clips.v1'

interface StoredDocument {
  version: 1
  clips: SavedClip[]
}

function isSavedClip(value: unknown): value is SavedClip {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.matchId === 'string' &&
    typeof v.partId === 'string' &&
    typeof v.label === 'string' &&
    typeof v.startS === 'number' &&
    typeof v.endS === 'number' &&
    typeof v.anchorS === 'number' &&
    typeof v.title === 'string' &&
    typeof v.createdAt === 'string'
  )
}

/** Tolerant parse of the stored document: anything malformed yields no clips rather than a crash. */
export function parseStoredClips(raw: string | null | undefined): SavedClip[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return []
    const clips = (parsed as Partial<StoredDocument>).clips
    if (!Array.isArray(clips)) return []
    return clips.filter(isSavedClip).map((c) => ({
      ...c,
      sourceEventId: c.sourceEventId ?? null,
      detectedLabel: c.detectedLabel ?? null,
      player: c.player ?? null,
      notes: typeof c.notes === 'string' ? c.notes : '',
      updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : c.createdAt,
    }))
  } catch {
    return []
  }
}

export function createClipId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `clip-${Date.now().toString(36)}-${random}`
}

export interface LocalClipRepositoryOptions {
  idFactory?: () => string
  now?: () => string
  /** Follow changes made in other tabs (`storage` events). Default: true when a window exists. */
  crossTab?: boolean
}

export class LocalClipRepository implements ClipRepository {
  private clips: readonly SavedClip[]
  private readonly listeners = new Set<() => void>()
  private readonly storage: Storage | null
  private readonly idFactory: () => string
  private readonly now: () => string

  constructor(storage: Storage | null, options: LocalClipRepositoryOptions = {}) {
    this.storage = storage
    this.idFactory = options.idFactory ?? createClipId
    this.now = options.now ?? (() => new Date().toISOString())
    this.clips = parseStoredClips(this.read())
    const crossTab = options.crossTab ?? typeof window !== 'undefined'
    if (crossTab && storage) {
      window.addEventListener('storage', (e) => {
        if (e.storageArea === storage && e.key === CLIPS_STORAGE_KEY) {
          this.clips = parseStoredClips(e.newValue)
          this.notify()
        }
      })
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getAll = (): readonly SavedClip[] => this.clips

  upsert(draft: ClipDraft): SavedClip {
    const now = this.now()
    const existing = draft.id ? this.clips.find((c) => c.id === draft.id) : undefined
    const clip: SavedClip = {
      ...draft,
      id: existing?.id ?? draft.id ?? this.idFactory(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    this.commit(existing ? this.clips.map((c) => (c.id === clip.id ? clip : c)) : [...this.clips, clip])
    return clip
  }

  remove(id: string): SavedClip | null {
    const clip = this.clips.find((c) => c.id === id) ?? null
    if (clip) this.commit(this.clips.filter((c) => c.id !== id))
    return clip
  }

  restore(clip: SavedClip): void {
    if (this.clips.some((c) => c.id === clip.id)) return
    this.commit([...this.clips, clip])
  }

  private commit(next: readonly SavedClip[]): void {
    this.clips = next
    this.write()
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private read(): string | null {
    try {
      return this.storage?.getItem(CLIPS_STORAGE_KEY) ?? null
    } catch {
      return null
    }
  }

  private write(): void {
    try {
      const doc: StoredDocument = { version: 1, clips: [...this.clips] }
      this.storage?.setItem(CLIPS_STORAGE_KEY, JSON.stringify(doc))
    } catch {
      // Storage full or unavailable: the clips live for the session only.
    }
  }
}

let defaultRepository: ClipRepository | null = null

function browserStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** The app-wide repository over `window.localStorage` (created on first use). */
export function getDefaultClipRepository(): ClipRepository {
  if (!defaultRepository) defaultRepository = new LocalClipRepository(browserStorage())
  return defaultRepository
}
