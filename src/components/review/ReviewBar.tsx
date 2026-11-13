import { useEffect, useState, type KeyboardEvent } from 'react'

import { Button, IconDownload, Spinner } from '@/components/common'
import type { ReviewInfo, ReviewSheet } from '@/domain'
import { labelDisplayName } from '@/domain'
import { formatClock, parseClock } from '@/utils/time'

import { loadExportRange, saveExportRange, type ExportRange } from './exportRange'
import s from './review.module.css'

/** A detection the user just deleted, offered for undo. */
export interface DeletedItem {
  id: string
  label: string
  timeS: number
}

interface ReviewBarProps {
  matchId: string
  partId: string
  info: ReviewInfo
  durationS: number
  /** A correction or an export is in flight. */
  busy: boolean
  /** Last failed request (correction, undo or export). */
  error: string | null
  deleted: DeletedItem | null
  onUndoDelete: () => void
  onDismissDelete: () => void
  /** Asks the backend for the sheet of the range; resolves null when it failed. */
  onExport: (fromS: number, toS: number | null) => Promise<ReviewSheet | null>
}

const UNDO_MS = 10000

function count(n: number, noun: string): string | null {
  return n > 0 ? `${n} ${noun}` : null
}

/**
 * State of the reviewed copy under the player: how many detections were
 * corrected, added and deleted, undo of the last deletion, and the export of
 * a time range as the ground-truth sheet (`tiempo,etiqueta,dorsal,equipo`).
 */
export function ReviewBar({ matchId, partId, info, durationS, busy, error, deleted, onUndoDelete, onDismissDelete, onExport }: ReviewBarProps) {
  const [range, setRange] = useState<ExportRange>(() => loadExportRange(matchId, partId))
  const [exporting, setExporting] = useState(false)
  const [sheet, setSheet] = useState<ReviewSheet | null>(null)

  useEffect(() => {
    if (!deleted) return
    const timer = window.setTimeout(onDismissDelete, UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [deleted, onDismissDelete])

  const changeRange = (next: ExportRange) => {
    setRange(next)
    setSheet(null)
    saveExportRange(matchId, partId, next)
  }

  const fromS = Math.min(Math.max(0, range.fromS), durationS)
  const toS = range.toS === null ? durationS : Math.min(Math.max(0, range.toS), durationS)
  const validRange = toS > fromS

  const exportSheet = async () => {
    if (!validRange || exporting) return
    setExporting(true)
    const result = await onExport(fromS, range.toS === null ? null : toS)
    setExporting(false)
    setSheet(result)
    if (!result) return
    const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${matchId}_${partId}_${result.filename}`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const counts = [count(info.nEdited, 'corrected'), count(info.nAdded, 'added'), count(info.nDeleted, 'deleted')].filter(Boolean)

  return (
    <section className={s.bar} aria-label="Reviewed copy">
      <div className={s.row}>
        <span className={s.title}>
          <span className={s.dot} />
          Reviewed copy
        </span>
        <span className={s.counts}>{counts.length > 0 ? counts.join(' · ') : 'no changes'}</span>
        {busy && !exporting && <Spinner label="Saving" />}
        {info.stale && (
          <span className={s.warning} title="The analysis ran again after this copy was made: its player ids (tracklets) are no longer the ones in the copy.">
            analysis re-run since
          </span>
        )}
        {deleted && (
          <span className={s.undo}>
            Deleted <strong>{labelDisplayName(deleted.label)}</strong> at {formatClock(deleted.timeS)}
            <button type="button" className={s.linkish} onClick={onUndoDelete}>
              Undo
            </button>
          </span>
        )}
        {error && (
          <span className={s.error} role="alert">
            {error}
          </span>
        )}
        <span className={s.spacer} />
        <span className={s.exportLabel}>Ground truth</span>
        <ClockInput label="from" value={fromS} onCommit={(t) => changeRange({ ...range, fromS: t })} />
        <ClockInput label="to" value={toS} onCommit={(t) => changeRange({ ...range, toS: t >= durationS ? null : t })} />
        <Button size="sm" variant="secondary" onClick={() => void exportSheet()} disabled={!validRange || exporting} title="Download that range of the reviewed copy as the annotation sheet (tiempo, etiqueta, dorsal, equipo). What was not touched in the range counts as correct.">
          {exporting ? <Spinner label="Exporting" /> : <IconDownload size={14} />}
          Export CSV
        </Button>
      </div>
      {sheet && (
        <div className={s.saved}>
          {sheet.nRows} rows, {formatClock(sheet.fromS)}–{formatClock(sheet.toS)}. Also saved on the server: <code>{sheet.path}</code>
        </div>
      )}
    </section>
  )
}

interface ClockInputProps {
  label: string
  value: number
  onCommit: (timeS: number) => void
}

/** Small mm:ss field: applied on blur or Enter, reverted when the text is not a time. */
function ClockInput({ label, value, onCommit }: ClockInputProps) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    const parsed = text === null ? null : parseClock(text)
    if (parsed !== null) onCommit(parsed)
    setText(null)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    else if (e.key === 'Escape') {
      setText(null)
      e.currentTarget.blur()
    }
  }
  return (
    <label className={s.clock}>
      <span>{label}</span>
      <input
        value={text ?? formatClock(value)}
        onFocus={() => setText(formatClock(value))}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        aria-label={`Ground truth ${label} (mm:ss)`}
        spellCheck={false}
      />
    </label>
  )
}
