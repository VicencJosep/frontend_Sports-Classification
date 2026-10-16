import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import { useMatchService } from '@/app/providers/useServices'
import { Page } from '@/app/shell/Page'
import { EmptyState, ErrorState, IconUpload, LinkButton, LoadingState } from '@/components/common'
import { MatchList } from '@/components/matches'
import s from '@/components/matches/matches.module.css'
import { ANALYSIS_STATUSES, STATUS_DISPLAY, isAnalysisStatus } from '@/domain'
import { useAsync } from '@/hooks/useAsync'
import { cx } from '@/utils/cx'

export function MatchesPage() {
  const service = useMatchService()
  const load = useCallback(() => service.listMatches(), [service])
  const matches = useAsync(load)
  const [params, setParams] = useSearchParams()
  const statusParam = params.get('status')
  const filter = isAnalysisStatus(statusParam) ? statusParam : null

  const visible = matches.status === 'success' ? matches.data.filter((m) => filter === null || m.status === filter) : []

  return (
    <Page
      title="Matches"
      subtitle="Every match known to the platform"
      actions={
        <LinkButton to="/matches/new" variant="primary">
          <IconUpload size={16} />
          New Match
        </LinkButton>
      }
    >
      <div className={s.filters} role="group" aria-label="Filter by status">
        <button type="button" className={cx(s.filter, filter === null && s.active)} onClick={() => setParams({})}>
          All
        </button>
        {ANALYSIS_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={cx(s.filter, filter === status && s.active)}
            onClick={() => setParams({ status })}
          >
            {STATUS_DISPLAY[status]}
          </button>
        ))}
      </div>

      {matches.status === 'loading' && <LoadingState label="Loading matches…" />}
      {matches.status === 'error' && <ErrorState error={matches.error} onRetry={matches.reload} />}
      {matches.status === 'success' &&
        (visible.length === 0 ? (
          <EmptyState title="No matches match this filter" />
        ) : (
          <MatchList matches={visible} />
        ))}
    </Page>
  )
}
