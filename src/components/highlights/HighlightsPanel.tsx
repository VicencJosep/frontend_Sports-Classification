import { useCallback, useEffect, useState } from 'react'

import { useMatchService } from '@/app/providers/useServices'
import { Badge, Button, EmptyState, ErrorState, Spinner } from '@/components/common'
import type { HighlightClip, HighlightLabel, PartHighlights } from '@/domain'
import { errorMessage, useAsync } from '@/hooks/useAsync'
import { isServiceError } from '@/services'
import { formatClock } from '@/utils/time'

import s from './highlights.module.css'

interface HighlightsPanelProps {
  matchId: string
  partId: string
  /** The part's analysis must be completed before clips can be generated. */
  analysisCompleted: boolean
  /** Seek the main player to the start of the play. */
  onSeek: (clip: HighlightClip) => void
  /**
   * Latest highlights state as the panel sees it (it polls its own endpoint;
   * the match record only refreshes while the analysis runs), so the parent
   * can keep its "Highlights · N" title in step with the list.
   */
  onStatus?: (highlights: PartHighlights) => void
}

const POLL_INTERVAL_MS = 4000

const LABEL_TEXT: Record<string, string> = { goal: 'Goal', shot: 'Chance', play: 'Play' }

function labelBadge(label: HighlightLabel) {
  return (
    <Badge tone={label === 'goal' ? 'accent' : label === 'shot' ? 'info' : 'neutral'} title={`Kind of play: ${label}`}>
      {LABEL_TEXT[label] ?? label}
    </Badge>
  )
}

/**
 * Best plays of one part: generation status, the clips when done (seek the
 * viewer, play the cut clip inline, download it) and the button to (re)generate.
 */
export function HighlightsPanel({ matchId, partId, analysisCompleted, onSeek, onStatus }: HighlightsPanelProps) {
  const service = useMatchService()
  const load = useCallback(() => service.getPartHighlights(matchId, partId), [service, matchId, partId])
  const state = useAsync(load)
  const [action, setAction] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const [openClipId, setOpenClipId] = useState<string | null>(null)

  const data: PartHighlights | null = state.status === 'success' ? state.data : null
  const generating = data?.status === 'pending' || data?.status === 'processing'
  const { refresh } = state
  useEffect(() => {
    if (data && onStatus) onStatus(data)
  }, [data, onStatus])
  useEffect(() => {
    if (!generating) return
    const id = window.setInterval(refresh, POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [generating, refresh])

  const generate = async (force: boolean) => {
    setAction({ busy: true, error: null })
    try {
      await service.generateHighlights(matchId, partId, force)
      setAction({ busy: false, error: null })
      state.reload()
    } catch (err) {
      setAction({ busy: false, error: errorMessage(err) })
    }
  }

  const generateButton = (label: string, force = false) => (
    <Button variant="primary" size="sm" onClick={() => void generate(force)} disabled={action.busy || !analysisCompleted}>
      {label}
    </Button>
  )

  if (state.status === 'loading') {
    return (
      <div className={s.status}>
        <Spinner label="Loading highlights" />
      </div>
    )
  }

  // Never generated: the API answers 404 until the first request.
  if (state.status === 'error' && isServiceError(state.error) && state.error.code === 'not-found') {
    return (
      <div className={s.status}>
        <EmptyState title="No highlights yet">
          The best plays of this part (goals, chances, runs) can be selected and cut into clips automatically.
        </EmptyState>
        {generateButton('Generate highlights')}
        {!analysisCompleted && <p className={s.statusText}>Available once the analysis has completed.</p>}
        {action.error && (
          <p className={s.error} role="alert">
            {action.error}
          </p>
        )}
      </div>
    )
  }
  if (state.status === 'error' || data === null) {
    return <ErrorState error={state.error} title="Highlights unavailable" onRetry={state.reload} />
  }

  if (data.status === 'pending' || data.status === 'processing') {
    return (
      <div className={s.status} aria-live="polite">
        <Spinner label="Generating highlights" />
        <p className={s.statusText}>
          {data.status === 'pending'
            ? 'Queued: waiting for the GPU (another analysis may be running).'
            : `Selecting and cutting the best plays${data.stage ? ` (stage: ${data.stage})` : ''}. This takes a few minutes; the list refreshes on its own.`}
        </p>
      </div>
    )
  }

  if (data.status === 'error') {
    return (
      <div className={s.status}>
        <EmptyState title="Highlights generation failed">{data.error ?? 'The generator exited with an error.'}</EmptyState>
        {generateButton('Try again')}
        {action.error && (
          <p className={s.error} role="alert">
            {action.error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={s.wrap}>
      <div className={s.toolbar}>
        <span title={data.vlmModel ? `Selected with ${data.vlmModel} from ${data.nCandidates} candidate plays` : `Selected by rules from ${data.nCandidates} candidate plays`}>
          {data.clips.length} clip{data.clips.length === 1 ? '' : 's'} · {data.nCandidates} candidates
        </span>
        {generateButton('Regenerate', true)}
      </div>
      {action.error && (
        <p className={s.error} role="alert">
          {action.error}
        </p>
      )}
      {data.clips.length === 0 ? (
        <EmptyState title="No play stood out">The generator found no play worth a clip in this part.</EmptyState>
      ) : (
        <ul className={s.list}>
          {data.clips.map((clip) => {
            const open = openClipId === clip.id
            return (
              <li key={clip.id} className={s.item}>
                <div className={s.head}>
                  <button type="button" className={s.seek} onClick={() => onSeek(clip)} title={`Go to ${formatClock(clip.startS)} in the viewer`}>
                    <span className={s.time}>{formatClock(clip.startS)}</span>
                    <span className={s.main}>
                      <span className={s.title}>
                        {labelBadge(clip.label)}
                        {clip.soccerhighScore !== null && (
                          <Badge tone="neutral" title="SoccerHigh: confidence that an editor would put this play in the official summary">
                            SH {Math.round(clip.soccerhighScore * 100)}%
                          </Badge>
                        )}
                        <span>{clip.title}</span>
                      </span>
                      <span className={s.sub}>
                        {formatClock(clip.startS)} – {formatClock(clip.endS)} · {Math.round(clip.durationS)} s
                      </span>
                    </span>
                  </button>
                  <div className={s.actions}>
                    {clip.contentUrl && (
                      <Button size="sm" onClick={() => setOpenClipId(open ? null : clip.id)} aria-expanded={open}>
                        {open ? 'Hide clip' : 'Play clip'}
                      </Button>
                    )}
                    {clip.contentUrl && (
                      <a className={s.download} href={clip.contentUrl} download title="Download the MP4 clip">
                        Download
                      </a>
                    )}
                  </div>
                </div>
                {clip.description && <p className={s.desc}>{clip.description}</p>}
                {open && clip.contentUrl && <video className={s.video} src={clip.contentUrl} controls autoPlay playsInline />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
