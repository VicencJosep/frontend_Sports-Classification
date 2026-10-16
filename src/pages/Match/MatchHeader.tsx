import { Badge } from '@/components/common'
import { StatusBadge } from '@/components/matches'
import type { Match } from '@/domain'
import { cx } from '@/utils/cx'
import { formatDate, formatDuration } from '@/utils/time'

import s from './Match.module.css'

interface MatchHeaderProps {
  match: Match
  selectedPartId: string
  onSelectPart: (partId: string) => void
}

export function MatchHeader({ match, selectedPartId, onSelectPart }: MatchHeaderProps) {
  return (
    <header className={s.header}>
      <div className={s.titleBlock}>
        <h1 className={s.title}>
          {match.homeTeam && match.awayTeam ? (
            <>
              {match.homeTeam} <span className={s.score}>{match.score ? `${match.score.home} – ${match.score.away}` : 'vs'}</span> {match.awayTeam}
            </>
          ) : (
            match.name
          )}
        </h1>
        <div className={s.meta}>
          <span>{formatDate(match.date)}</span>
          <span className={s.sep}>·</span>
          <span className="mono">{formatDuration(match.durationS)}</span>
          <span className={s.sep}>·</span>
          <StatusBadge status={match.status} />
          {match.isDemo && <Badge title="Excerpt of a real pipeline run with demo metadata">Demo excerpt</Badge>}
        </div>
      </div>
      {match.parts.length > 1 && (
        <div className={s.tabs} role="tablist" aria-label="Match parts">
          {match.parts.map((part) => (
            <button
              key={part.id}
              type="button"
              role="tab"
              aria-selected={part.id === selectedPartId}
              className={cx(s.tab, part.id === selectedPartId && s.active)}
              onClick={() => onSelectPart(part.id)}
              title={`${part.label} · ${part.status}`}
            >
              <span className={cx(s.tabDot, s[part.status])} />
              {part.label}
            </button>
          ))}
        </div>
      )}
    </header>
  )
}
