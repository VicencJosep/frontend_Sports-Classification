import { describe, expect, it } from 'vitest'

import { loadExportRange, saveExportRange } from './exportRange'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  }
}

describe('export range', () => {
  it('defaults to the whole video and remembers a range per match part', () => {
    const store = memoryStorage()
    expect(loadExportRange('m1', 'full', store)).toEqual({ fromS: 0, toS: null })
    saveExportRange('m1', 'full', { fromS: 600, toS: 3600 }, store)
    saveExportRange('m2', 'full', { fromS: 30, toS: null }, store)
    expect(loadExportRange('m1', 'full', store)).toEqual({ fromS: 600, toS: 3600 })
    expect(loadExportRange('m2', 'full', store)).toEqual({ fromS: 30, toS: null })
    expect(loadExportRange('m1', 'first-half', store)).toEqual({ fromS: 0, toS: null })
  })

  it('survives a missing or corrupt store', () => {
    expect(loadExportRange('m1', 'full', null)).toEqual({ fromS: 0, toS: null })
    const store = memoryStorage()
    store.setItem('football-intelligence.review-export-range.v1', '{not json')
    expect(loadExportRange('m1', 'full', store)).toEqual({ fromS: 0, toS: null })
    store.setItem('football-intelligence.review-export-range.v1', JSON.stringify({ 'm1/full': { fromS: 50, toS: 10 } }))
    expect(loadExportRange('m1', 'full', store)).toEqual({ fromS: 50, toS: null })
  })
})
