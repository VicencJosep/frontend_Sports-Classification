/** 67.4 -> "01:07"; 3725 -> "1:02:05". Hours only shown when needed. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** 67.44 -> "01:07.4" (tenths), for the player time display. */
export function formatClockTenths(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--.-'
  const tenths = Math.floor((seconds % 1) * 10)
  return `${formatClock(seconds)}.${tenths}`
}

/** Duration for match cards: 5400 -> "90:00", 75 -> "01:15". */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** "2019-10-01" -> "1 Oct 2019" (en-GB style, no time zone surprises). */
export function formatDate(isoDate: string | null): string {
  if (!isoDate) return '—'
  const parts = isoDate.split('-').map(Number)
  const [y, m, d] = parts
  if (parts.length !== 3 || y === undefined || m === undefined || d === undefined || !y || !m || !d) return isoDate
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}
