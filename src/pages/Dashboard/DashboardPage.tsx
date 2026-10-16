import { useCallback } from 'react'

import { useMatchService } from '@/app/providers/useServices'
import { Page } from '@/app/shell/Page'
import { Card, EmptyState, ErrorState, IconUpload, LinkButton, LoadingState } from '@/components/common'
import { MatchList } from '@/components/matches'
import s from '@/components/matches/matches.module.css'
import type { AnalysisStatus, Match } from '@/domain'
import { useAsync } from '@/hooks/useAsync'
import { cx } from '@/utils/cx'

function count(matches: Match[], status: AnalysisStatus): number {
  return matches.filter((m) => m.status === status).length
}

export function DashboardPage() {
  const service = useMatchService()
  const load = useCallback(() => service.listMatches(), [service])
  const matches = useAsync(load)

  return (
    <Page
      title="Dashboard"
      subtitle="Analysed matches and pipeline status"
      actions={
        <LinkButton to="/matches/new" variant="secondary">
          <IconUpload size={16} />
          Upload match
        </LinkButton>
      }
    >
      {matches.status === 'loading' && <LoadingState label="Loading matches…" />}
      {matches.status === 'error' && <ErrorState error={matches.error} onRetry={matches.reload} />}
      {matches.status === 'success' && (
        <>
          <div className={s.stats}>
            <Card className={s.stat}>
              <div className={s.statLabel}>Matches</div>
              <div className={s.statValue}>{matches.data.length}</div>
            </Card>
            <Card className={s.stat}>
              <div className={s.statLabel}>Completed</div>
              <div className={cx(s.statValue, s.success)}>{count(matches.data, 'completed')}</div>
            </Card>
            <Card className={s.stat}>
              <div className={s.statLabel}>Processing</div>
              <div className={s.statValue}>{count(matches.data, 'processing')}</div>
            </Card>
            <Card className={s.stat}>
              <div className={s.statLabel}>Pending / errors</div>
              <div className={s.statValue}>{count(matches.data, 'pending') + count(matches.data, 'error')}</div>
            </Card>
          </div>

          <div className={s.sectionTitle}>
            <h2>Matches</h2>
            <span className={s.count}>{matches.data.length} total</span>
          </div>
          {matches.data.length === 0 ? (
            <EmptyState title="No matches yet">Upload a match video to start an analysis.</EmptyState>
          ) : (
            <MatchList matches={matches.data} />
          )}
        </>
      )}
    </Page>
  )
}
