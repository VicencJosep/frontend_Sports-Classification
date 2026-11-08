import { describe, expect, it } from 'vitest'

import type { ClipDraft } from '@/domain'

import { CLIPS_STORAGE_KEY, LocalClipRepository, parseStoredClips } from './clipStore'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

const draft: ClipDraft = {
  id: null,
  matchId: 'm1',
  partId: 'full',
  sourceEventId: 'evt-1',
  detectedLabel: 'shot',
  label: 'goal',
  startS: 26,
  endS: 39,
  anchorS: 33,
  player: { trackerId: 1907, jersey: 9, teamCluster: 1, name: null },
  title: 'Goal · 00:33',
  notes: '',
}

function repo(storage: Storage | null = new MemoryStorage()) {
  let n = 0
  return new LocalClipRepository(storage, { idFactory: () => `id-${(n += 1)}`, now: () => '2026-11-08T10:00:00.000Z', crossTab: false })
}

describe('LocalClipRepository', () => {
  it('inserts, persists and notifies', () => {
    const storage = new MemoryStorage()
    const r = repo(storage)
    let notified = 0
    r.subscribe(() => (notified += 1))
    const before = r.getAll()
    const saved = r.upsert(draft)
    expect(saved).toMatchObject({ id: 'id-1', label: 'goal', createdAt: '2026-11-08T10:00:00.000Z' })
    expect(r.getAll()).toHaveLength(1)
    expect(r.getAll()).not.toBe(before)
    expect(notified).toBe(1)
    expect(parseStoredClips(storage.getItem(CLIPS_STORAGE_KEY))).toHaveLength(1)
  })

  it('updates in place keeping createdAt and reloads from storage', () => {
    const storage = new MemoryStorage()
    const r = repo(storage)
    const saved = r.upsert(draft)
    const later = new LocalClipRepository(storage, { now: () => '2026-11-08T11:00:00.000Z', crossTab: false })
    const updated = later.upsert({ ...saved, label: 'shot', endS: 40 })
    expect(updated).toMatchObject({ id: saved.id, label: 'shot', endS: 40, createdAt: saved.createdAt, updatedAt: '2026-11-08T11:00:00.000Z' })
    expect(later.getAll()).toHaveLength(1)
  })

  it('removes and restores', () => {
    const r = repo()
    const a = r.upsert(draft)
    r.upsert({ ...draft, partId: 'second-half' })
    expect(r.remove(a.id)).toEqual(a)
    expect(r.remove('nope')).toBeNull()
    expect(r.getAll().map((c) => c.id)).toEqual(['id-2'])
    r.restore(a)
    r.restore(a)
    expect(r.getAll().map((c) => c.id)).toEqual(['id-2', 'id-1'])
  })

  it('survives a missing or malformed store', () => {
    expect(repo(null).getAll()).toEqual([])
    expect(parseStoredClips('{not json')).toEqual([])
    expect(parseStoredClips(JSON.stringify({ version: 1, clips: [{ id: 'x' }, { ...draft, id: 'ok', createdAt: '2026-01-01T00:00:00.000Z' }] }))).toMatchObject([{ id: 'ok', updatedAt: '2026-01-01T00:00:00.000Z' }])
  })
})
