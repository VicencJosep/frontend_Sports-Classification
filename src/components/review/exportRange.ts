/** Time range of the ground-truth export, remembered per match part in this browser (a convenience, not data). */
export interface ExportRange {
  fromS: number
  /** null = to the end of the video. */
  toS: number | null
}

const STORAGE_KEY = 'football-intelligence.review-export-range.v1'
const WHOLE: ExportRange = { fromS: 0, toS: null }

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function readAll(store: Storage | null): Record<string, ExportRange> {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(STORAGE_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, ExportRange>) : {}
  } catch {
    return {}
  }
}

export function loadExportRange(matchId: string, partId: string, store: Storage | null = storage()): ExportRange {
  const saved = readAll(store)[`${matchId}/${partId}`]
  if (!saved || typeof saved.fromS !== 'number' || !(saved.fromS >= 0)) return WHOLE
  return { fromS: saved.fromS, toS: typeof saved.toS === 'number' && saved.toS > saved.fromS ? saved.toS : null }
}

export function saveExportRange(matchId: string, partId: string, range: ExportRange, store: Storage | null = storage()): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(store), [`${matchId}/${partId}`]: range }))
  } catch {
    // Storage unavailable: the range lives for the session only.
  }
}
