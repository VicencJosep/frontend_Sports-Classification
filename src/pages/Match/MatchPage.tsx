import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'

import { useMatchService } from '@/app/providers/useServices'
import { Button, Card, ErrorState, LinkButton, LoadingState } from '@/components/common'
import { StatusBadge } from '@/components/matches'
import type { Match, MatchPart } from '@/domain'
import { errorMessage, useAsync } from '@/hooks/useAsync'

import s from './Match.module.css'
import { MatchHeader } from './MatchHeader'
import { MatchViewer } from './MatchViewer'

const POLL_INTERVAL_MS = 5000

function isOpenable(part: MatchPart): boolean {
  return part.status === 'completed' && part.video !== null
}

function defaultPart(match: Match): MatchPart | undefined {
  return match.parts.find(isOpenable) ?? match.parts[0]
}

export function MatchPage() {
  const { matchId = '' } = useParams()
  const service = useMatchService()
  const load = useCallback(() => service.getMatch(matchId), [service, matchId])
  const match = useAsync(load)
  const [params, setParams] = useSearchParams()
  const [restart, setRestart] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })

  // While the backend is analysing, refresh the match without flashing the loading state.
  const polling = match.status === 'success' && (match.data.status === 'pending' || match.data.status === 'processing')
  const { refresh } = match
  useEffect(() => {
    if (!polling) return
    const id = window.setInterval(refresh, POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [polling, refresh])

  if (match.status === 'loading') {
    return (
      <div className={s.page}>
        <LoadingState label="Loading match…" />
      </div>
    )
  }
  if (match.status === 'error') {
    return (
      <div className={s.page}>
        <ErrorState error={match.error} title="Match not available" onRetry={match.reload} />
        <div style={{ textAlign: 'center' }}>
          <LinkButton to="/">Back to Dashboard</LinkButton>
        </div>
      </div>
    )
  }

  const data = match.data
  const requested = params.get('part')
  const part = data.parts.find((p) => p.id === requested) ?? defaultPart(data)
  const canRestart = data.status === 'error' || (data.status === 'pending' && data.parts.every((p) => p.video !== null))

  const onRestart = async () => {
    setRestart({ busy: true, error: null })
    try {
      await service.startAnalysis(data.id)
      setRestart({ busy: false, error: null })
      refresh()
    } catch (err) {
      setRestart({ busy: false, error: errorMessage(err) })
    }
  }

  return (
    <div className={s.page}>
      <MatchHeader match={data} selectedPartId={part?.id ?? ''} onSelectPart={(id) => setParams({ part: id })} />
      {part && isOpenable(part) && part.video ? (
        <MatchViewer key={part.id} match={data} part={part} video={part.video} />
      ) : (
        <Card className={s.statusCard}>
          <StatusBadge status={part?.status ?? data.status} />
          <h2>{part ? `${part.label} is not ready to view` : 'No video parts'}</h2>
          <p>
            {part?.status === 'processing' &&
              `The analysis pipeline is running on this video${part.stage ? ` (stage: ${part.stage})` : ''}. Tracking, team clustering, events and ball actions will appear here when it finishes; this page refreshes on its own.`}
            {part?.status === 'pending' && 'This video is queued and has not been analysed yet.'}
            {part?.status === 'error' && (data.errorMessage ?? 'The analysis failed for this video.')}
            {part?.status === 'completed' && 'The analysis finished but its files are not available to the frontend.'}
          </p>
          {data.note && <p>{data.note}</p>}
          {restart.error && (
            <p className="muted" role="alert">
              {restart.error}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {canRestart && (
              <Button variant="primary" onClick={() => void onRestart()} disabled={restart.busy}>
                {data.status === 'error' ? 'Retry analysis' : 'Start analysis'}
              </Button>
            )}
            <LinkButton to="/">Back to Dashboard</LinkButton>
          </div>
        </Card>
      )}
    </div>
  )
}
