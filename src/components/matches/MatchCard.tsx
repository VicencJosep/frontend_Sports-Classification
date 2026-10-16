import { Badge, Card, LinkButton } from '@/components/common'
import type { Match } from '@/domain'
import { cx } from '@/utils/cx'
import { formatDate, formatDuration } from '@/utils/time'

import { StatusBadge } from './StatusBadge'
import s from './matches.module.css'

function Title({ match }: { match: Match }) {
  if (match.homeTeam && match.awayTeam) {
    return (
      <span>
        {match.homeTeam} <span className={s.score}>{match.score ? `${match.score.home} – ${match.score.away}` : 'vs'}</span> {match.awayTeam}
      </span>
    )
  }
  return <span>{match.name}</span>
}

export function MatchCard({ match }: { match: Match }) {
  const partsLabel = match.parts.length === 2 ? '2 halves' : match.parts.length === 1 ? '1 video' : `${match.parts.length} parts`
  return (
    <Card className={s.card}>
      <div className={s.cardTop}>
        <h3 className={s.title}>
          <Title match={match} />
        </h3>
        <StatusBadge status={match.status} />
      </div>

      <div className={s.meta}>
        <span>{formatDate(match.date)}</span>
        <span className={s.sep}>·</span>
        <span className="mono" title="Duration of the analysed video">
          {formatDuration(match.durationS)}
        </span>
        <span className={s.sep}>·</span>
        <span>{partsLabel}</span>
        {match.isDemo && <Badge title="Fixture built from a real pipeline run; names and dates are demo metadata">Demo</Badge>}
      </div>

      {match.errorMessage ? <p className={s.errorNote}>{match.errorMessage}</p> : match.note && <p className={s.note}>{match.note}</p>}

      <div className={s.cardBottom}>
        <div className={s.parts}>
          {match.parts.map((part) => (
            <span key={part.id} className={s.partPill} title={`${part.label}: ${part.status}`}>
              <span className={cx(s.partDot, s[part.status])} />
              {part.label}
            </span>
          ))}
        </div>
        <LinkButton to={`/matches/${match.id}`} variant={match.status === 'completed' ? 'primary' : 'secondary'}>
          Open Match
        </LinkButton>
      </div>
    </Card>
  )
}
